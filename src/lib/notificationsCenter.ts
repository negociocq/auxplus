/**
 * Central de notificações do app: registra todo alerta que é enviado para o
 * mobile (via `showLocalAlert`) e alimenta o sino no topo da interface.
 *
 * Guarda por usuário em localStorage e notifica componentes inscritos.
 */

export type InAppNotification = {
  id: string;
  title: string;
  body?: string;
  /** Tag estável — substitui a notificação anterior com a mesma tag */
  tag?: string;
  url?: string;
  /** epoch ms */
  at: number;
  read: boolean;
};

type Listener = () => void;

const listeners = new Set<Listener>();
export const NOTIFICATIONS_CHANGED_EVENT = "auxplus:notifications-changed";
const MAX = 100;

const storageKey = (userId: string) => `auxplus-notifications-center:${userId}`;

function load(userId: string): InAppNotification[] {
  if (!userId) return [];
  try {
    const raw = localStorage.getItem(storageKey(userId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as InAppNotification[]) : [];
  } catch {
    return [];
  }
}

function persist(userId: string, list: InAppNotification[]) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(list));
  } catch {
    /* ignore */
  }
}

function emit() {
  listeners.forEach((l) => l());
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED_EVENT));
  }
}

/** Inscreve para re-render quando a lista muda (mesma aba ou outra aba). */
export function subscribeNotifications(cb: Listener): () => void {
  listeners.add(cb);
  const onStorage = () => cb();
  window.addEventListener("storage", onStorage);
  window.addEventListener(NOTIFICATIONS_CHANGED_EVENT, onStorage);
  return () => {
    listeners.delete(cb);
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(NOTIFICATIONS_CHANGED_EVENT, onStorage);
  };
}

export function getNotifications(userId: string): InAppNotification[] {
  return load(userId);
}

export function unreadNotificationsCount(userId: string): number {
  return load(userId).filter((n) => !n.read).length;
}

export function pushNotification(
  userId: string,
  payload: { title: string; body?: string; tag?: string; url?: string },
) {
  if (!userId) return;
  const at = Date.now();
  let list = load(userId);
  // Mesma tag substitui a anterior em vez de duplicar
  if (payload.tag) {
    list = list.filter((n) => n.tag !== payload.tag);
  }
  const id = payload.tag || `${at}_${Math.random().toString(36).slice(2, 8)}`;
  list = [
    {
      id,
      title: payload.title,
      body: payload.body,
      tag: payload.tag,
      url: payload.url,
      at,
      read: false,
    },
    ...list,
  ].slice(0, MAX);
  persist(userId, list);
  emit();
}

export function markNotificationRead(userId: string, id: string) {
  if (!userId) return;
  const next = load(userId).map((n) => (n.id === id ? { ...n, read: true } : n));
  persist(userId, next);
  emit();
}

export function markAllNotificationsRead(userId: string) {
  if (!userId) return;
  persist(
    userId,
    load(userId).map((n) => ({ ...n, read: true })),
  );
  emit();
}

export function clearNotifications(userId: string) {
  if (!userId) return;
  persist(userId, []);
  emit();
}