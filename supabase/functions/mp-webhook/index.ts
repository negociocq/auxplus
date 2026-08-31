/**
 * Webhook Mercado Pago + poll de backup.
 *
 * URL (produção):
 *   POST https://jcuehnzaonhdcjbxhadz.supabase.co/functions/v1/mp-webhook
 *
 * No painel MP → Sua integração → Webhooks:
 *   - URL acima
 *   - Evento: Order (Mercado Pago)  [e Payments, se existir]
 *
 * Poll de backup (cron / manual):
 *   POST { "action": "poll" }  com header x-cron-secret = MP_CRON_SECRET
 *
 * Ao receber pagamento aprovado: libera UniPlay + atualiza item + WhatsApp.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret, x-signature, x-request-id",
};

const PANEL_ORIGIN = "https://searchdefense.top";
const UPSTREAM = "https://gesapioffice.com/api";
const RELEASING_MARK = "__releasing__";
/** Trava atômica de liberação (por pedido): só um lado libera o PIX. */
const CLAIM_TTL_MS = 2 * 60 * 1000;
const claimKey = (orderId: string) => `mp_claim_${orderId}`;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function sb() {
  const url = Deno.env.get("SUPABASE_URL") || "";
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  if (!url || !key) throw new Error("Supabase service role ausente");
  return createClient(url, key);
}

async function getSetting<T>(
  client: ReturnType<typeof createClient>,
  key: string,
): Promise<T | null> {
  const { data } = await client
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();
  if (!data?.value) return null;
  if (typeof data.value === "string") {
    try {
      return JSON.parse(data.value) as T;
    } catch {
      return null;
    }
  }
  return data.value as T;
}

async function putSetting(
  client: ReturnType<typeof createClient>,
  key: string,
  value: unknown,
) {
  await client.from("platform_settings").upsert(
    { key, value, updated_at: new Date().toISOString() },
    { onConflict: "key" },
  );
}

type MpOrder = {
  id: string;
  mpPaymentId: string;
  status: string;
  itemRefId?: string;
  clientName?: string;
  panelUsername?: string;
  dueDate?: string | null;
  phone?: string;
  months?: number;
  credits?: number;
  amount?: number;
  kind?: "renew" | "reseller_credits" | "test_activate" | string;
  screens?: number;
  testApp?: string;
  testPassword?: string;
  testRemoteId?: string | number;
  createdAt?: string;
  updatedAt?: string;
  paidAt?: string;
  releasedAt?: string;
  error?: string;
  expiresAt?: string;
  pixCopyPaste?: string;
  /** true se já enviou notificação de erro (evita reenviá-la) */
  errorNotificationSent?: boolean;
};

type FoundOrder = { userId: string; order: MpOrder; orders: MpOrder[] };

function moneyBrl(n: number) {
  return (Number(n) || 0).toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
  });
}

function formatBrDate(raw?: string | null) {
  if (!raw) return "—";
  const s = String(raw).slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return s;
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function ymdOnly(raw?: string | null) {
  const s = String(raw || "").trim();
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(s);
  return m?.[1] || "";
}

function nextDueAfterRenew(currentDue: string | null | undefined, months: number) {
  const today = new Date();
  const todayKey = today.toISOString().slice(0, 10);
  const dueKey = ymdOnly(currentDue) || todayKey;
  const baseKey = dueKey < todayKey ? todayKey : dueKey;
  const [y, mo, d] = baseKey.split("-").map(Number);
  const base = new Date(y!, (mo || 1) - 1, d || 1);
  base.setMonth(base.getMonth() + Math.max(1, Math.floor(months) || 1));
  const yy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

function mapMpStatus(status: string): "pending" | "approved" | "cancelled" | "rejected" | "expired" {
  const s = status.toLowerCase();
  if (["approved", "processed", "paid", "accredited"].includes(s)) {
    return "approved";
  }
  if (s === "cancelled" || s === "canceled") return "cancelled";
  if (s === "rejected" || s === "failed") return "rejected";
  if (s === "expired") return "expired";
  return "pending";
}

function extractOrderStatus(data: Record<string, unknown>) {
  const tx = (data.transactions || {}) as {
    payments?: Array<Record<string, unknown>>;
  };
  const payment = Array.isArray(tx.payments) ? tx.payments[0] : undefined;
  const status = String(
    payment?.status || data.status || "pending",
  ).toLowerCase();
  const paymentId = payment?.id ? String(payment.id) : "";
  return { status, paymentId, mapped: mapMpStatus(status) };
}

async function fetchMpOrderStatus(accessToken: string, paymentId: string) {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
  };
  const orderRes = await fetch(
    `https://api.mercadopago.com/v1/orders/${encodeURIComponent(paymentId)}`,
    { headers },
  );
  if (orderRes.ok) {
    const data = (await orderRes.json()) as Record<string, unknown>;
    return extractOrderStatus(data);
  }
  const payRes = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}`,
    { headers },
  );
  const payData = (await payRes.json().catch(() => ({}))) as Record<
    string,
    unknown
  >;
  if (!payRes.ok) {
    throw new Error(
      String(payData.message || payData.error || `MP ${payRes.status}`),
    );
  }
  return {
    status: String(payData.status || "pending").toLowerCase(),
    paymentId: String(payData.id || paymentId),
    mapped: mapMpStatus(String(payData.status || "pending")),
  };
}

let uniplayProxyPrefer = "";

function uniplayProxyCandidates(): string[] {
  const list = [
    uniplayProxyPrefer.replace(/\/$/, ""),
    "https://auxplus.vercel.app/api/gesapi",
  ].filter(Boolean);
  return [...new Set(list)];
}

async function uniplayFetch(
  path: string,
  bearer: string,
  init?: RequestInit,
) {
  const apiPath = path.startsWith("/") ? path : `/${path}`;
  const token = bearer.replace(/^Bearer\s+/i, "").trim();
  const method = (init?.method || "GET").toUpperCase();
  const body =
    init?.body == null
      ? undefined
      : typeof init.body === "string"
        ? init.body
        : String(init.body);

  const attempts: Array<{ kind: "proxy" | "direct"; base: string }> = [
    ...uniplayProxyCandidates().map((base) => ({
      kind: "proxy" as const,
      base,
    })),
    { kind: "direct", base: UPSTREAM },
  ];

  let lastErr: Error | null = null;
  for (const attempt of attempts) {
    try {
      let res: Response;
      if (attempt.kind === "proxy") {
        const headers: Record<string, string> = {
          Accept: "application/json, text/plain, */*",
          "Content-Type": "application/json",
          "x-iptv-path": apiPath,
          "ngrok-skip-browser-warning": "true",
        };
        if (token) headers["x-iptv-authorization"] = `Bearer ${token}`;
        res = await fetch(attempt.base, {
          method,
          headers,
          body: method === "GET" || method === "HEAD" ? undefined : body,
        });
      } else {
        const headers: Record<string, string> = {
          Accept: "application/json",
          "Content-Type": "application/json",
          Origin: PANEL_ORIGIN,
          Referer: `${PANEL_ORIGIN}/`,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        };
        if (token) headers.Authorization = `Bearer ${token}`;
        res = await fetch(`${UPSTREAM}${apiPath}`, {
          method,
          headers,
          body: method === "GET" || method === "HEAD" ? undefined : body,
        });
      }
      const text = await res.text();
      let data: unknown = {};
      try {
        data = text ? JSON.parse(text) : {};
      } catch {
        data = { message: text.slice(0, 200) };
      }
      if (!res.ok) {
        const obj =
          data && typeof data === "object"
            ? (data as Record<string, unknown>)
            : {};
        const msg = String(obj.message || obj.error || `UniPlay ${res.status}`);
        lastErr = new Error(msg);
        if ([404, 403, 500, 502, 503].includes(res.status)) continue;
        throw lastErr;
      }
      return data;
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
    }
  }
  throw lastErr || new Error("Falha UniPlay");
}

function tokenNeedsRefresh(token: string) {
  const t = token.replace(/^Bearer\s+/i, "").trim();
  if (!t) return true;
  try {
    const parts = t.split(".");
    if (parts.length < 2) return false;
    const payload = JSON.parse(
      atob(parts[1]!.replace(/-/g, "+").replace(/_/g, "/")),
    ) as { exp?: number };
    const exp = Number(payload.exp || 0);
    if (!exp) return false;
    return exp * 1000 < Date.now() + 10 * 60 * 1000;
  } catch {
    return false;
  }
}

async function ensurePanelBearer(
  client: ReturnType<typeof createClient>,
  userId: string,
  automations: Record<string, unknown>,
): Promise<string> {
  let bearer = String(automations.iptvBearerToken || "")
    .trim()
    .replace(/^Bearer\s+/i, "");
  const panelUser = String(automations.iptvUsername || "").trim();
  const panelPass = String(automations.iptvPassword || "");
  if (!tokenNeedsRefresh(bearer)) return bearer;
  if (!panelUser || !panelPass) {
    if (!bearer) throw new Error("UniPlay desconectada");
    return bearer;
  }
  const login = await uniplayFetch("/login", "", {
    method: "POST",
    body: JSON.stringify({
      username: panelUser,
      password: panelPass,
      code: "",
    }),
  });
  const walk = (v: unknown, depth = 0): string => {
    if (depth > 4 || v == null) return "";
    if (typeof v === "string") {
      const s = v.trim();
      if (s.length > 40 && (s.includes(".") || s.startsWith("ey"))) return s;
      return "";
    }
    if (Array.isArray(v)) {
      for (const item of v) {
        const t = walk(item, depth + 1);
        if (t) return t;
      }
      return "";
    }
    if (typeof v === "object") {
      const obj = v as Record<string, unknown>;
      for (const key of [
        "access_token",
        "token",
        "bearer",
        "jwt",
        "Authorization",
      ]) {
        const t = walk(obj[key], depth + 1);
        if (t) return t.replace(/^Bearer\s+/i, "").trim();
      }
      for (const val of Object.values(obj)) {
        const t = walk(val, depth + 1);
        if (t) return t;
      }
    }
    return "";
  };
  bearer = walk(login).replace(/^Bearer\s+/i, "").trim();
  if (!bearer) throw new Error("Falha ao renovar token UniPlay");
  const nextAuto = { ...automations, iptvBearerToken: bearer };
  await putSetting(client, `automations_user_${userId}`, nextAuto);
  automations.iptvBearerToken = bearer;
  return bearer;
}

async function findUniplayUserId(bearer: string, username: string) {
  const want = username.trim().toLowerCase();
  if (!want) return null;
  const listed = (await uniplayFetch("/users-iptv", bearer)) as unknown;
  const rows = Array.isArray(listed)
    ? listed
    : Array.isArray((listed as { data?: unknown })?.data)
      ? ((listed as { data: unknown[] }).data)
      : [];
  for (const row of rows) {
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const u = String(r.username || r.user || "").trim().toLowerCase();
    if (u === want) return r.id ?? r.user_id ?? r.uid ?? null;
  }
  return null;
}

async function renewIptvUser(
  bearer: string,
  remoteUserId: string | number,
  credits: number,
) {
  const body = JSON.stringify({
    action: 1,
    credits: Math.max(0.1, Number(credits) || 1),
  });
  const path = `/users-iptv/${encodeURIComponent(String(remoteUserId))}`;
  let last: Error | null = null;
  for (const method of ["PUT", "PATCH", "POST"] as const) {
    try {
      return await uniplayFetch(path, bearer, { method, body });
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
      if (/405|Method Not Allowed|não permitido/i.test(last.message)) continue;
      throw last;
    }
  }
  throw last || new Error("Falha ao renovar UniPlay");
}

async function addResellerCredits(
  bearer: string,
  resellerId: string | number,
  credits: number,
  saleBrl: number,
  reason: string,
) {
  const idRes = Math.floor(Number(resellerId));
  if (!Number.isFinite(idRes) || idRes <= 0) {
    throw new Error("Revendedor sem ID numérico");
  }
  const sale = Math.min(100, Math.max(0.01, Math.round(saleBrl * 100) / 100));
  const actionBody = JSON.stringify({
    action: 0,
    credits: Math.floor(credits),
    sale,
    reason: reason || "AuxPlus PIX",
  });
  const path = `/reg-users/${encodeURIComponent(String(idRes))}`;
  let last: Error | null = null;
  for (const method of ["PUT", "POST", "PATCH"] as const) {
    try {
      return await uniplayFetch(path, bearer, { method, body: actionBody });
    } catch (e) {
      last = e instanceof Error ? e : new Error(String(e));
      if (/405|Method Not Allowed|não permitido/i.test(last.message)) continue;
      break;
    }
  }
  return await uniplayFetch("/recargas/criar", bearer, {
    method: "POST",
    body: JSON.stringify({
      id_res: idRes,
      qtd_creditos: Math.floor(credits),
    }),
  });
}

async function listResellers(bearer: string, search: string) {
  const q = new URLSearchParams({
    page: "1",
    per_page: "100",
    search: search.trim(),
  });
  const listed = (await uniplayFetch(`/reg-users?${q}`, bearer)) as unknown;
  const rows = Array.isArray(listed)
    ? listed
    : Array.isArray((listed as { data?: unknown })?.data)
      ? ((listed as { data: unknown[] }).data)
      : [];
  return rows.filter((r) => r && typeof r === "object") as Array<
    Record<string, unknown>
  >;
}

async function sendEvolutionText(
  apiBaseUrl: string,
  apiKey: string,
  instance: string,
  phone: string,
  text: string,
) {
  const digits = String(phone || "").replace(/\D/g, "");
  if (digits.length < 10 || !text.trim()) return false;
  let number = digits;
  if (number.length === 10 || number.length === 11) number = `55${number}`;
  const base = apiBaseUrl.replace(/\/$/, "");
  const url = `${base}/message/sendText/${encodeURIComponent(instance)}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      "ngrok-skip-browser-warning": "true",
    },
    body: JSON.stringify({
      number,
      text,
      delay: 1200,
    }),
  });
  return res.ok;
}

async function fetchEvolutionOwnerPhone(
  apiBaseUrl: string,
  apiKey: string,
  instance: string,
): Promise<string> {
  const base = apiBaseUrl.replace(/\/$/, "");
  const name = encodeURIComponent(instance);
  try {
    const res = await fetch(
      `${base}/instance/fetchInstances?instanceName=${name}`,
      { headers: { apikey: apiKey } },
    );
    const raw = await res.json().catch(() => null);
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object"
        ? [raw]
        : [];
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const obj = row as Record<string, unknown>;
      const nested =
        obj.instance && typeof obj.instance === "object"
          ? (obj.instance as Record<string, unknown>)
          : obj;
      const owner = String(
        nested.ownerJid ||
          nested.owner ||
          nested.wuid ||
          nested.number ||
          obj.ownerJid ||
          obj.owner ||
          obj.number ||
          "",
      ).trim();
      const digits = String(owner || "").replace(/\D/g, "");
      if (digits.length >= 10) return digits;
    }
  } catch {
    /* ignore */
  }
  return "";
}

async function notifyOwnerManualActivation(
  apiBaseUrl: string,
  apiKey: string,
  instance: string,
  contactPhone: string,
  username: string,
  amount: number,
  reason?: string,
) {
  const owner = await fetchEvolutionOwnerPhone(apiBaseUrl, apiKey, instance);
  if (!owner) return;
  if (owner === String(contactPhone || "").replace(/\D/g, "")) return;
  const reasonText = reason ? `\nMotivo: *${reason}*` : "";
  const text =
    `🔔 *Ativação manual*\n\n` +
    `Cliente *${username}* pagou o plano (R$ ${amount.toFixed(2)}).\n` +
    `Número: *${contactPhone}*${reasonText}\n\n` +
    `_Responda no chat dessa pessoa para concluir a ativação._`;
  await sendEvolutionText(apiBaseUrl, apiKey, instance, owner, text);
}

async function resolveInstanceName(
  client: ReturnType<typeof createClient>,
  userId: string,
): Promise<string> {
  const { data } = await client
    .from("platform_settings")
    .select("key,value")
    .like("key", "wa_instance_%");
  for (const row of data || []) {
    const val =
      typeof row.value === "string"
        ? (() => {
            try {
              return JSON.parse(row.value) as { userId?: string; instanceName?: string };
            } catch {
              return null;
            }
          })()
        : (row.value as { userId?: string; instanceName?: string } | null);
    if (String(val?.userId || "") === String(userId)) {
      return String(val?.instanceName || row.key.replace(/^wa_instance_/, ""));
    }
  }
  const evo =
    (await getSetting<{ instancePrefix?: string }>(client, "evolution_api")) ||
    {};
  const prefix = String(evo.instancePrefix || "auxplus").replace(
    /[^a-zA-Z0-9_-]/g,
    "",
  );
  const { data: user } = await client
    .from("users")
    .select("username")
    .eq("id", userId)
    .maybeSingle();
  const uname = String(user?.username || "u").replace(/[^a-zA-Z0-9]/g, "");
  const id = String(userId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  return `${prefix}-${uname || "u"}${id}`.slice(0, 60);
}

async function findOrderByPaymentId(
  client: ReturnType<typeof createClient>,
  paymentId: string,
): Promise<FoundOrder | null> {
  const want = String(paymentId || "").trim();
  if (!want) return null;
  const wantLower = want.toLowerCase();
  const { data } = await client
    .from("platform_settings")
    .select("key,value")
    .like("key", "mp_orders_user_%");
  for (const row of data || []) {
    const userId = String(row.key || "").replace(/^mp_orders_user_/, "");
    const bag =
      typeof row.value === "string"
        ? (() => {
            try {
              return JSON.parse(row.value) as { orders?: unknown[] };
            } catch {
              return { orders: [] };
            }
          })()
        : ((row.value || { orders: [] }) as { orders?: unknown[] });
    const orders = Array.isArray(bag.orders)
      ? (bag.orders as MpOrder[])
      : [];
    const order = orders.find((o) => {
      const id = String(o?.mpPaymentId || "").trim();
      return id === want || id.toLowerCase() === wantLower;
    });
    if (order) return { userId, order, orders };
  }
  return null;
}

async function saveOrders(
  client: ReturnType<typeof createClient>,
  userId: string,
  orders: MpOrder[],
) {
  const trimmed = [...orders]
    .sort((a, b) =>
      String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")),
    )
    .slice(0, 200);
  await putSetting(client, `mp_orders_user_${userId}`, { orders: trimmed });
}

/**
 * Trava atômica de liberação (por pedido): `insert` com chave única é o
 * compare-and-set — quem inserir primeiro vence, o outro lado desiste.
 * Travas velhas (> TTL, ex.: crash) são removidas para permitir retry.
 */
async function acquireReleaseClaim(
  client: ReturnType<typeof createClient>,
  orderId: string,
  claimer: string,
): Promise<boolean> {
  const key = claimKey(orderId);
  const now = Date.now();
  try {
    const { data: existing } = await client
      .from("platform_settings")
      .select("value")
      .eq("key", key)
      .maybeSingle();
    const existingAt = Number(
      (existing?.value as { at?: number } | undefined)?.at || 0,
    );
    if (existing && Number.isFinite(existingAt) && now - existingAt < CLAIM_TTL_MS) {
      return false; // outro processo está liberando (ou já liberou)
    }
    if (existing) {
      // trava velha (crash) → remove para poder assumir
      await client.from("platform_settings").delete().eq("key", key);
    }
    const ins = await client
      .from("platform_settings")
      .insert({
        key,
        value: { at: now, claimer },
        updated_at: new Date().toISOString(),
      })
      .select("key");
    return Array.isArray(ins.data) && ins.data.length > 0;
  } catch {
    return false;
  }
}

async function releaseClaim(
  client: ReturnType<typeof createClient>,
  orderId: string,
) {
  try {
    await client.from("platform_settings").delete().eq("key", claimKey(orderId));
  } catch {
    /* TTL limpa a trava */
  }
}

async function claimOrder(
  client: ReturnType<typeof createClient>,
  found: FoundOrder,
): Promise<MpOrder | null> {
  const { userId, order, orders } = found;
  if (order.status === "released" || order.releasedAt) return null;
  if (order.error === RELEASING_MARK) {
    const t = Date.parse(String(order.updatedAt || "")) || 0;
    if (Date.now() - t < 2 * 60 * 1000) return null;
  }
  // Trava atômica: só um lado (webhook ou cliente) pode liberar o pedido.
  const gotClaim = await acquireReleaseClaim(client, order.id, "server");
  if (!gotClaim) return null;
  const now = new Date().toISOString();
  const next = orders.map((o) =>
    o.id === order.id
      ? {
          ...o,
          status: o.status === "pending" ? "approved" : o.status,
          paidAt: o.paidAt || now,
          error: RELEASING_MARK,
          updatedAt: now,
        }
      : o,
  );
  await saveOrders(client, userId, next);
  return next.find((o) => o.id === order.id) || null;
}

async function appendIptvJob(
  client: ReturnType<typeof createClient>,
  userId: string,
  job: Record<string, unknown>,
) {
  try {
    const key = `iptv_jobs_user_${userId}`;
    const bag = (await getSetting<{ jobs?: unknown[] }>(client, key)) || {};
    const jobs = Array.isArray(bag.jobs) ? [...bag.jobs] : [];
    const now = new Date().toISOString();
    await putSetting(client, key, {
      jobs: [
        {
          id: `iptv_${Date.now().toString(36)}`,
          status: "done",
          itemRefId: "",
          createdAt: now,
          updatedAt: now,
          ...job,
        },
        ...jobs,
      ].slice(0, 200),
    });
  } catch {
    /* opcional */
  }
}

async function updateItemDue(
  client: ReturnType<typeof createClient>,
  itemId: string,
  dueDate: string,
  notesExtra?: string,
  price?: number,
) {
  if (!itemId) return;
  const patch: Record<string, unknown> = {
    due_date: dueDate.length === 10 ? `${dueDate}T12:00:00` : dueDate,
  };
  if (notesExtra) {
    const { data } = await client
      .from("items")
      .select("notes")
      .eq("id", itemId)
      .maybeSingle();
    const prev = String(data?.notes || "").trim();
    patch.notes = prev ? `${prev}\n${notesExtra}` : notesExtra;
  }
  if (typeof price === "number" && Number.isFinite(price) && price > 0) {
    patch.price = Math.round(price * 100) / 100;
  }
  await client.from("items").update(patch).eq("id", itemId);
}

async function releaseOrder(
  client: ReturnType<typeof createClient>,
  userId: string,
  order: MpOrder,
) {
  const automations =
    (await getSetting<Record<string, unknown>>(
      client,
      `automations_user_${userId}`,
    )) || {};
  const iptvPanel =
    (await getSetting<Record<string, unknown>>(client, "iptv_panel")) || {};
  uniplayProxyPrefer = String(
    iptvPanel.apiProxyUrl ||
      iptvPanel.api_proxy_url ||
      automations.apiProxyUrl ||
      "",
  ).trim();

  const bearer = await ensurePanelBearer(client, userId, automations);
  const username = String(order.panelUsername || "").trim();
  const phone = String(order.phone || "").replace(/\D/g, "");
  const months = Math.max(1, Math.floor(Number(order.months) || 1));
  const credits = Math.max(
    1,
    Math.floor(Number(order.credits) || months || 1),
  );
  const amount = Math.round((Number(order.amount) || 0) * 100) / 100;
  const kind = String(order.kind || "renew");

  let waText = "";

  if (kind === "test_activate") {
    if (!username) throw new Error("Pedido sem usuário do teste");
    let remoteId = order.testRemoteId;
    if (remoteId == null || remoteId === "") {
      remoteId = (await findUniplayUserId(bearer, username)) ?? undefined;
    }
    if (remoteId == null || remoteId === "") {
      throw new Error(`Usuário ${username} não encontrado no UniPlay`);
    }

    const planAmount = Math.round((Number(order.amount) || 0) * 100) / 100;
    const isManual = planAmount >= 155;
    const needsSecondScreen = planAmount >= 44.9 && !isManual;

    if (!isManual) {
      await renewIptvUser(bearer, remoteId, credits);
    }
    await appendIptvJob(client, userId, {
      kind: "renew",
      clientName: order.clientName || username,
      panelUsername: username,
      panelRemoteId: remoteId,
      phone,
      dueDate: order.dueDate ?? null,
      months,
      note: `Webhook MP · teste→plano · ${months}m · ${order.mpPaymentId}`,
    });
    const newDue = nextDueAfterRenew(order.dueDate, months);
    if (order.itemRefId) {
      await updateItemDue(client, order.itemRefId, newDue, undefined, planAmount);
    }

    if (isManual) {
      waText =
        `✅ *Pagamento confirmado!*\n\n` +
        `Vou encaminhar para um atendente concluir sua ativação. Em breve alguém responde por aqui.`;
      try {
        const evo =
          (await getSetting<{
            apiBaseUrl?: string;
            apiKey?: string;
          }>(client, "evolution_api")) || {};
        const apiBaseUrl = String(evo.apiBaseUrl || "").trim();
        const apiKey = String(evo.apiKey || "").trim();
        if (apiBaseUrl && apiKey) {
          const instance = await resolveInstanceName(client, userId);
          await notifyOwnerManualActivation(apiBaseUrl, apiKey, instance, phone, username, planAmount);
        }
      } catch {
        /* notificação opcional */
      }
    } else if (needsSecondScreen) {
      waText =
        `✅ *Pagamento confirmado!*\n\n` +
        `1ª tela liberada no usuário *${username}*.\n` +
        `Vou encaminhar para um atendente ativar a 2ª tela. Em breve alguém responde por aqui.`;
      try {
        const evo =
          (await getSetting<{
            apiBaseUrl?: string;
            apiKey?: string;
          }>(client, "evolution_api")) || {};
        const apiBaseUrl = String(evo.apiBaseUrl || "").trim();
        const apiKey = String(evo.apiKey || "").trim();
        if (apiBaseUrl && apiKey) {
          const instance = await resolveInstanceName(client, userId);
          await notifyOwnerManualActivation(apiBaseUrl, apiKey, instance, phone, username, planAmount, "Ativar 2ª tela");
        }
      } catch {
        /* notificação opcional */
      }
    } else {
      waText =
        `✅ *Pagamento confirmado!*\n\n` +
        `Plano liberado no usuário *${username}*.\n` +
        `Bom proveito!`;
    }
  } else if (kind === "reseller_credits") {
    if (!username) throw new Error("Pedido sem revendedor");
    const packCredits = Math.max(10, Math.floor(Number(order.credits) || 10));
    const rows = await listResellers(bearer, username);
    const want = username.toLowerCase();
    const remote = rows.find(
      (r) => String(r.username || "").toLowerCase() === want,
    );
    if (!remote) {
      throw new Error(`Revendedor ${username} não encontrado no UniPlay`);
    }
    const resellerId = remote.id ?? remote.user_id ?? remote.uid;
    await addResellerCredits(
      bearer,
      resellerId as string | number,
      packCredits,
      amount,
      `AuxPlus PIX ${order.id}`,
    );
    if (order.itemRefId) {
      const { data: item } = await client
        .from("items")
        .select("price,notes")
        .eq("id", order.itemRefId)
        .maybeSingle();
      if (item) {
        const price = (Number(item.price) || 0) + packCredits;
        let notes = String(item.notes || "")
          .split("\n")
          .filter((line) => !/^Última recarga:\s*/i.test(line.trim()))
          .join("\n")
          .trim();
        notes = notes
          ? `${notes}\nÚltima recarga: 0 dias`
          : "Última recarga: 0 dias";
        await client
          .from("items")
          .update({ price, notes, due_date: null })
          .eq("id", order.itemRefId);
      }
    }
    waText =
      `✅ *Pagamento confirmado!*\n\n` +
      `*${packCredits} créditos* liberados` +
      (username ? ` para *${username}*` : "") +
      (amount > 0 ? `\nValor: *${moneyBrl(amount)}*` : "") +
      `\n\nObrigado!`;
  } else {
    // renovação de cliente
    if (!username) throw new Error("Pedido sem usuário");

    let remoteId = await findUniplayUserId(bearer, username);
    let actualUsername = username;

    // Se não encontrou pelo username, tenta buscar pelo itemRefId
    if (remoteId == null && order.itemRefId) {
      try {
        const { data: item } = await client
          .from("items")
          .select("item_id")
          .eq("id", order.itemRefId)
          .maybeSingle();

        if (item?.item_id) {
          actualUsername = String(item.item_id).trim();
          remoteId = await findUniplayUserId(bearer, actualUsername);
        }
      } catch {
        /* ignora — continua com tentativa original */
      }
    }

    if (remoteId == null) {
      throw new Error(`Usuário ${username} não encontrado no UniPlay`);
    }

    await renewIptvUser(bearer, remoteId, credits);
    let newDue = nextDueAfterRenew(order.dueDate, months);
    try {
      // re-fetch user for exp — list again
      const listed = (await uniplayFetch("/users-iptv", bearer)) as unknown;
      const rows = Array.isArray(listed)
        ? listed
        : Array.isArray((listed as { data?: unknown })?.data)
          ? ((listed as { data: unknown[] }).data)
          : [];
      const hit = rows.find((row) => {
        if (!row || typeof row !== "object") return false;
        const r = row as Record<string, unknown>;
        return (
          String(r.username || r.user || "").trim().toLowerCase() ===
          actualUsername.toLowerCase()
        );
      }) as Record<string, unknown> | undefined;
      const exp = String(hit?.exp_date || hit?.expDate || "").trim();
      const m = /^(\d{4}-\d{2}-\d{2})/.exec(exp.replace(" ", "T"));
      if (m) newDue = m[1]!;
    } catch {
      /* usa cálculo local */
    }
    if (order.itemRefId) {
      await updateItemDue(client, order.itemRefId, newDue, undefined, Number(order.amount));
    }
    await appendIptvJob(client, userId, {
      kind: "renew",
      itemRefId: order.itemRefId || "",
      clientName: order.clientName || username,
      panelUsername: actualUsername,
      panelRemoteId: remoteId,
      phone,
      dueDate: newDue,
      months,
      note: `Webhook MP · renovação · ${months}m · vence ${formatBrDate(newDue)} · ${order.mpPaymentId}`,
    });
    waText =
      `✅ *Pagamento confirmado!*\n\n` +
      `Usuário *${username}* renovado.\n` +
      `Novo vencimento: *${formatBrDate(newDue)}*\n\n` +
      `Obrigado!`;
  }

  const now = new Date().toISOString();
  const bag =
    (await getSetting<{ orders?: MpOrder[] }>(
      client,
      `mp_orders_user_${userId}`,
    )) || { orders: [] };
  const orders = Array.isArray(bag.orders) ? bag.orders : [];
  await saveOrders(
    client,
    userId,
    orders.map((o) =>
      o.id === order.id
        ? {
            ...o,
            status: "released",
            paidAt: o.paidAt || now,
            releasedAt: now,
            error: undefined,
            updatedAt: now,
          }
        : o,
    ),
  );

  if (waText && phone.length >= 10) {
    try {
      const evo =
        (await getSetting<{
          apiBaseUrl?: string;
          apiKey?: string;
        }>(client, "evolution_api")) || {};
      const apiBaseUrl = String(evo.apiBaseUrl || "").trim();
      const apiKey = String(evo.apiKey || "").trim();
      if (apiBaseUrl && apiKey) {
        const instance = await resolveInstanceName(client, userId);
        await sendEvolutionText(apiBaseUrl, apiKey, instance, phone, waText);
      }
    } catch {
      /* WhatsApp opcional após liberação */
    }
  }
}

async function markOrderError(
  client: ReturnType<typeof createClient>,
  userId: string,
  orderId: string,
  error: string,
  notificationSent = false,
) {
  const bag =
    (await getSetting<{ orders?: MpOrder[] }>(
      client,
      `mp_orders_user_${userId}`,
    )) || { orders: [] };
  const orders = Array.isArray(bag.orders) ? bag.orders : [];
  const now = new Date().toISOString();
  await saveOrders(
    client,
    userId,
    orders.map((o) =>
      o.id === orderId
        ? {
            ...o,
            status: o.status === "released" ? "released" : "approved",
            error,
            errorNotificationSent: notificationSent,
            updatedAt: now,
          }
        : o,
    ),
  );
}

async function processApprovedPayment(
  client: ReturnType<typeof createClient>,
  paymentId: string,
) {
  const found = await findOrderByPaymentId(client, paymentId);
  if (!found) {
    return { ok: true, skipped: "order_not_found", paymentId };
  }
  const automations =
    (await getSetting<Record<string, unknown>>(
      client,
      `automations_user_${found.userId}`,
    )) || {};
  const mpToken = String(automations.mpAccessToken || "").trim();
  if (!mpToken) {
    return { ok: false, error: "mp_token_missing", userId: found.userId };
  }

  // Confirma no MP (nunca confiar só no webhook)
  const st = await fetchMpOrderStatus(mpToken, found.order.mpPaymentId);
  if (st.mapped !== "approved") {
    if (st.mapped === "pending") {
      return { ok: true, skipped: "still_pending", paymentId };
    }
    const bag = found.orders.filter((o) => o.id !== found.order.id);
    await saveOrders(client, found.userId, bag);
    return { ok: true, skipped: st.mapped, paymentId };
  }

  const claimed = await claimOrder(client, found);
  if (!claimed) {
    return { ok: true, skipped: "already_handling", paymentId };
  }

  try {
    await releaseOrder(client, found.userId, claimed);
    return {
      ok: true,
      action: "released",
      paymentId,
      userId: found.userId,
      orderId: claimed.id,
      kind: claimed.kind || "renew",
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Falha ao liberar";

    // Se o erro é "usuário não encontrado", remove IMEDIATAMENTE do armazenamento
    // para evitar loop infinito de tentativas
    if (
      msg.includes("não encontrado") ||
      msg.includes("not found") ||
      msg.includes("Usuário") ||
      msg.includes("user")
    ) {
      // REMOVE IMEDIATAMENTE DA FILA - não tenta mais nunca
      const updatedOrders = found.orders.filter((o) => o.id !== claimed.id);
      await saveOrders(client, found.userId, updatedOrders);

      console.log(
        `[mp-webhook] BLOQUEADO: Pedido ${claimed.id} removido permanentemente (${msg})`
      );

      // Avisa cliente UMA VEZ
      try {
        const phone = String(claimed.phone || "").replace(/\D/g, "");
        if (phone.length >= 10) {
          const evo =
            (await getSetting<{
              apiBaseUrl?: string;
              apiKey?: string;
            }>(client, "evolution_api")) || {};
          const apiBaseUrl = String(evo.apiBaseUrl || "").trim();
          const apiKey = String(evo.apiKey || "").trim();
          if (apiBaseUrl && apiKey) {
            const instance = await resolveInstanceName(client, found.userId);
            await sendEvolutionText(
              apiBaseUrl,
              apiKey,
              instance,
              phone,
              "⚠️ Pagamento recebido!\n\nMas não conseguimos localizar seu usuário no painel. Pode ser que:\n\n" +
                "• Você tem outro cliente cadastrado com este número\n" +
                "• Seu usuário foi alterado\n\n" +
                "Entre em contato: *atendente*"
            );
          }
        }
      } catch (err) {
        console.error("[mp-webhook] Erro ao avisar cliente:", err);
      }

      // Nao tenta mais — retorna sucesso para o MP (pedido foi processado, mesmo que com erro)
      return {
        ok: true,
        error: `${msg} (Bloqueado para evitar retry infinito)`,
        paymentId,
        userId: found.userId,
        orderId: claimed.id,
      };
    }

    // Para outros erros, marca como erro normal
    let sentNotification = false;

    // Só envia notificação de erro se passou 30+ segundos desde a primeira tentativa
    // Isso dá tempo pro MP confirmar e liberar tudo
    const createdAt = Date.parse(String(claimed.createdAt || "")) || Date.now();
    const timeSinceCreation = Date.now() - createdAt;
    const shouldNotifyError = timeSinceCreation > 30 * 1000; // 30 segundos

    // Avisa cliente (apenas se ainda não foi notificado E passou tempo suficiente)
    if (!claimed.errorNotificationSent && shouldNotifyError) {
      try {
        const phone = String(claimed.phone || "").replace(/\D/g, "");
        if (phone.length >= 10) {
          const evo =
            (await getSetting<{
              apiBaseUrl?: string;
              apiKey?: string;
            }>(client, "evolution_api")) || {};
          const apiBaseUrl = String(evo.apiBaseUrl || "").trim();
          const apiKey = String(evo.apiKey || "").trim();
          if (apiBaseUrl && apiKey) {
            const instance = await resolveInstanceName(client, found.userId);
            await sendEvolutionText(
              apiBaseUrl,
              apiKey,
              instance,
              phone,
              "⚠️ Pagamento recebido\n\nSeu PIX foi confirmado, mas houve um problema ao concluir sua renovação (" +
                claimed.id +
                ").\n\n" +
                "Já encaminhei para um atendente — em breve alguém responde por aqui."
            );
            sentNotification = true;
          }
        }
      } catch {
        /* ignore */
      }
    }

    await markOrderError(client, found.userId, claimed.id, msg, sentNotification);
    await releaseClaim(client, claimed.id);

    return {
      ok: false,
      error: msg,
      paymentId,
      userId: found.userId,
      orderId: claimed.id,
    };
  }
}

async function pollAllPending(client: ReturnType<typeof createClient>) {
  const { data } = await client
    .from("platform_settings")
    .select("key,value")
    .like("key", "mp_orders_user_%");
  const results: unknown[] = [];
  for (const row of data || []) {
    const userId = String(row.key || "").replace(/^mp_orders_user_/, "");
    const bag =
      typeof row.value === "string"
        ? (() => {
            try {
              return JSON.parse(row.value) as { orders?: MpOrder[] };
            } catch {
              return { orders: [] };
            }
          })()
        : ((row.value || { orders: [] }) as { orders?: MpOrder[] });
    const orders = Array.isArray(bag.orders) ? bag.orders : [];

    // Filtra apenas pedidos que ainda não foram finalizados e não estão bloqueados
    // Se tem erro e passou 30min, ignora (não tenta mais)
    const pending = orders.filter((o) => {
      // NUNCA processa pedidos bloqueados
      if ((o as Record<string, any>).blocked) return false;

      if (o.status === "pending" || (o.status === "approved" && !o.releasedAt)) {
        return true;
      }
      if (o.error === RELEASING_MARK) {
        const t = Date.parse(String(o.updatedAt || "")) || 0;
        // Se passou 2 minutos em RELEASING_MARK, retira da fila
        if (Date.now() - t >= 2 * 60 * 1000) {
          return false;
        }
        return true;
      }
      // Se tem outro erro (não RELEASING_MARK), ignora completamente
      if (o.error && o.error !== RELEASING_MARK) {
        return false;
      }
      return false;
    });

    if (!pending.length) continue;
    const automations =
      (await getSetting<Record<string, unknown>>(
        client,
        `automations_user_${userId}`,
      )) || {};
    const mpToken = String(automations.mpAccessToken || "").trim();
    if (!mpToken) continue;
    for (const order of pending) {
      try {
        const st = await fetchMpOrderStatus(mpToken, order.mpPaymentId);
        if (st.mapped === "approved") {
          results.push(await processApprovedPayment(client, order.mpPaymentId));
        } else if (
          st.mapped === "expired" ||
          st.mapped === "cancelled" ||
          st.mapped === "rejected"
        ) {
          await saveOrders(
            client,
            userId,
            orders.filter((o) => o.id !== order.id),
          );
          results.push({
            ok: true,
            skipped: st.mapped,
            paymentId: order.mpPaymentId,
          });
        }
      } catch (e) {
        results.push({
          ok: false,
          paymentId: order.mpPaymentId,
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }
  return results;
}

function extractWebhookIds(body: Record<string, unknown>, url: URL): string[] {
  const ids = new Set<string>();
  const data = body.data as Record<string, unknown> | undefined;
  if (data?.id) ids.add(String(data.id).trim());
  if (body.id && String(body.type || body.topic || "").includes("order")) {
    /* body.id is notification id, not order */
  }
  const qDataId = url.searchParams.get("data.id") || url.searchParams.get("id");
  if (qDataId) ids.add(qDataId.trim());
  const resource = String(body.resource || "").trim();
  const m = /\/(orders|payments)\/([^/?]+)/i.exec(resource);
  if (m?.[2]) ids.add(m[2]);
  return [...ids].filter(Boolean);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const client = await sb();

    // Health / ping (MP às vezes valida com GET)
    if (req.method === "GET") {
      return json({
        ok: true,
        service: "mp-webhook",
        hint: "Configure esta URL no webhook Order do Mercado Pago",
      });
    }

    if (req.method !== "POST") {
      return json({ error: "Use POST" }, 405);
    }

    const raw = await req.text();
    let body: Record<string, unknown> = {};
    try {
      body = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    } catch {
      body = {};
    }

    // Poll de backup (cron)
    const cronSecret = String(Deno.env.get("MP_CRON_SECRET") || "").trim();
    const gotCron = String(req.headers.get("x-cron-secret") || "").trim();
    if (
      String(body.action || "") === "poll" ||
      url.searchParams.get("action") === "poll"
    ) {
      if (cronSecret && gotCron !== cronSecret) {
        return json({ error: "cron unauthorized" }, 401);
      }
      const results = await pollAllPending(client);
      return json({ ok: true, action: "poll", count: results.length, results });
    }

    const ids = extractWebhookIds(body, url);
    if (!ids.length) {
      // Responde 200 para o MP não ficar reenviando
      return json({ ok: true, skipped: "no_id", bodyKeys: Object.keys(body) });
    }

    const results = [];
    for (const id of ids) {
      results.push(await processApprovedPayment(client, id));
    }
    return json({ ok: true, results });
  } catch (e) {
    // 200 evita storm de retries do MP; loga o erro no body
    return json(
      {
        ok: false,
        error: e instanceof Error ? e.message : "Falha mp-webhook",
      },
      200,
    );
  }
});
