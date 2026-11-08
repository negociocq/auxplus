import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";
import { runFootballStatusQueue } from "../_shared/footballStatus.ts";

// Retain the existing minute schedule for football. Movie/series banners retired.
const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST,OPTIONS" };
const reply = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });
Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method === "GET" && new URL(req.url).searchParams.get("mode") === "health") return reply({ ok: true, mode: "football-only" });
  if (req.method !== "POST") return reply({ error: "Use POST." }, 405);
  try {
    const text = await req.text();
    if (text.length > 4000) return reply({ error: "Pedido muito grande." }, 413);
    const body = JSON.parse(text);
    if (body.action !== "tick") return reply({ error: "Os banners de filmes e séries foram removidos. Os banners de jogos continuam disponíveis." }, 410);
    const { data: secret } = await db.from("platform_private_secrets").select("value").eq("name", "content_status_cron").maybeSingle();
    if (!secret?.value?.token || req.headers.get("x-content-cron") !== secret.value.token) return reply({ error: "Não autorizado." }, 401);
    await runFootballStatusQueue(db);
    return reply({ ok: true });
  } catch { return reply({ error: "Não foi possível concluir." }, 400); }
});
