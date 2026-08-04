/**
 * Central de notificações do app: registra todo alerta que é enviado para o
 * mobile (via `showLocalAlert`) e alimenta o sino no topo da interface.
 *
 * Fica vinculada à conta: além do cache local, persistiu/baixa na nuvem
 * (`platform_settings`), então qualquer dispositivo logado mostra as mesmas
 * notificações.
 */

import { supabase } from "@/integrations/supabase/client";

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
const centerDbKey = (userId: string) => `notif_center_user_${userId}`;

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

/** Persiste no cache local e sobe a versão para a conta (nuvem). */
function persistAndSync(userId: string, list: InAppNotification[]) {
  persist(userId, list);
  void persistRemote(userId, list);
}

async function persistRemote(userId: string, list: InAppNotification[]) {
  if (!supabase || !userId) return;
  try {
    await supabase.from("platform_settings").upsert(
      {
        key: centerDbKey(userId),
        value: { notifications: list },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch {
    /* cache local já salvo */
  }
}

/**
 * Mescla local + nuvem por id: mantém a notificação mais antiga (at menor),
 * mas o estado "lida" vence se qualquer uma das origens marcou como lida.
 */
function mergeLists(
  local: InAppNotification[],
  remote: InAppNotification[],
): InAppNotification[] {
  const map = new Map<string, InAppNotification>();
  for (const n of [...remote, ...local]) {
    if (!n || typeof n !== "object" || !n.id) continue;
    const prev = map.get(n.id);
    if (!prev) {
      map.set(n.id, n);
      continue;
    }
    const older = n.at <= prev.at ? n : prev;
    map.set(n.id, { ...older, read: prev.read || n.read });
  }
  return [...map.values()].sort((a, b) => b.at - a.at).slice(0, MAX);
}

/**
 * Carrega as notificações da conta e mescla com o cache local.
 * Chamado ao montar o sino / ao abrir / por polling para refletir
 * notificações geradas em qualquer outro dispositivo logado.
 */
export async function loadNotificationsRemote(
  userId: string,
): Promise<InAppNotification[]> {
  const local = load(userId);
  if (!supabase || !userId) return local;
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", centerDbKey(userId))
      .maybeSingle();
    if (error || !data?.value) {
      if (local.length) void persistRemote(userId, local);
      return local;
    }
    const raw =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as { notifications?: InAppNotification[] })
        : (data.value as { notifications?: InAppNotification[] });
    const remote = Array.isArray(raw?.notifications) ? raw.notifications : [];
    const merged = mergeLists(local, remote);
    persist(userId, merged);
    const changed =
      merged.length !== local.length || multiDiffers(merged, local);
    if (changed) void persistRemote(userId, merged);
    return merged;
  } catch {
    return local;
  }
}

function multiDiffers(a: InAppNotification[], b: InAppNotification[]) {
  if (a.length !== b.length) return true;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    if (x.id !== y.id || x.title !== y.title || (x.read || false) !== (y.read || false)) {
      return true;
    }
  }
  return false;
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
  persistAndSync(userId, list);
  emit();
}

export function markNotificationRead(userId: string, id: string) {
  if (!userId) return;
  const next = load(userId).map((n) => (n.id === id ? { ...n, read: true } : n));
  persistAndSync(userId, next);
  emit();
}

export function markAllNotificationsRead(userId: string) {
  if (!userId) return;
  persistAndSync(
    userId,
    load(userId).map((n) => ({ ...n, read: true })),
  );
  emit();
}

export function clearNotifications(userId: string) {
  if (!userId) return;
  persistAndSync(userId, []);
  emit();
}