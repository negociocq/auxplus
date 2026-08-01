import { supabase } from "@/integrations/supabase/client";

export interface AutomationsConfig {
  /** URL do painel IPTV (privada, por conta) */
  iptvPanelUrl: string;
  /** Base da API (ex.: https://gesapioffice.com/api) */
  iptvApiBaseUrl: string;
  /** JWT Bearer (renovado automaticamente se houver usuário/senha) */
  iptvBearerToken: string;
  /** Login do painel — para renovar o token sozinho */
  iptvUsername: string;
  iptvPassword: string;
  /** reg_password (se a listagem exigir) */
  iptvRegPassword: string;
  /** ID do pacote padrão (ex.: "1") */
  iptvPackageId: string;
  /** Meses padrão ao renovar */
  renewMonths: number;
  /** Horas padrão do teste */
  testHours: number;
  /** Minutos entre refresh da janela do painel */
  keepAliveMinutes: number;
  /** Renovar token automaticamente (login API) */
  iptvAutoRefreshToken: boolean;
  /**
   * Pasta tipo Cliente onde aparece o botão
   * “Sincronizar UniPlay” (lembretes).
   */
  syncFolderId: string;
}

const KEY = "auxplus-automations";
const dbKey = (userId: string) => `automations_user_${userId}`;

export function defaultAutomationsConfig(): AutomationsConfig {
  return {
    iptvPanelUrl: "",
    iptvApiBaseUrl: "https://gesapioffice.com/api",
    iptvBearerToken: "",
    iptvUsername: "",
    iptvPassword: "",
    iptvRegPassword: "",
    iptvPackageId: "1",
    renewMonths: 1,
    testHours: 6,
    keepAliveMinutes: 15,
    iptvAutoRefreshToken: true,
    syncFolderId: "",
  };
}

function normalizeConfig(
  base: AutomationsConfig,
  parsed: Partial<AutomationsConfig>,
): AutomationsConfig {
  return {
    ...base,
    ...parsed,
    iptvPanelUrl: parsed.iptvPanelUrl?.trim() || "",
    iptvApiBaseUrl: parsed.iptvApiBaseUrl?.trim() || base.iptvApiBaseUrl,
    iptvBearerToken: parsed.iptvBearerToken?.trim() || "",
    iptvUsername: parsed.iptvUsername?.trim() || "",
    // Mantém senha se o parsed vier sem (evita apagar na nuvem)
    iptvPassword:
      parsed.iptvPassword != null && String(parsed.iptvPassword).length > 0
        ? String(parsed.iptvPassword)
        : (base.iptvPassword ?? ""),
    iptvRegPassword: parsed.iptvRegPassword?.trim() || "",
    iptvPackageId: parsed.iptvPackageId?.trim() || "1",
    renewMonths: Math.max(1, Math.min(24, Number(parsed.renewMonths) || 1)),
    testHours: Math.max(1, Math.min(6, Number(parsed.testHours) || 6)),
    keepAliveMinutes: Math.max(
      1,
      Math.min(120, Number(parsed.keepAliveMinutes) || 15),
    ),
    iptvAutoRefreshToken: parsed.iptvAutoRefreshToken !== false,
    syncFolderId: parsed.syncFolderId?.trim() || "",
  };
}

/** Leitura síncrona do cache local (rápida para UI). */
export function loadAutomationsConfig(userId: string): AutomationsConfig {
  const base = defaultAutomationsConfig();
  try {
    const raw = localStorage.getItem(`${KEY}:${userId}`);
    if (!raw) return base;
    return normalizeConfig(base, JSON.parse(raw) as Partial<AutomationsConfig>);
  } catch {
    return base;
  }
}

function writeLocal(userId: string, config: AutomationsConfig) {
  localStorage.setItem(`${KEY}:${userId}`, JSON.stringify(config));
}

async function persistRemote(
  userId: string,
  config: AutomationsConfig,
): Promise<{ ok: boolean; warning?: string }> {
  if (!supabase || !userId) {
    return {
      ok: true,
      warning: "Salvo só neste navegador (Supabase indisponível).",
    };
  }
  try {
    const { error } = await supabase.from("platform_settings").upsert(
      {
        key: dbKey(userId),
        value: config,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
    if (error) {
      return {
        ok: true,
        warning: `Salvo localmente. Nuvem: ${error.message}`,
      };
    }
    return { ok: true };
  } catch (e) {
    return {
      ok: true,
      warning:
        e instanceof Error
          ? e.message
          : "Salvo localmente; falha ao gravar na nuvem.",
    };
  }
}

/**
 * Carrega config: prioriza nuvem (todos os dispositivos),
 * faz fallback no localStorage deste navegador.
 */
export async function loadAutomationsConfigRemote(
  userId: string,
): Promise<AutomationsConfig> {
  const local = loadAutomationsConfig(userId);
  if (!supabase || !userId) return local;
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", dbKey(userId))
      .maybeSingle();
    if (error || !data?.value) {
      // 1ª vez: sobe o que já estava só neste PC para a nuvem
      if (local.iptvUsername.trim() && local.iptvPassword) {
        void persistRemote(userId, local);
      }
      return local;
    }
    const value =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as Partial<AutomationsConfig>)
        : (data.value as Partial<AutomationsConfig>);
    // Nuvem manda; se senha/user vierem vazios, aproveita o local
    const merged = normalizeConfig(local, value);
    const withSecrets: AutomationsConfig = {
      ...merged,
      iptvUsername: merged.iptvUsername || local.iptvUsername,
      iptvPassword: merged.iptvPassword || local.iptvPassword,
      iptvBearerToken: merged.iptvBearerToken || local.iptvBearerToken,
    };
    writeLocal(userId, withSecrets);
    // Local tem senha e a nuvem não → sobe agora (outros PCs passam a ver)
    if (local.iptvPassword && !String(value.iptvPassword || "").trim()) {
      void persistRemote(userId, withSecrets);
    }
    return withSecrets;
  } catch {
    return local;
  }
}

/**
 * Salva local + nuvem (para a conta UniPlay funcionar em qualquer PC).
 * Mantém assinatura síncrona na UI; a nuvem grava em background.
 */
export function saveAutomationsConfig(
  userId: string,
  config: AutomationsConfig,
) {
  const clean = normalizeConfig(defaultAutomationsConfig(), config);
  writeLocal(userId, clean);
  void persistRemote(userId, clean);
}

/** Salva e aguarda a nuvem (usar no “Conectar”). */
export async function saveAutomationsConfigRemote(
  userId: string,
  config: AutomationsConfig,
): Promise<{ ok: boolean; warning?: string }> {
  const clean = normalizeConfig(defaultAutomationsConfig(), config);
  writeLocal(userId, clean);
  return persistRemote(userId, clean);
}
