import { toast } from "sonner";

export type LocalAlertPayload = {
  title: string;
  body: string;
  /** Tag estável — substitui notificação anterior com a mesma tag */
  tag: string;
  url?: string;
};

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<
  NotificationPermission | "unsupported"
> {
  if (typeof window === "undefined" || !("Notification" in window)) {
    return "unsupported";
  }
  if (Notification.permission === "granted") return "granted";
  if (Notification.permission === "denied") return "denied";
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export async function showLocalAlert(
  payload: LocalAlertPayload,
  opts?: { toastFallback?: boolean },
): Promise<boolean> {
  const permission = notificationPermission();
  const url = payload.url || "/dashboard";

  if (permission === "granted") {
    try {
      if ("serviceWorker" in navigator) {
        const reg = await navigator.serviceWorker.ready;
        await reg.showNotification(payload.title, {
          body: payload.body,
          tag: payload.tag,
          renotify: true,
          icon: "/pwa-192.png",
          badge: "/pwa-192.png",
          data: { url },
        } as NotificationOptions);
        return true;
      }
    } catch {
      /* tenta Notification direta */
    }
    try {
      const n = new Notification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        icon: "/pwa-192.png",
        data: { url },
      } as NotificationOptions);
      n.onclick = () => {
        try {
          window.focus();
          window.location.assign(url);
        } catch {
          /* ignore */
        }
        n.close();
      };
      return true;
    } catch {
      /* fallback toast */
    }
  }

  if (opts?.toastFallback !== false) {
    toast.message(payload.title, { description: payload.body });
  }
  return false;
}

export async function setAppBadgeCount(count: number) {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0 && typeof nav.setAppBadge === "function") {
      await nav.setAppBadge(count);
    } else if (count <= 0 && typeof nav.clearAppBadge === "function") {
      await nav.clearAppBadge();
    }
  } catch {
    /* ignore */
  }
}
