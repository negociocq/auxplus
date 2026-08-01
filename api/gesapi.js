/**
 * Proxy UniPlay — Vercel Serverless (Node).
 * O Edge do Supabase recebe 404 da API; a saída Node da Vercel costuma funcionar.
 *
 * Headers: x-iptv-path (/login) | x-iptv-authorization (Bearer do painel)
 */

const UPSTREAM = "https://gesapioffice.com/api";
const PANEL_ORIGIN = "https://searchdefense.top";

function header(req, name) {
  const v = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] || "";
  return v ? String(v) : "";
}

module.exports = async function handler(req, res) {
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
    return res.status(200).end("ok");
  }

  const rawPath = header(req, "x-iptv-path").trim();
  if (!rawPath) {
    return res.status(400).json({ error: "Informe x-iptv-path (ex.: /login)" });
  }

  const apiPath = rawPath.startsWith("/") ? rawPath : `/${rawPath}`;
  const qs = req.url?.includes("?")
    ? req.url.slice(req.url.indexOf("?"))
    : "";
  const dest = `${UPSTREAM}${apiPath}${qs}`;

  const headers = {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    Origin: PANEL_ORIGIN,
    Referer: `${PANEL_ORIGIN}/`,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  };

  const contentType = header(req, "content-type");
  if (contentType) headers["Content-Type"] = contentType;

  const iptvAuth = header(req, "x-iptv-authorization");
  if (iptvAuth) headers.Authorization = iptvAuth;

  let body;
  if (req.method && !["GET", "HEAD"].includes(req.method)) {
    if (typeof req.body === "string") body = req.body;
    else if (Buffer.isBuffer(req.body)) body = req.body.toString("utf8");
    else if (req.body != null) body = JSON.stringify(req.body);
  }

  try {
    const upstream = await fetch(dest, {
      method: req.method || "GET",
      headers,
      body,
    });
    const text = await upstream.text();
    const upstreamType = upstream.headers.get("content-type");
    if (upstreamType) res.setHeader("Content-Type", upstreamType);
    res.setHeader("x-auxplus-upstream", dest);
    res.setHeader("x-auxplus-upstream-status", String(upstream.status));
    return res.status(upstream.status).send(text);
  } catch (e) {
    return res.status(502).json({
      error: e instanceof Error ? e.message : "Proxy UniPlay falhou",
      dest,
    });
  }
};
