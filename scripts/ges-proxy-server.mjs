/**
 * Proxy local UniPlay (mesmo efeito do Vite /ges-api).
 * Rode no PC onde o login já funciona e exponha com ngrok se quiser usar no domínio.
 *
 *   node scripts/ges-proxy-server.mjs
 *   ngrok http 8787
 *
 * No Admin → Automações → cole a URL do ngrok em "Proxy API".
 */

import http from "node:http";

const PORT = Number(process.env.GES_PROXY_PORT || 8787);
const UPSTREAM = "https://gesapioffice.com/api";
const PANEL_ORIGIN = "https://searchdefense.top";

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS",
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "authorization, content-type, x-iptv-authorization, x-iptv-path, apikey",
  );
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end("ok");
    return;
  }

  const pathHeader = String(req.headers["x-iptv-path"] || "").trim();
  let apiPath = pathHeader || (req.url || "/").split("?")[0] || "/";
  // Aceita /login direto ou /ges-api/login
  apiPath = apiPath.replace(/^\/ges-api/, "") || "/";
  if (!apiPath.startsWith("/")) apiPath = `/${apiPath}`;
  const qs = (req.url || "").includes("?")
    ? req.url.slice(req.url.indexOf("?"))
    : "";
  const dest = `${UPSTREAM}${apiPath}${qs}`;

  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks);

  try {
    const headers = {
      Accept: "application/json, text/plain, */*",
      "Content-Type": req.headers["content-type"] || "application/json",
      Origin: PANEL_ORIGIN,
      Referer: `${PANEL_ORIGIN}/`,
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    };
    const auth =
      req.headers["x-iptv-authorization"] || req.headers.authorization;
    if (auth) headers.Authorization = String(auth);

    const upstream = await fetch(dest, {
      method: req.method || "GET",
      headers,
      body: ["GET", "HEAD"].includes(req.method || "") ? undefined : body,
    });
    const text = await upstream.text();
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    res.writeHead(upstream.status);
    res.end(text);
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: e instanceof Error ? e.message : "proxy failed",
        dest,
      }),
    );
  }
});

server.listen(PORT, () => {
  console.log(`[ges-proxy] http://127.0.0.1:${PORT}`);
  console.log(`[ges-proxy] Exemplo: ngrok http ${PORT}`);
});
