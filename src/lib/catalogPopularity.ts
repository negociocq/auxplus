import { catalogPopularityReference } from './catalogPopularityData.ts';
import { genreIdentity, normalizeGenreTitle } from './catalogGenreIdentity.mjs';
import type { CatalogTitle } from './uniplayDiscover.ts';

const index = new Map<string, typeof catalogPopularityReference>();
for (const entry of catalogPopularityReference) for (const name of entry.names) {
  const key = `${entry.kind}|${normalizeGenreTitle(name)}`;
  const list = index.get(key) || [];
  if (!list.some(e => e.id === entry.id)) list.push(entry);
  index.set(key, list);
}

/** Exact kind/name/year matching; never infer fame from the provider's addition date. */
function recognitionEntity(title: CatalogTitle) {
  const identity = genreIdentity(title);
  const matches = (index.get(`${identity.kind}|${normalizeGenreTitle(identity.name)}`) || [])
    .filter(entry => !identity.year || entry.years.includes(identity.year));
  return matches.length === 1 ? matches[0] : undefined;
}

export function catalogRecognitionKey(title: CatalogTitle): string {
  const entity = recognitionEntity(title);
  return entity ? `wikidata:${entity.id}` : title.key;
}

export function catalogReferenceId(title:CatalogTitle):string|undefined {
  return recognitionEntity(title)?.id;
}

/** Prefer an actual premiere to a catalog year, which can describe a rerelease. */
export function catalogWithReleaseEvidence(title: CatalogTitle): CatalogTitle {
  if (title.releasedAt) return title;
  const entity = recognitionEntity(title);
  const releasedAt = entity && 'releasedAt' in entity ? Number(entity.releasedAt) : undefined;
  if (!releasedAt) return title;
  return { ...title, releasedAt };
}

export function catalogRecognitionScore(title: CatalogTitle): number {
  const entity = recognitionEntity(title);
  if (entity) return entity.score;
  // Optional provider evidence must represent a substantial number of real votes.
  return title.voteCount && title.voteCount >= 500 ? Math.min(100, Math.log10(title.voteCount) * 15) : 0;
}
