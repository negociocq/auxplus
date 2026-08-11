/**
 * Circuit Breaker para o Painel UniPlay
 *
 * Quando o painel está offline (503/502), evita requisições em cascata
 * Retorna erro silenciosamente sem tentar de novo por 30 segundos
 */

interface PanelStatus {
  isDown: boolean;
  lastFailedAt: number;
  consecutiveFailures: number;
}

const PANEL_DOWN_THRESHOLD = 3; // 3 erros seguidos = painel está down
const PANEL_RECOVERY_TIME = 30000; // 30 segundos antes de tentar de novo
const FAILURE_RESET_TIME = 60000; // 60 segundos para resetar contador

let panelStatus: PanelStatus = {
  isDown: false,
  lastFailedAt: 0,
  consecutiveFailures: 0,
};

export function isPanelDown(): boolean {
  const now = Date.now();
  const timeSinceLastFailure = now - panelStatus.lastFailedAt;

  // Se passou do tempo de recuperação, tenta de novo
  if (timeSinceLastFailure > PANEL_RECOVERY_TIME) {
    panelStatus.isDown = false;
    panelStatus.consecutiveFailures = 0;
  }

  return panelStatus.isDown;
}

export function reportPanelError(error: unknown): void {
  const now = Date.now();
  const err = error as any;

  // Só conta como erro do painel se for 5xx
  if (err?.isPanelDown || err?.status >= 500) {
    panelStatus.consecutiveFailures++;
    panelStatus.lastFailedAt = now;

    if (panelStatus.consecutiveFailures >= PANEL_DOWN_THRESHOLD) {
      panelStatus.isDown = true;
      console.warn(
        `[PanelHealthCheck] Painel marcado como DOWN após ${panelStatus.consecutiveFailures} falhas`
      );
    }
  } else {
    // Erro diferente: reseta contador
    if (now - panelStatus.lastFailedAt > FAILURE_RESET_TIME) {
      panelStatus.consecutiveFailures = 0;
    }
  }
}

export function reportPanelSuccess(): void {
  panelStatus.isDown = false;
  panelStatus.consecutiveFailures = 0;
  panelStatus.lastFailedAt = 0;
}

export function getPanelStatus() {
  return {
    isDown: panelStatus.isDown,
    consecutiveFailures: panelStatus.consecutiveFailures,
    lastFailedAt: panelStatus.lastFailedAt,
    recoveryTimeRemaining: Math.max(
      0,
      PANEL_RECOVERY_TIME - (Date.now() - panelStatus.lastFailedAt)
    ),
  };
}
