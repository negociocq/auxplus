/**
 * Proxy local UniPlay (mesmo efeito do Vite /ges-api).
 * Rode no PC onde o login já funciona e exponha com ngrok/cloudflared.
 *
 *   node scripts/ges-proxy-server.mjs
 *   cloudflared tunnel --url http://127.0.0.1:8787
 *
 * No Admin → Automações → cole a URL do túnel em "Proxy API".
 *
 * Rotas GES misturam verbos: users-iptv usa POST; /clean-trials aceita DELETE/PUT.
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
    "authorization, content-type, x-iptv-authorization, x-iptv-path, apikey, ngrok-skip-browser-warning",
  );
  if (req.method === "OPTIONS") {
    res.writeHead(200);
    res.end("ok");
    return;
  }

  const pathHeader = String(req.headers["x-iptv-path"] || "").trim();
  // Preferir path da URL (túneis Cloudflare às vezes perdem headers custom)
  let urlPath = (req.url || "/").split("?")[0] || "/";
  urlPath = urlPath.replace(/^\/ges-api/, "") || "/";
  let apiPath = pathHeader || urlPath;
  if (!apiPath.startsWith("/")) apiPath = `/${apiPath}`;
  // Se a URL trouxe o path e o header também, URL ganha quando header é "/" ou vazio
  if (urlPath && urlPath !== "/" && (!pathHeader || pathHeader === "/")) {
    apiPath = urlPath.startsWith("/") ? urlPath : `/${urlPath}`;
  }

  // Sem path, POST/PUT em "/" cai na raiz da UniPlay → 405 Laravel
  if (
    apiPath === "/" &&
    req.method &&
    !["GET", "HEAD", "OPTIONS"].includes(req.method)
  ) {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error:
          "Path da API ausente. Use o proxy do AuxPlus (ges-proxy-server) e URL do túnel atualizada em Automações → Proxy API.",
      }),
    );
    return;
  }

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

    const method = req.method || "GET";
    const upstream = await fetch(dest, {
      method,
      headers,
      body: ["GET", "HEAD"].includes(method) ? undefined : body,
    });
    const text = await upstream.text();
    const ct = upstream.headers.get("content-type");
    if (ct) res.setHeader("Content-Type", ct);
    res.writeHead(upstream.status);
    res.end(text);
  } catch (e) {
    // Reaplica CORS (já setado acima) para o browser não mascarar como falha de CORS
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
  console.log(
    `[ges-proxy] Exponha com: cloudflared tunnel --url http://127.0.0.1:${PORT}`,
  );
});
