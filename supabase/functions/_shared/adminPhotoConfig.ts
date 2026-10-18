import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET,POST,OPTIONS", "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info" };
const name = "openai_device_photo";
const model = "gpt-4.1-mini";
const reply = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
});

export function createPhotoConfigHandler(db: SupabaseClient, verify: (plain: string, stored: string) => Promise<boolean>, environmentKey = "") {
  const attempts = new Map<string, { count: number; until: number }>();
  return async (req: Request): Promise<Response> => {
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    if (!["GET", "POST"].includes(req.method)) return reply({ error: "Método inválido." }, 405);
    try {
      if (req.method === "GET") {
        const { data, error } = await db.from("platform_private_secrets").select("value,updated_at").eq("name", name).maybeSingle();
        if (error) return reply({ error: "Não foi possível consultar a configuração." }, 503);
        return reply({ configured: Boolean(data?.value?.apiKey || environmentKey), model, updatedAt: data?.updated_at || null });
      }
      const raw = await req.text();
      if (raw.length > 4096) return reply({ error: "Pedido muito grande." }, 413);
      let body: Record<string, unknown>;
      try { body = JSON.parse(raw); } catch { return reply({ error: "Pedido inválido." }, 400); }
      if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Pedido inválido." }, 400);
      const username = typeof body.username === "string" ? body.username.trim() : "";
      const password = typeof body.password === "string" ? body.password : "";
      const apiKey = typeof body.apiKey === "string" ? body.apiKey.trim() : "";
      if (!username || !password || username.length > 150 || password.length > 256) return reply({ error: "Confirme sua senha de administrador." }, 400);
      const throttleKey = username.toLowerCase();
      const now = Date.now();
      for (const [key, limit] of attempts) if (limit.until < now) attempts.delete(key);
      const limit = attempts.get(throttleKey);
      if (limit && limit.count >= 5) return reply({ error: "Muitas tentativas. Tente novamente em 15 minutos." }, 429);
      if (attempts.size > 10000) return reply({ error: "Tente novamente mais tarde." }, 429);
      attempts.set(throttleKey, { count: (limit?.count || 0) + 1, until: limit?.until || now + 900000 });
      const { data: user, error: userError } = await db.from("users").select("id,username,password,is_admin,is_active").eq("username", username).maybeSingle();
      if (userError || !user || user.is_admin !== true || user.is_active === false || !await verify(password, String(user.password || ""))) {
        return reply({ error: "Administrador ou senha inválidos." }, 403);
      }
      if (!/^sk-[A-Za-z0-9_-]{16,500}$/.test(apiKey)) return reply({ error: "Cole uma chave válida da API OpenAI (começa com sk-)." }, 400);
      const updatedAt = new Date().toISOString();
      const { error } = await db.from("platform_private_secrets").upsert({ name, value: { apiKey, model }, updated_at: updatedAt }, { onConflict: "name" });
      if (error) return reply({ error: "Não foi possível salvar a chave no servidor." }, 503);
      attempts.delete(throttleKey);
      return reply({ configured: true, model, updatedAt });
    } catch { return reply({ error: "Não foi possível concluir. Tente novamente." }, 500); }
  };
}
