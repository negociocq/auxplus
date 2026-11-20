import { format } from "date-fns";
import type { Item } from "@/types";

export type WaConnectionStatus =
  | "disconnected"
  | "connecting"
  | "qr"
  | "open"
  | "error";

export type EvolutionRuntimeConfig = {
  apiBaseUrl: string;
  apiKey: string;
  instanceName: string;
};

export type EvolutionConnectedProfile = {
  phone: string;
  profileName?: string;
};

export const DEFAULT_MESSAGE_BEFORE = `{getGreeting}

🔔 Lembrete da T&E 🔔

👤 Usuário: {item_id}

📅 Seu acesso vence em: {due_date}

Renove antecipadamente para continuar assistindo sem interrupções. 📺✨

💬 {RENEWAL_REPLY_CTA}

Obrigado pela preferência! 💙`;

export const DEFAULT_MESSAGE_ONDAY = `{getGreeting}

🔔 Vencimento hoje

👤 Usuário: {item_id}

Vence hoje: {due_date}

Evite bloqueios — renove o quanto antes.

💬 {RENEWAL_REPLY_CTA}

Obrigado!`;

export const DEFAULT_PRORROGA_MESSAGE = `{getGreeting}

✅ Prorrogação concedida!

👤 Usuário: {phone}

Vencimento anterior: {due_date}
Novo vencimento: {new_due}

Tipo: {prorroga_type}

Aproveite o período extra!`;

export function phoneDigits(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

export function normalizeBrPhone(phone: string): string | null {
  let d = phoneDigits(phone);
  if (!d) return null;
  if (d.startsWith("55") && d.length === 12) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.length === 8) d = `55${ddd}9${rest}`;
  }
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length === 10) {
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);
    return `55${ddd}9${rest}`;
  }
  if (d.length === 11) return `55${d}`;
  if (d.length >= 12) return d;
  return null;
}

export function getWhatsappGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia,";
  if (h < 18) return "Boa tarde,";
  return "Boa noite,";
}

function greeting() {
  return getWhatsappGreeting();
}

export function ymdOnly(value: string | null | undefined): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || "").trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function parseLocalYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function formatYmdBr(ymd: string) {
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}/${y}`;
}

function formatDueForMessage(value: string | null | undefined): string {
  const s = String(value || "").trim();
  const m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (!m) return "—";
  const date = `${m[3]}/${m[2]}/${m[1]}`;
  const time = m[4] != null ? `${m[4]}:${m[5]}:${m[6] ?? "00"}` : "(horário não informado)";
  return `${date} ${time}`;
}

export function fillWhatsappTemplate(
  template: string,
  item: Pick<Item, "name" | "itemId" | "dueDate" | "price" | "phone">,
  kind: "before" | "onday",
) {
  const fullDue = formatDueForMessage(item.dueDate);
  const dueTime = fullDue.split(" ").slice(1).join(" ") || "horário não informado";
  const due = template.includes("{dueTime}") ? fullDue.split(" ")[0] : fullDue;
  const dateText =
    kind === "onday" ? "Vence hoje:" : "Vai vencer em:";
  const phoneFormatted = item.phone || item.itemId || "";
  const displayItemId = item.itemId && String(item.itemId).trim().length > 5
    ? String(item.itemId).trim()
    : (item.phone || item.itemId || "");
  return template
    .replace(/\{getGreeting\}/g, greeting())
    .replace(/\{item_id\}/g, displayItemId)
    .replace(/\{phone\}/g, phoneFormatted)
    .replace(/\{name\}/g, item.name || "")
    .replace(/\{dateText\}/g, dateText)
    .replace(/\{due_date\}/g, due)
    .replace(/\{due\}/g, due)
    .replace(/\{dueTime\}/g, dueTime)
    .replace(/\{valor\}/g, String(item.price ?? ""))
    .replace(/\{price\}/g, String(item.price ?? ""));
}

function parseSendTime(sendTime: string): { hour: number; minute: number } {
  const m = /^(\d{1,2}):(\d{2})$/.exec(sendTime.trim());
  if (!m) return { hour: 9, minute: 30 };
  return {
    hour: Math.min(23, Math.max(0, Number(m[1]))),
    minute: Math.min(59, Math.max(0, Number(m[2]))),
  };
}

export function isPastSendTime(sendTime: string, now = new Date()) {
  const { hour, minute } = parseSendTime(sendTime);
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  return now.getTime() >= target.getTime();
}

/** Trava global: evita fila manual e automática ao mesmo tempo. */
let sendLock = false;

export function acquireWhatsappSendLock() {
  if (sendLock) return false;
  sendLock = true;
  return true;
}

export function releaseWhatsappSendLock() {
  sendLock = false;
}

function apiUrl(base: string, path: string) {
  const b = base.replace(/\/$/, "");
  const p = path.startsWith("/") ? path : `/${path}`;
  return `${b}${p}`;
}

/** Em dev, usa proxy do Vite (mesmo origin) para não cair em CORS/ngrok. */
function resolveEvolutionBaseUrl(configured: string) {
  const raw = configured.trim();
  if (!raw) return raw;
  if (typeof window === "undefined") return raw;

  try {
    const u = new URL(raw, window.location.origin);
    const host = u.hostname.toLowerCase();
    const isLocalEvo =
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".ngrok-free.dev") ||
      host.endsWith(".ngrok-free.app") ||
      host.endsWith(".ngrok.io");
    if (isLocalEvo && import.meta.env.DEV) {
      return "/evolution-api";
    }
  } catch {
    /* keep configured */
  }
  return raw;
}

async function evolutionFetch(
  runtime: EvolutionRuntimeConfig,
  path: string,
  init?: RequestInit,
  silent = false,
) {
  if (!runtime.apiBaseUrl.trim()) {
    throw new Error(
      "WhatsApp ainda não foi configurado pelo administrador (API).",
    );
  }
  if (!runtime.apiKey.trim()) {
    throw new Error(
      "Chave da API ausente. Peça ao administrador para configurar em Admin → API.",
    );
  }
  const base = resolveEvolutionBaseUrl(runtime.apiBaseUrl);
  const controller = new AbortController();
  const timeoutMs = 45000;
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  let res: Response;
  try {
    res = await fetch(apiUrl(base, path), {
      ...init,
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        apikey: runtime.apiKey,
        "ngrok-skip-browser-warning": "true",
        ...(init?.headers || {}),
      },
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      throw new Error(
        "A Evolution demorou demais para responder. Confira Docker/ngrok e tente de novo.",
      );
    }
    throw e;
  } finally {
    window.clearTimeout(timer);
  }
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const msg =
      typeof data === "object" && data && "message" in data
        ? String((data as { message: unknown }).message)
        : text || res.statusText;
    const error = new Error(msg || `Erro HTTP ${res.status}`);
    if (!silent || res.status >= 500) {
      console.debug("[evolutionFetch]", path, res.status, msg);
    }
    throw error;
  }
  return data;
}

export async function ensureEvolutionInstance(runtime: EvolutionRuntimeConfig) {
  const name = runtime.instanceName.trim() || "auxplus";
  try {
    await evolutionFetch(runtime, `/instance/connectionState/${name}`);
    return;
  } catch {
    // Instance doesn't exist or can't be reached - try to create it
  }
  const createBodies = [
    {
      instanceName: name,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    },
    {
      instanceName: name,
      qrcode: true,
    },
    {
      instance: name,
      qrcode: true,
    },
  ];
  const createPaths = [
    "/instance/create",
    "/instance",
    "/instances/create",
  ];
  let lastErr: unknown;
  for (const path of createPaths) {
    for (const body of createBodies) {
      try {
        await evolutionFetch(runtime, path, {
          method: "POST",
          body: JSON.stringify(body),
        });
        return;
      } catch (e) {
        lastErr = e;
      }
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Não foi possível criar a instância");
}

export async function fetchEvolutionQr(
  runtime: EvolutionRuntimeConfig,
  phoneNumber?: string,
): Promise<{ base64?: string; pairingCode?: string; status: WaConnectionStatus }> {
  const name = runtime.instanceName.trim() || "auxplus";
  await ensureEvolutionInstance(runtime);
  const state = (await evolutionFetch(
    runtime,
    `/instance/connectionState/${name}`,
  )) as { instance?: { state?: string }; state?: string };
  const st = String(state?.instance?.state || state?.state || "").toLowerCase();
  if (st === "open") {
    return { status: "open" };
  }
  const number = String(phoneNumber || "").replace(/\D/g, "");
  if (number) {
    try {
      await evolutionFetch(runtime, `/instance/logout/${name}`, { method: "DELETE" }, true);
    } catch {
      // Instâncias já desconectadas podem responder 404; ainda assim prosseguimos.
    }
  }
  const qr = (await evolutionFetch(
    runtime,
    `/instance/connect/${name}${number ? `?number=${encodeURIComponent(number)}` : ""}`,
  )) as {
    base64?: string;
    qrcode?: { base64?: string };
    pairingCode?: string;
    code?: string;
    data?: { pairingCode?: string; code?: string; base64?: string; qrcode?: { base64?: string } };
  };
  const rawPairingCode = qr.pairingCode || qr.data?.pairingCode;
  const rawCode = qr.code || qr.data?.code;
  const pairingCode = rawPairingCode && /^[A-Z0-9]{8}$/i.test(String(rawPairingCode).trim())
    ? String(rawPairingCode).trim().toUpperCase()
    : (/^[A-Z0-9]{8}$/i.test(String(rawCode || "").trim()) ? String(rawCode).trim().toUpperCase() : undefined);
  const base64 = qr.base64 || qr.qrcode?.base64 || qr.data?.base64 || qr.data?.qrcode?.base64;
  return {
    status: base64 ? "qr" : "connecting",
    base64: base64?.startsWith("data:")
      ? base64
      : base64
        ? `data:image/png;base64,${base64}`
        : undefined,
    pairingCode,
  };
}

export async function fetchEvolutionStatus(
  runtime: EvolutionRuntimeConfig,
): Promise<WaConnectionStatus> {
  const name = runtime.instanceName.trim() || "auxplus";
  try {
    const state = (await evolutionFetch(
      runtime,
      `/instance/connectionState/${name}`,
    )) as { instance?: { state?: string }; state?: string };
    const st = String(
      state?.instance?.state || state?.state || "",
    ).toLowerCase();
    if (st === "open") return "open";
    if (st === "connecting") return "connecting";
    return "qr";
  } catch {
    return "disconnected";
  }
}

function pickConnectedProfile(row: unknown): EvolutionConnectedProfile | null {
  if (!row || typeof row !== "object") return null;
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
  const phone = formatConnectedWaPhone(owner);
  if (!phone) return null;
  const profileName = String(
    nested.profileName || obj.profileName || "",
  ).trim();
  return { phone, profileName: profileName || undefined };
}

export async function fetchEvolutionConnectedProfile(
  runtime: EvolutionRuntimeConfig,
): Promise<EvolutionConnectedProfile | null> {
  const name = runtime.instanceName.trim() || "auxplus";
  try {
    const raw = await evolutionFetch(
      runtime,
      `/instance/fetchInstances?instanceName=${encodeURIComponent(name)}`,
    );
    const list = Array.isArray(raw)
      ? raw
      : raw && typeof raw === "object" && Array.isArray((raw as { instance?: unknown }).instance)
        ? [(raw as { instance: unknown }).instance]
        : raw
          ? [raw]
          : [];
    for (const row of list) {
      if (row && typeof row === "object") {
        const obj = row as Record<string, unknown>;
        const nested = obj.instance && typeof obj.instance === "object" ? obj.instance as Record<string, unknown> : obj;
        const actualName = String(nested.instanceName || nested.name || obj.instanceName || obj.name || "").toLowerCase();
        if (actualName && actualName !== name.toLowerCase()) continue;
      }
      const picked = pickConnectedProfile(row);
      if (picked) return picked;
    }
  } catch {
    /* tenta outros formatos abaixo */
  }
  try {
    const raw = await evolutionFetch(runtime, "/instance/fetchInstances");
    const list = Array.isArray(raw) ? raw : [];
    const want = name.toLowerCase();
    for (const row of list) {
      if (!row || typeof row !== "object") continue;
      const obj = row as Record<string, unknown>;
      const nested =
        obj.instance && typeof obj.instance === "object"
          ? (obj.instance as Record<string, unknown>)
          : obj;
      const instName = String(
        nested.instanceName || nested.name || obj.instanceName || obj.name || "",
      ).toLowerCase();
      if (instName && instName !== want) continue;
      const picked = pickConnectedProfile(row);
      if (picked) return picked;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export async function logoutEvolution(runtime: EvolutionRuntimeConfig) {
  const name = runtime.instanceName.trim() || "auxplus";
  await evolutionFetch(runtime, `/instance/logout/${name}`, {
    method: "DELETE",
  });
}

export async function setEvolutionWebhook(
  runtime: EvolutionRuntimeConfig,
  webhookUrl: string,
) {
  const name = runtime.instanceName.trim() || "auxplus";
  const url = webhookUrl.trim();
  if (!url) throw new Error("URL do webhook vazia");
  const events = ["MESSAGES_UPSERT"];
  const nestedBody = {
    webhook: {
      enabled: true,
      url,
      webhookByEvents: false,
      webhookBase64: false,
      events,
    },
  };
  const flatBody = {
    enabled: true,
    url,
    webhookByEvents: false,
    webhookBase64: false,
    events,
  };
  const snakeBody = {
    enabled: true,
    url,
    webhook_by_events: false,
    webhook_base64: false,
    events,
  };
  const headersBody = {
    webhook: {
      enabled: true,
      url,
      webhookByEvents: false,
      webhookBase64: false,
      events,
      headers: {},
    },
  };
  const bodies: unknown[] = [nestedBody, flatBody, snakeBody, headersBody];
  const paths = [
    `/webhook/set/${encodeURIComponent(name)}`,
    `/webhook/${encodeURIComponent(name)}`,
  ];
  let lastErr: unknown;
  for (const path of paths) {
    for (const body of bodies) {
      for (const method of ["POST", "PUT"] as const) {
        try {
          await evolutionFetch(runtime, path, {
            method,
            body: JSON.stringify(body),
          }, true);
          return;
        } catch (e) {
          lastErr = e;
        }
      }
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Não foi possível registrar o webhook na Evolution");
}

export async function findEvolutionWebhook(
  runtime: EvolutionRuntimeConfig,
): Promise<{ url?: string; enabled?: boolean } | null> {
  const name = runtime.instanceName.trim() || "auxplus";
  const paths = [
    `/webhook/find/${encodeURIComponent(name)}`,
    `/webhook/${encodeURIComponent(name)}`,
  ];
  for (const path of paths) {
    try {
      const raw = await evolutionFetch(runtime, path);
      if (!raw || typeof raw !== "object") continue;
      const obj = raw as Record<string, unknown>;
      const nested =
        obj.webhook && typeof obj.webhook === "object"
          ? (obj.webhook as Record<string, unknown>)
          : obj;
      return {
        url: String(nested.url || nested.webhookUrl || "").trim() || undefined,
        enabled: nested.enabled !== false,
      };
    } catch {
      /* tenta próximo */
    }
  }
  return null;
}

export async function sendEvolutionText(
  runtime: EvolutionRuntimeConfig,
  phone: string,
  text: string,
  typingDelayMs = 1200,
) {
  const name = runtime.instanceName.trim() || "auxplus";
  const number = normalizeBrPhone(phone);
  if (!number) throw new Error("Telefone inválido");
  await evolutionFetch(runtime, `/message/sendText/${name}`, {
    method: "POST",
    body: JSON.stringify({
      number,
      text,
      delay: Math.min(5000, Math.max(0, typingDelayMs)),
    }),
  });
}

/** Número (e nome) do WhatsApp conectado na instância Evolution. */
export function formatConnectedWaPhone(raw: string): string {
  const d = phoneDigits(raw.split("@")[0] || "");
  if (!d) return "";
  if (d.startsWith("55") && d.length >= 12) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    if (rest.length === 9) {
      return `+55 ${ddd} ${rest.slice(0, 5)}-${rest.slice(5)}`;
    }
    if (rest.length === 8) {
      return `+55 ${ddd} ${rest.slice(0, 4)}-${rest.slice(4)}`;
    }
    return `+${d}`;
  }
  return d.length >= 10 ? `+${d}` : d;
}
