/**
 * API interna do painel (gesapioffice) usada pelo front searchdefense.
 * Dev: proxy Vite /ges-api. Produção: Edge Function Supabase (ges-api).
 */

import { SUPABASE_ANON_KEY } from "@/integrations/supabase/client";
import { formatBrDate } from "@/lib/format";
import { DEFAULT_PRORROGA_MESSAGE } from "@/lib/whatsappAutomation";

export type IptvPanelCreds = {
  apiBaseUrl: string;
  bearerToken: string;
  /** Às vezes exigido na listagem */
  regPassword?: string;
  defaultPackage: string;
  /** Para renovar o Bearer sem colar de novo */
  username?: string;
  password?: string;
  /**
   * Proxy que injeta Origin (ngrok + scripts/ges-proxy-server.mjs).
   * Em produção a API bloqueia IPs de nuvem (Supabase/Vercel → 404).
   */
  apiProxyUrl?: string;
};

export type IptvPackage = {
  id: string | number;
  name?: string;
  credits?: number;
  [k: string]: unknown;
};

export type IptvRemoteUser = {
  id: string | number;
  username?: string;
  user?: string;
  name?: string;
  password?: string;
  phone?: string;
  exp_date?: string;
  expDate?: string;
  /** “Criado Em” do painel, normalizado p/ `yyyy-MM-dd HH:mm:ss`. */
  createdAt?: string;
  [k: string]: unknown;
};

export type CreateTestResult = {
  raw: unknown;
  username?: string;
  password?: string;
  message?: string;
  /** Id remoto no UniPlay (users-iptv) */
  remoteId?: string | number;
  /** Link M3U completo, se o painel devolver */
  m3u?: string;
  /** DNS / URL Smarters */
  dnsSmarters?: string;
  /** Vencimento do teste `yyyy-MM-dd HH:mm:ss` */
  dueDate?: string;
};

/** Opções de duração do teste (1–6 horas). */
export const IPTV_TEST_HOURS = [1, 2, 3, 4, 5, 6] as const;

function pickNestedString(
  obj: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const key of keys) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return undefined;
}

function isHttpUrl(value: string) {
  return /^https?:\/\/[^\s]+$/i.test(value.trim());
}

function isM3uLink(value: string) {
  const v = value.trim();
  return (
    isHttpUrl(v) &&
    (/get\.php\?/i.test(v) || /type=m3u/i.test(v) || /\/m3u/i.test(v))
  );
}

function isDnsHost(value: string) {
  const v = value.trim();
  if (!isHttpUrl(v)) return false;
  if (isM3uLink(v)) return false;
  try {
    const u = new URL(v);
    return Boolean(u.hostname) && !u.pathname.includes("get.php");
  } catch {
    return false;
  }
}

/** Monta link M3U a partir do host de lista + usuário/senha. */
export function buildIptvM3uLink(
  hostOrUrl: string,
  username: string,
  password: string,
): string {
  const host = hostOrUrl.trim().replace(/\/+$/, "");
  if (!host || !username || !password) return "";
  const base = /^https?:\/\//i.test(host) ? host : `http://${host}`;
  // Se já veio um get.php completo, devolve como está
  if (/get\.php\?/i.test(base)) return base;
  try {
    const u = new URL(base);
    const origin = `${u.protocol}//${u.host}`;
    return `${origin}/get.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&type=m3u_plus&output=ts`;
  } catch {
    return "";
  }
}

/** Completa M3U/DNS com hosts padrão do painel quando a API não devolve. */
export function resolveTestAccessLinks(opts: {
  username?: string;
  password?: string;
  m3u?: string;
  dnsSmarters?: string;
  m3uHost?: string;
  dnsFallback?: string;
}): { m3u: string; dnsSmarters: string } {
  const username = opts.username?.trim() || "";
  const password = opts.password?.trim() || "";
  let m3u = opts.m3u?.trim() || "";
  let dnsSmarters = opts.dnsSmarters?.trim() || "";

  if (!dnsSmarters && opts.dnsFallback?.trim()) {
    dnsSmarters = opts.dnsFallback.trim();
  }
  if (!m3u && username && password && opts.m3uHost?.trim()) {
    m3u = buildIptvM3uLink(opts.m3uHost, username, password);
  }
  if (m3u && !isM3uLink(m3u)) m3u = "";
  if (dnsSmarters && !isDnsHost(dnsSmarters)) dnsSmarters = "";
  return { m3u, dnsSmarters };
}

/** Extrai M3U + DNS Smarters da mensagem de boas-vindas do painel. */
function parseBrDateTimeToCanonical(raw: string): string | undefined {
  const m = raw
    .trim()
    .match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
    );
  if (!m) return undefined;
  const d = m[1].padStart(2, "0");
  const mo = m[2].padStart(2, "0");
  const h = (m[4] ?? "00").padStart(2, "0");
  const mi = (m[5] ?? "00").padStart(2, "0");
  const s = (m[6] ?? "00").padStart(2, "0");
  return `${m[3]}-${mo}-${d} ${h}:${mi}:${s}`;
}

export function parseWelcomeAccessMessage(text: string): {
  m3u?: string;
  dnsSmarters?: string;
  username?: string;
  password?: string;
  dueDate?: string;
} {
  const src = String(text || "");
  if (!src.trim()) return {};

  const username =
    src.match(/USU[ÁA]RIO\s*:\s*([^\s\r\n]+)/i)?.[1]?.trim() || undefined;
  const password =
    src.match(/SENHA\s*:\s*([^\s\r\n]+)/i)?.[1]?.trim() || undefined;

  // Preferir o LINK (M3U8) completo (não o encurtado)
  const m3u =
    src.match(
      /LINK\s*\(M3U8\)\s*:\s*(https?:\/\/[^\s]+get\.php\?[^\s]+)/i,
    )?.[1]?.trim() ||
    src.match(/(https?:\/\/[^\s]+\/get\.php\?[^\s]+)/i)?.[1]?.trim() ||
    undefined;

  const dnsSmarters =
    src.match(
      /DNS\s*Smarters[^:\r\n]*:\s*(https?:\/\/[^\s]+)/i,
    )?.[1]?.trim() ||
    src.match(/^\s*DNS\s*:\s*(https?:\/\/[^\s]+)/im)?.[1]?.trim() ||
    undefined;

  const vencRaw =
    src.match(
      /VENCIMENTO\s*:\s*([0-9]{1,2}\/[0-9]{1,2}\/[0-9]{4}(?:\s+[0-9]{1,2}:[0-9]{2}(?::[0-9]{2})?)?)/i,
    )?.[1] || "";
  const dueDate = vencRaw ? parseBrDateTimeToCanonical(vencRaw) : undefined;

  return {
    username,
    password,
    m3u: m3u && isM3uLink(m3u) ? m3u : undefined,
    dnsSmarters:
      dnsSmarters && isDnsHost(dnsSmarters) ? dnsSmarters : undefined,
    dueDate,
  };
}

function collectTextBlobs(value: unknown, out: string[] = [], depth = 0): string[] {
  if (depth > 5 || value == null) return out;
  if (typeof value === "string") {
    if (value.length > 20) out.push(value);
    return out;
  }
  if (Array.isArray(value)) {
    for (const item of value) collectTextBlobs(item, out, depth + 1);
    return out;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) {
      collectTextBlobs(v, out, depth + 1);
    }
  }
  return out;
}

export function enrichCreateTestResult(result: CreateTestResult): CreateTestResult {
  let username = result.username?.trim() || "";
  let password = result.password?.trim() || "";
  let m3u = result.m3u?.trim() || "";
  let dnsSmarters = result.dnsSmarters?.trim() || "";
  let dueDate = result.dueDate?.trim() || "";

  // 1) Mensagem de boas-vindas (fonte confiável no UniPlay)
  const blobs = [
    result.message || "",
    ...collectTextBlobs(result.raw),
  ];
  for (const blob of blobs) {
    if (
      !/SENHA|USU[ÁA]RIO|LINK\s*\(M3U8\)|DNS\s*Smarters|get\.php\?|VENCIMENTO/i.test(
        blob,
      )
    ) {
      continue;
    }
    const parsed = parseWelcomeAccessMessage(blob);
    if (!username && parsed.username) username = parsed.username;
    if (!password && parsed.password) password = parsed.password;
    if (!m3u && parsed.m3u) m3u = parsed.m3u;
    if (!dnsSmarters && parsed.dnsSmarters) dnsSmarters = parsed.dnsSmarters;
    if (!dueDate && parsed.dueDate) dueDate = parsed.dueDate;
    if (username && password && m3u && dnsSmarters && dueDate) break;
  }

  // 2) Campos explícitos do JSON (sem url/link genéricos — pegavam senha)
  if (
    (!m3u || !dnsSmarters || !dueDate) &&
    result.raw &&
    typeof result.raw === "object"
  ) {
    const obj = result.raw as Record<string, unknown>;
    const nested =
      (obj.data && typeof obj.data === "object"
        ? (obj.data as Record<string, unknown>)
        : null) ||
      (obj.user && typeof obj.user === "object"
        ? (obj.user as Record<string, unknown>)
        : null) ||
      (obj.infos && typeof obj.infos === "object"
        ? (obj.infos as Record<string, unknown>)
        : null) ||
      obj;

    if (!m3u) {
      const candidate = pickNestedString(nested, [
        "m3u",
        "m3u_url",
        "url_m3u",
        "link_m3u",
        "playlist",
        "playlist_url",
      ]);
      if (candidate && isM3uLink(candidate)) m3u = candidate;
    }
    if (!dnsSmarters) {
      const candidate = pickNestedString(nested, [
        "dns",
        "dns_smarters",
        "dnsSmarters",
        "dns_url",
      ]);
      if (candidate && isDnsHost(candidate)) dnsSmarters = candidate;
    }
    if (!dueDate) {
      const expRaw =
        pickNestedString(nested, ["exp_date", "expDate", "expira", "due_date"]) ||
        "";
      dueDate =
        parseIptvExpToDateTime(expRaw) ||
        parseBrDateTimeToCanonical(expRaw) ||
        "";
    }
  }

  // Nunca usar senha/usuário como DNS ou M3U
  if (password && (m3u === password || dnsSmarters === password)) {
    if (m3u === password) m3u = "";
    if (dnsSmarters === password) dnsSmarters = "";
  }
  if (username && (m3u === username || dnsSmarters === username)) {
    if (m3u === username) m3u = "";
    if (dnsSmarters === username) dnsSmarters = "";
  }
  if (m3u && !isM3uLink(m3u)) m3u = "";
  if (dnsSmarters && !isDnsHost(dnsSmarters)) dnsSmarters = "";

  return {
    ...result,
    username: username || undefined,
    password: password || undefined,
    m3u: m3u || undefined,
    dnsSmarters: dnsSmarters || undefined,
    dueDate: dueDate || undefined,
  };
}

/** Último token usado/renovado nas chamadas da API (para persistir na UI). */
let lastIssuedToken = "";
export function getLastIssuedIptvToken() {
  return lastIssuedToken;
}

function shouldUseGesProxy(apiBaseUrl: string) {
  try {
    const u = new URL(apiBaseUrl || "https://gesapioffice.com/api");
    return (
      u.hostname.includes("gesapioffice") || u.pathname.includes("/api")
    );
  } catch {
    return true;
  }
}

/**
 * Proxy com path em header x-iptv-path (produção):
 * - /api/gesapi (Vercel)
 * - /functions/v1/gesapi (Supabase)
 * Dev Vite (/ges-api) usa path na URL: /ges-api/login
 */
function isPathHeaderProxy(base: string) {
  return (
    base === "/api/gesapi" ||
    base.includes("/functions/v1/gesapi") ||
    base.includes("/functions/v1/ges-api") ||
    isCustomExternalProxy(base)
  );
}

function isCustomExternalProxy(base: string) {
  return /^https?:\/\//i.test(base) && !base.includes("gesapioffice.com");
}

function isSupabaseGesProxy(base: string) {
  return (
    base.includes("/functions/v1/gesapi") ||
    base.includes("/functions/v1/ges-api")
  );
}

/** Proxies que só leem path no header (URL fica na raiz do proxy). */
function isHeaderOnlyProxy(base: string) {
  return (
    base === "/api/gesapi" ||
    base.includes("/functions/v1/gesapi") ||
    base.includes("/functions/v1/ges-api")
  );
}

/**
 * Monta a URL final do fetch.
 * Túnel ngrok/cloudflare: path NA URL + header (túneis às vezes perdem
 * x-iptv-path e a UniPlay responde 405 em POST /).
 */
function buildPanelFetchUrl(base: string, path: string) {
  const p = path.startsWith("/") ? path : `/${path}`;
  if (!isPathHeaderProxy(base)) return `${base}${p}`;
  if (isHeaderOnlyProxy(base)) return base;
  return `${base}${p}`;
}

/** Dyad/Vite em localhost — nem sempre import.meta.env.DEV é true (porta 32xxx). */
function isLocalhostBrowser() {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return (
    h === "localhost" ||
    h === "127.0.0.1" ||
    h === "[::1]" ||
    h.endsWith(".local")
  );
}

function resolveBase(apiBaseUrl: string, apiProxyUrl?: string) {
  const configured = (apiBaseUrl || "https://gesapioffice.com/api").replace(
    /\/$/,
    "",
  );

  // Localhost: SEMPRE /ges-api (proxy Vite/Dyad). Ignora túnel do Admin —
  // Cloudflare morto causa CORS e 405 em /criar.
  if (isLocalhostBrowser()) {
    if (!shouldUseGesProxy(configured)) return configured;
    return "/ges-api";
  }

  const custom = apiProxyUrl?.trim().replace(/\/$/, "");
  if (custom) {
    // Produção / outro origin: proxy externo (ngrok + ges-proxy-server)
    return custom;
  }

  if (!shouldUseGesProxy(configured)) return configured;

  // Produção sem proxy custom: Vercel /api/gesapi (Node).
  // Não usar Supabase Edge — a UniPlay responde 404 a IPs de datacenter.
  if (typeof window !== "undefined") {
    return "/api/gesapi";
  }
  return configured;
}

function proxyHeaders(
  base: string,
  path: string,
  iptvBearer?: string,
): Record<string, string> {
  const h: Record<string, string> = {
    "x-iptv-path": path.startsWith("/") ? path : `/${path}`,
  };
  // Gateway Supabase exige apikey + Authorization (anon)
  if (isSupabaseGesProxy(base)) {
    h.apikey = SUPABASE_ANON_KEY;
    h.Authorization = `Bearer ${SUPABASE_ANON_KEY}`;
  }
  // Nunca enviar ngrok-skip-browser-warning do browser: Cloudflare/CORS bloqueia
  // o preflight. O ges-proxy já fala direto com a UniPlay.
  if (iptvBearer?.trim()) {
    h["x-iptv-authorization"] = `Bearer ${iptvBearer
      .trim()
      .replace(/^Bearer\s+/i, "")}`;
  }
  return h;
}

/** Lê exp (unix seconds) do JWT sem validar assinatura. */
export function readJwtExp(token: string): number | null {
  try {
    const part = token.replace(/^Bearer\s+/i, "").split(".")[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, "+").replace(/_/g, "/"));
    const payload = JSON.parse(json) as { exp?: number };
    return typeof payload.exp === "number" ? payload.exp : null;
  } catch {
    return null;
  }
}

export function tokenExpiresInSec(token: string): number | null {
  const exp = readJwtExp(token);
  if (exp == null) return null;
  return exp - Math.floor(Date.now() / 1000);
}

function extractToken(data: unknown): string | null {
  if (!data || typeof data !== "object") return null;
  const o = data as Record<string, unknown>;
  for (const k of [
    "access_token",
    "token",
    "accessToken",
    "bearer",
    "jwt",
  ]) {
    if (typeof o[k] === "string" && String(o[k]).length > 20) {
      return String(o[k]);
    }
  }
  if (o.data && typeof o.data === "object") {
    return extractToken(o.data);
  }
  if (typeof o.authorization === "string") {
    return o.authorization.replace(/^Bearer\s+/i, "");
  }
  return null;
}

function parseApiError(data: unknown, text: string, statusText: string) {
  if (typeof data === "string" && data.trim()) return data.trim();
  if (typeof data === "object" && data) {
    const o = data as {
      message?: unknown;
      error?: unknown;
      msg?: unknown;
      errors?: unknown;
    };
    const msg = o.message ?? o.error ?? o.msg;
    if (msg != null && String(msg).trim()) return String(msg).trim();
    // Validação Laravel-like: { whatsapp: ["The whatsapp must be an integer."] }
    const parts: string[] = [];
    for (const [k, v] of Object.entries(o)) {
      if (k === "message" || k === "error" || k === "msg" || k === "errors")
        continue;
      if (Array.isArray(v) && v.every((x) => typeof x === "string")) {
        parts.push(`${k}: ${v.join(" ")}`);
      }
    }
    if (parts.length) return parts.join(" · ");
    if (o.errors && typeof o.errors === "object") {
      for (const [k, v] of Object.entries(o.errors as Record<string, unknown>)) {
        if (Array.isArray(v)) parts.push(`${k}: ${v.join(" ")}`);
        else if (typeof v === "string") parts.push(`${k}: ${v}`);
      }
      if (parts.length) return parts.join(" · ");
    }
  }
  const raw = text?.trim();
  if (raw) {
    try {
      const once = JSON.parse(raw);
      if (typeof once === "string" && once.trim()) return once.trim();
      if (once && typeof once === "object") {
        return parseApiError(once, "", statusText);
      }
    } catch {
      /* keep */
    }
    return raw.replace(/^"|"$/g, "");
  }
  return statusText || "Falha no login";
}

/**
 * Login na API do painel → novo Bearer.
 * Body igual ao front do painel: { username, password, code }.
 *
 * Dev: proxy Vite (/ges-api) — usa o IP da sua máquina.
 * Produção: informe apiProxyUrl (ngrok + scripts/ges-proxy-server.mjs)
 * porque a UniPlay bloqueia login vindo de IP de nuvem (404).
 */
export async function loginIptvPanel(
  apiBaseUrl: string,
  username: string,
  password: string,
  code = "",
  apiProxyUrl?: string,
): Promise<string> {
  const user = username.trim();
  const pass = password;
  if (!user || !pass) {
    throw new Error("Informe usuário e senha do painel");
  }

  const base = resolveBase(apiBaseUrl, apiProxyUrl);
  const loginPath = "/login";
  const loginUrl = buildPanelFetchUrl(base, loginPath);

  try {
    const res = await fetch(loginUrl, {
      method: "POST",
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        ...(isPathHeaderProxy(base) ? proxyHeaders(base, loginPath) : {}),
      },
      body: JSON.stringify({ username: user, password: pass, code }),
    });
    const text = await res.text();
    let data: unknown = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = text;
    }
    if (!res.ok) {
      const err = parseApiError(data, text, res.statusText);
      if (/Upstream 404|bloqueou|credencias?\s+n[aã]o\s+encontradas/i.test(err)) {
        throw new Error(
          "A UniPlay bloqueou o login pela nuvem. No PC onde o localhost funciona, rode: node scripts/ges-proxy-server.mjs — exponha com ngrok e cole a URL em Admin → Automações → Proxy API.",
        );
      }
      if (/inv[aá]lid/i.test(err)) {
        throw new Error(
          "Usuário ou senha do painel incorretos. Use o mesmo login de https://searchdefense.top (não o do AuxPlus).",
        );
      }
      if (res.status === 404 && base === "/api/gesapi") {
        throw new Error(
          "Proxy /api/gesapi não está no deploy da Vercel. Faça push da pasta api/ ou configure Proxy API (ngrok) no Admin.",
        );
      }
      throw new Error(err || "Falha no login");
    }
    const token = extractToken(data);
    if (token) {
      lastIssuedToken = token.replace(/^Bearer\s+/i, "");
      return lastIssuedToken;
    }
    throw new Error("Login ok, mas a resposta não trouxe access_token");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erro de rede no login";
    if (/Failed to fetch|NetworkError|Load failed|fetch/i.test(msg)) {
      throw new Error(
        "Não alcançou o Proxy API. Confira se npm run ges-proxy e o cloudflared estão rodando neste PC, e se a URL no Admin está atualizada (túnel novo = URL nova).",
      );
    }
    throw e instanceof Error ? e : new Error(msg);
  }
}

/**
 * Garante Bearer válido. Renova via login se faltar < skewSec para expirar
 * (ou se já expirou), quando houver usuário/senha salvos.
 */
export async function ensureIptvToken(
  creds: IptvPanelCreds,
  skewSec = 10 * 60,
): Promise<{ token: string; renewed: boolean }> {
  const current = creds.bearerToken.trim().replace(/^Bearer\s+/i, "");
  const left = current ? tokenExpiresInSec(current) : null;
  const need =
    !current || left == null || left < skewSec;

  if (!need) return { token: current, renewed: false };

  if (!creds.username?.trim() || !creds.password) {
    if (!current) {
      throw new Error(
        "Salve usuário/senha do painel (ou cole um Bearer) para continuar.",
      );
    }
    if (left != null && left <= 0) {
      throw new Error(
        "Token expirado. Salve usuário/senha do painel para renovar sozinho, ou cole um Bearer novo.",
      );
    }
    return { token: current, renewed: false };
  }

  const token = await loginIptvPanel(
    creds.apiBaseUrl,
    creds.username,
    creds.password,
    "",
    creds.apiProxyUrl,
  );
  lastIssuedToken = token;
  return { token, renewed: true };
}

export type PanelFetchResult = { data: unknown; token: string };

async function panelFetch(
  creds: IptvPanelCreds,
  path: string,
  init?: RequestInit,
): Promise<unknown> {
  let token = creds.bearerToken.trim().replace(/^Bearer\s+/i, "");
  if (!token && !(creds.username && creds.password)) {
    throw new Error("Cole o token Bearer ou salve usuário/senha do painel");
  }
  if (!token && creds.username && creds.password) {
    token = await loginIptvPanel(
      creds.apiBaseUrl,
      creds.username,
      creds.password,
      "",
      creds.apiProxyUrl,
    );
  }

  const base = resolveBase(creds.apiBaseUrl, creds.apiProxyUrl);
  const p = path.startsWith("/") ? path : `/${path}`;
  const url = buildPanelFetchUrl(base, p);
  const doFetch = (t: string) =>
    fetch(url, {
      ...init,
      headers: {
        accept: "application/json, text/plain, */*",
        "content-type": "application/json",
        ...(isPathHeaderProxy(base)
          ? proxyHeaders(base, p, t)
          : { authorization: `Bearer ${t}` }),
        ...(init?.headers || {}),
      },
    });

  let res = await doFetch(token);
  if (
    (res.status === 401 || res.status === 403) &&
    creds.username?.trim() &&
    creds.password
  ) {
    token = await loginIptvPanel(
      creds.apiBaseUrl,
      creds.username,
      creds.password,
      "",
      creds.apiProxyUrl,
    );
    res = await doFetch(token);
  }

  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }

  if (!res.ok) {
    // Erros 5xx (502/503/504) = servidor temporariamente indisponível
    // Não loga no console para evitar poluição, apenas retorna erro silencioso
    if (res.status >= 500) {
      // Painel down: retorna erro SILENCIOSO sem log para evitar poluição de console
      const err = new Error(
        `Painel temporariamente indisponível (${res.status})`
      );
      (err as any).isPanelDown = true;
      (err as any).status = res.status;
      throw err;
    }

    const msg = parseApiError(data, text, res.statusText);
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Token inválido ou expirado. Salve usuário/senha do painel ou cole um Bearer novo.",
      );
    }
    if (res.status === 405) {
      throw new Error(
        isLocalhostBrowser()
          ? `Rota UniPlay recusou ${init?.method || "GET"} ${p} (405).`
          : "Proxy UniPlay sem rota (405). Confira ges-proxy + cloudflared e a URL em Automações → Proxy API.",
      );
    }
    throw new Error(msg || `Erro HTTP ${res.status}`);
  }
  lastIssuedToken = token;
  return data;
}

function asArray(data: unknown): unknown[] {
  if (Array.isArray(data)) return data;
  if (data && typeof data === "object") {
    const o = data as Record<string, unknown>;
    for (const k of ["data", "users", "items", "result", "rows"]) {
      if (Array.isArray(o[k])) return o[k] as unknown[];
      // Laravel às vezes aninha: { data: { data: [...] } }
      if (o[k] && typeof o[k] === "object" && !Array.isArray(o[k])) {
        const nested = asArray(o[k]);
        if (nested.length) return nested;
      }
    }
  }
  return [];
}

function pickPassword(u: Record<string, unknown>): string | undefined {
  for (const k of [
    "password",
    "pass",
    "senha",
    "user_password",
    "iptv_password",
    "pwd",
    "passowrd", // typo comum em APIs
  ]) {
    const v = u[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  // às vezes vem aninhado em infos
  if (u.infos && typeof u.infos === "object") {
    return pickPassword(u.infos as Record<string, unknown>);
  }
  return undefined;
}

function deepFindPassword(value: unknown, depth = 0): string | undefined {
  if (depth > 6 || value == null) return undefined;
  if (typeof value === "string") {
    const fromMsg = value.match(/SENHA\s*:\s*([^\s\r\n]+)/i)?.[1]?.trim();
    if (fromMsg) return fromMsg;
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = deepFindPassword(item, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value === "object") {
    const direct = pickPassword(value as Record<string, unknown>);
    if (direct) return direct;
    for (const v of Object.values(value as Record<string, unknown>)) {
      const found = deepFindPassword(v, depth + 1);
      if (found) return found;
    }
  }
  return undefined;
}

/** Senha no estilo do painel (ex.: W249t1154X). */
export function generateIptvTestPassword(): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghjkmnpqrstuvwxyz";
  const nums = "23456789";
  const pick = (alphabet: string, n: number) =>
    Array.from({ length: n }, () => {
      const i = Math.floor(Math.random() * alphabet.length);
      return alphabet[i]!;
    }).join("");
  return `${pick(upper, 1)}${pick(nums, 3)}${pick(lower, 1)}${pick(nums, 4)}${pick(upper, 1)}`;
}

/**
 * Bytes Windows-1252 que diferem do Latin-1 (0x80–0x9F).
 * Necessário p/ reverter mojibake com “œ”, “€”, aspas curvas etc.
 */
const WIN1252_EXTRA: Record<number, number> = {
  0x20ac: 0x80,
  0x201a: 0x82,
  0x0192: 0x83,
  0x201e: 0x84,
  0x2026: 0x85,
  0x2020: 0x86,
  0x2021: 0x87,
  0x02c6: 0x88,
  0x2030: 0x89,
  0x0160: 0x8a,
  0x2039: 0x8b,
  0x0152: 0x8c,
  0x017d: 0x8e,
  0x2018: 0x91,
  0x2019: 0x92,
  0x201c: 0x93,
  0x201d: 0x94,
  0x2022: 0x95,
  0x2013: 0x96,
  0x2014: 0x97,
  0x02dc: 0x98,
  0x2122: 0x99,
  0x0161: 0x9a,
  0x203a: 0x9b,
  0x0153: 0x9c,
  0x017e: 0x9e,
  0x0178: 0x9f,
};

/** Detecta texto UTF-8 lido como Latin-1/Windows-1252 (ex.: VictÃ³ria). */
export function looksLikeUtf8Mojibake(text: string): boolean {
  return /Ã[\u0080-\u00bf]|Â[\u0080-\u00bf]|â.|ðŸ|ï¸/.test(text);
}

/**
 * Corrige mojibake comum da API do painel
 * (UTF-8 interpretado como Windows-1252).
 * Ex.: "VictÃ³ria" → "Victória", "âœ¨" → "✨"
 */
export function fixUtf8Mojibake(text: string): string {
  if (!text || !looksLikeUtf8Mojibake(text)) return text;
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (code <= 0xff) {
      bytes.push(code);
      continue;
    }
    const mapped = WIN1252_EXTRA[code];
    if (mapped == null) return text;
    bytes.push(mapped);
  }
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(
      Uint8Array.from(bytes),
    );
  } catch {
    return text;
  }
}

function pickUserFields(u: Record<string, unknown>): IptvRemoteUser {
  const notaRaw =
    typeof u.nota === "string"
      ? u.nota
      : typeof u.note === "string"
        ? u.note
        : typeof u.obs === "string"
          ? u.obs
          : "";
  const nota = fixUtf8Mojibake(notaRaw).trim();
  const nameRaw =
    typeof u.name === "string" && u.name.trim() && u.name !== u.username
      ? fixUtf8Mojibake(u.name).trim()
      : "";
  // No UniPlay a "nota" é o nome do cliente — prioriza ela
  const displayName = nota || nameRaw || undefined;
  const phoneRaw =
    u.whatsapp ?? u.phone ?? u.telefone ?? u.celular ?? u.whatsApp;
  const createdRaw = pickLooseString(u, [
    "created_at",
    "createdAt",
    "date_regis",
    "date_register",
    "date_registration",
    "created",
  ]);
  return {
    ...u,
    id: (u.id ?? u.user_id ?? u.uid) as string | number,
    username: String(u.username ?? u.user ?? ""),
    name: displayName ? String(displayName) : undefined,
    nota,
    password: pickPassword(u),
    exp_date: u.exp_date
      ? String(u.exp_date)
      : u.expDate
        ? String(u.expDate)
        : u.expira
          ? String(u.expira)
          : undefined,
    phone:
      phoneRaw != null && String(phoneRaw).trim()
        ? String(phoneRaw).trim()
        : undefined,
    createdAt: parseIptvExpToDateTime(createdRaw ?? "") || undefined,
  };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatLocalDateTime(dt: Date): string {
  return `${dt.getFullYear()}-${pad2(dt.getMonth() + 1)}-${pad2(dt.getDate())} ${pad2(dt.getHours())}:${pad2(dt.getMinutes())}:${pad2(dt.getSeconds())}`;
}

/**
 * Converte exp_date do painel → `yyyy-MM-dd HH:mm:ss` (preserva horário do UniPlay).
 */
export function parseIptvExpToDateTime(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;

  let m = s.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (m) {
    const time = m[4]
      ? `${m[4]}:${m[5]}:${m[6] ?? "00"}`
      : "00:00:00";
    return `${m[1]}-${m[2]}-${m[3]} ${time}`;
  }

  m = s.match(
    /^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})(?:[T\s](\d{2}):(\d{2})(?::(\d{2}))?)?/,
  );
  if (m) {
    const d = m[1].padStart(2, "0");
    const mo = m[2].padStart(2, "0");
    const time = m[4]
      ? `${m[4]}:${m[5]}:${m[6] ?? "00"}`
      : "00:00:00";
    return `${m[3]}-${mo}-${d} ${time}`;
  }

  const n = Number(s);
  if (Number.isFinite(n) && n > 1e9) {
    const ms = n > 1e12 ? n : n * 1000;
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime())) return formatLocalDateTime(dt);
  }

  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) return formatLocalDateTime(iso);
  return null;
}

/** Converte exp_date do painel → yyyy-MM-dd (ou null). */
export function parseIptvExpToYmd(
  raw: string | null | undefined,
): string | null {
  const full = parseIptvExpToDateTime(raw);
  return full ? full.slice(0, 10) : null;
}

function hasIptvTestFlag(row: Record<string, unknown>): boolean {
  for (const k of [
    "is_test",
    "is_trial",
    "isTest",
    "isTrial",
    "trial",
    "teste",
    "is_teste",
  ]) {
    const v = row[k];
    if (v === true || v === 1 || v === "1" || v === "true") return true;
  }
  const testHours = Number(row.test_hours ?? row.testHours ?? 0);
  if (Number.isFinite(testHours) && testHours > 0) return true;
  // UniPlay às vezes aninha em infos
  if (row.infos && typeof row.infos === "object") {
    const nested = row.infos as Record<string, unknown>;
    const nestedHours = Number(nested.test_hours ?? nested.testHours ?? 0);
    if (Number.isFinite(nestedHours) && nestedHours > 0) return true;
    for (const k of ["is_test", "is_trial", "isTest", "trial", "teste"]) {
      const v = nested[k];
      if (v === true || v === 1 || v === "1" || v === "true") return true;
    }
  }
  return false;
}

/**
 * Detecta linha de teste/trial no painel (não sincronizar no AuxPlus).
 * Heurística: flags, test_hours, nota/nome com “teste”, ou vida útil menor que 3 dias.
 */
export function isIptvTestOrTrialUser(
  u: IptvRemoteUser | Record<string, unknown>,
): boolean {
  const row = u as Record<string, unknown>;
  if (hasIptvTestFlag(row)) return true;

  const label = [
    row.nota,
    row.note,
    row.obs,
    row.notes,
    row.name,
    row.admin_notes,
  ]
    .map((v) => String(v ?? "").toLowerCase())
    .join(" ");
  if (/\bteste\b|\btest\b|\btrial\b|teste auxplus|teste uniplay/i.test(label)) {
    return true;
  }

  // Testes costumam durar horas (1–6h); planos ativos são semanas/meses
  const created = parseIptvExpToYmd(
    String(row.created_at ?? row.createdAt ?? row.created ?? row.date ?? ""),
  );
  const exp = parseIptvExpToYmd(
    String(row.exp_date ?? row.expDate ?? row.expira ?? ""),
  );
  if (created && exp) {
    const c = new Date(`${created}T12:00:00`);
    const e = new Date(`${exp}T12:00:00`);
    const days = (e.getTime() - c.getTime()) / 86_400_000;
    if (days >= 0 && days < 3) return true;
  }

  return false;
}

/**
 * Linha de TESTE ainda ativa (vence em horas/dias curtos)?
 *
 * Um teste ATIVADO vira plano (vence em semanas/meses) e passa a ser cliente —
 * mesmo que o painel mantenha a flag test_hours / nota “teste” do período de
 * teste. Convenção igual à aba Testes (isTestForSync): com mais de 2 dias de
 * validade restante, não é mais teste de horas.
 *
 * Usado no sync de clientes (em vez de isIptvTestOrTrialUser), que excluía
 * qualquer linha com flag de teste mesmo depois de virar plano.
 */
export function isShortLivedIptvTest(
  u: IptvRemoteUser | Record<string, unknown>,
): boolean {
  const row = u as Record<string, unknown>;
  const expFull = parseIptvExpToDateTime(
    String(row.exp_date ?? row.expDate ?? ""),
  );
  const expMs = expFull ? new Date(expFull.replace(" ", "T")).getTime() : NaN;
  const left = Number.isFinite(expMs) ? expMs - Date.now() : NaN;
  // Mais de 2 dias de validade → plano ativo (mesmo com flag de teste antiga)
  if (Number.isFinite(left) && left > 2 * 86_400_000) return false;
  // Sem data de expiração ou vida curta → usa a heurística original
  return isIptvTestOrTrialUser(u);
}

/**
 * Critério estrito para APAGAR em lote: só o que o painel marca como teste
 * (flag / test_hours). Nunca usa nome, nota ou “vence em poucos dias”
 * — evita risco com clientes ativos.
 */
export function isConfirmedIptvTestUser(
  u: IptvRemoteUser | Record<string, unknown>,
): boolean {
  return hasIptvTestFlag(u as Record<string, unknown>);
}

function userRowKey(u: IptvRemoteUser): string {
  if (u.id != null && String(u.id).trim()) return `id:${u.id}`;
  const username = String(u.username || u.user || "")
    .trim()
    .toLowerCase();
  return username ? `u:${username}` : "";
}

/** Lista usuários IPTV no painel (com paginação quando a API limitar). */
export async function listIptvUsers(
  creds: IptvPanelCreds,
  opts?: { /** Se true, omite testes/trials */ activeOnly?: boolean },
): Promise<IptvRemoteUser[]> {
  const reg = creds.regPassword?.trim() || "";
  const baseParams = new URLSearchParams();
  if (reg) baseParams.set("reg_password", reg);

  const fetchPage = async (page?: number, perPage?: number) => {
    const params = new URLSearchParams(baseParams);
    if (page != null) {
      params.set("page", String(page));
      params.set("per_page", String(perPage ?? 100));
    }
    const qs = params.toString();
    const data = await panelFetch(creds, `/users-iptv${qs ? `?${qs}` : ""}`);
    return asArray(data).map((row) =>
      pickUserFields((row || {}) as Record<string, unknown>),
    );
  };

  let users = await fetchPage();
  const seen = new Set(
    users.map(userRowKey).filter(Boolean),
  );

  // Se a 1ª página veio “cheia”, tenta as próximas (evita perder testes)
  const pageSize = users.length;
  if (pageSize >= 15 && pageSize <= 100) {
    for (let page = 2; page <= 40; page++) {
      let batch: IptvRemoteUser[] = [];
      try {
        batch = await fetchPage(page, pageSize);
      } catch {
        break;
      }
      let added = 0;
      for (const u of batch) {
        const key = userRowKey(u);
        if (!key || seen.has(key)) continue;
        seen.add(key);
        users.push(u);
        added += 1;
      }
      if (added === 0 || batch.length < pageSize) break;
    }
  }

  if (opts?.activeOnly) {
    users = users.filter((u) => !isShortLivedIptvTest(u));
  }
  return users;
}

/** Revendedor cadastrado sob a sua conta no painel UniPlay. */
export type IptvReseller = {
  id: string | number;
  username: string;
  name?: string;
  nota?: string;
  credits?: number;
  phone?: string;
  email?: string;
  /** Ex.: "45 / 45" (diretos / árvore) */
  ativosLabel?: string;
  /** Dias desde a última recarga (painel). */
  daysToDue?: number | null;
  createdAt?: string;
  exp_date?: string;
  [k: string]: unknown;
};

function pickCreditLoose(u: Record<string, unknown>): number | undefined {
  for (const k of [
    "credits",
    "credit",
    "creditos",
    "credits_remaining",
    "credits_re",
    "saldo",
  ]) {
    const raw = u[k];
    if (typeof raw === "number" && Number.isFinite(raw)) return raw;
    if (typeof raw === "string" && raw.trim()) {
      const n = Number(raw.replace(",", "."));
      if (Number.isFinite(n)) return n;
    }
  }
  return undefined;
}

/** WhatsApp/telefone do painel (só dígitos, com DDI). */
function looksLikePhoneDigits(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 10 && digits.length <= 15 && !value.includes("@");
}

function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function pickLooseString(
  u: Record<string, unknown>,
  keys: string[],
): string | undefined {
  for (const k of keys) {
    const v = u[k];
    if (v == null) continue;
    // UniPlay usa 0 para “sem WhatsApp”
    if (typeof v === "number" && v === 0) continue;
    if (typeof v === "string" && (!v.trim() || v.trim() === "0")) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return undefined;
}

function pickResellerFields(u: Record<string, unknown>): IptvReseller {
  const notaRaw =
    typeof u.nota === "string"
      ? u.nota
      : typeof u.note === "string"
        ? u.note
        : typeof u.obs === "string"
          ? u.obs
          : typeof u.reseller_name === "string"
            ? u.reseller_name
            : "";
  const nota = fixUtf8Mojibake(notaRaw).trim();
  const nameRaw =
    typeof u.name === "string" && u.name.trim()
      ? fixUtf8Mojibake(u.name).trim()
      : "";
  const username = String(
    u.username ?? u.user ?? u.reseller ?? u.login ?? "",
  ).trim();

  /**
   * No front UniPlay a coluna “Whatsapp” lê `item.email` (número),
   * e a coluna “E-mail” lê `item.email_contact`.
   * `whatsapp` também existe em formulários de edição.
   */
  const whatsappDirect = pickLooseString(u, [
    "whatsapp",
    "phone",
    "telefone",
    "celular",
    "whatsApp",
  ]);
  const emailField = pickLooseString(u, ["email"]);
  const emailContact = pickLooseString(u, ["email_contact", "emailContact"]);

  let phone: string | undefined;
  if (whatsappDirect && looksLikePhoneDigits(whatsappDirect)) {
    phone = whatsappDirect.replace(/\D/g, "");
  } else if (emailField && looksLikePhoneDigits(emailField)) {
    phone = emailField.replace(/\D/g, "");
  }

  let email: string | undefined;
  if (emailContact && looksLikeEmail(emailContact)) {
    email = emailContact;
  } else if (emailField && looksLikeEmail(emailField)) {
    email = emailField;
  } else if (emailContact) {
    email = emailContact;
  }

  const totalIptv = Number(u.total_iptv ?? u.totalIptv ?? 0) || 0;
  const totalUp2p = Number(u.total_up2p ?? u.totalUp2p ?? 0) || 0;
  const totalActives = Number(u.total_actives ?? u.totalActives ?? 0) || 0;
  const diretos = totalIptv + totalUp2p;
  const arvore = Number.isFinite(totalActives) ? totalActives : diretos;
  const ativosLabel =
    diretos > 0 || arvore > 0 ? `${diretos} / ${arvore}` : undefined;

  const daysRaw = u.days_to_due ?? u.daysToDue;
  const daysToDue =
    typeof daysRaw === "number" && Number.isFinite(daysRaw)
      ? daysRaw
      : typeof daysRaw === "string" && daysRaw.trim()
        ? Number(daysRaw)
        : null;

  const createdRaw = pickLooseString(u, [
    "created_at",
    "createdAt",
    "date_regis",
    "date_register",
    "date_registration",
    "created",
  ]);

  return {
    ...u,
    // PK do revendedor — não usar id_res/idRes da linha (muitas vezes é o pai)
    id: (u.id ?? u.reseller_id ?? u.user_id ?? u.uid ?? username) as
      | string
      | number,
    username,
    name: nota || nameRaw || undefined,
    nota,
    credits: pickCreditLoose(u),
    phone,
    email,
    ativosLabel,
    daysToDue:
      daysToDue != null && Number.isFinite(daysToDue) ? daysToDue : null,
    createdAt: createdRaw,
    exp_date: u.exp_date
      ? String(u.exp_date)
      : u.expDate
        ? String(u.expDate)
        : u.expira
          ? String(u.expira)
          : undefined,
  };
}

/**
 * Lista revendedores (sub-contas) do painel.
 * Front UniPlay: GET /api/reg-users?page&per_page&search&searchID
 */
export async function listIptvResellers(
  creds: IptvPanelCreds,
  opts?: { search?: string; perPage?: number },
): Promise<IptvReseller[]> {
  const params = new URLSearchParams({
    page: "1",
    per_page: String(Math.max(1, Math.min(200, opts?.perPage ?? 100))),
    search: opts?.search?.trim() || "",
    searchID: "",
  });
  const paths = [
    `/reg-users?${params.toString()}`,
    `/reseller?${params.toString()}`,
    `/resellers?${params.toString()}`,
  ];
  let lastErr: unknown;
  for (const path of paths) {
    try {
      const data = await panelFetch(creds, path);
      const rows = asArray(data)
        .map((row) => pickResellerFields((row || {}) as Record<string, unknown>))
        .filter((r) => r.username || r.id != null);
      if (rows.length || path.startsWith("/reg-users")) return rows;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("Não foi possível listar revendedores no UniPlay.");
}

/** Mínimo de créditos que o painel aceita transferir para um revendedor. */
export const IPTV_RESELLER_CREDITS_MIN = 10;

/**
 * ID numérico do revendedor no painel (PK).
 * Importante: em linhas do UniPlay, `id_res` / `idRes` costuma ser o PAI
 * (ou o usuário logado). O body de POST /recargas/criar espera o `id` do
 * revendedor alvo — o front só chama isso de idRes depois de selecionar.
 */
export function resolveIptvResellerPanelId(
  reseller: Pick<IptvReseller, "id" | "username"> & Record<string, unknown>,
): number | null {
  for (const raw of [reseller.id, reseller.reseller_id, reseller.user_id, reseller.uid]) {
    if (raw == null || raw === "") continue;
    // Evita usar o username como id (Number("eronvitor") === NaN)
    if (typeof raw === "string" && raw.trim() === reseller.username?.trim()) {
      continue;
    }
    const n = typeof raw === "number" ? raw : Number(String(raw).trim());
    if (Number.isFinite(n) && n > 0) return Math.floor(n);
  }
  return null;
}

export type IptvResellerMovement = {
  id: string | number;
  /** Quantidade de créditos da recarga */
  credits: number;
  /** Valor faturado em R$ */
  faturado: number;
  /** Valor do crédito por unidade (faturado ÷ créditos) */
  unitPrice: number;
  obs?: string;
  fromUser?: string;
  toUser?: string;
  /** Data/hora (ex.: "24/05/2026 12:42:29") */
  at: string;
};

function pickLogNumber(row: Record<string, unknown>, keys: string[]): number {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string" && v.trim()) {
      const m = v.replace(/\./g, "").replace(",", ".").match(/-?\d+(?:\.\d+)?/);
      if (m) {
        const n = Number(m[0]);
        if (Number.isFinite(n)) return n;
      }
    }
  }
  return 0;
}

function pickLogString(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k];
    if (v == null) continue;
    const s = String(v).trim();
    if (s && s !== "0") return fixUtf8Mojibake(s);
  }
  return "";
}

function parseLogFromTo(desc: string): { from?: string; to?: string } {
  const m = /^\s*(.*?)\s*(?:->|→|\bpara\b)\s*(.*?)\s*$/i.exec(desc);
  if (m && (m[1]?.trim() || m[2]?.trim())) {
    return { from: m[1]?.trim() || undefined, to: m[2]?.trim() || undefined };
  }
  return {};
}

function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(
    d.getHours(),
  )}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

/** Aceita data ISO, dd/mm/aaaa ou timestamp (segundos/milissegundos) do UniPlay. */
function parseLogDate(value: unknown): string {
  if (value == null) return "";
  const s = String(value).trim();
  if (/^\d{10}$/.test(s)) {
    const d = new Date(Number(s) * 1000);
    return Number.isNaN(d.getTime()) ? s : isoLocal(d);
  }
  if (/^\d{13}$/.test(s)) {
    const d = new Date(Number(s));
    return Number.isNaN(d.getTime()) ? s : isoLocal(d);
  }
  return s;
}

function pickMovement(row: Record<string, unknown>): IptvResellerMovement | null {
  const id =
    row.id ?? row.ID ?? row.codigo ?? row.recarga_id ?? row.log_id ?? row.nid;
  const at = parseLogDate(
    row.data ??
      row.date ??
      row.created_at ??
      row.createdAt ??
      row.datetime ??
      row.hora ??
      row.registrado ??
      row.created,
  );
  if (id == null && !at) return null;
  const credits = pickLogNumber(row, [
    "qtd",
    "quantidade",
    "credits",
    "credit",
    "qtd_creditos",
    "amount",
    "qtd_credits",
    "creditos",
  ]);
  // UniPlay pode devolver:
  // - "faturado" / "total": valor TOTAL da recarga
  // - "sale" / "price": valor POR CRÉDITO (unitário)
  // Se encontrar faturado/total primeiro, use direto. Senão calcule multiplicando.
  let faturado = 0;
  let unitPrice = 0;

  // Tenta encontrar o valor total primeiro
  const totalValue = pickLogNumber(row, [
    "faturado",
    "total",
    "valor_total",
    "debito",
  ]);

  if (totalValue) {
    // Se achou total, use direto
    faturado = totalValue;
    unitPrice = credits > 0 ? totalValue / credits : 0;
  } else {
    // Senão, procura por unitário e multiplica
    unitPrice = pickLogNumber(row, [
      "sale",
      "value",
      "price",
      "valor",
      "creditos_reais",
    ]);
    faturado = credits * unitPrice;
  }

  faturado = Math.round(faturado * 100) / 100;
  unitPrice = Math.round(unitPrice * 100) / 100;

  let obs = pickLogString(row, [
    "obs",
    "nota",
    "note",
    "descricao",
    "desc",
    "obs_reseller",
    "comentario",
    "resumo",
    "titulo",
    "log",
    "txt",
    "text",
  ]);
  // Fallback: qualquer campo que pareça descrição (de→para / PIX / compra)
  if (!obs) {
    for (const [k, v] of Object.entries(row)) {
      if (v == null || typeof v === "object") continue;
      const s = String(v).trim();
      if (!s || /^\d+$/.test(s)) continue;
      if (/(\bpara\b|->|→|pix|cr[eé]dito|compra|recarga)/i.test(s)) {
        obs = fixUtf8Mojibake(s);
        break;
      }
    }
  }
  let fromUser = pickLogString(row, [
    "de",
    "from",
    "from_user",
    "de_user",
    "origem",
    "remetente",
    "from_user_name",
    "de_nome",
  ]);
  let toUser = pickLogString(row, [
    "para",
    "to",
    "to_user",
    "para_user",
    "destino",
    "destinatario",
    "to_user_name",
    "para_nome",
  ]);
  if (!fromUser && !toUser && obs) {
    const p = parseLogFromTo(obs);
    fromUser = p.from || fromUser;
    toUser = p.to || toUser;
  }

  return {
    id: String(id ?? "") || at || `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    credits,
    faturado,
    unitPrice: Math.round(unitPrice * 100) / 100,
    obs: obs || undefined,
    fromUser: fromUser || undefined,
    toUser: toUser || undefined,
    at,
  };
}

/**
 * Movimentações de recarga de um revendedor (Logs de Movimentações).
 * Front UniPlay: GET /api/logs-reseller/{id}
 * Percorre todas as páginas (a API é paginada) e deduplica por ID.
 */
export async function listIptvResellerLogs(
  creds: IptvPanelCreds,
  resellerId: number | string,
  opts?: { perPage?: number },
): Promise<IptvResellerMovement[]> {
  const base = `/logs-reseller/${encodeURIComponent(String(resellerId))}`;
  const perPage = Math.max(50, Math.min(1000, opts?.perPage ?? 1000));
  const out: IptvResellerMovement[] = [];
  const seen = new Set<string>();
  let page = 1;
  let lastPage: number | null = null;

  for (;;) {
    let raw: unknown;
    try {
      raw = await panelFetch(creds, `${base}?page=${page}&per_page=${perPage}`);
    } catch (e) {
      if (page === 1) throw e;
      break; // páginas seguintes falharam — usa as que já coletou
    }
    const obj =
      raw && typeof raw === "object" && !Array.isArray(raw)
        ? (raw as Record<string, unknown>)
        : {};
    const rows = Array.isArray(raw)
      ? raw
      : Array.isArray(obj.data)
        ? (obj.data as unknown[])
        : [];
    for (const row of rows) {
      const m = pickMovement((row || {}) as Record<string, unknown>);
      if (!m) continue;
      const k = String(m.id);
      if (k && seen.has(k)) continue;
      if (k) seen.add(k);
      out.push(m);
    }
    if (lastPage == null) {
      const meta =
        obj.meta && typeof obj.meta === "object"
          ? (obj.meta as Record<string, unknown>)
          : {};
      const pag =
        obj.pagination && typeof obj.pagination === "object"
          ? (obj.pagination as Record<string, unknown>)
          : {};
      const lp = Number(obj.last_page ?? obj.total_pages ?? meta.last_page ?? pag.last_page);
      if (Number.isFinite(lp) && lp > 0) lastPage = lp;
    }
    if (lastPage != null && page >= lastPage) break;
    if (rows.length === 0) break;
    if (lastPage == null && rows.length < perPage) break;
    page += 1;
    if (page > 500) break;
  }

  return out.sort((a, b) => {
    const ta = Date.parse(a.at) || 0;
    const tb = Date.parse(b.at) || 0;
    if (ta && tb) return tb - ta;
    return String(b.at).localeCompare(String(a.at));
  });
}

/** Resumo dos créditos/valores de uma lista de movimentações. */
export function summarizeResellerMovements(
  moves: IptvResellerMovement[],
): { credits: number; faturado: number; unitPrice: number } {
  const credits = moves.reduce((s, m) => s + (Number(m.credits) || 0), 0);
  const faturado = moves.reduce((s, m) => s + (Number(m.faturado) || 0), 0);
  return {
    credits,
    faturado: Math.round(faturado * 100) / 100,
    unitPrice: credits > 0 ? Math.round((faturado / credits) * 100) / 100 : 0,
  };
}

/**
 * Adiciona créditos a um revendedor (sub-conta).
 *
 * Caminho principal = botão “Créditos Add” do painel:
 *   PUT /reg-users/{id} { action: 0, credits, sale, reason }
 *   (sale = valor R$ da venda, máx. 100 no front UniPlay)
 *
 * Fallback legado: POST /recargas/criar { id_res, qtd_creditos }
 * (em várias contas responde “Créditos insuficientes” mesmo com saldo).
 */
export async function addIptvResellerCredits(
  creds: IptvPanelCreds,
  opts: {
    resellerId: string | number;
    credits: number;
    /** Valor R$ da venda (painel: campo sale, máx. 100). */
    saleBrl?: number;
    /** Preço unitário p/ calcular sale quando saleBrl não vier. */
    unitPriceBrl?: number;
    reason?: string;
  },
): Promise<unknown> {
  const credits = Math.floor(Number(opts.credits));
  if (!Number.isFinite(credits) || credits < IPTV_RESELLER_CREDITS_MIN) {
    throw new Error(
      `A UniPlay só permite passar ${IPTV_RESELLER_CREDITS_MIN} créditos ou mais.`,
    );
  }
  const idRes = (() => {
    const n = Number(opts.resellerId);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
  })();
  if (idRes == null) {
    throw new Error(
      "Revendedor sem ID numérico no UniPlay. Atualize a lista de revendedores e tente de novo.",
    );
  }

  const unit = Math.max(0.01, Number(opts.unitPriceBrl) || 8.5);
  const saleRaw =
    opts.saleBrl != null && Number.isFinite(Number(opts.saleBrl))
      ? Number(opts.saleBrl)
      : credits * unit;
  // Front UniPlay: if (sale > 100) → "Valor máximo do crédito R$100."
  const sale = Math.min(100, Math.max(0.01, Math.round(saleRaw * 100) / 100));
  const reason = String(opts.reason || "AuxPlus").trim() || "AuxPlus";

  // Pré-checagem: teste/renovação e “Créditos Add” usam o mesmo saldo dash.credits
  let bal: IptvPanelCredits | null = null;
  try {
    bal = await fetchIptvPanelCredits(creds);
    if (bal.credits + 1e-9 < credits) {
      throw new Error(
        `Créditos insuficientes no UniPlay (saldo ${formatIptvCredits(bal.credits)} · necessário ${credits}).`,
      );
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/insuficientes/i.test(msg)) throw e;
  }

  const actionBody = JSON.stringify({
    action: 0,
    credits,
    sale,
    reason,
  });
  const idPath = `/reg-users/${encodeURIComponent(String(idRes))}`;
  const methods = ["PUT", "POST", "PATCH"] as const;
  let lastErr: Error | null = null;

  for (const method of methods) {
    try {
      return await panelFetch(creds, idPath, {
        method,
        body: actionBody,
      });
    } catch (e) {
      lastErr = e instanceof Error ? e : new Error(String(e));
      const msg = lastErr.message;
      if (
        /405|method is not supported|Method Not Allowed|não permitido/i.test(
          msg,
        )
      ) {
        continue;
      }
      // Se o action em /reg-users falhar, tenta o endpoint legado de recargas
      break;
    }
  }

  try {
    return await panelFetch(creds, "/recargas/criar", {
      method: "POST",
      body: JSON.stringify({
        id_res: idRes,
        qtd_creditos: credits,
      }),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    const prev = lastErr?.message || "";
    throw new Error(
      /insuficientes/i.test(msg)
        ? `UniPlay recusou créditos (saldo ${bal != null ? formatIptvCredits(bal.credits) : "?"} · envio ${credits} · id ${idRes} · sale R$${sale}). ` +
            `Teste/renovação gastam crédito normalmente; “passar créditos” usa outra rota do painel. ` +
            `Tente no searchdefense.top a coluna Créditos Add do revendedor. ` +
            `API: ${msg}${prev && prev !== msg ? ` · reg-users: ${prev}` : ""}`
        : lastErr && !/405/i.test(lastErr.message)
          ? lastErr.message
          : msg,
    );
  }
}

export async function findIptvUserByUsername(
  creds: IptvPanelCreds,
  username: string,
  opts?: { exactOnly?: boolean },
): Promise<IptvRemoteUser | null> {
  const want = username.trim().toLowerCase();
  if (!want) return null;
  const users = await listIptvUsers(creds);
  const exact = users.find(
    (u) => String(u.username || "").toLowerCase() === want,
  );
  if (exact || opts?.exactOnly) return exact || null;
  return (
    users.find((u) => String(u.username || "").toLowerCase().includes(want)) ||
    null
  );
}

function extractRemoteUserId(raw: unknown): string | number | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const obj = raw as Record<string, unknown>;
  const nested =
    (obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)
      : null) ||
    (obj.user && typeof obj.user === "object"
      ? (obj.user as Record<string, unknown>)
      : null) ||
    obj;
  const id = nested.id ?? nested.user_id ?? nested.uid ?? obj.id;
  if (id == null || id === "") return undefined;
  return id as string | number;
}

/**
 * Gera teste (cria linha IPTV).
 * Se `username` for enviado, o painel tenta criar com esse login
 * (útil p/ clientes apagados após vencimento). Sem username → gera aleatório.
 */
export async function createIptvTest(
  creds: IptvPanelCreds,
  opts: {
    testHours: number;
    packageId?: string;
    nota?: string;
    credits?: number;
    /** Login IPTV desejado (ex.: itemId do cliente no AuxPlus) */
    username?: string;
    whatsapp?: string;
    /** Se omitido, gera uma senha e envia ao painel */
    password?: string;
  },
): Promise<CreateTestResult> {
  // Enviamos a senha na criação — a API muitas vezes não devolve depois.
  const chosenPassword =
    opts.password?.trim() || generateIptvTestPassword();
  const body: Record<string, unknown> = {
    isOficial: false,
    package: String(opts.packageId || creds.defaultPackage || "1"),
    credits: opts.credits ?? 1,
    isCustomPackage: false,
    nota: opts.nota?.trim() || "",
    test_hours: String(Math.max(1, Math.min(6, Number(opts.testHours) || 6))),
    // Várias builds do GES aceitam password / pass / senha
    password: chosenPassword,
    pass: chosenPassword,
    senha: chosenPassword,
    bouquets: [] as string[],
  };
  // Painel exige whatsapp como inteiro — omitir se vazio (string "" quebra).
  const waDigits = String(opts.whatsapp || "").replace(/\D/g, "");
  if (waDigits) body.whatsapp = Number(waDigits);
  const desiredUser = opts.username?.trim();
  if (desiredUser) body.username = desiredUser;
  if (creds.regPassword?.trim()) {
    body.reg_password = creds.regPassword.trim();
  }
  const raw = await panelFetch(creds, "/users-iptv", {
    method: "POST",
    body: JSON.stringify(body),
  });

  // Resposta às vezes é só a mensagem de boas-vindas (string)
  if (typeof raw === "string") {
    return enrichCreateTestResult({
      raw,
      password: chosenPassword,
      message: raw,
    });
  }

  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<
    string,
    unknown
  >;
  const nested =
    obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)
      : obj.user && typeof obj.user === "object"
        ? (obj.user as Record<string, unknown>)
        : obj.infos && typeof obj.infos === "object"
          ? (obj.infos as Record<string, unknown>)
          : obj;

  const message =
    (typeof obj.message === "string" && obj.message) ||
    (typeof obj.msg === "string" && obj.msg) ||
    (typeof nested.message === "string" && nested.message) ||
    (typeof nested.msg === "string" && nested.msg) ||
    (typeof nested.whatsapp_message === "string" && nested.whatsapp_message) ||
    (typeof nested.text === "string" && nested.text) ||
    (typeof nested.whatsMessage === "string" && nested.whatsMessage) ||
    undefined;

  const passwordFromApi =
    pickPassword(nested) ||
    pickPassword(obj) ||
    deepFindPassword(raw) ||
    undefined;

  let result = enrichCreateTestResult({
    raw,
    username: nested.username
      ? String(nested.username)
      : nested.user
        ? String(nested.user)
        : undefined,
    // Prioriza senha da API; se não vier, usa a que enviamos
    password: passwordFromApi || chosenPassword,
    m3u: pickNestedString(nested, [
      "m3u",
      "m3u_url",
      "url_m3u",
      "link_m3u",
      "playlist",
      "playlist_url",
    ]),
    dnsSmarters: pickNestedString(nested, [
      "dns",
      "dns_smarters",
      "dnsSmarters",
      "dns_url",
    ]),
    message,
  });

  // Garante senha conhecida para montar M3U mesmo se a mensagem não trouxer
  if (!result.password) {
    result = { ...result, password: chosenPassword };
  }

  // Tenta ficha completa por id (pode trazer senha/exp)
  const remoteId = nested.id ?? obj.id ?? (obj.data as { id?: unknown } | undefined)?.id;
  if (remoteId != null && String(remoteId)) {
    try {
      const detail = await panelFetch(
        creds,
        `/users-iptv/${encodeURIComponent(String(remoteId))}`,
      );
      const detailPass = deepFindPassword(detail);
      result = enrichCreateTestResult({
        ...result,
        raw: detail ?? result.raw,
        password: detailPass || result.password || chosenPassword,
        message:
          result.message ||
          (typeof detail === "object" &&
          detail &&
          typeof (detail as { message?: unknown }).message === "string"
            ? String((detail as { message: string }).message)
            : undefined),
      });
    } catch {
      /* ignore */
    }
  }

  // Sempre devolve a senha enviada na criação se a API não ecoar outra
  const resolvedId =
    extractRemoteUserId(result.raw) ??
    (remoteId != null && String(remoteId)
      ? (remoteId as string | number)
      : undefined);
  let finalId = resolvedId;
  if (finalId == null && result.username) {
    try {
      const found = await findIptvUserByUsername(creds, result.username, {
        exactOnly: true,
      });
      if (found?.id != null) finalId = found.id;
    } catch {
      /* ignore */
    }
  }
  return {
    ...result,
    password: result.password?.trim() || chosenPassword,
    remoteId: finalId,
  };
}

/** Busca senha/dados de um usuário IPTV pelo login. */
export async function fetchIptvUserPassword(
  creds: IptvPanelCreds,
  username: string,
): Promise<string | null> {
  const remote = await findIptvUserByUsername(creds, username);
  if (!remote) return null;
  const fromList = remote.password || deepFindPassword(remote);
  if (fromList) return fromList;
  if (remote.id == null) return null;
  try {
    const detail = await panelFetch(
      creds,
      `/users-iptv/${encodeURIComponent(String(remote.id))}`,
    );
    return deepFindPassword(detail) || null;
  } catch {
    return null;
  }
}

/** Planos de renovação do painel (sem opção de 15 dias). */
export const IPTV_RENEW_OPTIONS = [
  { months: 1, credits: 1, label: "1 mês — 1 Crédito" },
  { months: 2, credits: 2, label: "2 meses — 2 Créditos" },
  { months: 3, credits: 3, label: "3 meses — 3 Créditos" },
  { months: 4, credits: 4, label: "4 meses — 4 Créditos" },
  { months: 6, credits: 5, label: "6 meses — 5 Créditos (Promoção)" },
  { months: 12, credits: 10, label: "12 meses — 10 Créditos (Promoção)" },
] as const;

export type IptvRenewOption = (typeof IPTV_RENEW_OPTIONS)[number];

/**
 * Estende cliente com 1 crédito (1 mês) — forma simples.
 * Uso: await extendClientOneMonth(creds, userId)
 */
export async function extendClientOneMonth(
  creds: IptvPanelCreds,
  remoteUserId: string | number,
): Promise<unknown> {
  try {
    const result = await renewIptvUser(creds, remoteUserId, {
      months: 1,
      credits: 1,
    });
    console.log(`[extendClientOneMonth] ✅ Cliente ${remoteUserId} estendido por 1 mês`);
    return result;
  } catch (error) {
    console.error(`[extendClientOneMonth] ❌ Erro ao estender cliente ${remoteUserId}:`, error);
    throw error;
  }
}

/**
 * Renova/estende usuário (Extend Line — consome crédito no painel).
 * No painel: action=1 + credits (= créditos gastos do plano, ex. 6m=5, 12m=10).
 * Algumas builds da UniPlay só aceitam PUT/PATCH em /users-iptv/{id} (POST → 405).
 *
 * No fluxo WhatsApp/PIX: chamar SOMENTE após status approved do Mercado Pago.
 */
export async function renewIptvUser(
  creds: IptvPanelCreds,
  remoteUserId: string | number,
  monthsOrOption: number | Pick<IptvRenewOption, "months" | "credits">,
): Promise<unknown> {
  const credits =
    typeof monthsOrOption === "number"
      ? Math.max(1, monthsOrOption)
      : Math.max(0.1, monthsOrOption.credits);
  const body: Record<string, unknown> = {
    action: 1,
    credits,
  };
  if (creds.regPassword?.trim()) {
    body.reg_password = creds.regPassword.trim();
  }
  const id = encodeURIComponent(String(remoteUserId));
  const path = `/users-iptv/${id}`;
  const payload = JSON.stringify(body);

  // UniPlay/Laravel: POST em /users-iptv/{id} costuma dar 405
  const methods = ["PUT", "PATCH", "POST"] as const;
  let lastError: Error | null = null;

  for (const method of methods) {
    try {
      return await panelFetch(creds, path, {
        method,
        body: payload,
      });
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const msg = lastError.message;
      const methodNotAllowed =
        /405|method is not supported|Method Not Allowed|não permitido|not supported for this route/i.test(
          msg,
        );
      if (methodNotAllowed) continue;
      throw lastError;
    }
  }

  throw (
    lastError ||
    new Error("Falha ao renovar/estender no UniPlay (método não aceito)")
  );
}

/**
 * Prorroga vencimento de usuário IPTV (+48h ou 23:59).
 * No painel UniPlay: action: 7 para +48h, action: 10 para 23:59.
 */
export async function prorrogaIptvUser(
  creds: IptvPanelCreds,
  remoteUserId: string | number,
  kind: "48h" | "23:59",
): Promise<unknown> {
  const action = kind === "48h" ? 7 : 10;
  const body: Record<string, unknown> = {
    action,
  };
  if (kind === "48h" && creds.regPassword?.trim()) {
    body.reg_password = creds.regPassword.trim();
  }

  const id = encodeURIComponent(String(remoteUserId));
  const path = `/users-iptv/${id}`;
  const payload = JSON.stringify(body);

  // UniPlay/Laravel: POST em /users-iptv/{id} costuma dar 405
  const methods = ["PUT", "PATCH", "POST"] as const;
  let lastError: Error | null = null;

  for (const method of methods) {
    try {
      return await panelFetch(creds, path, {
        method,
        body: payload,
      });
    } catch (e) {
      lastError = e instanceof Error ? e : new Error(String(e));
      const msg = lastError.message;
      const methodNotAllowed =
        /405|method is not supported|Method Not Allowed|não permitido|not supported for this route/i.test(
          msg,
        );
      if (methodNotAllowed) continue;
      throw lastError;
    }
  }

  throw (
    lastError ||
    new Error(`Falha ao prorrogar (${kind}) no UniPlay (método não aceito)`)
  );
}

/**
 * Pega o exp_date real do usuário após uma operação no painel.
 */
export async function fetchIptvExpDate(
  creds: IptvPanelCreds,
  remoteUserId: string | number,
): Promise<string | null> {
  const id = encodeURIComponent(String(remoteUserId));
  try {
    const data = await panelFetch<{ exp_date?: string }>(creds, `/users-iptv/${id}`, {
      method: "GET",
    });
    return data.exp_date || null;
  } catch {
    return null;
  }
}

/**
 * Apaga usuário IPTV no painel.
 * No front UniPlay: POST /users-iptv/{id} com
 * `{ action: 2, id_iptv, reg_password }` (a API NÃO aceita HTTP DELETE).
 */
export async function deleteIptvUser(
  creds: IptvPanelCreds,
  remoteUserId: string | number,
  opts?: {
    username?: string;
    /** id_iptv do painel (se diferente do id da linha) */
    idIptv?: string | number;
    nota?: string;
    isOficial?: boolean;
  },
): Promise<unknown> {
  const idRaw = String(remoteUserId);
  const id = encodeURIComponent(idRaw);
  const idIptv = opts?.idIptv ?? remoteUserId;
  const regPassword = creds.regPassword?.trim() || "";

  const body: Record<string, unknown> = {
    action: 2,
    id_iptv: idIptv,
  };
  if (regPassword) body.reg_password = regPassword;

  const attempts: Array<() => Promise<unknown>> = [
    // Formato oficial do painel (sendActionUserIPTV)
    () =>
      panelFetch(creds, `/users-iptv/${id}`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    // Sem id_iptv (algumas builds)
    () =>
      panelFetch(creds, `/users-iptv/${id}`, {
        method: "POST",
        body: JSON.stringify({
          action: 2,
          ...(regPassword ? { reg_password: regPassword } : {}),
        }),
      }),
  ];

  const stillExists = async () => {
    const user = opts?.username?.trim();
    if (!user) return null;
    const found = await findIptvUserByUsername(creds, user, { exactOnly: true });
    if (!found) return null;
    if (found.id != null && String(found.id) === idRaw) return found;
    if (found.id == null) return found;
    return null;
  };

  let lastError: unknown = null;
  let lastOk: unknown = null;
  for (const attempt of attempts) {
    try {
      lastOk = await attempt();
      if (opts?.username?.trim()) {
        const still = await stillExists();
        if (!still) return lastOk;
        lastError = new Error(
          `Usuário ${opts.username} ainda aparece no UniPlay após exclusão`,
        );
        continue;
      }
      return lastOk;
    } catch (e) {
      lastError = e;
    }
  }

  if (opts?.username?.trim()) {
    const still = await stillExists();
    if (!still && lastOk != null) return lastOk;
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("Falha ao apagar usuário no UniPlay");
}

/**
 * Recria a linha de um usuário no painel (sem gastar crédito).
 * Não altera: criado em, telefone, vencimento.
 * Apenas recria a linha.
 */
export async function recreateIptvLine(
  creds: IptvPanelCreds,
  remoteUserId: string | number,
): Promise<unknown> {
  const id = encodeURIComponent(String(remoteUserId));

  try {
    const result = await panelFetch(creds, `/recreate-line/${id}`, {
      method: "PUT",
      body: "",
    });
    return result;
  } catch (e) {
    throw new Error(
      `Falha ao recriar linha do usuário. ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

/**
 * Limpa testes na UniPlay.
 * 1) Endpoint oficial: /clean-trials { range }
 *    (a API GES rejeita POST nesse path — aceita DELETE/PUT/PATCH)
 * 2) Fallback: apaga um a um com action:2 (só testes confirmados)
 */
export async function deleteAllIptvTests(
  creds: IptvPanelCreds,
): Promise<{ deleted: number; failed: number; total: number }> {
  const allBefore = await listIptvUsers(creds);
  const activeIdsBefore = new Set(
    allBefore
      .filter((u) => !isConfirmedIptvTestUser(u))
      .map((u) => String(u.id))
      .filter((id) => id && id !== "undefined"),
  );

  const tests = allBefore.filter((u) => isConfirmedIptvTestUser(u));
  const initialTotal = tests.length;

  const assertActivesIntact = async () => {
    const allAfter = await listIptvUsers(creds);
    const activeIdsAfter = new Set(
      allAfter
        .filter((u) => !isConfirmedIptvTestUser(u))
        .map((u) => String(u.id))
        .filter((id) => id && id !== "undefined"),
    );
    for (const id of activeIdsBefore) {
      if (!activeIdsAfter.has(id)) {
        throw new Error(
          `Abortado: cliente ativo (id ${id}) sumiu da lista. Verifique o UniPlay imediatamente.`,
        );
      }
    }
    return allAfter;
  };

  // Painel: cleanTrials({ range }) → URL /api/clean-trials
  // range 2/3 = botões “Limpar testes”; 6 aparece em settings
  const cleanMethods = ["DELETE", "PUT", "PATCH"] as const;
  for (const range of [2, 3, 6, 1]) {
    for (const method of cleanMethods) {
      try {
        await panelFetch(creds, "/clean-trials", {
          method,
          body: JSON.stringify({ range }),
        });
        const after = await assertActivesIntact();
        const still = after.filter((u) => isConfirmedIptvTestUser(u)).length;
        if (still === 0) {
          return {
            deleted: initialTotal,
            failed: 0,
            total: initialTotal,
          };
        }
      } catch (e) {
        if (e instanceof Error && /Abortado:/.test(e.message)) throw e;
        /* tenta outro método / range / fallback */
      }
    }
  }

  if (tests.length === 0) {
    await assertActivesIntact().catch(() => undefined);
    return { deleted: 0, failed: 0, total: 0 };
  }

  let deleted = 0;
  let failed = 0;
  for (const t of tests) {
    const username = String(t.username || t.user || "").trim();
    if (t.id == null || t.id === "") {
      failed += 1;
      continue;
    }
    if (!isConfirmedIptvTestUser(t)) continue;
    if (activeIdsBefore.has(String(t.id))) continue;

    const row = t as Record<string, unknown>;
    const idIptv = row.id_iptv ?? row.idIptv ?? t.id;
    try {
      await deleteIptvUser(creds, t.id, {
        username: username || undefined,
        idIptv: idIptv as string | number,
      });
      deleted += 1;
    } catch {
      failed += 1;
    }
  }

  try {
    const after = await assertActivesIntact();
    const still = after.filter((u) => isConfirmedIptvTestUser(u)).length;
    if (still > 0) {
      failed = Math.max(failed, still);
      deleted = Math.max(0, initialTotal - still);
    } else {
      deleted = initialTotal;
      failed = 0;
    }
  } catch (e) {
    if (e instanceof Error && /Abortado:/.test(e.message)) throw e;
  }

  return { deleted, failed, total: initialTotal };
}

/** Texto do comprovante enviado ao cliente (sem senha). */
export function buildRenewalReceiptMessage(
  username: string,
  dueDateFormatted: string,
): string {
  return [
    "✅ *Pagamento confirmado!*",
    "",
    "Comprovante de renovação",
    `Usuário: *${username}*`,
    "Renovação/extensão concluída com sucesso!",
    "",
    `Novo vencimento: *${dueDateFormatted}*`,
    "",
    "Bom proveito! Qualquer dúvida, é só chamar.",
  ].join("\n");
}

/**
 * Saudação baseada na hora do dia (Bom dia/Boa tarde/Boa noite).
 */
function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Constrói mensagem de prorrogação usando template configurável.
 */
export function buildProrrogaMessage(
  name: string,
  itemId: string,
  oldDue: string,
  newDue: string,
  kind: "48h" | "23:59",
  template?: string,
): string {
  // Carrega configurações do usuário ou usa template padrão
  const settings = template || DEFAULT_PRORROGA_MESSAGE;

  const kindText = kind === "48h" ? "+48 horas" : "23:59 (mesmo dia)";
  const oldDueFormatted = formatBrDate(oldDue);
  const newDueFormatted = formatBrDate(newDue);

  // Substitui variáveis
  return settings
    .replace(/{getGreeting}/g, getGreeting())
    .replace(/{name}/g, name)
    .replace(/{item_id}/g, itemId)
    .replace(/{due_date}/g, oldDueFormatted)
    .replace(/{new_due}/g, newDueFormatted)
    .replace(/{prorroga_type}/g, kindText);
}

/** Comprovante de recarga de créditos para revendedor. */
export function buildResellerCreditsReceiptMessage(
  username: string,
  credits: number,
  amountBrl?: number,
): string {
  const amountLine =
    amountBrl != null && Number.isFinite(amountBrl) && amountBrl > 0
      ? `\nValor: *R$ ${amountBrl.toLocaleString("pt-BR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}*`
      : "";
  return [
    "✅ *Pagamento confirmado!*",
    "",
    "Recarga de créditos liberada.",
    `Login: *${username}*`,
    `Créditos creditados: *${credits}*${amountLine}`,
    "",
    "Já pode usar no painel. Qualquer dúvida, é só chamar.",
  ].join("\n");
}

/** Aviso ao cliente/revendedor quando o PIX pagou mas a liberação falhou. */
export function buildReleaseFailedClientMessage(
  username: string,
  kind: "renew" | "reseller_credits" | "test_activate" | string,
): string {
  const what =
    kind === "reseller_credits"
      ? "sua recarga de créditos"
      : kind === "test_activate"
        ? "a liberação do plano"
        : "sua renovação";
  return [
    "⚠️ *Pagamento recebido*",
    "",
    `Seu PIX foi confirmado, mas houve um problema ao concluir ${what}` +
      (username ? ` (*${username}*)` : "") +
      ".",
    "",
    "Já encaminhei para um *atendente* — em breve alguém responde por aqui.",
  ].join("\n");
}

export async function fetchIptvPackages(
  creds: IptvPanelCreds,
): Promise<IptvPackage[]> {
  const data = await panelFetch(creds, "/get-iptv-packages");
  return asArray(data).map((row) => {
    const o = (row || {}) as Record<string, unknown>;
    return {
      ...o,
      id: (o.id ?? o.package ?? o.value) as string | number,
      name: o.name ? String(o.name) : o.label ? String(o.label) : undefined,
    };
  });
}

export type IptvPanelCredits = {
  /** Créditos do revendedor (saldo principal no painel). */
  credits: number;
  /** Créditos de portal / recarga, se a API enviar. */
  creditsPortal?: number;
};

function pickCreditNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const n = Number(value.replace(",", "."));
    if (Number.isFinite(n)) return n;
  }
  return null;
}

/** Extrai saldo de créditos da resposta (ou objetos aninhados). */
export function extractIptvCredits(data: unknown): IptvPanelCredits | null {
  if (data == null) return null;
  if (typeof data === "number" && Number.isFinite(data)) {
    return { credits: data };
  }
  if (typeof data !== "object") return null;

  const root = data as Record<string, unknown>;
  const nest =
    root.data && typeof root.data === "object"
      ? (root.data as Record<string, unknown>)
      : root;
  // Front UniPlay valida transferência com dash.credits
  const dash =
    nest.dash && typeof nest.dash === "object"
      ? (nest.dash as Record<string, unknown>)
      : root.dash && typeof root.dash === "object"
        ? (root.dash as Record<string, unknown>)
        : null;

  const credits =
    pickCreditNumber(dash?.credits) ??
    pickCreditNumber(nest.credits) ??
    pickCreditNumber(nest.credit) ??
    pickCreditNumber(nest.creditos) ??
    pickCreditNumber(nest.saldo) ??
    pickCreditNumber(root.credits);

  if (credits == null) return null;

  const creditsPortal =
    pickCreditNumber(dash?.creditos_portal) ??
    pickCreditNumber(dash?.creditPortal) ??
    pickCreditNumber(nest.creditos_portal) ??
    pickCreditNumber(nest.creditPortal) ??
    pickCreditNumber(nest.credit_portal) ??
    pickCreditNumber(root.creditos_portal) ??
    undefined;

  return {
    credits,
    ...(creditsPortal != null ? { creditsPortal } : {}),
  };
}

/** Formata créditos para exibição (pt-BR). */
export function formatIptvCredits(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return value.toLocaleString("pt-BR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

/**
 * Saldo de créditos do revendedor na UniPlay.
 * Front do painel: GET {api}/recargas/credits (e fallback /dash-reseller).
 */
export async function fetchIptvPanelCredits(
  creds: IptvPanelCreds,
): Promise<IptvPanelCredits> {
  const paths = ["/recargas/credits", "/dash-reseller"];
  let lastErr: unknown;
  for (const path of paths) {
    try {
      const data = await panelFetch(creds, path);
      const parsed = extractIptvCredits(data);
      if (parsed) return parsed;
      lastErr = new Error(`Resposta sem créditos em ${path}`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error("A UniPlay não retornou o saldo de créditos.");
}

/** Apps parceiros do painel (ativação por MAC / Device ID). */
export type PartnerAppId = "prime" | "fun" | "pixel" | "lazer";

export const PARTNER_APPS: {
  id: PartnerAppId;
  label: string;
  /** Campo enviado à API */
  deviceField: "mac" | "deviceId";
  /** Tamanho típico do identificador */
  hint: string;
}[] = [
  {
    id: "prime",
    label: "Prime",
    deviceField: "mac",
    hint: "MAC com 17 caracteres (aa:bb:cc:dd:ee:ff)",
  },
  {
    id: "fun",
    label: "Fun Play",
    deviceField: "mac",
    hint: "MAC com 17 caracteres (aa:bb:cc:dd:ee:ff)",
  },
  {
    id: "pixel",
    label: "Pixel Player",
    deviceField: "deviceId",
    hint: "Device ID do app (mín. 10 caracteres)",
  },
  {
    id: "lazer",
    label: "Lazer Play",
    deviceField: "mac",
    hint: "MAC com 17 caracteres (aa:bb:cc:dd:ee:ff)",
  },
];

const ACTIVATE_PATH: Record<PartnerAppId, string> = {
  prime: "/activate-prime",
  fun: "/activate-fun",
  pixel: "/activate-pixel",
  lazer: "/activate-lazer",
};

/** Só hex do MAC (máx. 12), ignora `:` e outros separadores. Mantém maiúsculas/minúsculas. */
export function macHexDigits(raw: string): string {
  return raw.replace(/[^a-fA-F0-9]/g, "").slice(0, 12);
}

/** Normaliza MAC: aceita com/sem separadores → aa:bb:cc:dd:ee:ff (preserva caixa). */
export function normalizeMac(raw: string): string {
  const hex = macHexDigits(raw);
  if (hex.length === 12) {
    return hex.match(/.{2}/g)!.join(":");
  }
  return raw.trim();
}

/** Formata enquanto digita: xx:xx:xx:xx:xx:xx (máx. 12 hex, preserva A–F). */
export function formatMacInput(raw: string): string {
  const hex = macHexDigits(raw);
  return hex.match(/.{1,2}/g)?.join(":") ?? "";
}

/** Posição do cursor no MAC formatado após N dígitos hex. */
export function macCaretAfterHex(formatted: string, hexCount: number): number {
  if (hexCount <= 0) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (formatted[i] === ":") continue;
    seen++;
    if (seen >= hexCount) {
      // após par completo, cursor fica depois do `:` automático
      if (formatted[i + 1] === ":") return i + 2;
      return i + 1;
    }
  }
  return formatted.length;
}

/** Registro de MAC/app (Smart App no painel e/ou ativação parceira local). */
export type SmartAppEntry = {
  id: string | number;
  username: string;
  mac: string;
  idDevice: string;
  app: string | number;
  appLabel: string;
  /** Apelido local (SALA, QUARTO…) */
  nickname?: string;
  /** true = veio do /activate-* (não aparece só no Smart App) */
  localOnly?: boolean;
  source?: "smart-app" | "partner";
};

const PARTNER_APPS_LOCAL_KEY = "auxplus-partner-apps";
const DEVICE_NICK_KEY = "auxplus-device-nicknames";

type LocalPartnerApp = {
  id: string;
  username: string;
  mac: string;
  idDevice: string;
  app: PartnerAppId;
  appLabel: string;
  nickname?: string;
  createdAt: string;
};

function loadLocalPartnerApps(): LocalPartnerApp[] {
  try {
    const raw = localStorage.getItem(PARTNER_APPS_LOCAL_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as LocalPartnerApp[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalPartnerApps(rows: LocalPartnerApp[]) {
  localStorage.setItem(PARTNER_APPS_LOCAL_KEY, JSON.stringify(rows.slice(0, 500)));
}

function loadDeviceNicknames(): Record<string, string> {
  try {
    const raw = localStorage.getItem(DEVICE_NICK_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, string>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDeviceNicknames(map: Record<string, string>) {
  localStorage.setItem(DEVICE_NICK_KEY, JSON.stringify(map));
}

/** Chave estável p/ apelido: usuário + MAC/device. */
export function deviceNicknameKey(
  username: string,
  mac: string,
  idDevice: string,
): string {
  const device = (mac || idDevice).trim().toLowerCase();
  return `${username.trim().toLowerCase()}|${device}`;
}

export function getDeviceNickname(
  username: string,
  mac: string,
  idDevice: string,
): string {
  const key = deviceNicknameKey(username, mac, idDevice);
  if (!key.endsWith("|") && key.includes("|")) {
    return loadDeviceNicknames()[key]?.trim() || "";
  }
  return "";
}

/** Define ou limpa apelido do MAC/device (SALA, QUARTO…). */
export function setDeviceNickname(
  username: string,
  mac: string,
  idDevice: string,
  nickname: string,
): string {
  const key = deviceNicknameKey(username, mac, idDevice);
  const clean = nickname.trim().slice(0, 32);
  const map = loadDeviceNicknames();
  if (!clean) delete map[key];
  else map[key] = clean;
  saveDeviceNicknames(map);

  // Mantém sincronizado no registro local da ativação, se existir
  const device = (mac || idDevice).trim().toLowerCase();
  const rows = loadLocalPartnerApps().map((r) => {
    const sameUser = r.username.toLowerCase() === username.trim().toLowerCase();
    const sameDevice = (r.mac || r.idDevice).toLowerCase() === device;
    if (!sameUser || !sameDevice) return r;
    return { ...r, nickname: clean || undefined };
  });
  saveLocalPartnerApps(rows);
  return clean;
}

function withNickname(entry: SmartAppEntry): SmartAppEntry {
  const nick =
    entry.nickname?.trim() ||
    getDeviceNickname(entry.username, entry.mac, entry.idDevice);
  return nick ? { ...entry, nickname: nick } : { ...entry, nickname: "" };
}

function partnerLocalId(
  app: PartnerAppId,
  username: string,
  device: string,
): string {
  return `local:${app}:${username.trim().toLowerCase()}:${device.trim().toLowerCase()}`;
}

/** Guarda ativação parceira localmente (activate-* não entra no Smart App). */
export function rememberPartnerAppActivation(opts: {
  app: PartnerAppId;
  username: string;
  device: string;
  nickname?: string;
}): SmartAppEntry {
  const meta = PARTNER_APPS.find((a) => a.id === opts.app);
  const username = opts.username.trim();
  let mac = "";
  let idDevice = "";
  if (meta?.deviceField === "mac") {
    mac = normalizeMac(opts.device);
  } else {
    idDevice = opts.device.trim();
  }
  const id = partnerLocalId(opts.app, username, mac || idDevice);
  const existing = loadLocalPartnerApps().find((r) => r.id === id);
  const nickname = (
    opts.nickname?.trim() ||
    existing?.nickname ||
    getDeviceNickname(username, mac, idDevice) ||
    ""
  ).slice(0, 32);
  if (nickname) setDeviceNickname(username, mac, idDevice, nickname);

  const entry: LocalPartnerApp = {
    id,
    username,
    mac,
    idDevice,
    app: opts.app,
    appLabel: meta?.label || opts.app,
    nickname: nickname || undefined,
    createdAt: existing?.createdAt || new Date().toISOString(),
  };
  const prev = loadLocalPartnerApps().filter((r) => r.id !== id);
  saveLocalPartnerApps([entry, ...prev]);
  return {
    id: entry.id,
    username: entry.username,
    mac: entry.mac,
    idDevice: entry.idDevice,
    app: entry.app,
    appLabel: entry.appLabel,
    nickname: entry.nickname || "",
    localOnly: true,
    source: "partner",
  };
}

export function removeLocalPartnerApp(id: string | number) {
  const sid = String(id);
  if (!sid.startsWith("local:")) return;
  saveLocalPartnerApps(loadLocalPartnerApps().filter((r) => r.id !== sid));
}

function listLocalPartnerAppsForUsername(username: string): SmartAppEntry[] {
  const want = username.trim().toLowerCase();
  if (!want) return [];
  return loadLocalPartnerApps()
    .filter((r) => r.username.toLowerCase() === want)
    .map((r) =>
      withNickname({
        id: r.id,
        username: r.username,
        mac: r.mac,
        idDevice: r.idDevice,
        app: r.app,
        appLabel: r.appLabel,
        nickname: r.nickname || "",
        localOnly: true,
        source: "partner" as const,
      }),
    );
}

function pickNestedUsername(row: Record<string, unknown>): string {
  if (row.iptv && typeof row.iptv === "object") {
    const iptv = row.iptv as Record<string, unknown>;
    if (typeof iptv.username === "string" && iptv.username.trim()) {
      return iptv.username.trim();
    }
    if (typeof iptv.user === "string" && iptv.user.trim()) {
      return iptv.user.trim();
    }
  }
  if (typeof row.username === "string" && row.username.trim()) {
    return row.username.trim();
  }
  if (typeof row.user === "string" && row.user.trim()) return row.user.trim();
  // username numérico no root → tenta iptv aninhado já tratado
  if (typeof row.username === "number") return String(row.username);
  return "";
}

function normalizeSmartApp(
  row: Record<string, unknown>,
  index = 0,
): SmartAppEntry | null {
  const mac = String(row.mac ?? "").trim();
  const idDevice = String(
    row.id_device ?? row.idDevice ?? row.deviceId ?? row.device_id ?? "",
  ).trim();
  const username = pickNestedUsername(row);
  if (!mac && !idDevice && !username) return null;

  const id =
    row.id ??
    row.user_id ??
    row.uid ??
    `${username || "u"}:${mac || idDevice || index}`;
  const app = (row.app ?? row.app_id ?? row.appId ?? "") as string | number;
  const appLabel = String(
    row.app_name ??
      row.appName ??
      row.name_app ??
      row.label ??
      (app !== "" && app != null ? `App ${app}` : "Smart App"),
  );
  return {
    id: id as string | number,
    username,
    mac,
    idDevice,
    app,
    appLabel,
    localOnly: false,
    source: "smart-app",
  };
}

/** Lista todos os MACs/apps cadastrados no painel (Smart App). */
export async function listSmartApps(
  creds: IptvPanelCreds,
): Promise<SmartAppEntry[]> {
  const data = await panelFetch(creds, "/users-smart-app");
  return asArray(data)
    .map((row, i) =>
      normalizeSmartApp((row || {}) as Record<string, unknown>, i),
    )
    .filter((x): x is SmartAppEntry => Boolean(x));
}

function usernameMatches(entryUser: string, want: string): boolean {
  const a = entryUser.trim().toLowerCase();
  const b = want.trim().toLowerCase();
  if (!b) return false;
  if (!a) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/** Lista MACs/apps de um usuário IPTV (Smart App + ativações parceiras locais). */
export async function listSmartAppsForUsername(
  creds: IptvPanelCreds,
  username: string,
): Promise<SmartAppEntry[]> {
  const want = username.trim();
  if (!want) return [];
  const local = listLocalPartnerAppsForUsername(want);
  let remote: SmartAppEntry[] = [];
  try {
    const all = await listSmartApps(creds);
    remote = all.filter((e) => usernameMatches(e.username, want));
  } catch {
    // Se o Smart App falhar, ainda mostra as ativações locais
  }

  const seen = new Set<string>();
  const merged: SmartAppEntry[] = [];
  for (const row of [...remote, ...local]) {
    const key = `${String(row.app).toLowerCase()}|${(row.mac || row.idDevice).toLowerCase()}|${row.username.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(withNickname(row));
  }
  return merged;
}

/** Remove um MAC/app: Smart App no painel e/ou registro local. */
export async function deleteSmartApp(
  creds: IptvPanelCreds,
  id: string | number,
): Promise<unknown> {
  if (id == null || id === "") throw new Error("ID do app inválido");
  const sid = String(id);
  if (sid.startsWith("local:")) {
    removeLocalPartnerApp(sid);
    return { ok: true, local: true };
  }
  const result = await panelFetch(
    creds,
    `/users-smart-app/${encodeURIComponent(sid)}`,
    { method: "DELETE" },
  );
  return result;
}

/**
 * Ativa app parceiro no painel.
 * Body: { username, password, mac } ou { username, password, deviceId } (Pixel).
 */
export async function activatePartnerApp(
  creds: IptvPanelCreds,
  opts: {
    app: PartnerAppId;
    username: string;
    password: string;
    /** MAC ou Device ID conforme o app */
    device: string;
  },
): Promise<unknown> {
  const username = opts.username.trim();
  const password = opts.password;
  if (!username || !password) {
    throw new Error("Informe usuário e senha IPTV do cliente");
  }

  const meta = PARTNER_APPS.find((a) => a.id === opts.app);
  if (!meta) throw new Error("App inválido");

  let device = opts.device.trim();
  if (!device) {
    throw new Error(
      meta.deviceField === "mac" ? "Informe o MAC" : "Informe o Device ID",
    );
  }

  if (meta.deviceField === "mac") {
    device = normalizeMac(device);
    if (device.length !== 17) {
      throw new Error(
        "MAC inválido. Use o formato aa:bb:cc:dd:ee:ff (17 caracteres).",
      );
    }
  } else if (device.length < 10) {
    throw new Error("Device ID muito curto (mínimo 10 caracteres).");
  }

  const body =
    meta.deviceField === "mac"
      ? { username, password, mac: device }
      : { username, password, deviceId: device };

  try {
    return await panelFetch(creds, ACTIVATE_PATH[opts.app], {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (e) {
    const raw = e instanceof Error ? e.message : String(e);
    const looksHtml = /<\/?html|503\s*Backend|Backend fetch failed/i.test(raw);
    const looksGateway =
      /\b503\b|\b502\b|\b504\b|Bad Gateway|Service Unavailable|fetch failed/i.test(
        raw,
      );
    if (looksHtml || looksGateway) {
      const others = PARTNER_APPS.filter((a) => a.id !== opts.app)
        .map((a) => a.label)
        .join(", ");
      throw new Error(
        `Não foi possível ativar no ${meta.label}. Confira se o app escolhido está certo (este MAC pode ser de outro: ${others}). Se já estiver no app certo, tente de novo em instantes.`,
      );
    }
    // Mensagens curtas do painel — reforça checagem do app
    if (
      /não\s+encontr|invalid|inválid|mac|device|não\s+existe|wrong|incorret/i.test(
        raw,
      )
    ) {
      throw new Error(
        `${raw.replace(/<[^>]+>/g, "").slice(0, 180)} — confira se selecionou o app certo (${meta.label}).`,
      );
    }
    // HTML genérico: limpa e avisa
    if (/<[^>]+>/.test(raw)) {
      throw new Error(
        `Falha ao ativar no ${meta.label}. Verifique se o app selecionado está correto e tente novamente.`,
      );
    }
    throw e instanceof Error ? e : new Error(raw);
  }
}
