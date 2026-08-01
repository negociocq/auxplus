/**
 * Proxy UniPlay (gesapioffice) — injeta Origin/Referer do painel.
 * URL: {SUPABASE_URL}/functions/v1/gesapi
 * Path: x-iptv-path | Auth: x-iptv-authorization
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const headerPath = req.headers.get("x-iptv-path")?.trim() || "";
    if (!headerPath) {
      return new Response(
        JSON.stringify({ error: "Informe x-iptv-path (ex.: /login)" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const url = new URL(req.url);
    const apiPath = (headerPath.startsWith("/") ? headerPath : `/${headerPath}`) +
      url.search;
    const dest = `${UPSTREAM}${apiPath}`;

    const headers = new Headers();
    headers.set("Accept", "application/json, text/plain, */*");
    headers.set("Content-Type", "application/json");
    headers.set("Origin", PANEL_ORIGIN);
    headers.set("Referer", `${PANEL_ORIGIN}/`);
    headers.set(
      "User-Agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    );

    const contentType = req.headers.get("content-type");
    if (contentType) headers.set("Content-Type", contentType);

    const iptvAuth = req.headers.get("x-iptv-authorization");
    if (iptvAuth?.trim()) {
      headers.set("Authorization", iptvAuth.trim());
    }

    let body: string | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      body = await req.text();
    }

    const upstream = await fetch(dest, {
      method: req.method,
      headers,
      body,
      redirect: "manual",
    });

    const text = await upstream.text();
    const out = new Headers(corsHeaders);
    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) out.set("Content-Type", upstreamType);
    else out.set("Content-Type", "application/json; charset=utf-8");
    out.set("x-auxplus-upstream", dest);
    out.set("x-auxplus-upstream-status", String(upstream.status));

    // Se a API devolveu vazio/404, devolve JSON legível
    if (!text.trim() && upstream.status >= 400) {
      return new Response(
        JSON.stringify({
          error: `Upstream ${upstream.status} em ${dest}`,
          status: upstream.status,
        }),
        { status: upstream.status, headers: out },
      );
    }

    return new Response(text, {
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
