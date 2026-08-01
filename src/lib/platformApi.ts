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
