import { recoverySetting } from "./waRecovery.ts";
import { footballClock, evoConnection, statusRecipients, reconcileStatuses, FOOTBALL_STATUS_CAPTION, footballReceipt, footballMediaHash, claimStatusDelivery, releaseStatusDelivery } from "./footballStatus.ts";
import { normalizeCatalog } from "../../../src/lib/uniplayDiscover.ts";
import { catalogBannerPages, type CatalogBannerPage } from "../../../src/lib/catalogBanner.ts";
import { catalogRecognitionKey } from "../../../src/lib/catalogPopularity.ts";

type Render = (page: CatalogBannerPage) => Promise<Uint8Array>;
const settingsTable = "wa_content_status_settings", postsTable = "wa_content_status_posts";
export async function contentCatalog(db: any, userId: string) {
  const [auto, platform] = await Promise.all([recoverySetting(db, `automations_user_${userId}`), recoverySetting(db, "iptv_panel")]);
  const base = String(platform.apiProxyUrl || platform.api_proxy_url || "https://auxplus.vercel.app/api/gesapi").replace(/\/$/, "");
  if (!/^https:\/\//.test(base)) throw new Error("Configure a conexão UniPlay.");
  let token = String(auto.iptvBearerToken || "").replace(/^Bearer\s+/i, "");
  const call = async (path: string, payload?: unknown) => {
    const headerOnly = /\/api\/gesapi$|\/functions\/v1\/ges-?api$/.test(base);
    return fetch(headerOnly ? base : `${base}${path}`, { method: payload ? "POST" : "GET", headers: {
      "content-type": "application/json", "x-iptv-path": path, "x-iptv-authorization": `Bearer ${token}`, "ngrok-skip-browser-warning": "true",
    }, body: payload ? JSON.stringify(payload) : undefined, signal: AbortSignal.timeout(25000) });
  };
  const path = "/get-available-movies?reg_password=" + encodeURIComponent(auto.iptvRegPassword || platform.regPassword || "");
  let response = await call(path);
  if ([401, 403].includes(response.status) && auto.iptvUsername && auto.iptvPassword) {
    const login = await call("/login", { username: auto.iptvUsername, password: auto.iptvPassword, code: "" });
    const data = await login.json();
    token = String(data.access_token || data.token || data.data?.access_token || "");
    if (!token) throw new Error("Não foi possível autenticar na Uniplay.");
    response = await call(path);
  }
  if (!response.ok) throw new Error(`Não foi possível atualizar o catálogo (${response.status}).`);
  const data = await response.json();
  if (!Array.isArray(data.movies) || !Array.isArray(data.series)) throw new Error("A Uniplay não retornou o catálogo esperado.");
  return normalizeCatalog(data);
}

async function contentPlan(db: any, userId: string, pages: number) {
  const [items, history] = await Promise.all([
    contentCatalog(db, userId),
    db.from(postsTable).select("payload,status,post_day").eq("user_id", userId).in("status", ["sent", "provider_recorded", "uncertain", "sending"]).order("post_day", { ascending: false }).limit(200),
  ]);
  if (history.error) throw new Error("Não foi possível conferir os títulos já publicados.");
  // Rotate recognized titles instead of permanently exhausting the popular catalog.
  const cutoff = Date.now() - 14 * 86400000;
  const used = (history.data || []).filter((post: any) => Date.parse(`${post.post_day}T12:00:00Z`) >= cutoff)
    .flatMap((post: any) => post.payload?.titles?.flatMap((title: any) => [title.key, catalogRecognitionKey(title)]) || []);
  return catalogBannerPages(items, pages, used);
}

export async function manageContentStatus(db: any, userId: string, body: any, render?: Render) {
  let { data: setting, error: settingsError } = await db.from(settingsTable).select("*").eq("user_id", userId).maybeSingle();
  if (settingsError) throw new Error("Não foi possível consultar os banners de filmes e séries.");
  const patch = async (values: any) => {
    const result = setting ? await db.from(settingsTable).update(values).eq("user_id", userId)
      : await db.from(settingsTable).insert({ user_id: userId, ...values });
    if (result.error) throw new Error("Não foi possível salvar a configuração.");
    setting = { enabled: false, send_time: "09:00", pages_per_kind: 1, ...setting, ...values };
  };
  if (body.action === "content-status-save") {
    if (typeof body.enabled !== "boolean" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(body.sendTime) || ![1, 2, 3].includes(body.pagesPerKind)) throw new Error("Confira horário e quantidade de banners.");
    if (body.enabled) await evoConnection(db, userId);
    await patch({ enabled: body.enabled, send_time: body.sendTime, pages_per_kind: body.pagesPerKind, last_error: null, updated_at: new Date().toISOString() });
  } else if (body.action === "content-status-post-now") {
    await evoConnection(db, userId);
    await patch({ manual_request_day: footballClock().today, last_error: null });
    await db.from(postsTable).update({ status: "queued", error: null }).eq("user_id", userId).eq("post_day", footballClock().today).eq("status", "failed");
  } else if (body.action === "content-status-preview") {
    const { data: todayPosts, error } = await db.from(postsTable).select("payload").eq("user_id", userId).eq("post_day", footballClock().today).order("kind").order("page");
    if (error) throw new Error("Não foi possível consultar as páginas.");
    const plan = todayPosts?.length ? todayPosts.map((post: any) => post.payload) : await contentPlan(db, userId, setting?.pages_per_kind || 1);
    if (body.kind !== undefined) {
      const page = plan.find((page: CatalogBannerPage) => page.kind === body.kind && page.page === body.page);
      if (!page || !render) throw new Error("Banner indisponível.");
      const bytes = await render(page); let binary = "";
      for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
      return { image: `data:image/png;base64,${btoa(binary)}` };
    }
    return { pages: plan, day: footballClock().today };
  } else if (body.action !== "content-status-state") throw new Error("Ação inválida.");
  const { data: posts, error } = await db.from(postsTable).select("id,post_day,kind,page,total,status,error,sent_at,attempted_at").eq("user_id", userId).order("post_day", { ascending: false }).order("kind").order("page").limit(60);
  if (error) throw new Error("Não foi possível consultar a fila de filmes e séries.");
  return { settings: setting || { enabled: false, send_time: "09:00", pages_per_kind: 1 }, posts: posts || [] };
}

export async function runContentStatusQueue(db: any, render: Render, onlyUserId?: string) {
  const clock = footballClock(), start = Date.now();
  let query = db.from(settingsTable).select("*").or(`enabled.eq.true,manual_request_day.eq.${clock.today}`);
  if (onlyUserId) query = query.eq("user_id", onlyUserId);
  const { data: settings, error } = await query;
  if (error) return;
  for (const setting of settings || []) {
    if (Date.now() - start > 45000) break;
    if (setting.manual_request_day !== clock.today && clock.time < setting.send_time) continue;
    const { data: lock } = await db.from(settingsTable).update({ lease_until: new Date(Date.now() + 240000).toISOString() }).eq("user_id", setting.user_id)
      .or(`lease_until.is.null,lease_until.lt.${new Date().toISOString()}`).select("user_id").maybeSingle();
    if (!lock) continue;
    const deliveryToken = await claimStatusDelivery(db, setting.user_id);
    if (!deliveryToken) { await db.from(settingsTable).update({ lease_until: null }).eq("user_id", setting.user_id); continue; }
    try {
      await db.from(postsTable).update({ status: "uncertain", error: "Envio interrompido; confira no WhatsApp antes de repetir." }).eq("user_id", setting.user_id).eq("status", "sending");
      const evo = await evoConnection(db, setting.user_id);
      await reconcileStatuses(db, setting.user_id, evo, postsTable);
      const { data: existing, error: existingError } = await db.from(postsTable).select("id").eq("user_id", setting.user_id).eq("post_day", clock.today).limit(1);
      if (existingError) throw new Error("Não foi possível consultar as publicações de hoje.");
      if (!existing?.length) {
        const plan = await contentPlan(db, setting.user_id, setting.pages_per_kind);
        if (!plan.length) throw new Error("Nenhum lançamento recente e conhecido disponível sem repetir os últimos 14 dias. O catálogo será conferido no próximo ciclo.");
        if (plan.length) {
          const { error } = await db.from(postsTable).upsert(plan.map(page => ({ user_id: setting.user_id, post_day: clock.today, kind: page.kind, page: page.page, total: page.total, payload: page })), { onConflict: "user_id,post_day,kind,page", ignoreDuplicates: true });
          if (error) throw new Error("Não foi possível preparar a fila.");
        }
      }
      const { data: jobs, error: jobsError } = await db.from(postsTable).select("*").eq("user_id", setting.user_id).eq("post_day", clock.today).eq("status", "queued").order("kind").order("page").limit(1);
      if (jobsError) throw new Error("Não foi possível consultar a fila.");
      for (const job of jobs || []) {
        const bytes = await render(job.payload);
        const { data: active } = await db.from(settingsTable).select("enabled,manual_request_day").eq("user_id", setting.user_id).maybeSingle();
        if (!active?.enabled && active?.manual_request_day !== clock.today || footballClock().today !== clock.today) break;
        const recipients = await statusRecipients(evo);
        const hash = footballMediaHash(new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(bytes).buffer)));
        const { data: claimed, error } = await db.from(postsTable).update({ status: "sending", attempted_at: new Date().toISOString(), media_sha256: hash, error: null }).eq("id", job.id).eq("status", "queued").select("id").maybeSingle();
        if (error) throw new Error("Não foi possível registrar a tentativa.");
        if (!claimed) continue;
        try {
          let binary = ""; for (let offset = 0; offset < bytes.length; offset += 8192) binary += String.fromCharCode(...bytes.subarray(offset, offset + 8192));
          const response = await fetch(`${evo.base}/message/sendStatus/${encodeURIComponent(evo.instance)}`, { method: "POST", headers: evo.headers, signal: AbortSignal.timeout(110000),
            body: JSON.stringify({ type: "image", content: `data:image/png;base64,${btoa(binary)}`, caption: FOOTBALL_STATUS_CAPTION, allContacts: false, statusJidList: recipients }) });
          const result = await response.json().catch(() => null);
          if (!response.ok || result?.key?.remoteJid !== "status@broadcast" || !result.key?.id) throw new Error("Sem confirmação do WhatsApp. Confira o Status antes de repetir.");
          const receipt = footballReceipt(result.status);
          const saved = await db.from(postsTable).update({ status: receipt, message_id: String(result.key.id), sent_at: receipt === "sent" ? new Date().toISOString() : null, error: null }).eq("id", job.id).eq("status", "sending");
          if (saved.error) throw new Error("WhatsApp aceitou o Status, mas o registro falhou. Confira no celular.");
        } catch (e) {
          await db.from(postsTable).update({ status: "uncertain", error: e instanceof Error ? e.message : "Sem confirmação; confira no WhatsApp." }).eq("id", job.id).eq("status", "sending");
        }
      }
      const { data: pending } = await db.from(postsTable).select("id").eq("user_id", setting.user_id).eq("post_day", clock.today).eq("status", "queued").limit(1);
      await db.from(settingsTable).update({ last_run_at: new Date().toISOString(), last_error: null, ...(!pending?.length ? { manual_request_day: null } : {}) }).eq("user_id", setting.user_id);
    } catch (e) {
      await db.from(settingsTable).update({ last_error: e instanceof Error ? e.message : "Não foi possível publicar.", last_run_at: new Date().toISOString() }).eq("user_id", setting.user_id);
    } finally { await releaseStatusDelivery(db, setting.user_id, deliveryToken); await db.from(settingsTable).update({ lease_until: null }).eq("user_id", setting.user_id); }
  }
}
