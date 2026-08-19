import { addDays, differenceInCalendarDays, format } from "date-fns";
import type { Folder, Item } from "@/types";
import { isRevenueFolderType } from "@/types";
import { supabase } from "@/integrations/supabase/client";

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
  /** Mensagem para prorrogações (+48h/23:59) */
  prorrogaMessage: string;
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
const settingsDbKey = (userId: string) => `wa_settings_user_${userId}`;
const logDbKey = (userId: string) => `wa_send_log_user_${userId}`;

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

🔔 Lembrete da T&E 🔔

👤 Usuário: {item_id}

📅 Seu acesso vence em: {due_date}

Renove antecipadamente para continuar assistindo sem interrupções. 📺✨

💬 Responda esta mensagem para receber as opções de renovação automática.

Obrigado pela preferência! 💙`;

export const DEFAULT_MESSAGE_ONDAY = `{getGreeting}

🔔 Vencimento hoje

👤 Usuário: {item_id}

Vence hoje: {due_date}

Evite bloqueios — renove o quanto antes.

Obrigado!`;

export const DEFAULT_PRORROGA_MESSAGE = `{getGreeting}

✅ Prorrogação concedida!

👤 Usuário: {phone}

Vencimento anterior: {due_date}
Novo vencimento: {new_due}

Tipo: {prorroga_type}

Aproveite o período extra!`;


export function defaultWhatsappAutomation(): WhatsappAutomationSettings {
  return {
    enabled: false,
    daysBefore: 3,
    sendBefore: true,
    sendOnDay: true,
    sendTime: "09:30",
    messageBefore: DEFAULT_MESSAGE_BEFORE,
    messageOnDay: DEFAULT_MESSAGE_ONDAY,
    prorrogaMessage: DEFAULT_PRORROGA_MESSAGE,
    minIntervalSec: 60,
    jitterSec: 30,
    maxPerDay: 100,
    maxPerHour: 25,
  };
}

function normalizeWhatsappSettings(
  base: WhatsappAutomationSettings,
  parsed: Partial<WhatsappAutomationSettings> & {
    apiBaseUrl?: string;
    apiKey?: string;
    instanceName?: string;
  },
): WhatsappAutomationSettings {
  const {
    apiBaseUrl: _a,
    apiKey: _k,
    instanceName: _i,
    ...rest
  } = parsed;
  return {
    ...base,
    ...rest,
    daysBefore: Math.max(
      1,
      Math.min(30, Number(rest.daysBefore) || base.daysBefore),
    ),
    sendBefore:
      rest.sendBefore !== undefined ? Boolean(rest.sendBefore) : base.sendBefore,
    sendOnDay:
      rest.sendOnDay !== undefined ? Boolean(rest.sendOnDay) : base.sendOnDay,
    sendTime: String(rest.sendTime || base.sendTime).trim() || base.sendTime,
    messageBefore: String(rest.messageBefore ?? base.messageBefore),
    messageOnDay: String(rest.messageOnDay ?? base.messageOnDay),
    prorrogaMessage: String(rest.prorrogaMessage ?? base.prorrogaMessage),
    minIntervalSec: Math.max(
      30,
      Number(rest.minIntervalSec) || base.minIntervalSec,
    ),
    jitterSec: Math.max(
      0,
      rest.jitterSec !== undefined ? Number(rest.jitterSec) : base.jitterSec,
    ),
    maxPerDay: Math.max(1, Number(rest.maxPerDay) || base.maxPerDay),
    maxPerHour: Math.max(1, Number(rest.maxPerHour) || base.maxPerHour),
    enabled:
      rest.enabled !== undefined ? Boolean(rest.enabled) : base.enabled,
  };
}

function writeLocalSettings(
  userId: string,
  settings: WhatsappAutomationSettings,
) {
  localStorage.setItem(`${SETTINGS_KEY}:${userId}`, JSON.stringify(settings));
}

function trimSendLogs(logs: WaSendLog[]): WaSendLog[] {
  const cutoff = format(addDays(new Date(), -14), "yyyy-MM-dd");
  return logs.filter((l) => l.day >= cutoff).slice(-500);
}

function writeLocalSendLog(userId: string, logs: WaSendLog[]) {
  localStorage.setItem(
    `${LOG_KEY}:${userId}`,
    JSON.stringify(trimSendLogs(logs)),
  );
}

function mergeSendLogs(a: WaSendLog[], b: WaSendLog[]): WaSendLog[] {
  const map = new Map<string, WaSendLog>();
  for (const row of [...a, ...b]) {
    if (!row || typeof row !== "object") continue;
    const key = `${row.day}|${row.itemId}|${row.kind}|${row.sentAt}|${row.ok ? 1 : 0}`;
    map.set(key, row);
  }
  return trimSendLogs(
    [...map.values()].sort((x, y) => x.sentAt.localeCompare(y.sentAt)),
  );
}

async function persistSettingsRemote(
  userId: string,
  settings: WhatsappAutomationSettings,
) {
  if (!supabase || !userId) return;
  try {
    await supabase.from("platform_settings").upsert(
      {
        key: settingsDbKey(userId),
        value: settings,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch {
    /* local já salvo */
  }
}

async function persistSendLogRemote(userId: string, logs: WaSendLog[]) {
  if (!supabase || !userId) return;
  try {
    await supabase.from("platform_settings").upsert(
      {
        key: logDbKey(userId),
        value: { logs: trimSendLogs(logs) },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch {
    /* local já salvo */
  }
}

/** Leitura síncrona do cache local. */
export function loadWhatsappSettings(
  userId: string,
): WhatsappAutomationSettings {
  const base = defaultWhatsappAutomation();
  try {
    const raw = localStorage.getItem(`${SETTINGS_KEY}:${userId}`);
    if (!raw) return base;
    return normalizeWhatsappSettings(
      base,
      JSON.parse(raw) as Partial<WhatsappAutomationSettings>,
    );
  } catch {
    return base;
  }
}

/**
 * Carrega regras WhatsApp da conta (nuvem) + cache local.
 * Assim localhost e domínio ficam iguais.
 */
export async function loadWhatsappSettingsRemote(
  userId: string,
): Promise<WhatsappAutomationSettings> {
  const local = loadWhatsappSettings(userId);
  if (!supabase || !userId) return local;
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", settingsDbKey(userId))
      .maybeSingle();
    if (error || !data?.value) {
      // 1ª sincronização: sobe o que já estava neste PC
      void persistSettingsRemote(userId, local);
      return local;
    }
    const value =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as Partial<WhatsappAutomationSettings>)
        : (data.value as Partial<WhatsappAutomationSettings>);
    const merged = normalizeWhatsappSettings(local, value);
    writeLocalSettings(userId, merged);
    return merged;
  } catch {
    return local;
  }
}

/** Salva local + nuvem (vinculado à conta). */
export function saveWhatsappSettings(
  userId: string,
  settings: WhatsappAutomationSettings,
) {
  const clean = normalizeWhatsappSettings(
    defaultWhatsappAutomation(),
    settings,
  );
  writeLocalSettings(userId, clean);
  void persistSettingsRemote(userId, clean);
}

export function loadSendLog(userId: string): WaSendLog[] {
  try {
    const raw = localStorage.getItem(`${LOG_KEY}:${userId}`);
    if (!raw) return [];
    const list = JSON.parse(raw) as WaSendLog[];
    return Array.isArray(list) ? trimSendLogs(list) : [];
  } catch {
    return [];
  }
}

/** Carrega log de envios da conta (evita reenviar em outro dispositivo). */
export async function loadSendLogRemote(userId: string): Promise<WaSendLog[]> {
  const local = loadSendLog(userId);
  if (!supabase || !userId) return local;
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", logDbKey(userId))
      .maybeSingle();
    if (error || !data?.value) {
      if (local.length) void persistSendLogRemote(userId, local);
      return local;
    }
    const raw =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as { logs?: WaSendLog[] })
        : (data.value as { logs?: WaSendLog[] });
    const remote = Array.isArray(raw?.logs) ? raw.logs : [];
    const merged = mergeSendLogs(local, remote);
    writeLocalSendLog(userId, merged);
    if (local.length !== remote.length || local.length !== merged.length) {
      void persistSendLogRemote(userId, merged);
    }
    return merged;
  } catch {
    return local;
  }
}

export function saveSendLog(userId: string, logs: WaSendLog[]) {
  const trimmed = trimSendLogs(logs);
  writeLocalSendLog(userId, trimmed);
  void persistSendLogRemote(userId, trimmed);
}

/** Prefetch: baixa settings + log da conta para o cache local (autoenvio). */
export async function syncWhatsappAccountData(userId: string): Promise<{
  settings: WhatsappAutomationSettings;
  logs: WaSendLog[];
}> {
  const [settings, logs] = await Promise.all([
    loadWhatsappSettingsRemote(userId),
    loadSendLogRemote(userId),
  ]);
  return { settings, logs };
}

export function phoneDigits(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

export function normalizeBrPhone(phone: string): string | null {
  let d = phoneDigits(phone);
  if (!d) return null;
  // 55 + DDD + 8 dígitos → inclui o 9 do celular
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

/** Saudação dinâmica — mesma de `{getGreeting}` nos templates. */
export function getWhatsappGreeting() {
  const h = new Date().getHours();
  if (h < 12) return "Bom dia,";
  if (h < 18) return "Boa tarde,";
  return "Boa noite,";
}

function greeting() {
  return getWhatsappGreeting();
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
  const date = `${m[3]}/${m[2]}/${m[1]}`;
  const time = m[4] != null ? `${m[4]}:${m[5]}:${m[6] ?? "00"}` : "00:00:00";
  return `${date} ${time}`;
}

export function fillWhatsappTemplate(
  template: string,
  item: Pick<Item, "name" | "itemId" | "dueDate" | "price" | "phone">,
  kind: "before" | "onday",
) {
  const due = formatDueForMessage(item.dueDate);
  const dateText =
    kind === "onday" ? "Vence hoje:" : "Vai vencer em:";
  const phoneFormatted = item.phone || item.itemId || "";
  // Usa o itemId se for um número "longo" (> 5 caracteres, tipo username do painel)
  // Caso contrário, usa o phone como fallback
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

/**
 * Já houve QUALQUER tentativa hoje (sucesso OU falha) para este telefone+tipo?
 * Bloquear também a falha é intencional: se a Evolution entregou a mensagem mas
 * a resposta HTTP se perdeu (timeout), a falha é falsa — reenviar repetiria o
 * lembrete. Garante 1 envio por dia por telefone+tipo.
 */
export function wasItemSentToday(
  userId: string,
  itemId: string,
  kind: string,
  /** Telefone normalizado — cobre cliente duplicado em várias pastas. */
  phone?: string,
): boolean {
  const day = format(new Date(), "yyyy-MM-dd");
  return loadSendLog(userId).some(
    (l) =>
      l.day === day &&
      (l.itemId === itemId || (phone ? l.phone === phone : false)) &&
      l.kind === kind,
  );
}

/**
 * Marca a tentativa ANTES do envio (reserva). Fecha a corrida entre abas: outra
 * aba já enxerga a reserva pelo localStorage e não envia de novo. Também garante
 * que uma resposta perdida (falsa falha) não gere reenvio — o dia já está
 * "usado" assim que a tentativa começa.
 */
export function markWhatsappAttempt(
  userId: string,
  phone: string,
  itemId: string,
  kind: "before" | "onday",
): void {
  const day = format(new Date(), "yyyy-MM-dd");
  const logs = loadSendLog(userId);
  const exists = logs.some(
    (l) => l.day === day && l.phone === phone && l.kind === kind,
  );
  if (exists) return;
  const entry: WaSendLog = {
    day,
    sentAt: new Date().toISOString(),
    phone,
    itemId,
    kind,
    ok: false,
    error: "sending",
  };
  saveSendLog(userId, [...logs, entry]);
}

/** Conclui a tentativa: ok:true se entregue, ok:false com o erro se falhou. */
export function resolveWhatsappAttempt(
  userId: string,
  phone: string,
  kind: "before" | "onday",
  ok: boolean,
  error?: string,
): void {
  const day = format(new Date(), "yyyy-MM-dd");
  const logs = loadSendLog(userId);
  const idx = logs.findIndex(
    (l) => l.day === day && l.phone === phone && l.kind === kind && !l.ok,
  );
  if (idx === -1) return;
  const next = [...logs];
  next[idx] = {
    ...next[idx],
    ok,
    error: ok ? undefined : error || next[idx].error || "erro",
    sentAt: new Date().toISOString(),
  };
  saveSendLog(userId, next);
}

/** Remove um cliente específico do log de envios de hoje (recoloca na fila). */
export function requeWhatsappItem(
  userId: string,
  phone: string,
  kind: "before" | "onday",
  itemId?: string,
): void {
  const day = format(new Date(), "yyyy-MM-dd");
  const logs = loadSendLog(userId);
  const next = logs.filter(
    (l) => !(l.day === day && l.phone === phone && l.kind === kind),
  );
  saveSendLog(userId, next);
  // Sincroniza com o servidor para evitar que o sync automático recoloque o item
  if (supabase) {
    supabase
      .from("platform_settings")
      .upsert(
        {
          key: `wa_send_log_user_${userId}`,
          value: { logs: next },
          updated_at: new Date().toISOString(),
        },
        { onConflict: "key" }
      )
      .then(() => {
        /* sync ok */
      })
      .catch(() => {
        /* ignore sync errors */
      });
  }
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

  // Anti-duplicado por TELEFONE: o mesmo número nunca leva 2 lembretes do mesmo
  // tipo no mesmo dia. Conta QUALQUER tentativa (ok ou falha): depois de uma
  // resposta perdida / falha falsa, o item não volta pra fila hoje.
  const sentKeys = new Set(
    alreadySent
      .filter((l) => l.day === todayKey)
      .map((l) => `${l.phone}:${l.kind}`),
  );

  const queue: WaQueueItem[] = [];
  // Mesmo telefone já enfileirado hoje (ainda que não enviado) → pula.
  const queuedKeys = new Set<string>();

  // Ordena items por itemId para garantir consistência quando há múltiplos
  // com o mesmo telefone/vencimento
  const sortedItems = [...items].sort((a, b) =>
    (a.itemId || "").localeCompare(b.itemId || "")
  );

  for (const item of sortedItems) {
    if (!revenueIds.has(item.folderId)) continue;
    if (!item.dueDate || !item.isActive) continue;
    const phone = normalizeBrPhone(item.phone || "");
    if (!phone) continue;

    const dueKey = ymdOnly(item.dueDate);
    if (!dueKey) continue;
    const due = parseLocalYmd(dueKey);

    if (settings.sendOnDay && dueKey === todayKey) {
      const key = `${phone}:onday`;
      if (!sentKeys.has(key) && !queuedKeys.has(key)) {
        queuedKeys.add(key);
        queue.push({
          id: `${item.id}:onday`,
          itemId: item.itemId,
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
      // Só no DIA EXATO (daysBefore dias antes) — não na janela 1..daysBefore,
      // senão o lembrete repete todo dia enquanto o cliente está "Perto".
      const daysLeft = differenceInCalendarDays(due, parseLocalYmd(todayKey));
      if (daysLeft === settings.daysBefore) {
        const key = `${phone}:before`;
        if (!sentKeys.has(key) && !queuedKeys.has(key)) {
          queuedKeys.add(key);
          queue.push({
            id: `${item.id}:before`,
            itemId: item.itemId,
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

  // Ordem de envio: vence primeiro → hoje antes de antecipado → nome
  return queue.sort((a, b) => {
    const byDue = a.dueDate.localeCompare(b.dueDate);
    if (byDue !== 0) return byDue;
    if (a.kind !== b.kind) return a.kind === "onday" ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
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
  /** Se true, não loga erros HTTP no console (tentativas em loop de webhook) */
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
    const error = new Error(msg || `Erro HTTP ${res.status}`);
    // Silencia erros 400/404 de webhook (tentativas repetidas não geram console spam)
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

export type EvolutionConnectedProfile = {
  phone: string;
  profileName?: string;
};

/** Formata JID/número Evolution para exibição (+55 71 99999-9999). */
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

/** Número (e nome) do WhatsApp conectado na instância Evolution. */
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

/**
 * Registra o webhook da Evolution para o bot AuxPlus receber mensagens.
 * URL: {SUPABASE_URL}/functions/v1/evolution-webhook
 * (Independe de localhost — a Evolution chama o Supabase direto.)
 */
export async function setEvolutionWebhook(
  runtime: EvolutionRuntimeConfig,
  webhookUrl: string,
) {
  const name = runtime.instanceName.trim() || "auxplus";
  const url = webhookUrl.trim();
  if (!url) throw new Error("URL do webhook vazia");

  const events = ["MESSAGES_UPSERT"];
  const bodies: unknown[] = [
    {
      enabled: true,
      url,
      webhookByEvents: false,
      webhookBase64: false,
      events,
    },
    {
      webhook: {
        enabled: true,
        url,
        webhookByEvents: false,
        webhookBase64: false,
        events,
      },
    },
    {
      enabled: true,
      url,
      webhook_by_events: false,
      webhook_base64: false,
      events,
    },
  ];

  const paths = [
    `/webhook/set/${encodeURIComponent(name)}`,
    `/webhook/${encodeURIComponent(name)}`,
  ];
  let lastErr: unknown;
  for (const path of paths) {
    for (const body of bodies) {
      for (const method of ["POST", "PUT"] as const) {
        try {
          // silent=true: não loga erros 400/404 repetidos no console
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

/** Confere se a Evolution tem webhook apontando para o AuxPlus. */
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
