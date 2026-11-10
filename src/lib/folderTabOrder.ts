import { supabase } from "@/integrations/supabase/client";
import type { FolderType } from "@/types";

export const DEFAULT_FOLDER_TAB_ORDER: FolderType[] = ["Cliente", "Produto", "Dívida"];
export function normalizeFolderTabOrder(value: unknown): FolderType[] {
  const values = Array.isArray(value) ? value : [];
  return [...new Set([...values.filter((type): type is FolderType => DEFAULT_FOLDER_TAB_ORDER.includes(type as FolderType)), ...DEFAULT_FOLDER_TAB_ORDER])];
}
export function localFolderTabOrder(userId?: string): FolderType[] {
  try { return normalizeFolderTabOrder(JSON.parse(localStorage.getItem(`auxplus-folder-tab-order:${userId}`) || "null")); }
  catch { return [...DEFAULT_FOLDER_TAB_ORDER]; }
}
export function cacheFolderTabOrder(userId: string, order: FolderType[]) {
  try { localStorage.setItem(`auxplus-folder-tab-order:${userId}`, JSON.stringify(normalizeFolderTabOrder(order))); } catch { /* Remote preferences remain available. */ }
}
export async function fetchFolderTabOrder(userId: string): Promise<FolderType[] | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.from("platform_settings").select("value").eq("key", `folder_tab_order_user_${userId}`).maybeSingle();
  if (error || !data?.value) return null;
  try {
    const value = typeof data.value === "string" ? JSON.parse(data.value) : data.value;
    return Array.isArray(value?.order) ? normalizeFolderTabOrder(value.order) : null;
  } catch { return null; }
}
export async function persistFolderTabOrder(userId: string, order: FolderType[]) {
  cacheFolderTabOrder(userId, order);
  if (!supabase) throw Error("Sem conexão para sincronizar a ordem.");
  const { error } = await supabase.from("platform_settings").upsert({ key: `folder_tab_order_user_${userId}`, value: { order: normalizeFolderTabOrder(order) }, updated_at: new Date().toISOString() }, { onConflict: "key" });
  if (error) throw error;
}
