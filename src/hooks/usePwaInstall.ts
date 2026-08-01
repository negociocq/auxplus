import { useEffect, useState } from "react";
import {
  getDeferredInstall,
  initPwaInstallCapture,
  promptPwaInstall,
  subscribeDeferredInstall,
} from "@/lib/pwaInstall";

function isStandaloneDisplay() {
  if (typeof window === "undefined") return false;
  const mq = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    "standalone" in navigator &&
    Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  return mq || iosStandalone;
}

function isIosDevice() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/i.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

export function usePwaInstall() {
  const [hasNativePrompt, setHasNativePrompt] = useState(
    () => !!getDeferredInstall(),
  );
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    initPwaInstallCapture();
    setInstalled(isStandaloneDisplay());
    setIos(isIosDevice());

    const unsub = subscribeDeferredInstall((event) => {
      setHasNativePrompt(!!event);
    });

    const onInstalled = () => {
      setInstalled(true);
      setHasNativePrompt(false);
    };
    window.addEventListener("appinstalled", onInstalled);

    // Se o SW ainda estiver ativando, o Chrome pode disparar o prompt um pouco depois.
    let cancelled = false;
    void (async () => {
      try {
        if ("serviceWorker" in navigator) {
          await navigator.serviceWorker.ready;
        }
      } catch {
        /* ignore */
      }
      if (!cancelled) setHasNativePrompt(!!getDeferredInstall());
    })();

    return () => {
      cancelled = true;
      unsub();
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async (): Promise<
    "accepted" | "dismissed" | "manual"
  > => {
    // Aguarda um pouco caso o evento chegue logo após o clique (SW acabou de ativar).
    if (!getDeferredInstall()) {
      await new Promise((r) => setTimeout(r, 400));
    }
    if (!getDeferredInstall() && "serviceWorker" in navigator) {
      try {
        await navigator.serviceWorker.ready;
        await new Promise((r) => setTimeout(r, 600));
      } catch {
        /* ignore */
      }
    }

    const outcome = await promptPwaInstall();
    if (outcome === "unavailable") return "manual";
    if (outcome === "accepted") setInstalled(true);
    setHasNativePrompt(!!getDeferredInstall());
    return outcome;
  };

  return {
    canOfferInstall: !installed,
    installed,
    ios,
    hasNativePrompt,
    promptInstall,
  };
}
