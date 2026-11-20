import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Entry = { value: unknown; updatedAt: string; pending?: boolean };
type Cache = Record<string, Entry>;
let account = "";
let running: Promise<void> | undefined;
let saveTimer: ReturnType<typeof setTimeout>;
const cacheKey = (id: string) => `auxplus-devices-sync:${id}`;
const prefix = (id: string) => `partner-devices:${id}:`;

function read(id: string): Cache {
  try { return JSON.parse(localStorage.getItem(cacheKey(id)) || "{}"); }
  catch { return {}; }
}

export function configurePartnerAppsAccount(id: string) {
  account = id;
}

export function readSyncedDevices(kind: string): Record<string, unknown> {
  return Object.fromEntries(Object.entries(read(account))
    .filter(([key, entry]) => key.startsWith(`${kind}:`) && entry.value !== null)
    .map(([key, entry]) => [key.slice(kind.length + 1), entry.value]));
}

export function writeSyncedDevice(kind: string, id: string, value: unknown) {
  if (!account) return;
  const cache = read(account);
  const key = `${kind}:${id}`;
  if (JSON.stringify(cache[key]?.value) === JSON.stringify(value)) return;
  cache[key] = { value, updatedAt: new Date().toISOString(), pending: true };
  localStorage.setItem(cacheKey(account), JSON.stringify(cache));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void syncPartnerApps().catch(() => toast.error(
      "Não foi possível sincronizar os aparelhos. Os dados estão salvos neste dispositivo e serão reenviados.",
      { id: "partner-apps-sync" },
    ));
  }, 600);
}

/** Per-device records avoid replacing another computer's entire list. */
export async function syncPartnerApps(): Promise<void> {
  if (!account) return;
  if (running) { await running; return syncPartnerApps(); }
  const owner = account;
  running = (async () => {
    const before = read(owner);
    for (const [id, entry] of Object.entries(before)) {
      if (!entry.pending) continue;
      const { error } = await supabase.from("platform_settings").upsert({
        key: prefix(owner) + id,
        value: { value: entry.value, updatedAt: entry.updatedAt },
        updated_at: entry.updatedAt,
      }, { onConflict: "key" });
      if (error) throw error;
      const current = read(owner);
      if (current[id]?.updatedAt === entry.updatedAt &&
          JSON.stringify(current[id]?.value) === JSON.stringify(entry.value)) {
        current[id].pending = false;
        localStorage.setItem(cacheKey(owner), JSON.stringify(current));
      }
    }
    const { data, error } = await supabase.from("platform_settings")
      .select("key,value").like("key", `${prefix(owner)}%`);
    if (error) throw error;
    const current = read(owner);
    for (const row of data || []) {
      const id = row.key.slice(prefix(owner).length);
      const entry = row.value as unknown as Entry;
      if (!entry || typeof entry.updatedAt !== "string" || current[id]?.pending) continue;
      current[id] = { value: entry.value, updatedAt: entry.updatedAt };
    }
    localStorage.setItem(cacheKey(owner), JSON.stringify(current));
  })();
  try { await running; } finally { running = undefined; }
}

export function migratePartnerApps() {
  if (!account) return;
  // Legacy browser data is claimed once, so switching accounts cannot copy it.
  const claimed = localStorage.getItem("auxplus-devices-legacy-owner");
  if (claimed && claimed !== account) return;
  const marker = `auxplus-devices-migrated:${account}`;
  if (localStorage.getItem(marker)) return;
  let apps: { id: string }[] = [];
  let names: Record<string, string> = {};
  try {
    const rawApps = JSON.parse(localStorage.getItem("auxplus-partner-apps") || "[]");
    const rawNames = JSON.parse(localStorage.getItem("auxplus-device-nicknames") || "{}");
    if (Array.isArray(rawApps)) apps = rawApps;
    if (rawNames && typeof rawNames === "object" && !Array.isArray(rawNames)) names = rawNames;
  } catch { /* preserve malformed legacy data without blocking the page */ }
  for (const app of apps) if (app?.id) writeSyncedDevice("app", app.id, app);
  for (const [id, name] of Object.entries(names)) writeSyncedDevice("nickname", id, name);
  localStorage.setItem("auxplus-devices-legacy-owner", account);
  localStorage.setItem(marker, "1");
}
