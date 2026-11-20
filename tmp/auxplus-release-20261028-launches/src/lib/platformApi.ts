import { supabase } from "@/integrations/supabase/client";

export interface EvolutionPlatformConfig {
  apiBaseUrl: string;
  apiKey: string;
  /** Prefixo da instância; por usuário vira `{prefix}-{userId}` */
  instancePrefix: string;
}

const LOCAL_KEY = "auxplus-platform-evolution";
const DB_KEY = "evolution_api";

export function defaultEvolutionPlatformConfig(): EvolutionPlatformConfig {
  return {
    apiBaseUrl: import.meta.env.VITE_EVOLUTION_API_URL?.trim() || "",
    apiKey: import.meta.env.VITE_EVOLUTION_API_KEY?.trim() || "",
    instancePrefix: "auxplus",
  };
}

function readLocal(): EvolutionPlatformConfig {
  const base = defaultEvolutionPlatformConfig();
  try {
    const raw = localStorage.getItem(LOCAL_KEY);
    if (!raw) return base;
    return { ...base, ...(JSON.parse(raw) as Partial<EvolutionPlatformConfig>) };
  } catch {
    return base;
  }
}

function writeLocal(config: EvolutionPlatformConfig) {
  localStorage.setItem(LOCAL_KEY, JSON.stringify(config));
}

/** Carrega config da Evolution (Supabase se existir; senão local). */
export async function loadEvolutionPlatformConfig(): Promise<EvolutionPlatformConfig> {
  const fallback = readLocal();
  if (!supabase) return fallback;
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", DB_KEY)
      .maybeSingle();
    if (error || !data?.value) return fallback;
    const value =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as Partial<EvolutionPlatformConfig>)
        : (data.value as Partial<EvolutionPlatformConfig>);
    const merged = { ...fallback, ...value };
    writeLocal(merged);
    return merged;
  } catch {
    return fallback;
  }
}

/** Salva config (admin). Tenta Supabase e sempre grava local. */
export async function saveEvolutionPlatformConfig(
  config: EvolutionPlatformConfig,
): Promise<{ ok: boolean; warning?: string }> {
  writeLocal(config);
  if (!supabase) {
    return {
      ok: true,
      warning:
        "Salvo só neste navegador (Supabase indisponível). Rode a migration platform_settings para sincronizar.",
    };
  }
  try {
    const { error } = await supabase.from("platform_settings").upsert(
      {
        key: DB_KEY,
        value: config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) {
      return {
        ok: true,
        warning: `Salvo localmente. Supabase: ${error.message}. Aplique legacy/migrate-platform-settings.sql`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: true,
      warning:
        e instanceof Error
          ? e.message
          : "Salvo localmente; falha ao gravar no Supabase.",
    };
  }
}

export function instanceNameForUser(
  prefix: string,
  userId: string,
  username?: string,
) {
  const base = (prefix || "auxplus").replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  const id = String(userId).replace(/[^a-zA-Z0-9]/g, "").slice(0, 16);
  const user = String(username || "")
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(0, 12);
  return `${base}-${user || "u"}${id}`.slice(0, 60);
}

export function isEvolutionConfigured(config: EvolutionPlatformConfig) {
  return Boolean(config.apiBaseUrl?.trim() && config.apiKey?.trim());
}

/** Config global UniPlay / painel IPTV (só admin). */
export interface IptvPlatformConfig {
  apiBaseUrl: string;
  packageId: string;
  regPassword: string;
  panelUrl: string;
  /**
   * Proxy HTTP que injeta Origin do painel (obrigatório em produção).
   * Ex.: https://xxxx.ngrok-free.app  (rodando scripts/ges-proxy-server.mjs)
   * Vazio = /api/gesapi na Vercel ou /ges-api no Vite.
   */
  apiProxyUrl: string;
  /** DNS Smarters padrão (ex.: http://blushes.top). */
  dnsSmarters: string;
  /** Host da lista M3U (ex.: http://ibetsa.top) — diferente do DNS Smarters. */
  m3uHost: string;
}

const IPTV_LOCAL_KEY = "auxplus-platform-iptv";
const IPTV_DB_KEY = "iptv_panel";

/** URL padrão do front do painel (botão Abrir painel). */
export const DEFAULT_IPTV_PANEL_URL = "https://searchdefense.top/#/login";

export function defaultIptvPlatformConfig(): IptvPlatformConfig {
  return {
    apiBaseUrl: "https://gesapioffice.com/api",
    packageId: "1",
    regPassword: "",
    panelUrl: DEFAULT_IPTV_PANEL_URL,
    apiProxyUrl: "",
    dnsSmarters: "http://blushes.top",
    m3uHost: "http://ibetsa.top",
  };
}

function pickPanelUrl(raw: Partial<IptvPlatformConfig> & Record<string, unknown>) {
  const fromKeys = [
    raw.panelUrl,
    raw.panel_url,
    raw.iptvPanelUrl,
    raw.url,
  ];
  for (const v of fromKeys) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function readIptvLocal(): IptvPlatformConfig {
  const base = defaultIptvPlatformConfig();
  try {
    const raw = localStorage.getItem(IPTV_LOCAL_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<IptvPlatformConfig> &
      Record<string, unknown>;
    return {
      ...base,
      ...parsed,
      apiBaseUrl: parsed.apiBaseUrl?.trim() || base.apiBaseUrl,
      packageId: parsed.packageId?.trim() || base.packageId,
      regPassword: parsed.regPassword ?? "",
      panelUrl: pickPanelUrl(parsed) || base.panelUrl,
      apiProxyUrl:
        (typeof parsed.apiProxyUrl === "string" && parsed.apiProxyUrl.trim()) ||
        (typeof (parsed as { api_proxy_url?: string }).api_proxy_url ===
          "string" &&
          String((parsed as { api_proxy_url?: string }).api_proxy_url).trim()) ||
        "",
      dnsSmarters:
        (typeof parsed.dnsSmarters === "string" && parsed.dnsSmarters.trim()) ||
        (typeof (parsed as { dns_smarters?: string }).dns_smarters ===
          "string" &&
          String((parsed as { dns_smarters?: string }).dns_smarters).trim()) ||
        base.dnsSmarters,
      m3uHost:
        (typeof parsed.m3uHost === "string" && parsed.m3uHost.trim()) ||
        (typeof (parsed as { m3u_host?: string }).m3u_host === "string" &&
          String((parsed as { m3u_host?: string }).m3u_host).trim()) ||
        base.m3uHost,
    };
  } catch {
    return base;
  }
}

function writeIptvLocal(config: IptvPlatformConfig) {
  localStorage.setItem(IPTV_LOCAL_KEY, JSON.stringify(config));
}

export async function loadIptvPlatformConfig(): Promise<IptvPlatformConfig> {
  const fallback = readIptvLocal();
  if (!supabase) return fallback;
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", IPTV_DB_KEY)
      .maybeSingle();
    if (error || !data?.value) return fallback;
    const value =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as Partial<IptvPlatformConfig> &
            Record<string, unknown>)
        : (data.value as Partial<IptvPlatformConfig> & Record<string, unknown>);
    const merged: IptvPlatformConfig = {
      ...fallback,
      ...value,
      apiBaseUrl: value.apiBaseUrl?.trim() || fallback.apiBaseUrl,
      packageId: value.packageId?.trim() || fallback.packageId,
      regPassword: value.regPassword ?? fallback.regPassword,
      panelUrl:
        pickPanelUrl(value) || fallback.panelUrl || DEFAULT_IPTV_PANEL_URL,
      apiProxyUrl:
        (typeof value.apiProxyUrl === "string" && value.apiProxyUrl.trim()) ||
        (typeof (value as { api_proxy_url?: unknown }).api_proxy_url ===
          "string" &&
          String((value as { api_proxy_url?: string }).api_proxy_url).trim()) ||
        fallback.apiProxyUrl ||
        "",
      dnsSmarters:
        (typeof value.dnsSmarters === "string" && value.dnsSmarters.trim()) ||
        (typeof (value as { dns_smarters?: unknown }).dns_smarters ===
          "string" &&
          String((value as { dns_smarters?: string }).dns_smarters).trim()) ||
        fallback.dnsSmarters ||
        defaultIptvPlatformConfig().dnsSmarters,
      m3uHost:
        (typeof value.m3uHost === "string" && value.m3uHost.trim()) ||
        (typeof (value as { m3u_host?: unknown }).m3u_host === "string" &&
          String((value as { m3u_host?: string }).m3u_host).trim()) ||
        fallback.m3uHost ||
        defaultIptvPlatformConfig().m3uHost,
    };
    writeIptvLocal(merged);
    return merged;
  } catch {
    return fallback;
  }
}

export async function saveIptvPlatformConfig(
  config: IptvPlatformConfig,
): Promise<{ ok: boolean; warning?: string }> {
  const defaults = defaultIptvPlatformConfig();
  const clean: IptvPlatformConfig = {
    apiBaseUrl: config.apiBaseUrl.trim().replace(/\/$/, "") ||
      defaults.apiBaseUrl,
    packageId: config.packageId.trim() || "1",
    regPassword: config.regPassword.trim(),
    panelUrl: config.panelUrl.trim() || DEFAULT_IPTV_PANEL_URL,
    apiProxyUrl: config.apiProxyUrl.trim().replace(/\/$/, ""),
    dnsSmarters: config.dnsSmarters.trim() || defaults.dnsSmarters,
    m3uHost: config.m3uHost.trim() || defaults.m3uHost,
  };
  writeIptvLocal(clean);
  if (!supabase) {
    return {
      ok: true,
      warning:
        "Salvo só neste navegador. Rode a migration platform_settings para sincronizar.",
    };
  }
  try {
    const { error } = await supabase.from("platform_settings").upsert(
      {
        key: IPTV_DB_KEY,
        value: clean,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) {
      return {
        ok: true,
        warning: `Salvo localmente. Supabase: ${error.message}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: true,
      warning:
        e instanceof Error
          ? e.message
          : "Salvo localmente; falha ao gravar no Supabase.",
    };
  }
}

export function isIptvPlatformConfigured(config: IptvPlatformConfig) {
  return Boolean(config.apiBaseUrl?.trim());
}
