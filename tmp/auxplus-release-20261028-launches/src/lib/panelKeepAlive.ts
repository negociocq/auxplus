/**
 * Mantém a janela do painel IPTV aberta e dá refresh periódico.
 * Obs.: sem noopener, para podermos controlar a janela que abrimos.
 */

let panelWin: Window | null = null;
let timer: number | null = null;
let keepUrl = "";
let minutes = 15;
const listeners = new Set<(active: boolean) => void>();

function notify() {
  const active = Boolean(panelWin && !panelWin.closed && timer);
  listeners.forEach((fn) => fn(active));
}

export function subscribePanelKeepAlive(fn: (active: boolean) => void) {
  listeners.add(fn);
  fn(Boolean(panelWin && !panelWin.closed && timer));
  return () => listeners.delete(fn);
}

export function isPanelKeepAliveActive() {
  return Boolean(panelWin && !panelWin.closed && timer);
}

export function getPanelWindow() {
  if (panelWin && panelWin.closed) panelWin = null;
  return panelWin;
}

/** Abre (ou foca) a janela do painel. */
export function openPanelWindow(url: string) {
  const target = url.trim();
  if (!target) throw new Error("URL do painel vazia");
  keepUrl = target;

  if (panelWin && !panelWin.closed) {
    try {
      panelWin.focus();
      panelWin.location.href = target;
    } catch {
      panelWin = window.open(target, "auxplus_iptv_panel");
    }
  } else {
    panelWin = window.open(target, "auxplus_iptv_panel");
  }

  if (!panelWin) {
    throw new Error(
      "O navegador bloqueou a janela. Permita pop-ups para este site.",
    );
  }
  notify();
  return panelWin;
}

function refreshPanel() {
  if (!panelWin || panelWin.closed) {
    stopPanelKeepAlive();
    return;
  }
  try {
    // Recarrega a página atual (mantém a rota se já estiver logado)
    panelWin.location.reload();
  } catch {
    try {
      if (keepUrl) panelWin.location.href = keepUrl;
    } catch {
      panelWin = window.open(keepUrl || panelWin.location.href, "auxplus_iptv_panel");
    }
  }
  notify();
}

/** Liga keep-alive (refresh a cada N minutos). */
export function startPanelKeepAlive(url: string, everyMinutes = 15) {
  openPanelWindow(url);
  minutes = Math.max(1, Math.min(120, everyMinutes));
  if (timer) window.clearInterval(timer);
  timer = window.setInterval(
    () => refreshPanel(),
    minutes * 60 * 1000,
  );
  notify();
}

export function stopPanelKeepAlive() {
  if (timer) {
    window.clearInterval(timer);
    timer = null;
  }
  notify();
}

export function closePanelWindow() {
  stopPanelKeepAlive();
  if (panelWin && !panelWin.closed) {
    try {
      panelWin.close();
    } catch {
      /* ignore */
    }
  }
  panelWin = null;
  notify();
}
