import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { loanReminderCandidate } from "../_shared/loanReminderQueue.ts";
import { loanInstanceName } from "../_shared/waLoanConnection.ts";

const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });
Deno.serve(async req => {
  const secret = Deno.env.get("AUXPLUS_LOAN_CRON_SECRET");
  if (!secret || req.headers.get("x-loan-cron") !== secret) return reply({ error: "Unauthorized" }, 401);
  if (req.method !== "POST") return reply({ error: "Use POST" }, 405);
  const summary = { eligible: 0, sent: 0, duplicate: 0, failed: 0, skipped: 0 };
  try {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const body = await req.json().catch(() => ({}));
    const now = new Date();
    const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now).map(p => [p.type, p.value]));
    const today = `${parts.year}-${parts.month}-${parts.day}`;
    const time = `${parts.hour}:${parts.minute}`;
    const [folderResult, userResult, configResult] = await Promise.all([
      client.from("folders").select("id,user_id,type,whatsapp_message").eq("type", "Produto"),
      client.from("users").select("id,username,is_active").eq("is_active", true),
      client.from("platform_settings").select("value").eq("key", "evolution_api").maybeSingle(),
    ]);
    if (folderResult.error || userResult.error || configResult.error) throw Error("Falha ao consultar configuração dos lembretes.");
    const evo = typeof configResult.data?.value === "string" ? JSON.parse(configResult.data.value) : configResult.data?.value;
    if (!evo?.apiBaseUrl || !evo?.apiKey) return reply({ ...summary, error: "WhatsApp não configurado" });
    const base = String(evo.apiBaseUrl).trim().replace(/\/$/, "");
    async function evolution(path: string, init?: RequestInit) {
      const result = await fetch(`${base}${path}`, { ...init, signal: AbortSignal.timeout(15000), headers: { "Content-Type": "application/json", apikey: evo.apiKey, "ngrok-skip-browser-warning": "true" } });
      if (!result.ok) throw Error(`WhatsApp HTTP ${result.status}`);
      return result.json();
    }
    let attempts = 0;
    const connectionStates = new Map<string, boolean>();
    for (const user of userResult.data || []) {
      if (attempts >= 3) break;
      const folders = (folderResult.data || []).filter(f => String(f.user_id) === String(user.id));
      if (!folders.length) continue;
      const result = await client.from("items").select("id,folder_id,name,phone,notes").in("folder_id", folders.map(f => f.id));
      if (result.error) throw Error("Falha ao consultar empréstimos.");
      const candidates = (result.data || []).map(item => ({ item, folder: folders.find(f => String(f.id) === String(item.folder_id))! })).filter(({ item, folder }) => loanReminderCandidate(folder, item, today, time));
      summary.eligible += candidates.length;
      if (body.dryRun || !candidates.length) continue;
      // Limite conservador: no máximo três tentativas por execução, dez por hora e trinta por dia por conta.
      const counts = await client.from("platform_settings").select("updated_at").like("key", String.raw`loan\_reminder\_${user.id}\_%`).gte("updated_at", `${today}T03:00:00Z`);
      if (counts.error) throw Error("Falha ao conferir limites de envio.");
      let daily = counts.data?.length || 0;
      let hourly = (counts.data || []).filter(row => Date.parse(row.updated_at) >= Date.now() - 3600000).length;
      for (const { item, folder } of candidates) {
        if (attempts >= 3 || daily >= 30 || hourly >= 10) { summary.skipped++; continue; }
        // Reconsulta imediatamente antes do envio: quitação, mudança de data e desativação cancelam a cobrança.
        const [freshItem, freshFolder] = await Promise.all([
          client.from("items").select("id,folder_id,name,phone,notes").eq("id", item.id).maybeSingle(),
          client.from("folders").select("id,user_id,type,whatsapp_message").eq("id", folder.id).maybeSingle(),
        ]);
        if (freshItem.error || freshFolder.error) { summary.skipped++; continue; }
        const current = freshItem.data && freshFolder.data && loanReminderCandidate(freshFolder.data, freshItem.data, today, time);
        if (!current || String(freshFolder.data!.user_id) !== String(user.id)) { summary.skipped++; continue; }
        const instance = loanInstanceName(String(evo.instancePrefix || "auxplus"), String(user.id), String(freshFolder.data!.id));
        if (!connectionStates.has(instance)) {
          const state = await evolution(`/instance/connectionState/${encodeURIComponent(instance)}`).catch(() => null);
          connectionStates.set(instance, String(state?.instance?.state || state?.state).toLowerCase() === "open");
        }
        // A disconnected loan number never falls back to the IPTV number.
        if (!connectionStates.get(instance)) { summary.skipped++; continue; }
        // Chave única no banco: execuções simultâneas e novas aberturas do site não repetem uma tentativa.
        const claim = await client.from("platform_settings").insert({ key: current.key, value: { status: "attempted", kind: current.kind, itemId: item.id, dueDate: current.dueDate }, updated_at: new Date().toISOString() });
        if (claim.error?.code === "23505") { summary.duplicate++; continue; }
        if (claim.error) throw Error("Não foi possível reservar o envio.");
        attempts++; daily++; hourly++;
        let status = "sent";
        try {
          await evolution(`/message/sendText/${encodeURIComponent(instance)}`, { method: "POST", body: JSON.stringify({ number: current.phone, text: current.text, linkPreview: false }) });
          summary.sent++;
        } catch { status = "delivery_unknown"; summary.failed++; }
        // Nunca repete automaticamente uma tentativa cuja entrega ficou incerta.
        await client.from("platform_settings").update({ value: { status, kind: current.kind, itemId: item.id, dueDate: current.dueDate } }).eq("key", current.key);
        if (attempts < 3) await new Promise(resolve => setTimeout(resolve, 4000));
      }
    }
    return reply({ ok: true, dryRun: !!body.dryRun, ...summary });
  } catch { return reply({ error: "Falha ao processar lembretes de empréstimos", ...summary }, 500); }
});
