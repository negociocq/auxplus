/**
 * Cleanup de pedidos PIX (MP) travados ou com erro
 * POST /functions/v1/cleanup-mp-orders
 *
 * Body: {
 *   "action": "remove-error" | "remove-username" | "list",
 *   "errorPattern": "não encontrado",  // opcional
 *   "username": "343924041"  // opcional
 * }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, content-type",
};

interface MpOrder {
  id: string;
  mpPaymentId: string;
  panelUsername: string;
  clientName: string;
  phone: string;
  error?: string | null;
  status: string;
  releasedAt?: string | null;
  [key: string]: any;
}

interface MpOrdersData {
  orders: MpOrder[];
}

async function cleanupMpOrders(
  client: ReturnType<typeof createClient>,
  userId: string,
  action: string,
  errorPattern?: string,
  username?: string
) {
  const key = `mp_orders_user_${userId}`;

  const { data } = await client
    .from("platform_settings")
    .select("value")
    .eq("key", key)
    .maybeSingle();

  if (!data?.value) {
    return {
      success: false,
      message: "Nenhum pedido PIX encontrado",
      removed: 0,
      before: 0,
      after: 0,
    };
  }

  try {
    const parsed =
      typeof data.value === "string"
        ? JSON.parse(data.value)
        : (data.value as MpOrdersData);

    let orders = Array.isArray(parsed.orders) ? parsed.orders : [];
    const before = orders.length;

    if (action === "list") {
      // Retorna pedidos com erro
      const problematic = orders.filter(
        (o) => o.error || (o.status === "approved" && !o.releasedAt)
      );
      return {
        success: true,
        message: `${problematic.length} pedido(s) com problema encontrado(s)`,
        orders: problematic,
        before,
        after: before,
      };
    }

    if (action === "remove-error") {
      const pattern = (errorPattern || "não encontrado").toLowerCase();
      orders = orders.filter(
        (o) => !o.error || !o.error.toLowerCase().includes(pattern)
      );
    }

    if (action === "remove-username") {
      const user = (username || "").trim();
      orders = orders.filter((o) => o.panelUsername !== user);
    }

    const removed = before - orders.length;

    if (removed > 0) {
      await client
        .from("platform_settings")
        .update({ value: JSON.stringify({ orders }) })
        .eq("key", key);

      console.log(`[cleanup-mp-orders] Removidos ${removed} pedido(s) para ${userId}`);
    }

    return {
      success: true,
      message: `${removed} pedido(s) removido(s) com sucesso`,
      removed,
      before,
      after: orders.length,
    };
  } catch (e) {
    console.error("[cleanup-mp-orders] Erro:", e);
    return {
      success: false,
      message: e instanceof Error ? e.message : "Erro desconhecido",
      error: e,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const token = authHeader.slice(7);
    const client = createClient(
      Deno.env.get("SUPABASE_URL") || "",
      Deno.env.get("SUPABASE_ANON_KEY") || "",
      {
        global: { headers: { Authorization: `Bearer ${token}` } },
      }
    );

    // Valida token pegando o usuário
    const { data: userData, error: userError } = await client.auth.getUser();
    if (userError || !userData?.user) {
      return new Response(
        JSON.stringify({ error: "Token inválido" }),
        { status: 401, headers: corsHeaders }
      );
    }

    const userId = userData.user.id;
    const body = await req.json();
    const { action = "list", errorPattern, username } = body;

    const result = await cleanupMpOrders(
      client,
      userId,
      action,
      errorPattern,
      username
    );

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("[cleanup-mp-orders] Erro geral:", e);
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Erro desconhecido",
      }),
      { status: 500, headers: corsHeaders }
    );
  }
});
