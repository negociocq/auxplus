/**
 * Supabase edge function para resetar configuração do WhatsApp bot
 * POST /functions/v1/reset-wa-bot
 *
 * Body: { "userId": "uuid", "secret": "mp_cron_secret" }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const client = await sb();
    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

    const userId = String(body.userId || "").trim();
    const secret = String(body.secret || "").trim();
    const cronSecret = String(Deno.env.get("MP_CRON_SECRET") || "").trim();

    // Validar secret
    if (!secret || secret !== cronSecret) {
      return json({ error: "unauthorized" }, 401);
    }

    if (!userId) {
      return json({ error: "userId required" }, 400);
    }

    // Deletar configuração do bot
    const configKey = `wa_bot_config_user_${userId}`;

    const { error: deleteError } = await client
      .from("platform_settings")
      .delete()
      .eq("key", configKey);

    if (deleteError) {
      console.error(`[reset-wa-bot] Erro ao deletar ${configKey}:`, deleteError);
      return json({ error: deleteError.message }, 500);
    }

    console.log(`[reset-wa-bot] ✅ Resetado: ${configKey}`);

    return json({
      ok: true,
      message: `Configuração do bot foi resetada para ${userId}`,
      configKey,
    });
  } catch (error) {
    console.error("[reset-wa-bot] Erro:", error);
    return json(
      {
        error: error instanceof Error ? error.message : "Erro interno",
      },
      500,
    );
  }
});
