/**
 * Health Check RÁPIDO do Painel
 *
 * Verifica se o painel está responsivo com timeout curto.
 * Usado no atendimento automático para diagnosticar instabilidades.
 */

interface HealthCheckResult {
  isOnline: boolean;
  responseTime: number;
  timestamp: string;
  error?: string;
}

const HEALTH_CHECK_TIMEOUT = 3000; // 3 segundos
const PANEL_URL = "http://localhost:32116";
const HEALTH_CHECK_ENDPOINT = "/ges-api/recargas/credits";

let lastCheckCache: {
  result: HealthCheckResult;
  timestamp: number;
} | null = null;

const CACHE_TTL = 5000; // Cache 5 segundos

/**
 * Faz health check rápido do painel.
 * Retorna true se responsivo, false se offline/lento.
 */
export async function checkPanelHealth(): Promise<HealthCheckResult> {
  const now = Date.now();

  // Retorna cache se ainda válido
  if (lastCheckCache && now - lastCheckCache.timestamp < CACHE_TTL) {
    return lastCheckCache.result;
  }

  const startTime = now;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

    const response = await fetch(`${PANEL_URL}${HEALTH_CHECK_ENDPOINT}`, {
      method: "GET",
      signal: controller.signal,
      // Sem credenciais, só queremos saber se está respondendo
      credentials: "omit",
    });

    clearTimeout(timeoutId);

    const responseTime = Date.now() - startTime;
    const isOnline = response.ok || response.status < 500; // 2xx ou 4xx = online

    const result: HealthCheckResult = {
      isOnline,
      responseTime,
      timestamp: new Date().toISOString(),
    };

    // Cache o resultado
    lastCheckCache = { result, timestamp: now };

    return result;
  } catch (error) {
    const responseTime = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    const result: HealthCheckResult = {
      isOnline: false,
      responseTime,
      timestamp: new Date().toISOString(),
      error: errorMsg,
    };

    // Cache mesmo o erro
    lastCheckCache = { result, timestamp: now };

    return result;
  }
}

/**
 * Verifica se o painel está online (versão síncrona do cache).
 * Retorna o último resultado conhecido, sem fazer requisição.
 */
export function isPanelHealthy(): boolean {
  if (!lastCheckCache) return true; // Assume online se nunca checou
  return lastCheckCache.result.isOnline;
}

/**
 * Reseta o cache (útil após manual troubleshooting).
 */
export function resetHealthCache(): void {
  lastCheckCache = null;
}

/**
 * Retorna mensagem amigável baseada no status do painel.
 */
export function getPanelStatusMessage(isOnline: boolean): string {
  if (isOnline) {
    return "Estou conseguindo me comunicar com os servidores.\n\nVou transferir você para nosso atendimento para investigar o problema.";
  } else {
    return "Estamos com uma instabilidade no serviço no momento.\n\nNossos técnicos já estão trabalhando no reparo. Tente novamente em alguns minutos.";
  }
}
