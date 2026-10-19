// Private campaign state is only accessed with the service role.
export const RECOVERY_MESSAGE = "{getGreeting}\n\nVocê já foi nosso cliente de *IPTV* 📺\n\n👤 *Seu usuário anterior:* `{item_id}`\n\nQuer experimentar nosso serviço novamente? Podemos liberar um *teste grátis, sem compromisso*.\n\n*1 — Quero experimentar*\n*2 — Parar de receber mensagens*";
export function recoveryPhone(value: unknown): string {
  let p = String(value || "").replace(/\D/g, "");
  if (p.length === 10 || p.length === 11) p = "55" + p;
  if (!/^55\d{10,11}$/.test(p)) return "";
  return p.length === 13 && p[4] === "9" ? p.slice(0,4) + p.slice(5) : p;
}
export function recoveryText(template: string, username: string, date = new Date()) {
  const hour = Number(new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", hour12: false }).format(date));
  return template.replace(/\{getGreeting\}/g, hour < 12 ? "Bom dia!" : hour < 18 ? "Boa tarde!" : "Boa noite!").replace(/\{item_id\}/g, username);
}
export async function recoverySetting(db: any, key: string) {
  const { data, error } = await db.from("platform_settings").select("value").eq("key", key).maybeSingle();
  if (error) throw new Error("Não foi possível consultar a configuração.");
  return typeof data?.value === "string" ? JSON.parse(data.value) : data?.value || {};
}
export function recoveryRows(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.data?.data)) return raw.data.data;
  throw new Error("O painel não devolveu uma lista válida. Nenhum cliente foi considerado excluído.");
}
async function allRecoveryRows(query: () => any): Promise<any[]> {
  const all: any[] = [];
  for (let offset=0; offset<50000; offset+=1000) {
    const {data,error}=await query().order("id").range(offset,offset+999);
    if(error)throw new Error("Não foi possível conferir todos os clientes e o histórico.");
    all.push(...data);
    if(data.length<1000)return all;
  }
  throw new Error("A lista excedeu o limite de conferência. Envio bloqueado.");
}
export async function recoveryPanel(db: any, userId: string) {
  const startedAt = Date.now();
  const auto = await recoverySetting(db, `automations_user_${userId}`);
  const panel = await recoverySetting(db, "iptv_panel");
  const base = String(panel.apiProxyUrl || panel.api_proxy_url || auto.apiProxyUrl || "").replace(/\/$/, "");
  if (!/^https:\/\//.test(base)) throw new Error("Conecte o UniPlay e configure o Proxy API.");
  let bearer = String(auto.iptvBearerToken || "").replace(/^Bearer\s+/i, "");
  const call = async (path: string, body?: any, token = bearer) => {
    const response = await fetch(base, { method: body ? "POST" : "GET", headers: { "Content-Type": "application/json", "x-iptv-path": path, "x-iptv-authorization": `Bearer ${token}`, "ngrok-skip-browser-warning": "true" }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Não foi possível conferir o UniPlay (${response.status}).`);
    return response.json();
  };
  if (auto.iptvUsername && auto.iptvPassword) {
    const login = await call("/login", { username: auto.iptvUsername, password: auto.iptvPassword, code: "" }, "");
    bearer = String(login.access_token || login.accessToken || login.token || login.data?.access_token || login.data?.accessToken || login.data?.token || "").replace(/^Bearer\s+/i, "");
  }
  if (!bearer) throw new Error("Conecte a conta UniPlay em Automações.");
  const usernames = new Set<string>();
  let completed = false;
  let pageSize = 100;
  for (let page = 1; page <= 100; page++) {
    if (Date.now() - startedAt > 60000) throw new Error("A conferência do painel demorou. Tente novamente mais tarde.");
    const params = new URLSearchParams({page:String(page),per_page:String(pageSize)});
    const reg = String(panel.regPassword || panel.reg_password || auto.iptvRegPassword || "").trim();
    if (reg) params.set("reg_password",reg);
    const payload = await call(`/users-iptv?${params}`);
    const rows = recoveryRows(payload);
    const lastPage = Number(payload?.last_page || payload?.meta?.last_page || payload?.data?.last_page || 0);
    let added = 0;
    for (const row of rows) {
      const username = String(row.username || row.user || "").trim().toLowerCase();
      if (!username) throw new Error("Lista incompleta do UniPlay. Envio bloqueado.");
      if (!usernames.has(username)) { usernames.add(username); added++; }
    }
    if (Array.isArray(payload) || !rows.length || (lastPage && page >= lastPage)) { completed = true; break; }
    if (page === 1 && !lastPage) pageSize = rows.length;
    if (!added) throw new Error("Não foi possível confirmar todas as páginas do UniPlay.");
  }
  if (!completed) throw new Error("Lista do UniPlay excedeu o limite de conferência.");
  return { auto, usernames };
}
export async function recoveryCandidates(db: any, userId: string, checked?: Awaited<ReturnType<typeof recoveryPanel>>) {
  const { auto, usernames } = checked || await recoveryPanel(db, userId);
  const folderId = String(auto.syncFolderId || "");
  if (!folderId) throw new Error("Selecione a pasta de clientes UniPlay em Automações.");
  const { data: folder, error: folderError } = await db.from("folders").select("id,user_id,type").eq("id", folderId).maybeSingle();
  if (folderError || !folder || String(folder.user_id) !== userId || folder.type !== "Cliente") throw new Error("Pasta de clientes inválida para esta conta.");
  const items = await allRecoveryRows(()=>db.from("items").select("id,item_id,name,phone,due_date").eq("folder_id", folderId));
  const contacts = await allRecoveryRows(()=>db.from("wa_recovery_contacts").select("phone").eq("user_id", userId));
  const used = new Set((contacts || []).map((r: any) => r.phone));
  const botState = await recoverySetting(db, `wa_bot_state_user_${userId}`);
  for (const [phone, optedOut] of Object.entries(botState.optOut || {})) if (optedOut) used.add(recoveryPhone(phone));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const seen = new Set<string>();
  // Any live list for the same phone excludes the contact, including a renewed login.
  const activePhones = new Set((items || []).filter((i: any) => usernames.has(String(i.item_id).trim().toLowerCase()) || (i.due_date && String(i.due_date).slice(0,10) >= today)).map((i: any) => recoveryPhone(i.phone)));
  return (items || []).filter((item: any) => {
    const phone = recoveryPhone(item.phone), username = String(item.item_id || "").trim();
    if (!phone || !username || !item.due_date || String(item.due_date).slice(0,10) >= today || usernames.has(username.toLowerCase()) || activePhones.has(phone) || used.has(phone) || seen.has(phone)) return false;
    seen.add(phone); return true;
  }).map((i: any) => ({ itemRef: String(i.id), username: String(i.item_id).trim(), name: String(i.name || ""), phone: recoveryPhone(i.phone), destination: String(i.phone).replace(/\D/g,""), dueDate: i.due_date }));
}
/** One durable, claimed send per invocation. Ambiguous sends are never retried automatically. */
export async function runRecoveryQueue(db: any, userId?: string) {
  const startedAt = Date.now();
  let query = db.from("wa_recovery_campaigns").select("*").eq("status", "running").lte("next_at", new Date().toISOString());
  if (userId) query = query.eq("user_id", userId);
  const { data: campaigns } = await query.order("next_at").limit(userId ? 1 : 3);
  for (const campaign of campaigns || []) {
    if (Date.now() - startedAt > 90000) break;
    const now = new Date().toISOString();
    const { data: claim } = await db.from("wa_recovery_campaigns").update({ lease_until: new Date(Date.now()+120000).toISOString() }).eq("id",campaign.id).eq("status","running").or(`lease_until.is.null,lease_until.lt.${now}`).select("id");
    if (!claim?.length) continue;
    try {
      await db.from("wa_recovery_contacts").update({ status: "uncertain", reason: "Envio interrompido: confira no WhatsApp; não será reenviado automaticamente." }).eq("campaign_id",campaign.id).eq("status","sending");
      const { data: contact } = await db.from("wa_recovery_contacts").select("*").eq("campaign_id",campaign.id).eq("status","queued").order("updated_at").limit(1).maybeSingle();
      if (!contact) { await db.from("wa_recovery_campaigns").update({status:"completed"}).eq("id",campaign.id); continue; }
      const { data: account } = await db.from("users").select("id,username,is_active").eq("id",campaign.user_id).maybeSingle();
      const bot = await recoverySetting(db, `wa_bot_user_${campaign.user_id}`);
      if (!account || account.is_active === false || bot.enabled !== true) throw new Error("Ative o bot do WhatsApp antes de enviar.");
      const panel = await recoveryPanel(db, campaign.user_id);
      // Check current item and all phone siblings immediately before dispatch.
      const { data: item } = await db.from("items").select("id,folder_id,item_id,phone,due_date").eq("id",contact.item_ref).maybeSingle();
      const state = await recoverySetting(db, `wa_bot_state_user_${campaign.user_id}`);
      const optedOut = Object.entries(state.optOut || {}).some(([p,v]) => v && recoveryPhone(p) === contact.phone);
      const humanPaused = Object.entries(state.humanPaused || {}).some(([p,v]) => v && recoveryPhone(p) === contact.phone);
      const siblings = await allRecoveryRows(()=>db.from("items").select("item_id,phone").eq("folder_id",panel.auto.syncFolderId));
      const renewed = (siblings || []).some((i: any) => recoveryPhone(i.phone) === contact.phone && panel.usernames.has(String(i.item_id).toLowerCase()));
      if (!item || String(item.folder_id) !== String(panel.auto.syncFolderId) || String(item.item_id).trim() !== contact.username || recoveryPhone(item.phone) !== contact.phone || !item.due_date || Date.parse(item.due_date) >= Date.now() || renewed || optedOut || humanPaused || panel.usernames.has(contact.username.toLowerCase())) {
        await db.from("wa_recovery_contacts").update({status:optedOut?"opted_out":"skipped",reason:"Contato renovado, alterado, indisponível ou sem interesse."}).eq("id",contact.id).eq("status","queued"); continue;
      }
      const evo = await recoverySetting(db,"evolution_api");
      if (!evo.apiBaseUrl || !evo.apiKey) throw new Error("Configure a conexão WhatsApp.");
      const prefix=String(evo.instancePrefix||"auxplus").replace(/[^a-zA-Z0-9_-]/g,"").slice(0,24);
      const instance=`${prefix}-${String(account.username).replace(/[^a-zA-Z0-9]/g,"").slice(0,12)||"u"}${String(account.id).replace(/[^a-zA-Z0-9]/g,"").slice(0,16)}`.slice(0,60);
      const headers={apikey:evo.apiKey,"Content-Type":"application/json","ngrok-skip-browser-warning":"true"};
      const connection=await fetch(`${String(evo.apiBaseUrl).replace(/\/$/,"")}/instance/connectionState/${instance}`,{headers,signal:AbortSignal.timeout(10000)});
      const connectionState=await connection.json();
      if (!connection.ok || (connectionState.instance?.state||connectionState.state)!=="open") throw new Error("WhatsApp desconectado. Conecte antes de continuar a fila.");
      const { data: stillRunning } = await db.from("wa_recovery_campaigns").select("id").eq("id",campaign.id).eq("status","running").maybeSingle();
      if (!stillRunning) continue;
      const { data: claimed }=await db.from("wa_recovery_contacts").update({status:"sending",updated_at:now}).eq("id",contact.id).eq("status","queued").select("id");
      if (!claimed?.length) continue;
      try {
        const response=await fetch(`${String(evo.apiBaseUrl).replace(/\/$/,"")}/message/sendText/${instance}`,{method:"POST",headers,body:JSON.stringify({number:contact.destination.length<12?"55"+contact.destination:contact.destination,text:recoveryText(campaign.message,contact.username),delay:1200}),signal:AbortSignal.timeout(20000)});
        if (!response.ok) throw new Error("Não foi possível confirmar o envio.");
        await db.from("wa_recovery_contacts").update({status:"invited",sent_at:now,updated_at:now}).eq("id",contact.id).eq("status","sending");
        const {data:pending,error:pendingError}=await db.from("wa_recovery_contacts").select("id").eq("campaign_id",campaign.id).eq("status","queued").limit(1).maybeSingle();
        if(!pendingError&&!pending)await db.from("wa_recovery_campaigns").update({status:"completed"}).eq("id",campaign.id).eq("status","running");
      } catch {
        await db.from("wa_recovery_contacts").update({status:"uncertain",reason:"Envio sem confirmação. Confira no WhatsApp; não será repetido automaticamente."}).eq("id",contact.id).eq("status","sending");
        throw new Error("Um envio ficou sem confirmação. Confira o histórico antes de continuar.");
      }
    } catch(error) {
      await db.from("wa_recovery_campaigns").update({status:"paused",last_error:error instanceof Error ? error.message : "Falha ao enviar. Confira a conexão."}).eq("id",campaign.id).eq("status","running");
      console.warn("recovery_queue_paused", error instanceof Error ? error.message : "queue_error");
    } finally {
      await db.from("wa_recovery_campaigns").update({lease_until:null,next_at:new Date(Date.now()+campaign.interval_seconds*1000).toISOString()}).eq("id",campaign.id);
    }
  }
}
