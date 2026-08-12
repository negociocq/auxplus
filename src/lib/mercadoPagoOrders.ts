import { supabase } from "@/integrations/supabase/client";

export type MpOrderStatus =
  | "pending"
  | "approved"
  | "cancelled"
  | "rejected"
  | "expired"
  | "released";

/** Validade padrão do PIX no Mercado Pago (e no AuxPlus). */
export const PIX_EXPIRATION_HOURS = 24;
export const PIX_EXPIRATION_ISO = `PT${PIX_EXPIRATION_HOURS}H`;
export const PIX_EXPIRATION_MS = PIX_EXPIRATION_HOURS * 60 * 60 * 1000;

export interface MpRenewOrder {
  id: string;
  /** ID do pagamento no Mercado Pago */
  mpPaymentId: string;
  status: MpOrderStatus;
  itemRefId: string;
  /** Nota / nome do cliente na pasta */
  clientName: string;
  panelUsername: string;
  /** Vencimento do item no momento da geração do PIX */
  dueDate?: string | null;
  phone: string;
  months: number;
  credits: number;
  amount: number;
  pixCopyPaste: string;
  ticketUrl?: string;
  /** Quando o PIX deixa de ser pagável */
  expiresAt?: string;
  /** renew = renovação · reseller_credits = créditos · test_activate = teste→plano */
  kind?: "renew" | "reseller_credits" | "test_activate";
  /** test_activate: telas do plano (extras de MAC após o pagamento) */
  screens?: number;
  testApp?: string;
  testPassword?: string;
  testRemoteId?: string | number;
  createdAt: string;
  updatedAt: string;
  paidAt?: string;
  releasedAt?: string;
  error?: string;
  /** Pedido permanentemente bloqueado - ignora todas as operações */
  blocked?: boolean;
  blockedAt?: string;
}

const KEY = "auxplus-mp-orders";
const dbKey = (userId: string) => `mp_orders_user_${userId}`;

function uid() {
  return `mp_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function trimOrders(list: MpRenewOrder[]): MpRenewOrder[] {
  return [...list]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 200);
}

function isOrder(v: unknown): v is MpRenewOrder {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return typeof o.id === "string" && typeof o.mpPaymentId === "string";
}

function writeLocal(userId: string, orders: MpRenewOrder[]) {
  localStorage.setItem(`${KEY}:${userId}`, JSON.stringify(trimOrders(orders)));
}

export function loadMpOrders(userId: string): MpRenewOrder[] {
  try {
    const raw = localStorage.getItem(`${KEY}:${userId}`);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown[];
    return Array.isArray(list)
      ? list.filter(isOrder).filter((o) => !o.blocked)
      : [];
  } catch {
    return [];
  }
}

function mergeOrders(a: MpRenewOrder[], b: MpRenewOrder[]): MpRenewOrder[] {
  const map = new Map<string, MpRenewOrder>();
  for (const row of [...a, ...b]) {
    if (!isOrder(row)) continue;
    const prev = map.get(row.id);
    if (!prev || row.updatedAt > prev.updatedAt) map.set(row.id, row);
  }
  return trimOrders([...map.values()]);
}

async function persistRemote(userId: string, orders: MpRenewOrder[]) {
  if (!supabase || !userId) return;
  try {
    await supabase.from("platform_settings").upsert(
      {
        key: dbKey(userId),
        value: { orders: trimOrders(orders) },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch {
    /* local ok */
  }
}

export async function loadMpOrdersRemote(
  userId: string,
): Promise<MpRenewOrder[]> {
  const local = loadMpOrders(userId);
  if (!supabase || !userId) return local;
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", dbKey(userId))
      .maybeSingle();
    if (error || !data?.value) {
      if (local.length) void persistRemote(userId, local);
      return local;
    }
    const raw =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as { orders?: unknown })
        : (data.value as { orders?: unknown });
    const remote = Array.isArray(raw?.orders)
      ? (raw.orders as unknown[])
          .filter(isOrder)
          .filter((o) => !o.blocked) // Ignora pedidos bloqueados permanentemente
      : [];
    const merged = mergeOrders(local, remote);
    writeLocal(userId, merged);
    void persistRemote(userId, merged);
    return merged;
  } catch {
    return local;
  }
}

export function saveMpOrders(userId: string, orders: MpRenewOrder[]) {
  const trimmed = trimOrders(orders);
  writeLocal(userId, trimmed);
  void persistRemote(userId, trimmed);
}

export function createMpOrder(
  partial: Omit<MpRenewOrder, "id" | "createdAt" | "updatedAt" | "status"> & {
    status?: MpOrderStatus;
  },
): MpRenewOrder {
  const now = new Date().toISOString();
  const expiresAt =
    partial.expiresAt ||
    new Date(Date.parse(now) + PIX_EXPIRATION_MS).toISOString();
  return {
    ...partial,
    id: uid(),
    status: partial.status || "pending",
    expiresAt,
    createdAt: now,
    updatedAt: now,
  };
}

export function getMpOrderExpiresAt(order: MpRenewOrder): number {
  if (order.expiresAt) {
    const t = Date.parse(order.expiresAt);
    if (Number.isFinite(t)) return t;
  }
  const created = Date.parse(order.createdAt);
  return (Number.isFinite(created) ? created : Date.now()) + PIX_EXPIRATION_MS;
}

/** Pedido pending já passou do prazo local (24h). */
export function isMpOrderPastExpiry(order: MpRenewOrder, now = Date.now()) {
  if (order.status !== "pending") return order.status === "expired";
  return now >= getMpOrderExpiresAt(order);
}

/**
 * Remove da lista: expirados, cancelados, rejeitados e pending vencidos.
 * Mantém pagos/liberados para histórico recente.
 * Se houver mais de um PIX pendente do mesmo usuário, fica só o mais recente.
 */
export function pruneStaleMpOrders(orders: MpRenewOrder[]): MpRenewOrder[] {
  const now = Date.now();
  const alive = orders.filter((o) => {
    // Ignora pedidos bloqueados permanentemente
    if (o.blocked) {
      return false;
    }
    if (
      o.status === "expired" ||
      o.status === "cancelled" ||
      o.status === "rejected"
    ) {
      return false;
    }
    if (o.status === "pending" && now >= getMpOrderExpiresAt(o)) {
      return false;
    }
    return true;
  });

  const seenPending = new Set<string>();
  const deduped: MpRenewOrder[] = [];
  for (const o of [...alive].sort((a, b) =>
    b.createdAt.localeCompare(a.createdAt),
  )) {
    if (o.status === "pending") {
      const key =
        o.panelUsername.trim().toLowerCase() ||
        o.itemRefId ||
        o.id;
      if (seenPending.has(key)) continue;
      seenPending.add(key);
    }
    deduped.push(o);
  }
  return deduped.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

/** PIX pendente ainda válido para o mesmo cliente (usuário do painel ou item). */
export function findPendingMpOrderForClient(
  orders: MpRenewOrder[],
  opts: { itemRefId?: string; panelUsername?: string },
): MpRenewOrder | undefined {
  const itemId = String(opts.itemRefId || "").trim();
  const username = String(opts.panelUsername || "")
    .trim()
    .toLowerCase();
  const now = Date.now();
  return pruneStaleMpOrders(orders).find((o) => {
    if (o.status !== "pending") return false;
    if (now >= getMpOrderExpiresAt(o)) return false;
    if (itemId && o.itemRefId === itemId) return true;
    if (
      username &&
      o.panelUsername.trim().toLowerCase() === username
    ) {
      return true;
    }
    return false;
  });
}

export function patchMpOrder(
  orders: MpRenewOrder[],
  id: string,
  patch: Partial<MpRenewOrder>,
): MpRenewOrder[] {
  return orders.map((o) =>
    o.id === id
      ? { ...o, ...patch, updatedAt: new Date().toISOString() }
      : o,
  );
}

function formatDueBr(value: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || "").trim());
  if (!m) return "—";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

/**
 * WhatsApp Business: 1ª msg texto + 2ª msg só o código.
 * Sem nome da nota — só saudação, usuário e vencimento.
 */
export function buildPixWhatsappIntro(
  order: MpRenewOrder,
  opts?: { greeting?: string; dueDate?: string | null },
): string {
  const valor = order.amount.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
  const greet = (opts?.greeting || "Olá,").trim();
  const userLine = order.panelUsername.trim() || "—";
  const dueLine = formatDueBr(opts?.dueDate);
  return [
    greet,
    "",
    `Usuário: *${userLine}*`,
    `Vencimento: *${dueLine}*`,
    "",
    `Segue o PIX para renovar *${order.months} ${order.months === 1 ? "mês" : "meses"}* (${valor}).`,
    "",
    "Na *próxima mensagem* vai só o código PIX.",
    "Toque e segure nela → *Copiar*, e cole no app do banco.",
    "",
    "Assim que o pagamento for confirmado, liberamos o acesso automaticamente.",
  ].join("\n");
}

/** Só o código — facilita copiar no WhatsApp Business. */
export function buildPixWhatsappCodeOnly(order: MpRenewOrder): string {
  return String(order.pixCopyPaste || "").trim();
}

/** @deprecated Preferir intro + código em mensagens separadas */
export function buildPixWhatsappMessage(order: MpRenewOrder): string {
  return [
    buildPixWhatsappIntro(order),
    "",
    buildPixWhatsappCodeOnly(order),
  ].join("\n");
}
