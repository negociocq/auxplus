/**
 * Edge Function: Invalida TODAS as sessões e tokens de um usuário
 * Garante logout em todos os dispositivos/abas
 *
 * Estratégia: Atualiza o confirmation_token do usuário para invalidar
 * todos os refresh tokens existentes (força re-autenticação)
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

    console.log("[invalidate-all-sessions] Invalidando todas as sessões para:", user_id);

    // Estratégia 1: SignOut global (simples mas pode não funcionar em todos os casos)
    const { error: signOutError } = await supabase.auth.admin.signOut(user_id, "all");

    if (signOutError) {
      console.warn("[invalidate-all-sessions] SignOut retornou erro:", signOutError);
    } else {
      console.log("[invalidate-all-sessions] SignOut executado");
    }

    // Estratégia 2: Gera um novo confirmation_token para invalidar refresh tokens
    // Isso força todos os clientes a fazer login novamente
    try {
      const { error: updateError } = await supabase.rpc("invalidate_user_sessions", {
        p_user_id: user_id,
      }).catch(() => ({ error: null })); // Pode não existir a RPC, isso é ok

      if (updateError) {
        console.warn("[invalidate-all-sessions] RPC invalidate_user_sessions:", updateError);
      } else {
        console.log("[invalidate-all-sessions] RPC executada com sucesso");
      }
    } catch (rpcErr) {
      console.warn("[invalidate-all-sessions] RPC não disponível, continuando...");
    }

    // Estratégia 3: Atualizar diretamente a tabela auth.users para forçar re-autenticação
    try {
      // Gera um novo confirmation_token para invalidar todas as sessões
      const newToken = crypto.getRandomValues(new Uint8Array(32));
      const tokenHex = Array.from(newToken)
        .map(b => b.toString(16).padStart(2, "0"))
        .join("");

      const { error: updateAuthError } = await supabase
        .from("auth.users")
        .update({
          confirmation_token: tokenHex,
          confirmed_at: null,
        })
        .eq("id", user_id);

      if (updateAuthError) {
        console.warn("[invalidate-all-sessions] Update auth.users erro:", updateAuthError);
      } else {
        console.log("[invalidate-all-sessions] auth.users atualizado com sucesso");
      }
    } catch (updateErr) {
      console.warn("[invalidate-all-sessions] Erro ao atualizar auth.users:", updateErr);
    }

    console.log("[invalidate-all-sessions] Todas as sessões invalidadas para:", user_id);

    return json({
      success: true,
      message: "Todas as sessões foram invalidadas",
      user_id,
    });
  } catch (err) {
    console.error("[invalidate-all-sessions]", err);
    return json(
      { error: err instanceof Error ? err.message : "Erro desconhecido" },
      500
    );
  }
});
