/**
 * API interna do painel (gesapioffice) usada pelo front searchdefense.
 * Dev: proxy Vite /ges-api. Produção: Edge Function Supabase (ges-api).
 */

import { SUPABASE_ANON_KEY } from "@/integrations/supabase/client";

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
  [k: string]: unknown;
};

export type CreateTestResult = {
  raw: unknown;
  username?: string;
  password?: string;
  message?: string;
};

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

function resolveBase(apiBaseUrl: string, apiProxyUrl?: string) {
  const custom = apiProxyUrl?.trim().replace(/\/$/, "");
  if (custom) {
    // Proxy externo (ngrok) — path via header x-iptv-path
    return custom;
  }

  const configured = (apiBaseUrl || "https://gesapioffice.com/api").replace(
    /\/$/,
    "",
  );
  if (!shouldUseGesProxy(configured)) return configured;

  // Dev: proxy do Vite (sai pelo seu IP — a API aceita)
  if (typeof window !== "undefined" && import.meta.env.DEV) {
    return "/ges-api";
  }
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
  // Ngrok free: evita página intermediária HTML
  if (/ngrok/i.test(base)) {
    h["ngrok-skip-browser-warning"] = "true";
  }
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
    const o = data as { message?: unknown; error?: unknown; msg?: unknown };
    const msg = o.message ?? o.error ?? o.msg;
    if (msg != null && String(msg).trim()) return String(msg).trim();
  }
  const raw = text?.trim();
  if (raw) {
    try {
      const once = JSON.parse(raw);
      if (typeof once === "string" && once.trim()) return once.trim();
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
  const loginUrl = isPathHeaderProxy(base) ? base : `${base}${loginPath}`;

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
  const url = isPathHeaderProxy(base) ? base : `${base}${p}`;
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
    const msg =
      typeof data === "object" &&
      data &&
      ("message" in data || "error" in data || "msg" in data)
        ? String(
            (data as { message?: unknown; error?: unknown; msg?: unknown })
              .message ??
              (data as { error?: unknown }).error ??
              (data as { msg?: unknown }).msg,
          )
        : text || res.statusText;
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        "Token inválido ou expirado. Salve usuário/senha do painel ou cole um Bearer novo.",
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
  ]) {
    const v = u[k];
    if (typeof v === "string" && v.trim()) return v;
  }
  // às vezes vem aninhado em infos
  if (u.infos && typeof u.infos === "object") {
    return pickPassword(u.infos as Record<string, unknown>);
  }
  return undefined;
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
  };
}

/** Converte exp_date do painel → yyyy-MM-dd (ou null). */
export function parseIptvExpToYmd(
  raw: string | null | undefined,
): string | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const br = s.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/);
  if (br) {
    const d = br[1].padStart(2, "0");
    const m = br[2].padStart(2, "0");
    return `${br[3]}-${m}-${d}`;
  }
  const n = Number(s);
  if (Number.isFinite(n) && n > 1e9) {
    const ms = n > 1e12 ? n : n * 1000;
    const dt = new Date(ms);
    if (!Number.isNaN(dt.getTime())) {
      const y = dt.getFullYear();
      const mo = String(dt.getMonth() + 1).padStart(2, "0");
      const day = String(dt.getDate()).padStart(2, "0");
      return `${y}-${mo}-${day}`;
    }
  }
  const iso = new Date(s);
  if (!Number.isNaN(iso.getTime())) {
    const y = iso.getFullYear();
    const mo = String(iso.getMonth() + 1).padStart(2, "0");
    const day = String(iso.getDate()).padStart(2, "0");
    return `${y}-${mo}-${day}`;
  }
  return null;
}

/**
 * Detecta linha de teste/trial no painel (não sincronizar no AuxPlus).
 * Heurística: flags, test_hours, nota/nome com “teste”, ou vida útil menor que 3 dias.
 */
export function isIptvTestOrTrialUser(
  u: IptvRemoteUser | Record<string, unknown>,
): boolean {
  const row = u as Record<string, unknown>;
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

/** Lista usuários IPTV no painel. */
export async function listIptvUsers(
  creds: IptvPanelCreds,
  opts?: { /** Se true, omite testes/trials */ activeOnly?: boolean },
): Promise<IptvRemoteUser[]> {
  const q = creds.regPassword?.trim()
    ? `?reg_password=${encodeURIComponent(creds.regPassword.trim())}`
    : "";
  const data = await panelFetch(creds, `/users-iptv${q}`);
  let users = asArray(data).map((row) =>
    pickUserFields((row || {}) as Record<string, unknown>),
  );
  if (opts?.activeOnly) {
    users = users.filter((u) => !isIptvTestOrTrialUser(u));
  }
  return users;
}

export async function findIptvUserByUsername(
  creds: IptvPanelCreds,
  username: string,
): Promise<IptvRemoteUser | null> {
  const want = username.trim().toLowerCase();
  if (!want) return null;
  const users = await listIptvUsers(creds);
  return (
    users.find((u) => String(u.username || "").toLowerCase() === want) ||
    users.find((u) => String(u.username || "").toLowerCase().includes(want)) ||
    null
  );
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
  },
): Promise<CreateTestResult> {
  const body: Record<string, unknown> = {
    isOficial: false,
    package: String(opts.packageId || creds.defaultPackage || "1"),
    credits: opts.credits ?? 1,
    isCustomPackage: false,
    nota: opts.nota?.trim() || "teste auxplus",
    test_hours: String(Math.max(1, Math.min(6, Number(opts.testHours) || 6))),
    whatsapp: opts.whatsapp?.trim() || "",
    bouquets: [] as string[],
  };
  const desiredUser = opts.username?.trim();
  if (desiredUser) body.username = desiredUser;
  if (creds.regPassword?.trim()) {
    body.reg_password = creds.regPassword.trim();
  }
  const raw = await panelFetch(creds, "/users-iptv", {
    method: "POST",
    body: JSON.stringify(body),
  });

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

  return {
    raw,
    username: nested.username
      ? String(nested.username)
      : nested.user
        ? String(nested.user)
        : undefined,
    password: nested.password ? String(nested.password) : undefined,
    message:
      typeof obj.message === "string"
        ? obj.message
        : typeof obj.msg === "string"
          ? obj.msg
          : undefined,
  };
}

/**
 * Renova usuário existente.
 * No painel: action=1 + credits (meses), em /users-iptv/{id}
 */
export async function renewIptvUser(
  creds: IptvPanelCreds,
  remoteUserId: string | number,
  months: number,
): Promise<unknown> {
  const body = {
    action: 1,
    credits: Math.max(1, months),
  };
  const id = encodeURIComponent(String(remoteUserId));
  try {
    return await panelFetch(creds, `/users-iptv/${id}`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  } catch (e1) {
    try {
      return await panelFetch(creds, `/users-iptv/${id}`, {
        method: "PUT",
        body: JSON.stringify(body),
      });
    } catch {
      throw e1;
    }
  }
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

/** Normaliza MAC: aceita com/sem separadores → aa:bb:cc:dd:ee:ff */
export function normalizeMac(raw: string): string {
  const hex = raw.replace(/[^a-fA-F0-9]/g, "").toLowerCase();
  if (hex.length === 12) {
    return hex.match(/.{2}/g)!.join(":");
  }
  return raw.trim().toLowerCase();
}

/** Formata enquanto digita: xx:xx:xx:xx:xx:xx (máx. 12 hex, minúsculas). */
export function formatMacInput(raw: string): string {
  const hex = raw.replace(/[^a-fA-F0-9]/g, "").toLowerCase().slice(0, 12);
  return hex.match(/.{1,2}/g)?.join(":") ?? "";
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
