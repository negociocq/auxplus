/**
 * Proxy da API UniPlay (gesapioffice) para o browser.
 * Injeta Origin/Referer do painel — sem isso o login falha.
 *
 * URL fixa: {SUPABASE_URL}/functions/v1/ges-api
 * Caminho da API: header x-iptv-path (ex.: /login, /users-iptv)
 * Auth painel: header x-iptv-authorization (Bearer …)
 */

const UPSTREAM = "https://gesapioffice.com/api";
const PANEL_ORIGIN = "https://searchdefense.top";

const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-iptv-authorization, x-iptv-path",
  "Access-Control-Max-Age": "86400",
};

function resolveApiPath(req: Request): string {
  const headerPath = req.headers.get("x-iptv-path")?.trim();
  if (headerPath) {
    const p = headerPath.startsWith("/") ? headerPath : `/${headerPath}`;
    const url = new URL(req.url);
    return `${p}${url.search}`;
  }

  // Fallback: /functions/v1/ges-api[/resto]
  const url = new URL(req.url);
  const marker = "/functions/v1/ges-api";
  let path = url.pathname;
  const idx = path.indexOf(marker);
  if (idx >= 0) path = path.slice(idx + marker.length);
  if (!path.startsWith("/")) path = `/${path}`;
  if (path === "/") path = "";
  return `${path}${url.search}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const apiPath = resolveApiPath(req);
    if (!apiPath || apiPath === "/") {
      return new Response(
        JSON.stringify({ error: "Informe x-iptv-path (ex.: /login)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const dest = `${UPSTREAM}${apiPath}`;
    const headers = new Headers();
    headers.set("Accept", "application/json, text/plain, */*");
    headers.set("Origin", PANEL_ORIGIN);
    headers.set("Referer", `${PANEL_ORIGIN}/`);

    const contentType = req.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);

    const iptvAuth = req.headers.get("x-iptv-authorization");
    if (iptvAuth?.trim()) {
      headers.set("Authorization", iptvAuth.trim());
    }

    const init: RequestInit = {
      method: req.method,
      headers,
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      init.body = await req.arrayBuffer();
    }

    const upstream = await fetch(dest, init);
    const body = await upstream.arrayBuffer();
    const out = new Headers(corsHeaders);
    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) out.set("Content-Type", upstreamType);

    return new Response(body, {
      status: upstream.status,
      statusText: upstream.statusText,
      headers: out,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Proxy UniPlay falhou",
      }),
      {
        status: 502,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
