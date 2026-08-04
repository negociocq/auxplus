/** Evento global: saldo UniPlay mudou — header/Automações/Dashboard recarregam. */
export const UNIPLAY_CREDITS_CHANGED_EVENT = "auxplus:uniplay-credits-changed";

export type UniplayCreditsChangedDetail = {
  /** Créditos consumidos nesta operação (opcional, só informativo). */
  spent?: number;
  source?: string;
};

export function notifyUniplayCreditsChanged(
  detail?: UniplayCreditsChangedDetail,
) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent(UNIPLAY_CREDITS_CHANGED_EVENT, { detail: detail || {} }),
  );
}

export function onUniplayCreditsChanged(
  handler: (detail: UniplayCreditsChangedDetail) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (ev: Event) => {
    const detail =
      (ev as CustomEvent<UniplayCreditsChangedDetail>).detail || {};
    handler(detail);
  };
  window.addEventListener(UNIPLAY_CREDITS_CHANGED_EVENT, listener);
  return () =>
    window.removeEventListener(UNIPLAY_CREDITS_CHANGED_EVENT, listener);
}
