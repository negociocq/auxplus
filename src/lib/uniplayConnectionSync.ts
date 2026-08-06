/** Evento global: conexão UniPlay mudou — sidebar/Conexões recarregam o item de menu. */
export const UNIPLAY_CONNECTION_EVENT = "auxplus:uniplay-connection";

export type UniplayConnectionDetail = {
  connected: boolean;
};

export function notifyUniplayConnection(connected: boolean) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent<UniplayConnectionDetail>(UNIPLAY_CONNECTION_EVENT, {
      detail: { connected },
    }),
  );
}

export function onUniplayConnection(
  handler: (connected: boolean) => void,
): () => void {
  if (typeof window === "undefined") return () => undefined;
  const listener = (ev: Event) => {
    const detail = (ev as CustomEvent<UniplayConnectionDetail>).detail;
    handler(detail?.connected === true);
  };
  window.addEventListener(UNIPLAY_CONNECTION_EVENT, listener);
  return () =>
    window.removeEventListener(UNIPLAY_CONNECTION_EVENT, listener);
}
