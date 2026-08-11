/**
 * Edge Function: Invalida TODAS as sessões e tokens de um usuário
 * Garante logout em todos os dispositivos/abas
 *
 * Uso: supabase.rpc('invalidate_all_sessions', { user_id: uuid })
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || ""
    );

    const { user_id } = await req.json();

    if (!user_id) {
      return json({ error: "user_id é obrigatório" }, 400);
    }

    // Invalida todos os refresh tokens do usuário
    // Isso desautentica todas as sessões em todos os dispositivos
    const { error } = await supabase.auth.admin.signOut(user_id, "all");

    if (error) {
      console.error("[invalidate-all-sessions] Erro:", error);
      return json({ error: error.message }, 400);
    }

    console.log("[invalidate-all-sessions] Todas as sessões invalidadas para:", user_id);

    return json({
      success: true,
      message: "Todas as sessões foram invalidadas",
    });
  } catch (err) {
    console.error("[invalidate-all-sessions]", err);
    return json(
      { error: err instanceof Error ? err.message : "Erro desconhecido" },
      500
    );
  }
});
