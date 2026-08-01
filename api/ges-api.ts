/**
 * Proxy UniPlay no mesmo domínio (auxplus.vercel.app/api/ges-api).
 * Injeta Origin/Referer do painel — necessário para o login.
 *
 * Path da API: header x-iptv-path (ex.: /login)
 * Auth painel: header x-iptv-authorization
 */

const UPSTREAM = "https://gesapioffice.com/api";
const PANEL_ORIGIN = "https://searchdefense.top";

type VercelReq = {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
  url?: string;
};

type VercelRes = {
  setHeader: (k: string, v: string) => void;
  status: (n: number) => VercelRes;
  json: (b: unknown) => void;
  send: (b: string) => void;
  end: (b?: string) => void;
};

function header(
  req: VercelReq,
  name: string,
): string {
  const v = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0] || "";
  return v ? String(v) : "";
}

export default async function handler(req: VercelReq, res: VercelRes) {
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

  const headers: Record<string, string> = {
    Accept: "application/json, text/plain, */*",
    Origin: PANEL_ORIGIN,
    Referer: `${PANEL_ORIGIN}/`,
  };

  const contentType = header(req, "content-type");
  if (contentType) headers["Content-Type"] = contentType;

  const iptvAuth = header(req, "x-iptv-authorization");
  if (iptvAuth) headers.Authorization = iptvAuth;

  let body: string | undefined;
  if (req.method && !["GET", "HEAD"].includes(req.method)) {
    if (typeof req.body === "string") body = req.body;
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
    return res.status(upstream.status).send(text);
  } catch (e) {
    return res.status(502).json({
      error: e instanceof Error ? e.message : "Proxy UniPlay falhou",
    });
  }
}
