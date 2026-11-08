import { genreIdentity, genreTitleVariants, matchGenreEntity, translateSourceGenres } from "../../src/lib/catalogGenreIdentity.mjs";

const endpoint = "https://query.wikidata.org/sparql";
const cache = new Map();
export const GENRE_BATCH_SIZE = 40;
export const METADATA_VERSION = 2;

export function buildGenreQuery(identities) {
  const labels = [...new Set(identities.flatMap(identity => genreTitleVariants(identity.name)))];
  const literals = labels.flatMap(name => ["pt", "pt-br", "en", "mul"].map(lang => `${JSON.stringify(name)}@${lang}`));
  return `SELECT DISTINCT ?item ?label ?kind ?genreLabel ?date ?season ?seasonNumber ?seasonDate WHERE {
    VALUES ?label { ${literals.join(" ")} }
    { ?item rdfs:label ?label } UNION { ?item skos:altLabel ?label }
    ?item wdt:P31 ?type.
    BIND(IF(EXISTS { ?type wdt:P279* wd:Q5398426 }, "series", IF(EXISTS { ?type wdt:P279* wd:Q11424 }, "movie", "other")) AS ?kind)
    FILTER(?kind != "other")
    OPTIONAL { ?item wdt:P577|wdt:P580 ?date }
    OPTIONAL {
      ?item wdt:P136 ?genre.
      OPTIONAL { ?genre rdfs:label ?genrePt. FILTER(LANG(?genrePt)="pt") }
      OPTIONAL { ?genre rdfs:label ?genreEn. FILTER(LANG(?genreEn)="en") }
      BIND(COALESCE(?genrePt, ?genreEn) AS ?genreLabel)
    }
    OPTIONAL {
      FILTER(?kind="series")
      ?item p:P527 ?part.
      ?part ps:P527 ?season; pq:P1545 ?seasonNumber.
      ?season wdt:P31/wdt:P279* wd:Q3464665; wdt:P577|wdt:P580 ?seasonDate.
    }
  }`;
}

export function parseGenreEntities(bindings) {
  const entities = new Map();
  for (const row of bindings) {
    const id = row.item?.value?.match(/\/(Q\d+)$/)?.[1];
    if (!id || !row.label?.value || !["movie", "series"].includes(row.kind?.value)) continue;
    const old = entities.get(id) || { id, kind: row.kind.value, names: [], years: [], genres: [], seasons: [] };
    if (row.kind.value === "series") old.kind = "series";
    old.names.push(row.label.value);
    const year = Number(row.date?.value?.match(/^\+?(\d{4})-/)?.[1]);
    if (year) old.years.push(year);
    if (row.genreLabel?.value) old.genres.push(row.genreLabel.value);
    const seasonId = row.season?.value?.match(/\/(Q\d+)$/)?.[1];
    const number = Number(row.seasonNumber?.value);
    const releasedAt = Date.parse(row.seasonDate?.value || "");
    if (seasonId && Number.isInteger(number) && number > 0 && Number.isFinite(releasedAt)) {
      const season = old.seasons.find(season => season.id === seasonId);
      if (season) season.releasedAt = Math.min(season.releasedAt, releasedAt);
      else old.seasons.push({ id: seasonId, number, releasedAt });
    }
    entities.set(id, old);
  }
  return [...entities.values()].map(entity => ({ ...entity, names: [...new Set(entity.names)], years: [...new Set(entity.years)], genres: translateSourceGenres([...new Set(entity.genres)]) }));
}

export async function lookupCatalogGenres(titles, fetcher = fetch) {
  const identities = [...new Map(titles.map(title => { const id = genreIdentity(title); return [id.key, id]; })).values()];
  const pending = identities.filter(identity => !cache.has(identity.key) || cache.get(identity.key).expires <= Date.now());
  for (let offset = 0; offset < pending.length; offset += 10) {
    const batch = pending.slice(offset, offset + 10);
    const response = await fetcher(endpoint, { method: "POST", headers: {
      accept: "application/sparql-results+json", "content-type": "application/x-www-form-urlencoded",
      "user-agent": "AuxPlusCatalog/1.0 (public film and television metadata)",
    }, body: new URLSearchParams({ query: buildGenreQuery(batch), format: "json" }), signal: AbortSignal.timeout(20000) });
    if (!response.ok) throw new Error(`Metadata HTTP ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data.results?.bindings)) throw new Error("Invalid metadata response");
    const candidates = parseGenreEntities(data.results.bindings);
    for (const identity of batch) {
      const match = matchGenreEntity(identity, candidates, false);
      const season = match?.kind === "series" ? match.seasons.filter(season => season.releasedAt <= Date.now()).sort((a, b) => b.releasedAt - a.releasedAt || b.number - a.number)[0] : undefined;
      cache.set(identity.key, { expires: Date.now() + (match ? 7 * 86400000 : 3600000), value: {
        genres: match?.genres || [], source: match ? `https://www.wikidata.org/wiki/${match.id}` : undefined, checkedAt: Date.now(), metadataVersion: METADATA_VERSION,
        seasonReference: season ? { number: season.number, releasedAt: season.releasedAt, source: `https://www.wikidata.org/wiki/${season.id}` } : undefined,
      } });
    }
  }
  const result = Object.fromEntries(identities.map(identity => [identity.key, cache.get(identity.key).value]));
  while (cache.size > 40000) cache.delete(cache.keys().next().value);
  return result;
}

export async function catalogGenresHandler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") { res.statusCode = 405; res.setHeader("Allow", "POST"); res.end(JSON.stringify({ error: "Use POST." })); return; }
  let body = req.body;
  try {
    if (body === undefined) {
      let text = "";
      for await (const chunk of req) { text += chunk; if (text.length > 24000) throw new Error("Body too large"); }
      body = JSON.parse(text);
    } else if (typeof body === "string" || Buffer.isBuffer(body)) body = JSON.parse(String(body));
    if (!Array.isArray(body?.titles) || body.titles.length < 1 || body.titles.length > GENRE_BATCH_SIZE || body.titles.some(title =>
      !title || typeof title.name !== "string" || title.name.length < 1 || title.name.length > 240 || !["movie", "series"].includes(title.kind) ||
      title.releaseYear !== undefined && (!Number.isInteger(title.releaseYear) || title.releaseYear < 1800 || title.releaseYear > 2100))) throw new Error("Invalid titles");
  } catch { res.statusCode = 400; res.end(JSON.stringify({ error: "Informe até 40 títulos válidos." })); return; }
  try { res.end(JSON.stringify({ entries: await lookupCatalogGenres(body.titles), source: "Wikidata" })); }
  catch { res.statusCode = 502; res.end(JSON.stringify({ error: "A fonte de gêneros está temporariamente indisponível." })); }
}
