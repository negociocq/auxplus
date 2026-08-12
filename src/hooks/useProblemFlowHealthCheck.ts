/**
 * Hook para gerenciar o fluxo de atendimento com health check do painel.
 *
 * Quando cliente diz "problema" ou "não consegue assistir":
 * 1. Checa saúde do painel silenciosamente
 * 2. Se online → "Vou transferir para atendimento"
 * 3. Se offline → "Estamos com instabilidade, estamos reparando"
 */

import { useCallback, useRef } from "react";
import { checkPanelHealth, getPanelStatusMessage } from "@/lib/panelHealthCheckFast";

export interface HealthCheckFlowResult {
  isPanelOnline: boolean;
  message: string;
  responseTime: number;
}

export function useProblemFlowHealthCheck() {
  const checkingRef = useRef(false);

  /**
   * Executa health check quando cliente reporta problema.
   * Retorna mensagem apropriada sem mencionar UniPlay ao cliente.
   */
  const handleClientProblem = useCallback(
    async (): Promise<HealthCheckFlowResult> => {
      // Evita múltiplas requisições simultâneas
      if (checkingRef.current) {
        return {
          isPanelOnline: true, // Assume online em fallback
          message: getPanelStatusMessage(true),
          responseTime: 0,
        };
      }

      checkingRef.current = true;

      try {
        const result = await checkPanelHealth();

        const message = getPanelStatusMessage(result.isOnline);

        return {
          isPanelOnline: result.isOnline,
          message,
          responseTime: result.responseTime,
        };
      } catch (error) {
        console.error("[useProblemFlowHealthCheck] Erro:", error);
        // Em caso de erro, assume que está online (melhor dar erro específico no atendimento)
        return {
          isPanelOnline: true,
          message: getPanelStatusMessage(true),
          responseTime: 0,
        };
      } finally {
        checkingRef.current = false;
      }
    },
    [],
  );

  return { handleClientProblem };
}

/**
 * Versão assíncrona para usar diretamente (sem hook).
 * Útil no webhook da Evolution.
 */
export async function checkPanelAndRespond(): Promise<{
  isOnline: boolean;
  responseMessage: string;
  shouldTransferToHuman: boolean;
  diagnosticInfo: {
    responseTime: number;
    timestamp: string;
  };
}> {
  try {
    const health = await checkPanelHealth();

    const isOnline = health.isOnline;
    const message = getPanelStatusMessage(isOnline);

    return {
      isOnline,
      responseMessage: message,
      shouldTransferToHuman: isOnline, // Se online → atendimento humano
      diagnosticInfo: {
        responseTime: health.responseTime,
        timestamp: health.timestamp,
      },
    };
  } catch (error) {
    // Fallback: assume online e transfere para humano
    return {
      isOnline: true,
      responseMessage: getPanelStatusMessage(true),
      shouldTransferToHuman: true,
      diagnosticInfo: {
        responseTime: 0,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
