import assert from "node:assert/strict";
import { parseGenreEntities, buildGenreQuery } from "./lib/catalog-genres.mjs";
import { matchRecentSeasonGuide, translateSourceGenres } from "../src/lib/catalogGenreIdentity.mjs";
import { catalogSeasonNews, catalogNews } from "../src/lib/uniplayDiscover.ts";
import { getRecentSeasons, recentSeasonsHandler } from "./lib/recent-seasons.mjs";

const now = Date.parse("2026-10-28T12:00:00Z");
const row = { item: { value: "http://www.wikidata.org/entity/Q111967146" }, label: { value: "Tulsa King" },
  kind: { value: "series" }, date: { value: "2022-11-13T00:00:00Z" }, genreLabel: { value: "gangster film" },
  season: { value: "http://www.wikidata.org/entity/Q141750282" }, seasonNumber: { value: "4" }, seasonDate: { value: "2026-10-16T00:00:00Z" } };
const candidates = parseGenreEntities([row]);
assert.deepEqual(candidates[0].genres, ["Crime"], "English-only source genres are translated instead of discarded");
assert.deepEqual(translateSourceGenres(["crime drama", "comédia dramática"]), ["Crime", "Drama", "Comédia"]);
const query = buildGenreQuery([{ name: "Tulsa King", kind: "series", year: 2022 }]);
assert.ok(query.includes('?genreEn') && query.includes('COALESCE(?genrePt, ?genreEn)'), "Portuguese metadata has an English fallback");
const series = { key: "series:1", name: "Tulsa King (2022)", kind: "series", releaseYear: 2022 };
const references = matchRecentSeasonGuide([series], candidates, now);
assert.equal(references[series.key].number, 4);
const enriched = { ...series, seasonReference: references[series.key] };
const news = catalogSeasonNews(enriched, now);
assert.equal(news.providerConfirmed, false, "an external premiere is not proof of provider availability");
assert.equal(news.order, Date.parse("2026-10-16T00:00:00Z"));
assert.equal(catalogNews(enriched, now), undefined, "an old series is not advertised as a new provider release");
assert.equal(catalogSeasonNews({ ...enriched, seasonReference: { ...enriched.seasonReference, releasedAt: now + 86400000 } }, now), undefined);
assert.equal(catalogSeasonNews({ ...enriched, seasonReference: { ...enriched.seasonReference, number: 1 } }, now), undefined);
assert.equal(Object.keys(matchRecentSeasonGuide([{ ...series, releaseYear: 2010 }], candidates, now)).length, 0, "a different premiere year is not matched");
assert.equal(Object.keys(matchRecentSeasonGuide([{ ...series, kind: "movie" }], candidates, now)).length, 0);
const direct = catalogSeasonNews({ ...series, latestSeason: 4, seasonReleasedAt: now - 86400000 }, now);
assert.equal(direct.providerConfirmed, true);
let calls = 0;
const guide = await getRecentSeasons(async (url, options) => {
  calls++;
  assert.equal(url, "https://query.wikidata.org/sparql");
  const query = options.body.get("query");
  assert.ok(query.includes("FILTER NOT EXISTS"), "later regional dates cannot turn an old season into a new premiere");
  assert.ok(!query.includes("Tulsa King"), "the public guide request contains no titles from the account");
  return { ok: true, json: async () => ({ results: { bindings: [row] } }) };
}, now);
assert.equal(guide.candidates.length, 1);
await getRecentSeasons(() => { throw new Error("Unexpected extra request"); }, now + 1000);
assert.equal(calls, 1);
const method = { setHeader() {}, end() {}, statusCode: 200 };
await recentSeasonsHandler({ method: "POST" }, method); assert.equal(method.statusCode, 405);
console.log("PASS: English fallback, actual season premieres, remake/year exclusion, no future seasons, availability distinction and anonymous public-guide caching");
