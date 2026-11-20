/** Usuários excluídos da pasta de sync — a UniPlay não recria. */
import { supabase } from "@/integrations/supabase/client";

const KEY = "auxplus-sync-excluded";
const dbKey = (userId: string) => `sync_excluded_user_${userId}`;

type ExclusionMap = Record<string, string[]>;

function loadMap(userId: string): ExclusionMap {
  try {
    const raw = localStorage.getItem(`${KEY}:${userId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as ExclusionMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveMap(userId: string, map: ExclusionMap) {
  localStorage.setItem(`${KEY}:${userId}`, JSON.stringify(map));
}

function mergeMaps(a: ExclusionMap, b: ExclusionMap): ExclusionMap {
  const out: ExclusionMap = { ...a };
  for (const [folderId, list] of Object.entries(b)) {
    const set = new Set([
      ...(out[folderId] || []).map((u) => u.toLowerCase()),
      ...(list || []).map((u) => u.toLowerCase()),
    ]);
    if (set.size) out[folderId] = [...set];
  }
  return out;
}

async function persistRemote(userId: string, map: ExclusionMap) {
  if (!supabase || !userId) return;
  try {
    await supabase.from("platform_settings").upsert(
      {
        key: dbKey(userId),
        value: map,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch {
    /* local já salvo */
  }
}

/** Baixa exclusões da conta para o cache local. */
export async function loadSyncExclusionsRemote(userId: string): Promise<void> {
  const local = loadMap(userId);
  if (!supabase || !userId) return;
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", dbKey(userId))
      .maybeSingle();
    if (error || !data?.value) {
      if (Object.keys(local).length) void persistRemote(userId, local);
      return;
    }
    const remote =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as ExclusionMap)
        : (data.value as ExclusionMap);
    const merged = mergeMaps(local, remote && typeof remote === "object" ? remote : {});
    saveMap(userId, merged);
    void persistRemote(userId, merged);
  } catch {
    /* ignore */
  }
}

export function isExcludedFromSync(
  userId: string,
  folderId: string,
  username: string,
): boolean {
  const want = username.trim().toLowerCase();
  if (!want) return false;
  const list = loadMap(userId)[folderId] || [];
  return list.some((u) => u.toLowerCase() === want);
}

export function excludeFromSync(
  userId: string,
  folderId: string,
  username: string,
) {
  const want = username.trim().toLowerCase();
  if (!want) return;
  const map = loadMap(userId);
  const set = new Set((map[folderId] || []).map((u) => u.toLowerCase()));
  set.add(want);
  map[folderId] = [...set];
  saveMap(userId, map);
  void persistRemote(userId, map);
}

export function includeInSync(
  userId: string,
  folderId: string,
  username: string,
) {
  const want = username.trim().toLowerCase();
  if (!want) return;
  const map = loadMap(userId);
  const next = (map[folderId] || []).filter((u) => u.toLowerCase() !== want);
  if (next.length) map[folderId] = next;
  else delete map[folderId];
  saveMap(userId, map);
  void persistRemote(userId, map);
}

export function excludedUsernamesForFolder(
  userId: string,
  folderId: string,
): Set<string> {
  return new Set(
    (loadMap(userId)[folderId] || []).map((u) => u.trim().toLowerCase()),
  );
}

/**
 * Sincronização automática por pasta (ligar/desligar).
 * Desliga o sync da pasta sem apagar nada — útil para editar itens à mão.
 */
const DISABLED_KEY = "auxplus-sync-disabled";
const disabledDbKey = (userId: string) => `sync_disabled_user_${userId}`;

type DisabledMap = Record<string, boolean>;

function loadDisabled(userId: string): DisabledMap {
  try {
    const raw = localStorage.getItem(`${DISABLED_KEY}:${userId}`);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DisabledMap;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveDisabled(userId: string, map: DisabledMap) {
  try {
    localStorage.setItem(`${DISABLED_KEY}:${userId}`, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

async function persistDisabledRemote(userId: string, map: DisabledMap) {
  if (!supabase || !userId) return;
  try {
    await supabase.from("platform_settings").upsert(
      {
        key: disabledDbKey(userId),
        value: map,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "key" },
    );
  } catch {
    /* local já salvo */
  }
}

/** Baixa o estado do sync por pasta (nuvem → local). */
export async function loadSyncDisabledRemote(userId: string): Promise<void> {
  if (!supabase || !userId) return;
  try {
    const { data, error } = await supabase
      .from("platform_settings")
      .select("value")
      .eq("key", disabledDbKey(userId))
      .maybeSingle();
    if (error || !data?.value) return;
    const remote =
      typeof data.value === "string"
        ? (JSON.parse(data.value) as DisabledMap)
        : (data.value as DisabledMap);
    saveDisabled(userId, {
      ...loadDisabled(userId),
      ...(remote && typeof remote === "object" ? remote : {}),
    });
  } catch {
    /* ignore */
  }
}

/** Sync desativado para esta pasta? (padrão: ativado) */
export function isFolderSyncDisabled(
  userId: string,
  folderId: string,
): boolean {
  return loadDisabled(userId)[folderId] === true;
}

export function setFolderSyncDisabled(
  userId: string,
  folderId: string,
  disabled: boolean,
) {
  const map = loadDisabled(userId);
  if (disabled) map[folderId] = true;
  else delete map[folderId];
  saveDisabled(userId, map);
  void persistDisabledRemote(userId, map);
}
