import { recoverySetting } from "./waRecovery.ts";

export const FOOTBALL_STATUS_CAPTION = 'Comente "teste" para testar grátis.';
export function footballMediaHash(value: any): string {
  try {
    if (typeof value === "string" && /^[a-f0-9]{64}$/i.test(value)) return value.toLowerCase();
    const bytes = typeof value === "string" ? Uint8Array.from(atob(value), c => c.charCodeAt(0))
      : value instanceof Uint8Array ? value : Array.isArray(value?.data) ? Uint8Array.from(value.data) : Array.isArray(value) ? Uint8Array.from(value) : null;
    return bytes?.length === 32 ? [...bytes].map(b => b.toString(16).padStart(2, "0")).join("") : "";
  } catch { return ""; }
}

export function footballClock(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map(p => [p.type, p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const next = new Date(`${today}T12:00:00Z`); next.setUTCDate(next.getUTCDate() + 1);
  return { today, tomorrow: next.toISOString().slice(0, 10), time: `${parts.hour}:${parts.minute}` };
}
export function footballInstance(prefix: string, user: { id: string; username: string }) {
  return `${String(prefix || "auxplus").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24)}-${String(user.username || "").replace(/[^a-zA-Z0-9]/g, "").slice(0, 12) || "u"}${String(user.id).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16)}`.slice(0, 60);
}
export function footballReceipt(status: unknown): "sent" | "provider_recorded" {
  return ["SERVER_ACK", "DELIVERY_ACK", "READ", "PLAYED"].includes(String(status).toUpperCase()) || typeof status === "number" && status >= 2 && status <= 5 ? "sent" : "provider_recorded";
}
export function footballRecipients(contacts: any[], owner: unknown) {
  const normalize = (input: unknown) => String(input || "").replace(/:\d+@/, "@");
  const valid = (jid: string) => /^\d{5,20}@(s\.whatsapp\.net|lid)$/.test(jid);
  const own = normalize(owner);
  if (!valid(own)) throw new Error("Não foi possível identificar o próprio WhatsApp conectado para o Status.");
  const recipients = contacts.filter(c => c && !c.isGroup && (c.pushName || c.isSaved === true)).map(c => normalize(c.remoteJid)).filter(valid);
  if (!recipients.length) throw new Error("Nenhum contato disponível para publicar o Status.");
  // Include the sender explicitly so the story is synchronized to the linked phone too.
  return [...new Set([own, ...recipients])];
}
async function statusRecipients(evo: { base: string; instance: string; headers: Record<string, string> }) {
  const [profileResponse, contactsResponse] = await Promise.all([
    fetch(`${evo.base}/instance/fetchInstances?instanceName=${encodeURIComponent(evo.instance)}`, { headers: evo.headers, signal: AbortSignal.timeout(10000) }),
    fetch(`${evo.base}/chat/findContacts/${encodeURIComponent(evo.instance)}`, { method: "POST", headers: evo.headers, body: JSON.stringify({ where: {} }), signal: AbortSignal.timeout(15000) }),
  ]);
  if (!profileResponse.ok || !contactsResponse.ok) throw new Error("Não foi possível conferir os destinatários do Status.");
  const profiles = await profileResponse.json(), contacts = await contactsResponse.json();
  const list = Array.isArray(profiles) ? profiles : [profiles];
  const profile = list.find(p => p.name === evo.instance || p.instance?.instanceName === evo.instance);
  if (!profile || !Array.isArray(contacts)) throw new Error("A Evolution não retornou o perfil e os contatos da conta.");
  return footballRecipients(contacts, profile.ownerJid || profile.instance?.ownerJid || profile.instance?.owner);
}
function captionFor(job: any, legacy = false) {
  const when = job.banner_day === job.post_day ? "Hoje" : "Amanhã";
  return `AuxPlus · ${when} · ${legacy ? "" : `${String(job.banner_day).split("-").reverse().join("/")} · `}${job.region === "national" ? "Nacional" : "Internacional"} · ${job.page + 1}/${job.total} · Horários de Brasília`;
}
async function reconcileStatuses(db: any, userId: string, evo: { base: string; instance: string; headers: Record<string, string> }) {
  const { data: posts, error } = await db.from("wa_football_status_posts").select("*").eq("user_id", userId).in("status", ["sending", "uncertain", "provider_recorded"]).order("post_day", { ascending: false }).limit(40);
  if (error) throw new Error("Não foi possível conferir os Status anteriores.");
  if (!posts?.length) return;
  const response = await fetch(`${evo.base}/chat/findMessages/${encodeURIComponent(evo.instance)}`, { method: "POST", headers: evo.headers,
    body: JSON.stringify({ where: { key: { remoteJid: "status@broadcast", fromMe: true } }, page: 1, offset: 100 }), signal: AbortSignal.timeout(15000) });
  if (!response.ok) return;
  const raw = await response.json();
  const messages = raw.messages?.records;
  if (!Array.isArray(messages)) return;
  for (const post of posts) {
    const record = messages.find((m: any) => {
      if (m.key?.remoteJid !== "status@broadcast" || m.key?.fromMe !== true || !m.key?.id) return false;
      if (post.message_id) return m.key.id === post.message_id;
      const timestamp = Number(m.messageTimestamp) * 1000, attempted = Date.parse(post.attempted_at);
      const caption = m.message?.imageMessage?.caption;
      const legacyMatch = [captionFor(post), captionFor(post, true)].includes(caption);
      const imageMatch = caption === FOOTBALL_STATUS_CAPTION && !!post.media_sha256 && footballMediaHash(m.message?.imageMessage?.fileSha256) === post.media_sha256;
      return Number.isFinite(attempted) && timestamp >= attempted - 10000 && timestamp <= attempted + 240000 && (legacyMatch || imageMatch);
    });
    if (!record) continue;
    const status = footballReceipt(record.status);
    const { error: updateError } = await db.from("wa_football_status_posts").update({ status, message_id: String(record.key.id), error: null,
      sent_at: status === "sent" ? new Date(Number(record.messageTimestamp) * 1000).toISOString() : null }).eq("id", post.id).in("status", ["sending", "uncertain", "provider_recorded"]);
    if (updateError) throw new Error("Não foi possível atualizar a confirmação do Status.");
  }
}
function renderer() {
  const url = Deno.env.get("FOOTBALL_BANNER_RENDER_URL") || `${Deno.env.get("SUPABASE_URL")}/functions/v1/wa-football-banner`;
  if (!/^https:\/\//.test(url)) throw new Error("Configure a URL pública HTTPS do gerador de banners.");
  return url;
}
async function evoConnection(db: any, userId: string) {
  const [{ data: user, error }, evo] = await Promise.all([
    db.from("users").select("id,username,is_active").eq("id", userId).maybeSingle(), recoverySetting(db, "evolution_api"),
  ]);
  if (error || !user || user.is_active === false) throw new Error("Conta indisponível.");
  if (!evo.apiBaseUrl || !evo.apiKey) throw new Error("Configure o WhatsApp em Conexões.");
  const instance = footballInstance(evo.instancePrefix, user);
  const base = String(evo.apiBaseUrl).replace(/\/$/, "");
  const headers = { apikey: String(evo.apiKey), "Content-Type": "application/json", "ngrok-skip-browser-warning": "true" };
  const response = await fetch(`${base}/instance/connectionState/${encodeURIComponent(instance)}`, { headers, signal: AbortSignal.timeout(10000) });
  const result = await response.json();
  if (!response.ok || (result.instance?.state || result.state) !== "open") throw new Error("WhatsApp desconectado. Reconecte em Conexões.");
  return { base, instance, headers };
}

export async function manageFootballStatus(db: any, userId: string, body: any) {
  if (body.action === "football-status-save") {
    if (typeof body.enabled !== "boolean" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(body.sendTime || ""))) throw new Error("Informe o horário de postagem e ligue ou desligue o automático.");
    if (body.enabled) {
      await evoConnection(db, userId);
      const health = await fetch(`${renderer()}?mode=health`, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(15000) });
      const status = await health.json().catch(() => null);
      if (!health.ok || status?.ok !== true) throw new Error("O gerador automático está indisponível. Tente ativar novamente em instantes. O download manual continua disponível.");
    }
    const { error } = await db.from("wa_football_status_settings").upsert({ user_id: userId, enabled: body.enabled, send_time: body.sendTime, last_error: null, updated_at: new Date().toISOString() });
    if (error) throw new Error("Não foi possível salvar o agendamento. Confira a instalação da automação.");
  } else if (body.action !== "football-status-state") throw new Error("Ação inválida.");
  const [{ data: settings, error }, { data: posts, error: postsError }] = await Promise.all([
    db.from("wa_football_status_settings").select("enabled,send_time,last_run_at,last_error").eq("user_id", userId).maybeSingle(),
    db.from("wa_football_status_posts").select("id,banner_day,region,page,total,status,error,sent_at,attempted_at,post_day").eq("user_id", userId).order("post_day", { ascending: false }).order("banner_day").order("page").limit(50),
  ]);
  if (error || postsError) throw new Error("A automação de Status ainda precisa ser instalada no servidor. Os banners continuam disponíveis para download.");
  return { settings: settings || { enabled: false, send_time: "09:00" }, posts: posts || [] };
}

export function footballManifest(raw: any, today: string, tomorrow: string) {
  if (raw?.postDay !== today || !Array.isArray(raw.entries) || raw.entries.length > 40) throw new Error("Programação automática inválida ou desatualizada.");
  const seen = new Set<string>();
  return raw.entries.map((e: any) => {
    const key = `${e.day}:${e.region}:${e.page}`;
    if (![today, tomorrow].includes(e.day) || !["national", "international"].includes(e.region) || !Number.isInteger(e.page) || !Number.isInteger(e.total) || e.total < 1 || e.total > 10 || e.page < 0 || e.page >= e.total || seen.has(key)) throw new Error("Páginas automáticas inválidas.");
    seen.add(key); return { day: e.day, region: e.region, page: e.page, total: e.total };
  });
}

/** Called by the existing server cron; sends only opt-in accounts, never on UI render. */
export async function runFootballStatusQueue(db: any) {
  const clock = footballClock(), started = Date.now();
  const { data: settings, error } = await db.from("wa_football_status_settings").select("user_id,send_time").eq("enabled", true);
  if (error) { console.warn("[football-status] Settings table unavailable."); return; }
  for (const setting of settings || []) {
    if (Date.now() - started > 45000) break;
    if (clock.time < setting.send_time) continue;
    const now = new Date().toISOString();
    const { data: lease, error: leaseError } = await db.from("wa_football_status_settings")
      .update({ lease_until: new Date(Date.now() + 240000).toISOString() }).eq("user_id", setting.user_id).eq("enabled", true)
      .or(`lease_until.is.null,lease_until.lt.${now}`).select("user_id").maybeSingle();
    if (leaseError || !lease) continue;
    try {
      // A crashed request may have reached WhatsApp: it must never be retried automatically.
      const { error: staleError } = await db.from("wa_football_status_posts").update({ status: "uncertain", error: "Envio interrompido. Confira no WhatsApp; não será repetido automaticamente." }).eq("user_id", setting.user_id).eq("status", "sending");
      if (staleError) throw new Error("Não foi possível conferir as postagens anteriores.");
      const evo = await evoConnection(db, setting.user_id);
      await reconcileStatuses(db, setting.user_id, evo);
      const response = await fetch(`${renderer()}?mode=manifest`, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(55000) });
      if (!response.ok) throw new Error("Gerador de banners indisponível. Nova consulta no próximo ciclo.");
      const entries = footballManifest(await response.json(), clock.today, clock.tomorrow).filter((entry: any) => entry.day === clock.today);
      if (entries.length) {
        const { error: queueError } = await db.from("wa_football_status_posts").upsert(entries.map((e: any) => ({ user_id: setting.user_id, post_day: clock.today, banner_day: e.day, region: e.region, page: e.page, total: e.total })), { onConflict: "user_id,post_day,banner_day,region,page", ignoreDuplicates: true });
        if (queueError) throw new Error("Não foi possível preparar as postagens.");
      }
      const { data: jobs, error: jobsError } = await db.from("wa_football_status_posts").select("*").eq("user_id", setting.user_id).eq("post_day", clock.today).eq("banner_day", clock.today).eq("status", "queued").order("banner_day").order("region", { ascending: false }).order("page").limit(1);
      if (jobsError) throw new Error("Não foi possível consultar a fila de Status.");
      for (const job of jobs || []) {
        if (Date.now() - started > 45000) break;
        if (footballClock().today !== clock.today) break;
        const { data: active, error: activeError } = await db.from("wa_football_status_settings").select("enabled").eq("user_id", setting.user_id).maybeSingle();
        if (activeError || !active?.enabled) break;
        const query = new URLSearchParams({ day: job.banner_day, region: job.region, page: String(job.page) });
        const imageUrl = `${renderer()}?${query}`;
        // Render before claiming a send. An unavailable image is safe to retry later.
        const image = await fetch(imageUrl, { headers: { "user-agent": "Mozilla/5.0" }, signal: AbortSignal.timeout(55000) });
        if (!image.ok || !image.headers.get("content-type")?.startsWith("image/png")) {
          const reason = await image.json().catch(() => null);
          throw new Error(`O gerador retornou HTTP ${image.status}${reason?.reason ? `: ${String(reason.reason).slice(0, 150)}` : ""}. A postagem foi adiada.`);
        }
        const bytes = new Uint8Array(await image.arrayBuffer());
        if (bytes.length < 8 || bytes[0] !== 137 || bytes[1] !== 80 || bytes[2] !== 78 || bytes[3] !== 71) throw new Error("Imagem do banner inválida.");
        let binary = "";
        for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
        const imageContent = `data:image/png;base64,${btoa(binary)}`;
        // Turning off during rendering must still stop the following publication.
        const { data: stillActive, error: stillError } = await db.from("wa_football_status_settings").select("enabled").eq("user_id", setting.user_id).maybeSingle();
        if (stillError || !stillActive?.enabled || footballClock().today !== clock.today) break;
        const recipients = await statusRecipients(evo);
        const { data: ready, error: readyError } = await db.from("wa_football_status_settings").select("enabled").eq("user_id", setting.user_id).maybeSingle();
        if (readyError || !ready?.enabled) break;
        const mediaHash = footballMediaHash(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)));
        const { data: claimed, error: claimError } = await db.from("wa_football_status_posts").update({ status: "sending", media_sha256: mediaHash, attempted_at: new Date().toISOString() }).eq("id", job.id).eq("status", "queued").select("id").maybeSingle();
        if (claimError) throw new Error("Não foi possível registrar a tentativa de postagem.");
        if (!claimed) continue;
        try {
          const caption = FOOTBALL_STATUS_CAPTION;
          const sent = await fetch(`${evo.base}/message/sendStatus/${encodeURIComponent(evo.instance)}`, {
            method: "POST", headers: evo.headers, signal: AbortSignal.timeout(110000),
            body: JSON.stringify({ type: "image", content: imageContent, caption, allContacts: false, statusJidList: recipients }),
          });
          const result = await sent.json().catch(() => null);
          if (!sent.ok || result?.key?.remoteJid !== "status@broadcast" || !result?.key?.id) throw new Error("A Evolution não confirmou a publicação. Confira o Status no WhatsApp.");
          const receipt = footballReceipt(result.status);
          const { error: logError } = await db.from("wa_football_status_posts").update({ status: receipt, message_id: String(result.key.id), sent_at: receipt === "sent" ? new Date().toISOString() : null, error: null }).eq("id", job.id).eq("status", "sending");
          if (logError) throw new Error("WhatsApp aceitou o Status, mas o registro falhou. Confira no celular.");
        } catch (e) {
          const message = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? "A Evolution demorou mais de 110 segundos. O histórico será conferido sem reenviar a imagem." : e instanceof Error ? e.message : "Envio sem confirmação; confira no WhatsApp.";
          await db.from("wa_football_status_posts").update({ status: "uncertain", error: message }).eq("id", job.id).eq("status", "sending");
          throw new Error("Postagem sem confirmação. Confira no WhatsApp. Não haverá reenvio automático desta imagem.");
        }
      }
      await db.from("wa_football_status_settings").update({ last_run_at: new Date().toISOString(), last_error: null }).eq("user_id", setting.user_id);
    } catch (e) {
      await db.from("wa_football_status_settings").update({ last_run_at: new Date().toISOString(), last_error: e instanceof Error ? e.message : "Falha ao publicar os banners." }).eq("user_id", setting.user_id);
    } finally {
      await db.from("wa_football_status_settings").update({ lease_until: null }).eq("user_id", setting.user_id);
    }
  }
}
