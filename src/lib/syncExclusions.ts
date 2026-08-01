/** Usuários excluídos da pasta de sync — a UniPlay não recria. */

const KEY = "auxplus-sync-excluded";

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
}

export function excludedUsernamesForFolder(
  userId: string,
  folderId: string,
): Set<string> {
  return new Set(
    (loadMap(userId)[folderId] || []).map((u) => u.trim().toLowerCase()),
  );
}
