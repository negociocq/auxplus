import { supabase } from "@/integrations/supabase/client";
import { mergeCatalogSnapshots, parseCatalogSnapshot, type CatalogSnapshot } from "@/lib/uniplayDiscover";

// The caller's storage key includes the AuxPlus account, provider and panel login.
const cloudKey = (storageKey: string) => `catalog_history:${storageKey}`;

export async function loadCatalogHistory(storageKey: string): Promise<CatalogSnapshot | null> {
  const { data, error } = await supabase.from("platform_settings").select("value")
    .eq("key", cloudKey(storageKey)).maybeSingle().abortSignal(AbortSignal.timeout(10000));
  if (error) throw new Error("Não foi possível sincronizar o histórico do catálogo.");
  return parseCatalogSnapshot(data?.value);
}

export async function saveCatalogHistory(storageKey: string, snapshot: CatalogSnapshot): Promise<CatalogSnapshot> {
  // Re-read before writing so a refresh cannot replace an older browser's history.
  const latest = await loadCatalogHistory(storageKey);
  const merged = mergeCatalogSnapshots(latest, snapshot)!;
  const { error } = await supabase.from("platform_settings").upsert({
    key: cloudKey(storageKey), value: merged, updated_at: new Date().toISOString(),
  }, { onConflict: "key" }).abortSignal(AbortSignal.timeout(10000));
  if (error) throw new Error("Não foi possível salvar o histórico do catálogo na conta.");
  return merged;
}
