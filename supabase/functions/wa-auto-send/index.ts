/**
 * Envio automático de lembretes de vencimento (WhatsApp) — lado servidor.
 *
 * O autoenvio do app (useWhatsappAutoSend) só roda com o app aberto. Esta função
 * replica a MESMA lógica (fila do dia, anti-duplicado por telefone, limites
 * anti-ban) e roda no Supabase Edge em um cron — assim a mensagem sai sem abrir
 * o app.
 *
 * Trigger: cron (pg_cron) a cada 5 min → POST {SUPABASE_URL}/functions/v1/wa-auto-send
 * Config: platform_settings → evolution_api, wa_settings_user_{id}, wa_send_log_user_{id}
 * Dados: tabelas folders / items / users
 *
 * É idempotente: o send log (wa_send_log_user_{id}) já marca quem foi tentado
 * hoje — rodar várias vezes não reenvia.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,GET,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-cron",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// ---------------------------------------------------------------------------
// Fuso horário do app: Brasil (America/Sao_Paulo). O Edge roda em UTC — se
// usássemos a data UTC aqui, o "dia" do send log divergiria do telefone e o
// anti-duplicado entre app aberto e servidor quebraria.
// ---------------------------------------------------------------------------

function spParts(now = new Date()): { ymd: string; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of fmt.formatToParts(now)) parts[p.type] = p.value;
  // Alguns motores emitem "24" para meia-noite com hour12:false
  return {
    ymd: `${parts.year}-${parts.month}-${parts.day}`,
    hour: Number(parts.hour) % 24,
    minute: Number(parts.minute),
  };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function addDaysYmd(ymd: string, n: number): string {
  const t = Date.parse(`${ymd}T12:00:00Z`) + n * 86_400_000;
  const d = new Date(t);
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function calendarDaysBetween(aYmd: string, bYmd: string): number {
  const a = Date.parse(`${aYmd}T12:00:00Z`);
  const b = Date.parse(`${bYmd}T12:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Tipos (paridade com src/lib/whatsappAutomation.ts)
// ---------------------------------------------------------------------------

interface WaSettings {
  enabled: boolean;
  daysBefore: number;
  sendBefore: boolean;
  sendOnDay: boolean;
  sendTime: string;
  messageBefore: string;
  messageOnDay: string;
  minIntervalSec: number;
  jitterSec: number;
  maxPerDay: number;
  maxPerHour: number;
}

interface WaLogRow {
  day: string;
  sentAt: string;
  phone: string;
  itemId: string;
  kind: "before" | "onday";
  ok: boolean;
  error?: string;
}

interface QueueItem {
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

const DEFAULT_MESSAGE_BEFORE = `{getGreeting}

🔔 *Lembrete da T&E* 🔔

👤 *Usuário:* \`{item_id}\`

📅 *Seu acesso vence em:* *{due_date}*

Renove antecipadamente para continuar assistindo *sem interrupções*. 📺✨

💬 *Responda esta mensagem* para receber as opções de renovação automática.

Obrigado pela preferência! 💙`;

const DEFAULT_MESSAGE_ONDAY = `{getGreeting}

⚠️ *Seu acesso vence hoje!* ⚠️

👤 *Usuário:* \`{item_id}\`

🕒 *Vencimento:* *{due_date}*

Para evitar a interrupção do serviço, faça sua renovação agora. 📺✨

💬 *Responda esta mensagem* para renovar automaticamente.

Obrigado pela preferência! 💙`;

function defaultSettings(): WaSettings {
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

function normalizeSettings(raw: unknown): WaSettings {
  const base = defaultSettings();
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: r.enabled !== undefined ? Boolean(r.enabled) : base.enabled,
    daysBefore: Math.max(1, Math.min(30, Number(r.daysBefore) || base.daysBefore)),
    sendBefore:
      r.sendBefore !== undefined ? Boolean(r.sendBefore) : base.sendBefore,
    sendOnDay: r.sendOnDay !== undefined ? Boolean(r.sendOnDay) : base.sendOnDay,
    sendTime: String(r.sendTime || base.sendTime).trim() || base.sendTime,
    messageBefore: String(r.messageBefore ?? base.messageBefore),
    messageOnDay: String(r.messageOnDay ?? base.messageOnDay),
    minIntervalSec: Math.max(30, Number(r.minIntervalSec) || base.minIntervalSec),
    jitterSec: Math.max(
      0,
      r.jitterSec !== undefined ? Number(r.jitterSec) : base.jitterSec,
    ),
    maxPerDay: Math.max(1, Number(r.maxPerDay) || base.maxPerDay),
    maxPerHour: Math.max(1, Number(r.maxPerHour) || base.maxPerHour),
  };
}

// ---------------------------------------------------------------------------
// Helpers puros (paridade com whatsappAutomation.ts)
// ---------------------------------------------------------------------------

function phoneDigits(phone: string) {
  return String(phone || "").replace(/\D/g, "");
}

function normalizeBrPhone(phone: string): string | null {
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

function getWhatsappGreeting() {
  const h = spParts().hour;
  if (h < 12) return "Bom dia,";
  if (h < 18) return "Boa tarde,";
  return "Boa noite,";
}

function ymdOnly(value: unknown): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || "").trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

function formatDueForMessage(value: unknown): string {
  const s = String(value || "").trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/);
  if (!m) return "—";
  const date = `${m[3]}/${m[2]}/${m[1]}`;
  const time = m[4] != null ? `${m[4]}:${m[5]}:${m[6] ?? "00"}` : "00:00:00";
  return `${date} ${time}`;
}

function fillWhatsappTemplate(
  template: string,
  item: { name?: string; itemId?: string; dueDate?: unknown; price?: unknown; phone?: string },
  kind: "before" | "onday",
): string {
  const due = formatDueForMessage(item.dueDate);
  const dateText = kind === "onday" ? "Vence hoje:" : "Vai vencer em:";
  // Usa o itemId se for um número "longo" (> 5 caracteres, tipo username do painel)
  // Caso contrário, usa o phone como fallback
  const displayItemId = item.itemId && String(item.itemId).trim().length > 5
    ? String(item.itemId).trim()
    : (String(item.phone || "").replace(/\D/g, "") || String(item.itemId || ""));
  return String(template || "")
    .replace(/\{getGreeting\}/g, getWhatsappGreeting())
    .replace(/\{item_id\}/g, displayItemId)
    .replace(/\{name\}/g, String(item.name || ""))
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

/** Já passou do horário de envio de hoje (fuso SP)? */
function isPastSendTime(sendTime: string): boolean {
  const { hour, minute } = parseSendTime(sendTime);
  const now = spParts();
  return now.hour > hour || (now.hour === hour && now.minute >= minute);
}

function trimSendLogs(logs: WaLogRow[]): WaLogRow[] {
  const cutoff = addDaysYmd(spParts().ymd, -14);
  return logs.filter((l) => (l.day || "") >= cutoff).slice(-500);
}

/**
 * Monta fila do dia — mesma regra do app:
 * - pastas de receita (Cliente/Produto)
 * - item ativo com vencimento + telefone BR válido
 * - "onday" quando vence hoje; "before" no dia EXATO daysBefore antes
 * - anti-duplicado por telefone+tipo (send log + fila)
 */
function buildTodayQueue(
  settings: WaSettings,
  items: Array<Record<string, unknown>>,
  folders: Array<Record<string, unknown>>,
  alreadySent: WaLogRow[],
  todayKey: string,
): QueueItem[] {
  const revenueIds = new Set(
    folders
      .filter((f) => f.type === "Cliente" || f.type === "Produto")
      .map((f) => String(f.id)),
  );
  const { hour, minute } = parseSendTime(settings.sendTime);
  const scheduledAt = `${todayKey}T${pad2(hour)}:${pad2(minute)}:00`;

  const sentKeys = new Set(
    alreadySent
      .filter((l) => l.day === todayKey)
      .map((l) => `${l.phone}:${l.kind}`),
  );

  // Rastreia quais telefones já foram notificados como "onday" em qualquer dia anterior
  const alreadyNotifiedOnday = new Set(
    alreadySent
      .filter((l) => l.kind === "onday")
      .map((l) => l.phone),
  );

  const queue: QueueItem[] = [];
  const queuedKeys = new Set<string>();

  // Ordena items por itemId para garantir consistência quando há múltiplos
  // com o mesmo telefone/vencimento
  const sortedItems = [...items].sort((a, b) =>
    String(a.id ?? a.item_id ?? "").localeCompare(String(b.id ?? b.item_id ?? ""))
  );

  for (const item of sortedItems) {
    if (!revenueIds.has(String(item.folder_id))) continue;
    if (item.is_active === false) continue;
    if (!item.due_date) continue;
    const phone = normalizeBrPhone(String(item.phone || ""));
    if (!phone) continue;

    const dueKey = ymdOnly(item.due_date);
    if (!dueKey) continue;

    const name = String(item.name || "");
    const itemId = String(item.item_id ?? "");
    const row = {
      name,
      itemId,
      dueDate: item.due_date as unknown,
      price: item.price as unknown,
      phone: String(item.phone || ""),
    };

    if (settings.sendOnDay && dueKey === todayKey) {
      const key = `${phone}:onday`;
      // Não enviar se já foi notificado como "onday" em qualquer dia anterior
      if (!sentKeys.has(key) && !queuedKeys.has(key) && !alreadyNotifiedOnday.has(phone)) {
        // Verifica se há um item mais recente do mesmo cliente com vencimento futuro
        const hasNewerItem = items.some((other) => {
          if (String(other.id ?? other.item_id) !== itemId) return false;
          if (other.is_active === false) return false;
          const otherDue = ymdOnly(other.due_date);
          if (!otherDue) return false;
          // Se há item com vencimento DEPOIS de hoje, ignora o antigo
          return otherDue > todayKey;
        });

        if (!hasNewerItem) {
          queuedKeys.add(key);
          queue.push({
            id: `${itemId}:onday`,
            itemId,
            folderId: String(item.folder_id),
            name,
            phone,
            dueDate: dueKey,
            kind: "onday",
            message: fillWhatsappTemplate(settings.messageOnDay, row, "onday"),
            scheduledAt,
          });
        }
      }
    }

    if (settings.sendBefore && settings.daysBefore > 0) {
      const daysLeft = calendarDaysBetween(dueKey, todayKey);
      if (daysLeft === settings.daysBefore) {
        const key = `${phone}:before`;
        if (!sentKeys.has(key) && !queuedKeys.has(key)) {
          const hasNewerItem = items.some((other) => {
            if (String(other.id ?? other.item_id) !== itemId) return false;
            if (other.is_active === false) return false;
            const otherDue = ymdOnly(other.due_date);
            if (!otherDue) return false;
            return otherDue > todayKey;
          });
          if (!hasNewerItem) {
            queuedKeys.add(key);
            queue.push({
              id: `${itemId}:before`,
              itemId,
              folderId: String(item.folder_id),
              name,
              phone,
              dueDate: dueKey,
              kind: "before",
              message: fillWhatsappTemplate(settings.messageBefore, row, "before"),
              scheduledAt,
            });
          }
        }
      }
    }
  }

  return queue.sort((a, b) => {
    const byDue = a.dueDate.localeCompare(b.dueDate);
    if (byDue !== 0) return byDue;
    if (a.kind !== b.kind) return a.kind === "onday" ? -1 : 1;
    return a.name.localeCompare(b.name, "pt-BR");
  });
}

function canSendMore(
  settings: WaSettings,
  logs: WaLogRow[],
  nowIso: string,
): { ok: boolean; reason?: string } {
  const day = spParts().ymd;
  const now = new Date(nowIso).getTime();
  const dayLogs = logs.filter((l) => l.day === day && l.ok);
  if (dayLogs.length >= settings.maxPerDay) {
    return { ok: false, reason: `Limite diário atingido (${settings.maxPerDay}).` };
  }
  const hourAgo = now - 60 * 60 * 1000;
  const hourCount = dayLogs.filter(
    (l) => new Date(l.sentAt).getTime() >= hourAgo,
  ).length;
  if (hourCount >= settings.maxPerHour) {
    return { ok: false, reason: `Limite por hora atingido (${settings.maxPerHour}).` };
  }
  const last = [...dayLogs].sort((a, b) =>
    (b.sentAt || "").localeCompare(a.sentAt || ""),
  )[0];
  if (last) {
    const elapsed = now - new Date(last.sentAt).getTime();
    const need = settings.minIntervalSec * 1000;
    if (elapsed < need) {
      return {
        ok: false,
        reason: `Aguarde ${Math.ceil((need - elapsed) / 1000)}s pelo intervalo anti-ban.`,
      };
    }
  }
  return { ok: true };
}

function nextDelayMs(settings: WaSettings) {
  const base = Math.max(30, settings.minIntervalSec) * 1000;
  const jitter = Math.max(0, settings.jitterSec) * 1000;
  return base + Math.floor(Math.random() * (jitter + 1));
}

/**
 * Reserva a tentativa ANTES do envio e só resolve depois: se a resposta da
 * Evolution se perder após entregar (falsa falha), o dia já fica "usado" —
 * nunca reenvia o lembrete. Igual ao app (markWhatsappAttempt/resolve).
 */
function markAttempt(
  logs: WaLogRow[],
  day: string,
  phone: string,
  itemId: string,
  kind: "before" | "onday",
  sentAt: string,
): WaLogRow[] {
  if (logs.some((l) => l.day === day && l.phone === phone && l.kind === kind)) {
    return logs;
  }
  return [
    ...logs,
    { day, sentAt, phone, itemId, kind, ok: false, error: "sending" },
  ];
}

function resolveAttempt(
  logs: WaLogRow[],
  day: string,
  phone: string,
  kind: "before" | "onday",
  ok: boolean,
  sentAt: string,
  error?: string,
): WaLogRow[] {
  const idx = logs.findIndex(
    (l) => l.day === day && l.phone === phone && l.kind === kind && !l.ok,
  );
  if (idx === -1) return logs;
  const next = [...logs];
  next[idx] = {
    ...next[idx],
    ok,
    error: ok ? undefined : error || next[idx].error || "erro",
    sentAt,
  };
  return next;
}

// ---------------------------------------------------------------------------
// Supabase helpers (mesmo padrão do evolution-webhook)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Evolution API
// ---------------------------------------------------------------------------

async function evolutionFetch(
  base: string,
  apiKey: string,
  path: string,
  init?: RequestInit,
) {
  const res = await fetch(`${base}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      apikey: apiKey,
      // Evolution atrás de ngrok free
      "ngrok-skip-browser-warning": "true",
      ...(init?.headers || {}),
    },
  });
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

async function evolutionInstanceOpen(
  base: string,
  apiKey: string,
  instance: string,
): Promise<boolean> {
  try {
    const state = (await evolutionFetch(
      base,
      apiKey,
      `/instance/connectionState/${encodeURIComponent(instance)}`,
    )) as { instance?: { state?: string }; state?: string };
    const st = String(state?.instance?.state || state?.state || "").toLowerCase();
    return st === "open";
  } catch {
    return false;
  }
}

async function sendEvolutionText(
  base: string,
  apiKey: string,
  instance: string,
  phone: string,
  text: string,
) {
  const number = normalizeBrPhone(phone);
  if (!number) throw new Error("Telefone inválido");
  await evolutionFetch(base, apiKey, `/message/sendText/${encodeURIComponent(instance)}`, {
    method: "POST",
    body: JSON.stringify({
      number,
      text,
      // delay da Evolution = simulação de digitação; intervalo entre envios é via nextDelayMs
      delay: 1200,
    }),
  });
}

/** Instância por usuário: `{prefix}-{username}{id}` (paridade com platformApi). */
function instanceNameForUser(prefix: string, userId: unknown, username?: string) {
  const base = (prefix || "auxplus").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  const id = String(userId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  const user = String(username || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12);
  return `${base}-${user || "u"}${id}`.slice(0, 60);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST" && req.method !== "GET") {
    return json({ error: "Use POST" }, 405);
  }

  const startedAt = Date.now();
  const summary = { users: 0, queued: 0, sent: 0, skipped: 0, failed: 0 };

  try {
    const client = await sb();

    const evo = await getSetting<{ apiBaseUrl?: string; apiKey?: string; instancePrefix?: string }>(
      client,
      "evolution_api",
    );
    if (!evo?.apiBaseUrl?.trim() || !evo?.apiKey?.trim()) {
      return json({ ok: false, error: "evolution_api não configurado" });
    }
    const base = String(evo.apiBaseUrl).trim().replace(/\/$/, "");
    const apiKey = String(evo.apiKey).trim();
    const prefix = String(evo.instancePrefix || "auxplus");

    const [foldersRes, itemsRes, usersRes] = await Promise.all([
      client.from("folders").select("id,user_id,type"),
      client.from("items").select("id,folder_id,item_id,name,due_date,phone,price,is_active"),
      client.from("users").select("id,username"),
    ]);
    const folders = (foldersRes.data || []) as Array<Record<string, unknown>>;
    const allItems = (itemsRes.data || []) as Array<Record<string, unknown>>;
    const users = (usersRes.data || []) as Array<Record<string, unknown>>;

    for (const u of users) {
      const userId = String(u.id);
      const settingsRaw = await getSetting<unknown>(client, `wa_settings_user_${userId}`);
      if (!settingsRaw) continue;
      const settings = normalizeSettings(settingsRaw);
      if (!settings.enabled) continue;
      if (!isPastSendTime(settings.sendTime)) continue;

      const myFolders = folders.filter((f) => String(f.user_id) === userId);
      if (!myFolders.length) continue;
      const folderIds = new Set(myFolders.map((f) => String(f.id)));
      const myItems = allItems.filter((i) => folderIds.has(String(i.folder_id)));
      if (!myItems.length) continue;

      const bag = await getSetting<{ logs?: WaLogRow[] }>(
        client,
        `wa_send_log_user_${userId}`,
      );
      let logs = trimSendLogs(Array.isArray(bag?.logs) ? bag.logs : []);
      const todayKey = spParts().ymd;

      const queue = buildTodayQueue(settings, myItems, myFolders, logs, todayKey);
      if (!queue.length) continue;

      const instance = instanceNameForUser(prefix, userId, u.username);
      const open = await evolutionInstanceOpen(base, apiKey, instance);
      if (!open) {
        summary.users += 1;
        summary.skipped += queue.length;
        continue;
      }

      summary.queued += queue.length;
      let sent = 0;
      let consecutiveFailures = 0;
      for (let idx = 0; idx < queue.length; idx++) {
        const item = queue[idx];
        const sentAt = new Date().toISOString();
        const gate = canSendMore(settings, logs, sentAt);
        if (!gate.ok) {
          summary.skipped += queue.length - idx;
          break;
        }

        logs = markAttempt(logs, todayKey, item.phone, item.itemId, item.kind, sentAt);
        try {
          await sendEvolutionText(base, apiKey, instance, item.phone, item.message);
          logs = resolveAttempt(logs, todayKey, item.phone, item.kind, true, sentAt);
          sent += 1;
          consecutiveFailures = 0;
        } catch (e) {
          // Falha pontual (número inválido/banido) não trava a fila; mas se a
          // Evolution cair no meio, para de martelar e deixa o próximo cron
          // tentar de novo (os restantes não ficam reservados).
          logs = resolveAttempt(
            logs,
            todayKey,
            item.phone,
            item.kind,
            false,
            sentAt,
            e instanceof Error ? e.message : String(e),
          );
          summary.failed += 1;
          consecutiveFailures += 1;
          if (consecutiveFailures >= 3) {
            summary.skipped += queue.length - idx - 1;
            await putSetting(client, `wa_send_log_user_${userId}`, { logs });
            break;
          }
        }
        await putSetting(client, `wa_send_log_user_${userId}`, { logs });

        if (idx < queue.length - 1) {
          await sleep(nextDelayMs(settings));
        }
      }
      summary.sent += sent;
      summary.users += 1;
    }

    return json({ ok: true, ...summary, elapsedMs: Date.now() - startedAt });
  } catch (e) {
    return json(
      {
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        ...summary,
      },
      500,
    );
  }
});
