import { parseGenreEntities } from "./catalog-genres.mjs";

let cached, pending;
export async function getRecentSeasons(fetcher = fetch, now = Date.now()) {
  if (cached && cached.expires > now) return cached.data;
  if (pending) return pending;
  pending = (async () => {
    const since = new Date(now - 183 * 86400000).toISOString();
    const query = `SELECT DISTINCT ?item ?label ?date ?season ?seasonNumber ?seasonDate WHERE {
      ?season wdt:P31 wd:Q3464665; wdt:P577|wdt:P580 ?seasonDate.
      FILTER(?seasonDate >= "${since}"^^xsd:dateTime && ?seasonDate <= NOW())
      FILTER NOT EXISTS { ?season wdt:P577|wdt:P580 ?earlier. FILTER(?earlier < ?seasonDate) }
      ?item p:P527 ?part. ?part ps:P527 ?season; pq:P1545 ?seasonNumber.
      ?item (rdfs:label|skos:altLabel) ?label. FILTER(LANG(?label) IN ("pt", "pt-br", "en", "mul"))
      OPTIONAL { ?item wdt:P577|wdt:P580 ?date }
    } LIMIT 15000`;
    const response = await fetcher("https://query.wikidata.org/sparql", { method: "POST", headers: {
      accept: "application/sparql-results+json", "content-type": "application/x-www-form-urlencoded",
      "user-agent": "AuxPlusCatalog/1.0 (public season premiere guide)",
    }, body: new URLSearchParams({ query, format: "json" }), signal: AbortSignal.timeout(25000) });
    if (!response.ok) throw new Error("Season guide unavailable");
    const data = await response.json();
    if (!Array.isArray(data.results?.bindings)) throw new Error("Invalid season guide");
    const candidates = parseGenreEntities(data.results.bindings.map(row => ({ ...row, kind: { value: "series" } })));
    const result = { candidates, checkedAt: now, source: "Wikidata", partial: data.results.bindings.length >= 15000 };
    cached = { data: result, expires: now + 3600000 };
    return result;
  })();
  try { return await pending; } finally { pending = undefined; }
}

export async function recentSeasonsHandler(req, res) {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  if (req.method !== "GET") { res.statusCode = 405; res.setHeader("Allow", "GET"); res.end(); return; }
  try {
    const data = await getRecentSeasons();
    res.setHeader("Cache-Control", "public, max-age=300, s-maxage=3600"); res.end(JSON.stringify(data));
  } catch {
    res.statusCode = 502; res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify({ error: "O guia de estreias de temporadas está temporariamente indisponível." }));
  }
}
