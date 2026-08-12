import { addMonths, format } from "date-fns";
import type { AppData, Item } from "@/types";
import { createItem, updateItem } from "@/lib/storage";
import {
  type ProrrogaKind,
  calculateNewDueDate,
  withProrrogaUsage,
  withoutProrrogaUsage,
} from "@/lib/itemExtensions";
import {
  appendItemPayment,
  embedPaymentsInNotes,
  extractPaymentsFromNotes,
  getRecordedPayments,
  paymentsAfterDueChange,
  stripPaymentMarker,
  withEmbeddedPayments,
} from "@/lib/payments";
import {
  embedResellerCreditsBought,
  extractResellerCreditsBought,
  getResellerCreditsBought,
  stripResellerMarker,
  withResellerCreditsBought,
  withResellerCreditsBoughtDelta,
} from "@/lib/resellerCredits";
import type { ItemPayment } from "@/types";
import {
  fixUtf8Mojibake,
  isShortLivedIptvTest,
  parseIptvExpToDateTime,
  resolveTestAccessLinks,
  type IptvRemoteUser,
  type IptvReseller,
  type IptvResellerMovement,
} from "@/lib/iptvPanelApi";
import { ymdOnly, parseLocalYmd } from "@/lib/whatsappAutomation";
import { supabase } from "@/integrations/supabase/client";

export type IptvJobKind = "renew" | "test";
export type IptvJobStatus = "pending" | "doing" | "done" | "failed";

export interface IptvJob {
  id: string;
  kind: IptvJobKind;
  status: IptvJobStatus;
  /** id interno do item AuxPlus (vazio se avulso) */
  itemRefId: string;
  clientName: string;
  /** Usuário no painel IPTV (geralmente o campo Usuário do item) */
  panelUsername: string;
  /** Id remoto no UniPlay (users-iptv) — facilita apagar o teste */
  panelRemoteId?: string | number;
  /** Senha gerada no teste (só jobs de teste) */
  panelPassword?: string;
  /** Link M3U do teste */
  m3u?: string;
  /** DNS Smarters do teste */
  dnsSmarters?: string;
  phone: string;
  dueDate: string | null;
  months: number;
  testHours: number;
  note: string;
  createdAt: string;
  updatedAt: string;
}

const JOBS_KEY = "auxplus-iptv-jobs";
const jobsDbKey = (userId: string) => `iptv_jobs_user_${userId}`;

function uid() {
  return `iptv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function trimJobs(jobs: IptvJob[]): IptvJob[] {
  return [...jobs]
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 200);
}

function isJob(v: unknown): v is IptvJob {
  if (!v || typeof v !== "object") return false;
  const o = v as Record<string, unknown>;
  return (
    typeof o.id === "string" &&
    (o.kind === "renew" || o.kind === "test") &&
    typeof o.status === "string"
  );
}

/** Une listas por id, ficando com o registro mais recente (updatedAt). */
export function mergeIptvJobs(a: IptvJob[], b: IptvJob[]): IptvJob[] {
  const map = new Map<string, IptvJob>();
  for (const job of [...a, ...b]) {
    if (!isJob(job)) continue;
    const prev = map.get(job.id);
    if (!prev || job.updatedAt > prev.updatedAt) map.set(job.id, job);
  }
  return trimJobs([...map.values()]);
}

type WaConsumedRow = {
  at?: string;
  username?: string;
  name?: string;
  remoteId?: string | number;
};

type MpLogOrder = {
  id: string;
  mpPaymentId?: string;
  status?: string;
  kind?: string;
  itemRefId?: string;
  clientName?: string;
  panelUsername?: string;
  dueDate?: string | null;
  phone?: string;
  months?: number;
  releasedAt?: string;
  paidAt?: string;
  updatedAt?: string;
  createdAt?: string;
};

function hasTestUsername(jobs: IptvJob[], username: string) {
  const u = username.trim().toLowerCase();
  if (!u) return false;
  return jobs.some(
    (j) =>
      j.kind === "test" && j.panelUsername.trim().toLowerCase() === u,
  );
}

function hasRenewForMp(jobs: IptvJob[], order: MpLogOrder) {
  const id = `wa_mp_${order.id}`;
  if (jobs.some((j) => j.id === id)) return true;
  const mp = String(order.mpPaymentId || "").trim();
  if (mp && jobs.some((j) => j.note?.includes(mp))) return true;
  const user = String(order.panelUsername || "").trim().toLowerCase();
  const when = order.releasedAt || order.paidAt || order.updatedAt || "";
  if (!user || !when) return false;
  const t = new Date(when).getTime();
  if (!Number.isFinite(t)) return false;
  return jobs.some((j) => {
    if (j.kind !== "renew") return false;
    if (j.panelUsername.trim().toLowerCase() !== user) return false;
    const jt = new Date(j.updatedAt).getTime();
    return Number.isFinite(jt) && Math.abs(jt - t) < 2 * 60 * 60 * 1000;
  });
}

/** Testes gerados no WhatsApp (wa_bot_state.testConsumed) → entradas de log. */
export function jobsFromWaTestConsumed(
  testConsumed: Record<string, WaConsumedRow> | null | undefined,
  opts?: { testHours?: number },
): IptvJob[] {
  if (!testConsumed) return [];
  const hours = Math.max(1, Number(opts?.testHours) || 6);
  const out: IptvJob[] = [];
  for (const [phone, info] of Object.entries(testConsumed)) {
    if (!info || typeof info !== "object") continue;
    const username = String(info.username || "").trim();
    const at = String(info.at || "").trim() || new Date().toISOString();
    if (!username && !info.name) continue;
    const phoneKey = String(phone || "").replace(/\D/g, "") || phone;
    out.push({
      id: `wa_test_${phoneKey}_${username || at}`,
      kind: "test",
      status: "done",
      itemRefId: "",
      clientName: String(info.name || "").trim() || username || phoneKey,
      panelUsername: username,
      panelRemoteId: info.remoteId,
      phone: phoneKey,
      dueDate: null,
      months: 0,
      testHours: hours,
      note: "WhatsApp · teste gerado",
      createdAt: at,
      updatedAt: at,
    });
  }
  return out;
}

/** PIX liberados (WhatsApp/bot) → log de renovação/extensão. */
export function jobsFromReleasedMpOrders(
  orders: MpLogOrder[] | null | undefined,
): IptvJob[] {
  if (!Array.isArray(orders)) return [];
  const out: IptvJob[] = [];
  for (const order of orders) {
    if (!order?.id) continue;
    const kind = order.kind || "renew";
    if (kind === "reseller_credits") continue;
    const released =
      order.status === "released" ||
      Boolean(order.releasedAt) ||
      (order.status === "approved" && Boolean(order.paidAt));
    if (!released) continue;
    if (kind !== "renew" && kind !== "test_activate") continue;
    const at =
      order.releasedAt ||
      order.paidAt ||
      order.updatedAt ||
      order.createdAt ||
      new Date().toISOString();
    const months = Math.max(1, Math.floor(Number(order.months) || 1));
    const username = String(order.panelUsername || "").trim();
    const isTestPlan = kind === "test_activate";
    out.push({
      id: `wa_mp_${order.id}`,
      kind: "renew",
      status: "done",
      itemRefId: String(order.itemRefId || ""),
      clientName:
        String(order.clientName || "").trim() || username || "WhatsApp",
      panelUsername: username,
      phone: String(order.phone || "").replace(/\D/g, ""),
      dueDate: order.dueDate ?? null,
      months,
      testHours: 0,
      note: isTestPlan
        ? `WhatsApp · teste→plano · ${months}m · MP ${order.mpPaymentId || ""}`.trim()
        : `WhatsApp · PIX · ${months}m · MP ${order.mpPaymentId || ""}`.trim(),
      createdAt: order.createdAt || at,
      updatedAt: at,
    });
  }
  return out;
}

/**
 * Une fila local com testes/renovações vindos do WhatsApp
 * (testConsumed + pedidos PIX liberados), sem duplicar.
 */
export function mergeWhatsAppLogSources(
  jobs: IptvJob[],
  opts: {
    testConsumed?: Record<string, WaConsumedRow> | null;
    mpOrders?: MpLogOrder[] | null;
    testHours?: number;
  },
): IptvJob[] {
  let next = [...jobs];
  for (const job of jobsFromWaTestConsumed(opts.testConsumed, {
    testHours: opts.testHours,
  })) {
    if (hasTestUsername(next, job.panelUsername)) continue;
    if (next.some((j) => j.id === job.id)) continue;
    next.push(job);
  }
  for (const job of jobsFromReleasedMpOrders(opts.mpOrders)) {
    const order = (opts.mpOrders || []).find(
      (o) => `wa_mp_${o.id}` === job.id,
    );
    if (order && hasRenewForMp(next, order)) continue;
    if (next.some((j) => j.id === job.id)) continue;
    next.push(job);
  }
  return trimJobs(next);
}

export function loadIptvJobs(userId: string): IptvJob[] {
  try {
    const raw = localStorage.getItem(`${JOBS_KEY}:${userId}`);
    if (!raw) return [];
    const list = JSON.parse(raw) as IptvJob[];
    return Array.isArray(list) ? list.filter(isJob) : [];
  } catch {
    return [];
  }
}

function writeLocalJobs(userId: string, jobs: IptvJob[]) {
  localStorage.setItem(
    `${JOBS_KEY}:${userId}`,
    JSON.stringify(trimJobs(jobs)),
  );
}

async function persistJobsRemote(
  userId: string,
  jobs: IptvJob[],
): Promise<{ ok: boolean; warning?: string }> {
  if (!supabase || !userId) {
    return {
      ok: true,
      warning: "Fila salva só neste navegador (Supabase indisponível).",
    };
  }
  try {
    const { error } = await supabase.from("platform_settings").upsert(
      {
        key: jobsDbKey(userId),
        value: { jobs: trimJobs(jobs) },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) {
      return {
        ok: true,
        warning: `Salvo localmente. Nuvem: ${error.message}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: true,
      warning:
        e instanceof Error
          ? e.message
          : "Salvo localmente; falha ao gravar na nuvem.",
    };
  }
}

/**
 * Carrega fila/log: nuvem (conta) + local, mesclados.
 * Assim localhost e domínio veem as mesmas renovações.
 */
export async function loadIptvJobsRemote(userId: string): Promise<IptvJob[]> {
  const local = loadIptvJobs(userId);
  if (!supabase || !userId) return local;
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", jobsDbKey(userId))
      .maybeSingle();
    if (error || !data?.value) {
      if (local.length) void persistJobsRemote(userId, local);
      return local;
    }
    const raw =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as { jobs?: unknown })
        : (data.value as { jobs?: unknown });
    const remote = Array.isArray(raw?.jobs)
      ? (raw.jobs as unknown[]).filter(isJob)
      : [];
    const merged = mergeIptvJobs(local, remote);
    writeLocalJobs(userId, merged);
    // Se o local tinha algo a mais, sobe o merge
    if (local.length && merged.length !== remote.length) {
      void persistJobsRemote(userId, merged);
    } else if (
      local.some((j) => {
        const r = remote.find((x) => x.id === j.id);
        return !r || j.updatedAt > r.updatedAt;
      })
    ) {
      void persistJobsRemote(userId, merged);
    }
    return merged;
  } catch {
    return local;
  }
}

/** Salva local + nuvem (vinculado à conta AuxPlus). */
export function saveIptvJobs(userId: string, jobs: IptvJob[]) {
  const trimmed = trimJobs(jobs);
  writeLocalJobs(userId, trimmed);
  void persistJobsRemote(userId, trimmed);
}

export function createIptvJob(
  partial: Omit<IptvJob, "id" | "createdAt" | "updatedAt" | "status"> & {
    status?: IptvJobStatus;
  },
): IptvJob {
  const now = new Date().toISOString();
  return {
    ...partial,
    id: uid(),
    status: partial.status || "pending",
    createdAt: now,
    updatedAt: now,
  };
}

export function patchIptvJob(
  jobs: IptvJob[],
  id: string,
  patch: Partial<IptvJob>,
): IptvJob[] {
  return jobs.map((j) =>
    j.id === id
      ? { ...j, ...patch, updatedAt: new Date().toISOString() }
      : j,
  );
}

/** Nova data de vencimento após N meses (a partir do vencimento atual ou hoje). */
export function nextDueAfterRenew(
  currentDue: string | null | undefined,
  months: number,
  now = new Date(),
): string {
  const todayKey = format(now, "yyyy-MM-dd");
  const dueKey = ymdOnly(currentDue) || todayKey;
  const base =
    dueKey < todayKey ? parseLocalYmd(todayKey) : parseLocalYmd(dueKey);
  return format(addMonths(base, Math.max(1, months)), "yyyy-MM-dd");
}

/** Aplica renovação no item AuxPlus (vencimento + histórico de pagamento). */
export function applyRenewalToItem(item: Item, months: number): Item {
  const newDue = nextDueAfterRenew(item.dueDate, months);
  const draft: Item = { ...item, dueDate: newDue };
  const payments = paymentsAfterDueChange(item, draft);
  // Remove marcador de prorrogação ao renovar (ciclo pago)
  return withEmbeddedPayments(resetProrrogaUsage({ ...draft, payments }));
}

/** Atualiza vencimento do lembrete a partir da data do painel (ou +meses). */
export function applyPanelDueToItem(
  item: Item,
  opts: { panelExp?: string | null; months?: number },
): Item {
  const fromPanel = parseIptvExpToDateTime(opts.panelExp);
  if (fromPanel) {
    const draft: Item = { ...item, dueDate: fromPanel };
    const payments = paymentsAfterDueChange(item, draft);
    // Remove marcador de prorrogação ao atualizar vencimento (ciclo pago)
    return withEmbeddedPayments(resetProrrogaUsage({ ...draft, payments }));
  }
  return applyRenewalToItem(item, opts.months ?? 1);
}

/**
 * Aplica prorrogação no item (+48h ou 23:59) SEM registrar pagamento.
 * Apenas atualiza vencimento e marca uso no ciclo.
 */
export function applyProrrogaToItem(
  item: Item,
  kind: ProrrogaKind,
  panelExp?: string | null,
): Item {
  console.log("DEBUG applyProrrogaToItem:", {
    itemDue: item.dueDate,
    kind,
    panelExp,
    hasPanelExp: !!panelExp
  });

  // Usa a data do painel se fornecida, ou calcula localmente
  const newDue = panelExp
    ? parseIptvExpToDateTime(panelExp)
    : calculateNewDueDate(item.dueDate, kind);

  console.log("DEBUG applyProrrogaToItem - novo vencimento:", newDue);

  // Cria um novo item com o vencimento atualizado
  const draft: Item = {
    ...item,
    dueDate: newDue,
    // Atualiza a data de modificação para forçar re-render
    updatedAt: new Date().toISOString()
  };

  // Atualiza marcador de uso no ciclo (sem pagamentos)
  const usage = {
    usedAt: new Date().toISOString(),
    kind,
    oldDue: item.dueDate,
    newDue,
  };

  const result = withProrrogaUsage(draft, usage);
  console.log("DEBUG applyProrrogaToItem - resultado:", {
    oldDue: item.dueDate,
    newDue: result.dueDate,
    kind
  });

  return result;
}

/**
 * Remove marcador de prorrogação (para reset de ciclo pós-pagamento).
 */
export function resetProrrogaUsage(item: Item): Item {
  return withoutProrrogaUsage(item);
}

export type SyncIptvResult = {
  data: AppData;
  created: number;
  updated: number;
  skipped: number;
};

/**
 * Sincroniza só a partir dos usuários do UniPlay.
 * - Já existe → atualiza vencimento e nome (nota do painel)
 * - Não existe → cria com usuário, nome (nota) e vencimento
 * - Não apaga nem altera clientes que não estão no painel
 */
export function syncIptvUsersToFolder(
  data: AppData,
  folderId: string,
  users: IptvRemoteUser[],
  opts?: { /** Logins excluídos manualmente — não recriar */ excludedUsernames?: Set<string> },
): SyncIptvResult {
  let next = data;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const excluded = opts?.excludedUsernames;

  const folderItems = () =>
    next.items.filter((i) => i.folderId === folderId && i.isActive !== false);

  for (const remote of users) {
    // Só exclui teste AINDA ativo (vence em horas). Teste ativado (plano de
    // semanas/meses) entra como cliente — mesmo com flag test_hours no painel.
    if (isShortLivedIptvTest(remote)) {
      skipped += 1;
      continue;
    }
    const username = String(remote.username || remote.user || "").trim();
    if (!username) {
      skipped += 1;
      continue;
    }
    const dueDate = parseIptvExpToDateTime(
      remote.exp_date ?? remote.expDate,
    );
    const nota = String(remote.nota ?? "").trim();
    const name =
      nota ||
      (remote.name && String(remote.name).trim()) ||
      username;

    const existing = folderItems().find(
      (i) => i.itemId.trim().toLowerCase() === username.toLowerCase(),
    );

    if (!existing && excluded?.has(username.toLowerCase())) {
      skipped += 1;
      continue;
    }

    if (existing) {
      const patch: Partial<typeof existing> = {};
      const existingDue = existing.dueDate
        ? parseIptvExpToDateTime(existing.dueDate) ||
          `${ymdOnly(existing.dueDate)} 00:00:00`
        : "";
      if (dueDate && existingDue !== dueDate) {
        patch.dueDate = dueDate;
      }
      if (name && name !== (existing.name || "").trim()) {
        patch.name = name;
      } else {
        const fixedLocal = fixUtf8Mojibake(existing.name || "");
        if (fixedLocal && fixedLocal !== existing.name) {
          patch.name = fixedLocal;
        }
      }
      // Telefone só preenche se vazio no AuxPlus — nunca sobrescreve o editado
      const remotePhone = String(remote.phone || "").trim();
      if (remotePhone && !(existing.phone || "").trim()) patch.phone = remotePhone;
      // “Criado em” do painel → só preenche se vazio no AuxPlus (nunca sobrescreve)
      if (remote.createdAt && !existing.createdAt) {
        patch.createdAt = remote.createdAt.slice(0, 19);
      }
      if (Object.keys(patch).length === 0) {
        skipped += 1;
        continue;
      }
      next = updateItem(next, { ...existing, ...patch });
      updated += 1;
    } else {
      next = createItem(next, {
        folderId,
        itemId: username,
        name,
        dueDate,
        phone: String(remote.phone || "").trim(),
        price: 0,
        createdAt: remote.createdAt ? remote.createdAt.slice(0, 19) : null,
        isActive: true,
      });
      created += 1;
    }
  }

  return { data: next, created, updated, skipped };
}

/** Notas automáticas do sync de revendedores (e-mail / ativos). */
function buildResellerSyncNotes(
  remote: IptvReseller,
  existingNotes?: string | null,
  payments?: ItemPayment[],
): string {
  const pays = payments?.length
    ? payments
    : extractPaymentsFromNotes(existingNotes);
  const clean = stripResellerMarker(
    stripPaymentMarker(existingNotes),
  )
    .split("\n")
    .filter(
      (line) =>
        !/^E-mail:\s*/i.test(line.trim()) &&
        !/^Ativos:\s*/i.test(line.trim()) &&
        !/^Última recarga:\s*/i.test(line.trim()),
    )
    .join("\n")
    .trim();
  const auto: string[] = [];
  if (remote.email?.trim()) auto.push(`E-mail: ${remote.email.trim()}`);
  if (remote.ativosLabel?.trim()) {
    auto.push(`Ativos: ${remote.ativosLabel.trim()}`);
  }
  if (
    remote.daysToDue != null &&
    Number.isFinite(remote.daysToDue) &&
    remote.daysToDue >= 0
  ) {
    const d = Math.floor(remote.daysToDue);
    auto.push(`Última recarga: ${d} ${d === 1 ? "dia" : "dias"}`);
  }
  const body = [clean, ...auto].filter(Boolean).join("\n");
  const withPay = embedPaymentsInNotes(body, pays);
  const bought = extractResellerCreditsBought(existingNotes);
  return bought != null
    ? embedResellerCreditsBought(withPay, bought)
    : withPay;
}

/**
 * Registra recarga de revendedor: +créditos no saldo, soma em
 * créditos comprados (Consultar Anual), PIX no histórico e “Última recarga”.
 */
export function applyResellerRechargeToItem(
  item: Item,
  opts: { credits: number; amountBrl: number; paidAt?: string },
): Item {
  const credits = Math.max(0, Math.floor(Number(opts.credits) || 0));
  const amountBrl = Math.round((Number(opts.amountBrl) || 0) * 100) / 100;
  const paidAt = String(
    opts.paidAt || format(new Date(), "yyyy-MM-dd"),
  ).slice(0, 10);

  let notes = stripPaymentMarker(item.notes)
    .split("\n")
    .filter((line) => !/^Última recarga:\s*/i.test(line.trim()))
    .join("\n")
    .trim();
  notes = notes
    ? `${notes}\nÚltima recarga: 0 dias`
    : "Última recarga: 0 dias";

  const withCredits = withResellerCreditsBoughtDelta(
    {
      ...item,
      price: (Number(item.price) || 0) + credits,
      notes,
      dueDate: null,
    },
    credits,
  );
  if (amountBrl <= 0) {
    return withEmbeddedPayments({
      ...withCredits,
      payments: getRecordedPayments(item),
    });
  }
  return appendItemPayment(withCredits, { paidAt, amount: amountBrl });
}

/**
 * Sincroniza revendedores do UniPlay numa pasta.
 * - itemId = login do revendedor
 * - name = nota/nome
 * - phone = WhatsApp do painel (no UniPlay costuma vir em `email`)
 * - price = créditos (saldo no painel — não é R$)
 * - notes = e-mail / ativos / última recarga
 * - dueDate = normalmente vazio (revendedor não tem vencimento de cliente)
 */
export function syncIptvResellersToFolder(
  data: AppData,
  folderId: string,
  resellers: IptvReseller[],
  opts?: { excludedUsernames?: Set<string> },
): SyncIptvResult {
  let next = data;
  let created = 0;
  let updated = 0;
  let skipped = 0;
  const excluded = opts?.excludedUsernames;

  const folderItems = () =>
    next.items.filter((i) => i.folderId === folderId && i.isActive !== false);

  for (const remote of resellers) {
    const username = String(remote.username || "").trim();
    if (!username) {
      skipped += 1;
      continue;
    }
    // Revendedor não usa vencimento de cliente — dueDate vazio evita o gráfico
    // tratar saldo de créditos (price) como se fosse R$.
    const dueDate = "";
    const name =
      (remote.name && String(remote.name).trim()) ||
      (remote.nota && String(remote.nota).trim()) ||
      username;
    const phone = remote.phone?.trim() || "";
    const credits =
      typeof remote.credits === "number" && Number.isFinite(remote.credits)
        ? remote.credits
        : null;

    const existing = folderItems().find(
      (i) => i.itemId.trim().toLowerCase() === username.toLowerCase(),
    );

    if (!existing && excluded?.has(username.toLowerCase())) {
      skipped += 1;
      continue;
    }

    if (existing) {
      const patch: Partial<typeof existing> = {};
      if (existing.dueDate) patch.dueDate = dueDate;
      if (name && name !== (existing.name || "").trim()) patch.name = name;
      // Telefone só preenche se vazio no AuxPlus — nunca sobrescreve o editado
      if (phone && !(existing.phone || "").trim()) patch.phone = phone;
      if (credits != null && credits !== existing.price) patch.price = credits;
      // Inicia histórico editável com o saldo atual (só na 1ª vez)
      if (
        existing.resellerCreditsBought == null &&
        credits != null &&
        credits >= 0
      ) {
        patch.resellerCreditsBought = Math.max(
          getResellerCreditsBought(existing),
          Math.floor(credits),
        );
      }
      // Limpa pagamentos sintéticos (saldo antigo contado como R$)
      const recorded = getRecordedPayments(existing).filter(
        (p) => Number(p.amount) >= 10,
      );
      const nextNotes = buildResellerSyncNotes(
        remote,
        existing.notes,
        recorded,
      );
      if (
        nextNotes !== (existing.notes || "").trim() ||
        recorded.length !== getRecordedPayments(existing).length
      ) {
        patch.notes = nextNotes;
        patch.payments = recorded;
      }
      if (
        remote.createdAt &&
        !existing.createdAt &&
        /^\d{4}-\d{2}-\d{2}/.test(remote.createdAt)
      ) {
        patch.createdAt = remote.createdAt.slice(0, 19).replace("T", " ");
      }
      if (Object.keys(patch).length === 0) {
        skipped += 1;
        continue;
      }
      next = updateItem(next, { ...existing, ...patch });
      updated += 1;
    } else {
      const startCredits = Math.max(0, Math.floor(credits ?? 0));
      next = createItem(next, {
        folderId,
        itemId: username,
        name,
        dueDate,
        phone,
        price: startCredits,
        notes: buildResellerSyncNotes(remote, null, []),
        payments: [],
        resellerCreditsBought: startCredits,
        createdAt:
          remote.createdAt && /^\d{4}-\d{2}-\d{2}/.test(remote.createdAt)
            ? remote.createdAt.slice(0, 19).replace("T", " ")
            : null,
        isActive: true,
      });
      created += 1;
    }
  }

  return { data: next, created, updated, skipped };
}

function movementDateToYmd(at: string): string | null {
  const m = String(at || "")
    .trim()
    .match(/^(\d{4})-(\d{2})-(\d{2})|^(\d{2})\/(\d{2})\/(\d{4})/);
  if (!m) return null;
  if (m[1]) return `${m[1]}-${m[2]}-${m[3]}`;
  return `${m[6]}-${m[5]}-${m[4]}`;
}

/**
 * Aplica as movimentações (recargas) de cada revendedor nos itens da pasta:
 * - recalcula os créditos comprados (soma das recargas)
 * - grava cada recarga como pagamento (data + valor) → alimenta a Receita por mês
 *
 * Recargas "AuxPlus PIX" ficam de fora porque o app já registra esses valores
 * como pagamento no momento da liberação (evita contar em dobro).
 */
export function applyResellerMovementsToFolder(
  data: AppData,
  folderId: string,
  movementLogs: Map<string, IptvResellerMovement[]>,
): AppData {
  if (!movementLogs.size) return data;
  let changed = false;
  const items = data.items.map((i) => {
    if (i.folderId !== folderId || i.isActive === false) return i;
    const key = String(i.itemId || "").trim().toLowerCase();
    const list = key ? movementLogs.get(key) : undefined;
    if (!list || !list.length) return i;

    const total = Math.floor(
      list.reduce((s, m) => s + (Number(m.credits) || 0), 0),
    );
    let next = withResellerCreditsBought(i, total);
    if (getResellerCreditsBought(i) !== total) changed = true;

    // Recargas já gravadas (PIX liberado pelo app etc.) — dedupe por data+valor
    const seen = new Set(
      getRecordedPayments(i).map(
        (p) =>
          `${String(p.paidAt).slice(0, 10)}|${Math.round(
            Number(p.amount) * 100,
          )}`,
      ),
    );
    for (const m of list) {
      if (/AuxPlus PIX/i.test(m.obs || "")) continue;
      const amount = Math.round((Number(m.faturado) || 0) * 100) / 100;
      if (amount <= 0) continue;
      const paidAt = movementDateToYmd(m.at);
      if (!paidAt) continue;
      const k = `${paidAt}|${Math.round(amount * 100)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      next = appendItemPayment(next, { paidAt, amount });
      changed = true;
    }
    return next;
  });
  return changed ? { ...data, items } : data;
}

export type SyncPanelTestsResult = {
  jobs: IptvJob[];
  created: number;
  updated: number;
  removed: number;
};

/**
 * Espelha os testes da lista UniPlay na fila local (jobs kind=test).
 * - Cria/atualiza cada teste encontrado no painel
 * - Remove da aba Testes o que foi apagado no painel (ghost local/WhatsApp)
 * - Mantém só jobs locais ainda em andamento (pending/doing)
 * - Não mexe em jobs de renovação
 * - Nunca promove cliente AuxPlus (excludeUsernames) a “teste”
 */
export function mergePanelTestsIntoJobs(
  jobs: IptvJob[],
  remoteUsers: IptvRemoteUser[],
  opts?: {
    m3uHost?: string;
    dnsFallback?: string;
    /** Logins já cadastrados como cliente no AuxPlus — nunca entram em Testes */
    excludeUsernames?: Iterable<string>;
  },
): SyncPanelTestsResult {
  const excluded = new Set(
    [...(opts?.excludeUsernames || [])]
      .map((u) => String(u || "").trim().toLowerCase())
      .filter(Boolean),
  );

  /**
   * Só teste “de verdade” no painel:
   * - flag / test_hours do UniPlay, ou
   * - vida útil curta (horas), ou
   * - nome “teste” SOMENTE se ainda acaba em poucas horas
   *
   * Evita plano mensal que ficou com nota “Teste WhatsApp…” após ativar.
   */
  const isTestForSync = (u: IptvRemoteUser) => {
    const username = String(u.username || u.user || "")
      .trim()
      .toLowerCase();
    if (username && excluded.has(username)) return false;

    const row = u as Record<string, unknown>;
    const expFull = parseIptvExpToDateTime(u.exp_date ?? u.expDate);
    const expMs = expFull
      ? new Date(expFull.replace(" ", "T")).getTime()
      : NaN;
    const left = Number.isFinite(expMs) ? expMs - Date.now() : NaN;
    const created = parseIptvExpToDateTime(
      String(row.created_at ?? row.createdAt ?? row.created ?? ""),
    );
    const lifeMs =
      created && Number.isFinite(expMs)
        ? expMs - new Date(created.replace(" ", "T")).getTime()
        : NaN;

    // Plano longo (≥7 dias de vida) nunca entra em Testes
    if (Number.isFinite(lifeMs) && lifeMs >= 7 * 86_400_000) return false;
    // Ainda tem mais de 2 dias de validade → não é teste de horas
    if (Number.isFinite(left) && left > 2 * 86_400_000) return false;

    // Flag oficial do painel
    const testHours = Number(row.test_hours ?? row.testHours ?? 0);
    if (Number.isFinite(testHours) && testHours > 0) return true;
    for (const k of [
      "is_test",
      "is_trial",
      "isTest",
      "isTrial",
      "trial",
      "teste",
      "is_teste",
    ]) {
      const v = row[k];
      if (v === true || v === 1 || v === "1" || v === "true") return true;
    }

    // Vida útil total curta (criação → exp)
    if (Number.isFinite(lifeMs) && lifeMs >= 0 && lifeMs < 2 * 86_400_000) {
      return true;
    }

    // Nome/nota “teste” só conta se acaba em até 18h (teste ativo)
    const label = [row.nota, row.note, row.obs, row.notes, row.name]
      .map((v) => String(v ?? "").toLowerCase())
      .join(" ");
    const nameIsTest =
      /\bteste\b|\btest\b|\btrial\b|teste auxplus|teste uniplay/i.test(label);
    if (
      nameIsTest &&
      Number.isFinite(left) &&
      left > -3_600_000 &&
      left <= 18 * 3_600_000
    ) {
      return true;
    }

    // Login numérico ainda válido por até 18h (sem created_at)
    if (
      /^\d{6,}$/.test(username) &&
      Number.isFinite(left) &&
      left > -3_600_000 &&
      left <= 18 * 3_600_000
    ) {
      return true;
    }

    return false;
  };

  const tests = remoteUsers.filter(isTestForSync);
  const renewJobs = jobs.filter((j) => j.kind !== "test");
  const existingTests = jobs.filter((j) => j.kind === "test");
  const usedJobIds = new Set<string>();
  const nextTests: IptvJob[] = [];
  let created = 0;
  let updated = 0;

  const matchExisting = (remote: IptvRemoteUser): IptvJob | undefined => {
    const username = String(remote.username || remote.user || "")
      .trim()
      .toLowerCase();
    const rid = remote.id != null ? String(remote.id) : "";
    return existingTests.find((j) => {
      if (usedJobIds.has(j.id)) return false;
      if (rid && j.panelRemoteId != null && String(j.panelRemoteId) === rid) {
        return true;
      }
      return (
        Boolean(username) &&
        j.panelUsername.trim().toLowerCase() === username
      );
    });
  };

  for (const remote of tests) {
    const username = String(remote.username || remote.user || "").trim();
    if (!username) continue;

    const row = remote as Record<string, unknown>;
    const dueDate =
      parseIptvExpToDateTime(remote.exp_date ?? remote.expDate) || null;
    const nota = String(remote.nota ?? "").trim();
    const clientName =
      nota ||
      (remote.name && String(remote.name).trim()) ||
      username ||
      "Teste UniPlay";
    const password =
      (typeof remote.password === "string" && remote.password.trim()) ||
      "";
    const testHoursRaw = Number(row.test_hours ?? row.testHours ?? 0);
    const testHours =
      Number.isFinite(testHoursRaw) && testHoursRaw > 0
        ? Math.max(1, Math.min(6, Math.round(testHoursRaw)))
        : 6;
    const links = resolveTestAccessLinks({
      username,
      password,
      m3u:
        typeof row.m3u === "string"
          ? row.m3u
          : typeof row.url_m3u === "string"
            ? row.url_m3u
            : undefined,
      dnsSmarters:
        typeof row.dns === "string"
          ? row.dns
          : typeof row.dns_smarters === "string"
            ? row.dns_smarters
            : undefined,
      m3uHost: opts?.m3uHost,
      dnsFallback: opts?.dnsFallback,
    });

    const existing = matchExisting(remote);
    if (existing) {
      usedJobIds.add(existing.id);
      nextTests.push({
        ...existing,
        status: existing.status === "failed" ? "done" : existing.status,
        panelUsername: username,
        panelRemoteId: remote.id ?? existing.panelRemoteId,
        panelPassword: password || existing.panelPassword,
        m3u: links.m3u || existing.m3u,
        dnsSmarters: links.dnsSmarters || existing.dnsSmarters,
        clientName,
        dueDate: dueDate ?? existing.dueDate,
        testHours,
        // Telefone só preenche se vazio no AuxPlus — nunca sobrescreve o editado
        phone: String(remote.phone || "").trim() || existing.phone,
        note: `UniPlay · ${username}${password ? ` / ${password}` : ""}`,
        updatedAt: new Date().toISOString(),
      });
      updated += 1;
    } else {
      nextTests.push(
        createIptvJob({
          kind: "test",
          status: "done",
          itemRefId: "",
          clientName,
          panelUsername: username,
          panelRemoteId: remote.id,
          panelPassword: password || undefined,
          m3u: links.m3u || undefined,
          dnsSmarters: links.dnsSmarters || undefined,
          phone: String(remote.phone || "").trim(),
          dueDate,
          months: 1,
          testHours,
          note: `UniPlay · ${username}${password ? ` / ${password}` : ""}`,
        }),
      );
      created += 1;
    }
  }

  // Só mantém o que ainda está no painel (+ pending/doing local).
  // Antes: WhatsApp/histórico ficavam pra sempre mesmo após apagar no UniPlay.
  const keepMissing = existingTests.filter((j) => {
    if (usedJobIds.has(j.id)) return false;
    const u = j.panelUsername.trim().toLowerCase();
    if (u && excluded.has(u)) return false;
    return j.status === "pending" || j.status === "doing";
  });
  const nextTestsClean = nextTests.filter((j) => {
    const u = j.panelUsername.trim().toLowerCase();
    return !(u && excluded.has(u));
  });
  const removed =
    existingTests.filter(
      (j) => !usedJobIds.has(j.id) && !keepMissing.includes(j),
    ).length +
    (nextTests.length - nextTestsClean.length);

  const jobsOut = [...renewJobs, ...nextTestsClean, ...keepMissing].sort(
    (a, b) => b.updatedAt.localeCompare(a.updatedAt),
  );

  return {
    jobs: jobsOut,
    created,
    updated,
    removed,
  };
}

export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
