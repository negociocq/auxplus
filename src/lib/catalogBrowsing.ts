import type { CatalogTitle } from "./uniplayDiscover.ts";
import { genreIdentity } from "./catalogGenreIdentity.mjs";

export const CATALOG_PAGE_SIZE = 48;
export const genreKey = (name: string) => name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLocaleLowerCase("pt-BR");

export type CatalogDisplayTitle = CatalogTitle & {
  audioLabel?: string; qualities: string[]; variantKeys: string[]; variantNames: string[]; variantCount: number;
};

function catalogVariant(name: string) {
  let clean = name.trim();
  const audio = new Set<string>(), qualities = new Set<string>();
  // Strip only edition tags at the end; numbers, years, subtitles and seasons remain significant.
  const suffix = /(?:\s+|\s*[-–—]\s*|\s*[([])(DUB\s*\/\s*LEG|DUBLADO|DUBLADA|LEGENDADO|LEGENDADA|DUB|LEG|DUAL(?:\s+AUDIO)?|4K|UHD|FHD|HD)[)\]]?\s*$/i;
  let match: RegExpMatchArray | null;
  while ((match = clean.match(suffix))) {
    const tag = match[1].toUpperCase();
    if (/^DUB\s*\/\s*LEG$/.test(tag)) { audio.add("DUB"); audio.add("LEG"); }
    else if (/^DUB/.test(tag)) audio.add("DUB");
    else if (/^LEG/.test(tag)) audio.add("LEG");
    else if (/^DUAL/.test(tag)) audio.add("DUAL");
    else qualities.add(tag);
    clean = clean.slice(0, match.index).trim();
  }
  return { clean: clean || name.trim(), audio, qualities };
}

/** Group for display only: the original provider entries and observation history stay intact. */
export function groupCatalogVariants(items: CatalogTitle[]): CatalogDisplayTitle[] {
  const groups = new Map<string, { title: CatalogDisplayTitle; audio: Set<string>; defaultAudio: boolean }>();
  for (const item of items) {
    const variant = catalogVariant(item.name);
    const identity = genreIdentity({ ...item, name: variant.clean });
    const key = `group:${identity.key}`;
    const displayName = identity.year ? `${identity.name} (${identity.year})` : identity.name;
    let group = groups.get(key);
    if (!group) {
      group = { title: { ...item, key, name: displayName, qualities: [], variantKeys: [], variantNames: [], variantCount: 0 }, audio: new Set(), defaultAudio: false };
      groups.set(key, group);
    }
    const target = group.title;
    target.releaseYear ??= identity.year;
    target.variantKeys.push(item.key); target.variantNames.push(item.name); target.variantCount++;
    for (const audio of variant.audio) group.audio.add(audio);
    if (!variant.audio.size) group.defaultAudio = true;
    target.qualities = [...new Set([...target.qualities, ...variant.qualities])].sort();
    if (!target.image && item.image) target.image = item.image;
    if (!target.synopsis && item.synopsis) { target.synopsis=item.synopsis;target.synopsisSource=item.synopsisSource; }
    target.genres = catalogGenres([...(target.genres || []), ...(item.genres || [])]);
    target.genreSource ||= item.genreSource;
    target.voteCount = Math.max(target.voteCount || 0, item.voteCount || 0) || undefined;
    if (!target.rating && item.rating) target.rating = item.rating;
    const itemAddition = item.addedAt ?? item.observedAt ?? 0;
    if (itemAddition > (target.addedAt ?? target.observedAt ?? 0)) {
      target.addedAt = item.addedAt; target.observedAt = item.observedAt;
    }
    if (item.releasedAt && (!target.releasedAt || item.releasedAt < target.releasedAt)) target.releasedAt = item.releasedAt;
    if (item.latestSeason && (!target.latestSeason || item.latestSeason > target.latestSeason)) target.latestSeason = item.latestSeason;
    if (item.episodeCount && (!target.episodeCount || item.episodeCount > target.episodeCount)) target.episodeCount = item.episodeCount;
    target.seasonReleasedAt ??= item.seasonReleasedAt;
    target.seasonReleaseYear ??= item.seasonReleaseYear;
    // In this provider's naming convention, the unmarked edition is the Portuguese edition.
    const dub = group.audio.has("DUB") || group.defaultAudio && group.audio.has("LEG");
    target.audioLabel = dub && group.audio.has("LEG") ? "DUB/LEG" : group.audio.has("LEG") ? "LEG" : dub ? "DUB" : group.audio.has("DUAL") ? "DUAL" : undefined;
  }
  return [...groups.values()].map(group => group.title);
}

/** Only explicit genre metadata; category names, title words and numeric IDs are not genres. */
export function catalogGenres(input: unknown): string[] {
  const values = Array.isArray(input) ? input : typeof input === "string" ? input.split(/[,;/|]/) : input && typeof input === "object" ? [input] : [];
  const names = new Map<string, string>();
  for (const value of values) {
    const name = (typeof value === "string" ? value : value && typeof value === "object" && "name" in value ? String(value.name || "") : "").trim();
    if (!name || name.length > 80 || /^\d+$/.test(name)) continue;
    names.set(genreKey(name), name);
  }
  return [...names.values()];
}

export function catalogGenreOptions(items: CatalogTitle[]): { value: string; label: string }[] {
  const options = new Map<string, string>();
  for (const item of items) for (const name of item.genres || []) options.set(genreKey(name), name);
  return [...options].map(([value, label]) => ({ value, label })).sort((a, b) => a.label.localeCompare(b.label, "pt-BR"));
}

export function catalogPage<T>(items: T[], requestedPage: number) {
  const totalPages = Math.max(1, Math.ceil(items.length / CATALOG_PAGE_SIZE));
  const page = Math.min(totalPages, Math.max(1, Math.trunc(requestedPage) || 1));
  const offset = (page - 1) * CATALOG_PAGE_SIZE;
  const pages = [...new Set([1, page - 1, page, page + 1, totalPages])].filter(n => n >= 1 && n <= totalPages).sort((a, b) => a - b);
  return { page, totalPages, pages, items: items.slice(offset, offset + CATALOG_PAGE_SIZE),
    first: items.length ? offset + 1 : 0, last: Math.min(items.length, offset + CATALOG_PAGE_SIZE) };
}
