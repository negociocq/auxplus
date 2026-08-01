import { addDays, differenceInCalendarDays, format } from "date-fns";
import type { Folder, Item } from "@/types";
import { isRevenueFolderType } from "@/types";

export type WaConnectionStatus =
  | "disconnected"
  | "connecting"
  | "qr"
  | "open"
  | "error";

export interface WhatsappAutomationSettings {
  enabled: boolean;
  /** Dias antes do vencimento (ex.: 3) */
  daysBefore: number;
  sendBefore: boolean;
  sendOnDay: boolean;
  /** Horário local HH:mm */
  sendTime: string;
  messageBefore: string;
  messageOnDay: string;
  /** Intervalo mínimo entre envios (segundos) */
  minIntervalSec: number;
  /** Variação aleatória extra (segundos) */
  jitterSec: number;
  /** Máximo de mensagens por dia */
  maxPerDay: number;
  /** Máximo por hora */
  maxPerHour: number;
}

/** Credenciais da Evolution vêm do painel admin (platform). */
export type EvolutionRuntimeConfig = {
  apiBaseUrl: string;
  apiKey: string;
  instanceName: string;
};

export interface WaQueueItem {
  id: string;
  itemId: string;
  folderId: string;
  name: string;
  phone: string;
  dueDate: string;
  kind: "before" | "onday";
  message: string;
  scheduledAt: string;
}

export interface WaSendLog {
  day: string;
  sentAt: string;
  phone: string;
  itemId: string;
  kind: "before" | "onday";
  ok: boolean;
  error?: string;
}

const SETTINGS_KEY = "auxplus-wa-settings";
const LOG_KEY = "auxplus-wa-send-log";

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

export const DEFAULT_MESSAGE_BEFORE = `{getGreeting}

🔔 Lembrete de vencimento

Usuário: {item_id}

Vai vencer em: {due_date}

Renove com antecedência para evitar interrupções.

Obrigado!`;

export const DEFAULT_MESSAGE_ONDAY = `{getGreeting}

🔔 Vencimento hoje

Usuário: {item_id}

Vence hoje: {due_date}

Evite bloqueios — renove o quanto antes.

Obrigado!`;

export function defaultWhatsappAutomation(): WhatsappAutomationSettings {
  return {
    enabled: false,
    daysBefore: 3,
    sendBefore: true,
    sendOnDay: true,
    sendTime: "09:30",
    messageBefore: DEFAULT_MESSAGE_BEFORE,
    messageOnDay: DEFAULT_MESSAGE_ONDAY,
    minIntervalSec: 60,
    jitterSec: 30,
    maxPerDay: 100,
    maxPerHour: 25,
  };
}

export function loadWhatsappSettings(
  userId: string,
): WhatsappAutomationSettings {
  const base = defaultWhatsappAutomation();
  try {
    const raw = localStorage.getItem(`${SETTINGS_KEY}:${userId}`);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<WhatsappAutomationSettings> & {
      apiBaseUrl?: string;
      apiKey?: string;
      instanceName?: string;
    };
    // Remove campos antigos de API (agora só no admin)
    const {
      apiBaseUrl: _a,
      apiKey: _k,
      instanceName: _i,
      ...rest
    } = parsed;
    return { ...base, ...rest };
  } catch {
    return base;
  }
}

export function saveWhatsappSettings(
  userId: string,
  settings: WhatsappAutomationSettings,
) {
  localStorage.setItem(`${SETTINGS_KEY}:${userId}`, JSON.stringify(settings));
}

export function loadSendLog(userId: string): WaSendLog[] {
  try {
    const raw = localStorage.getItem(`${LOG_KEY}:${userId}`);
    if (!raw) return [];
    return JSON.parse(raw) as WaSendLog[];
  } catch {
    return [];
  }
}

export function saveSendLog(userId: string, logs: WaSendLog[]) {
  // Mantém só os últimos 14 dias
  const cutoff = format(addDays(new Date(), -14), "yyyy-MM-dd");
  const trimmed = logs.filter((l) => l.day >= cutoff).slice(-500);
  localStorage.setItem(`${LOG_KEY}:${userId}`, JSON.stringify(trimmed));
}

export function phoneDigits(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

export function normalizeBrPhone(phone: string): string | null {
  let d = phoneDigits(phone);
  if (!d) return null;
  if (d.startsWith("55") && d.length >= 12) return d;
  if (d.length >= 10 && d.length <= 11) return `55${d}`;
  if (d.length >= 12) return d;
  return null;
}

function greeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia,";
  if (h < 18) return "Boa tarde,";
  return "Boa noite,";
}

/** yyyy-MM-dd em calendário local (evita bug do parseISO UTC no Brasil). */
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
  const base = `${m[3]}/${m[2]}/${m[1]}`;
  if (m[4] != null) return `${base} ${m[4]}:${m[5]}:${m[6] ?? "00"}`;
  return base;
}

export function fillWhatsappTemplate(
  template: string,
  item: Pick<Item, "name" | "itemId" | "dueDate" | "price">,
  kind: "before" | "onday",
) {
  const due = formatDueForMessage(item.dueDate);
  const dateText =
    kind === "onday" ? "Vence hoje:" : "Vai vencer em:";
  return template
    .replace(/\{getGreeting\}/g, greeting())
    .replace(/\{item_id\}/g, item.itemId || "")
    .replace(/\{name\}/g, item.name || "")
    .replace(/\{dateText\}/g, dateText)
    .replace(/\{due_date\}/g, due)
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

/** Já passou do horário de envio de hoje? */
export function isPastSendTime(sendTime: string, now = new Date()) {
  const { hour, minute } = parseSendTime(sendTime);
  const target = new Date(now);
  target.setHours(hour, minute, 0, 0);
  return now.getTime() >= target.getTime();
}

/** Monta fila do dia (lembretes elegíveis pela regra de dias). */
export function buildTodayQueue(
  settings: WhatsappAutomationSettings,
  items: Item[],
  folders: Folder[],
  alreadySent: WaSendLog[],
  now = new Date(),
): WaQueueItem[] {
  const todayKey = format(now, "yyyy-MM-dd");
  const revenueIds = new Set(
    folders.filter((f) => isRevenueFolderType(f.type)).map((f) => f.id),
  );
  const { hour, minute } = parseSendTime(settings.sendTime);
  const scheduledAt = parseLocalYmd(todayKey);
  scheduledAt.setHours(hour, minute, 0, 0);

  const sentKeys = new Set(
    alreadySent
      .filter((l) => l.day === todayKey && l.ok)
      .map((l) => `${l.itemId}:${l.kind}`),
  );

  const queue: WaQueueItem[] = [];

  for (const item of items) {
    if (!revenueIds.has(item.folderId)) continue;
    if (!item.dueDate || !item.isActive) continue;
    const phone = normalizeBrPhone(item.phone || "");
    if (!phone) continue;

    const dueKey = ymdOnly(item.dueDate);
    if (!dueKey) continue;
    const due = parseLocalYmd(dueKey);

    if (settings.sendOnDay && dueKey === todayKey) {
      const key = `${item.id}:onday`;
      if (!sentKeys.has(key)) {
        queue.push({
          id: key,
          itemId: item.id,
          folderId: item.folderId,
          name: item.name,
          phone,
          dueDate: dueKey,
          kind: "onday",
          message: fillWhatsappTemplate(
            settings.messageOnDay,
            item,
            "onday",
          ),
          scheduledAt: scheduledAt.toISOString(),
        });
      }
    }

    if (settings.sendBefore && settings.daysBefore > 0) {
      // Janela 1..daysBefore (não só o dia exato): quem está "Perto"
      // e ainda não recebeu o aviso entra na fila (inclui atraso/recuperação).
      const daysLeft = differenceInCalendarDays(due, parseLocalYmd(todayKey));
      if (daysLeft >= 1 && daysLeft <= settings.daysBefore) {
        const key = `${item.id}:before`;
        if (!sentKeys.has(key)) {
          queue.push({
            id: key,
            itemId: item.id,
            folderId: item.folderId,
            name: item.name,
            phone,
            dueDate: dueKey,
            kind: "before",
            message: fillWhatsappTemplate(
              settings.messageBefore,
              item,
              "before",
            ),
            scheduledAt: scheduledAt.toISOString(),
          });
        }
      }
    }
  }

  return queue.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

export function nextDelayMs(settings: WhatsappAutomationSettings) {
  const base = Math.max(30, settings.minIntervalSec) * 1000;
  const jitter = Math.max(0, settings.jitterSec) * 1000;
  return base + Math.floor(Math.random() * (jitter + 1));
}

export function canSendMore(
  settings: WhatsappAutomationSettings,
  logs: WaSendLog[],
  now = new Date(),
): { ok: boolean; reason?: string } {
  const day = format(now, "yyyy-MM-dd");
  const dayLogs = logs.filter((l) => l.day === day && l.ok);
  if (dayLogs.length >= settings.maxPerDay) {
    return {
      ok: false,
      reason: `Limite diário atingido (${settings.maxPerDay}).`,
    };
  }
  const hourAgo = now.getTime() - 60 * 60 * 1000;
  const hourCount = dayLogs.filter(
    (l) => new Date(l.sentAt).getTime() >= hourAgo,
  ).length;
  if (hourCount >= settings.maxPerHour) {
    return {
      ok: false,
      reason: `Limite por hora atingido (${settings.maxPerHour}). Aguarde.`,
    };
  }
  const last = [...dayLogs].sort((a, b) =>
    b.sentAt.localeCompare(a.sentAt),
  )[0];
  if (last) {
    const elapsed = now.getTime() - new Date(last.sentAt).getTime();
    const need = settings.minIntervalSec * 1000;
    if (elapsed < need) {
      const wait = Math.ceil((need - elapsed) / 1000);
      return {
        ok: false,
        reason: `Aguarde ${wait}s pelo intervalo anti-ban.`,
      };
    }
  }
  return { ok: true };
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
        // Pula aviso intermediário do ngrok free (quando não usa o proxy)
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
    throw new Error(msg || `Erro HTTP ${res.status}`);
  }
  return data;
}

export async function ensureEvolutionInstance(runtime: EvolutionRuntimeConfig) {
  const name = runtime.instanceName.trim() || "auxplus";
  try {
    await evolutionFetch(runtime, `/instance/connectionState/${name}`);
    return;
  } catch {
    /* cria se não existir */
  }
  await evolutionFetch(runtime, "/instance/create", {
    method: "POST",
    body: JSON.stringify({
      instanceName: name,
      qrcode: true,
      integration: "WHATSAPP-BAILEYS",
    }),
  });
}

export async function fetchEvolutionQr(
  runtime: EvolutionRuntimeConfig,
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

  const qr = (await evolutionFetch(
    runtime,
    `/instance/connect/${name}`,
  )) as {
    base64?: string;
    qrcode?: { base64?: string };
    pairingCode?: string;
    code?: string;
  };

  const base64 = qr.base64 || qr.qrcode?.base64;
  return {
    status: base64 ? "qr" : "connecting",
    base64: base64?.startsWith("data:")
      ? base64
      : base64
        ? `data:image/png;base64,${base64}`
        : undefined,
    pairingCode: qr.pairingCode || qr.code,
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

export async function logoutEvolution(runtime: EvolutionRuntimeConfig) {
  const name = runtime.instanceName.trim() || "auxplus";
  await evolutionFetch(runtime, `/instance/logout/${name}`, {
    method: "DELETE",
  });
}

export async function sendEvolutionText(
  runtime: EvolutionRuntimeConfig,
  phone: string,
  text: string,
  /** Atraso de “digitando…” na Evolution (ms). Não usar o intervalo anti-ban aqui. */
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
      // delay da Evolution = simulação de digitação (ms), não o intervalo entre envios
      delay: Math.min(5000, Math.max(0, typingDelayMs)),
    }),
  });
}
