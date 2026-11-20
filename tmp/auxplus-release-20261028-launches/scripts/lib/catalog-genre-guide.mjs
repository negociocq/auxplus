import { parseGenreEntities } from "./catalog-genres.mjs";

const cache = new Map(), pending = new Map();
export function buildGenreGuideQuery(kind, year) {
  const dateProperty = kind === "series" ? "P580" : "P577";
  const root = kind === "series" ? "Q5398426" : "Q11424";
  return `SELECT DISTINCT ?item ?label ?date ?genreLabel WHERE {
    ?item wdt:${dateProperty} ?date. hint:Prior hint:rangeSafe true.
    FILTER(?date >= "${year}-01-01T00:00:00Z"^^xsd:dateTime && ?date < "${year + 1}-01-01T00:00:00Z"^^xsd:dateTime)
    ?item wdt:P31 wd:${root}; wdt:P136 ?genre; (rdfs:label|skos:altLabel) ?label.
    FILTER(LANG(?label) IN ("pt", "pt-br", "en", "mul"))
    OPTIONAL { ?genre rdfs:label ?pt. FILTER(LANG(?pt)="pt") }
    OPTIONAL { ?genre rdfs:label ?en. FILTER(LANG(?en)="en") }
    BIND(COALESCE(?pt,?en) AS ?genreLabel)
  } LIMIT 40000`;
}

export async function getCatalogGenreGuide(kind, year, fetcher = fetch) {
  const key = `${kind}:${year}`;
  if (cache.get(key)?.expires > Date.now()) return cache.get(key).data;
  if (pending.has(key)) return pending.get(key);
  const request = (async () => {
    const response = await fetcher("https://query.wikidata.org/sparql", { method: "POST", headers: {
      accept: "application/sparql-results+json", "content-type": "application/x-www-form-urlencoded",
      "user-agent": "AuxPlusCatalog/1.0 (public genre reference by year)",
    }, body: new URLSearchParams({ query: buildGenreGuideQuery(kind, year), format: "json" }), signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error("Genre guide unavailable");
    const data = await response.json();
    if (!Array.isArray(data.results?.bindings)) throw new Error("Invalid genre guide");
    const candidates = parseGenreEntities(data.results.bindings.map(row => ({ ...row, kind: { value: kind } })));
    const guide = { candidates, source: "Wikidata", partial: data.results.bindings.length >= 40000, checkedAt: Date.now() };
    cache.set(key, { data: guide, expires: Date.now() + 86400000 });
    while (cache.size > 80) cache.delete(cache.keys().next().value);
    return guide;
  })();
  pending.set(key, request);
  try { return await request; } finally { pending.delete(key); }
}

export async function catalogGenreGuideHandler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") { res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(); return; }
  const params = new URL(req.url || "/", "https://auxplus.vercel.app").searchParams;
  const kind = params.get("kind"), year = Number(params.get("year"));
  if (!["movie", "series"].includes(kind) || !Number.isInteger(year) || year < 1900 || year > 2100) {
    res.statusCode = 400; res.end(JSON.stringify({ error: "Informe um ano e tipo válidos." })); return;
  }
  try {
    const data = await getCatalogGenreGuide(kind, year);
    res.setHeader("Cache-Control", "public, max-age=3600, s-maxage=86400"); res.end(JSON.stringify(data));
  } catch {
    res.statusCode = 502; res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "O guia de gêneros está temporariamente indisponível. Tente novamente." }));
  }
}
