export type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

type Listener = (event: BeforeInstallPromptEvent | null) => void;

let deferred: BeforeInstallPromptEvent | null = null;
let capturing = false;
const listeners = new Set<Listener>();

declare global {
  interface Window {
    __auxplusDeferredInstall?: BeforeInstallPromptEvent | null;
  }
}

function emit() {
  const value = deferred;
  if (typeof window !== "undefined") {
    window.__auxplusDeferredInstall = value;
  }
  listeners.forEach((listener) => listener(value));
}

/** Captura o prompt o mais cedo possível (antes do React montar). */
export function initPwaInstallCapture() {
  if (typeof window === "undefined" || capturing) return;
  capturing = true;

  deferred = window.__auxplusDeferredInstall ?? null;

  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    emit();
  });

  window.addEventListener("appinstalled", () => {
    deferred = null;
    emit();
  });
}

export function getDeferredInstall() {
  if (typeof window === "undefined") return null;
  return deferred ?? window.__auxplusDeferredInstall ?? null;
}

export function subscribeDeferredInstall(listener: Listener) {
  listeners.add(listener);
  listener(getDeferredInstall());
  return () => {
    listeners.delete(listener);
  };
}

export async function promptPwaInstall(): Promise<
  "accepted" | "dismissed" | "unavailable"
> {
  const event = getDeferredInstall();
  if (!event) return "unavailable";

  await event.prompt();
  const { outcome } = await event.userChoice;
  if (outcome === "accepted") {
    deferred = null;
    emit();
  }
  return outcome;
}
