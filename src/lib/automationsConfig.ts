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

export function loadAutomationsConfig(userId: string): AutomationsConfig {
  const base = defaultAutomationsConfig();
  try {
    const raw = localStorage.getItem(`${KEY}:${userId}`);
    if (!raw) return base;
    const parsed = JSON.parse(raw) as Partial<AutomationsConfig>;
    return {
      ...base,
      ...parsed,
      iptvPanelUrl: parsed.iptvPanelUrl?.trim() || "",
      iptvApiBaseUrl:
        parsed.iptvApiBaseUrl?.trim() || base.iptvApiBaseUrl,
      iptvBearerToken: parsed.iptvBearerToken?.trim() || "",
      iptvUsername: parsed.iptvUsername?.trim() || "",
      iptvPassword: parsed.iptvPassword ?? "",
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
  } catch {
    return base;
  }
}

export function saveAutomationsConfig(
  userId: string,
  config: AutomationsConfig,
) {
  localStorage.setItem(`${KEY}:${userId}`, JSON.stringify(config));
}
