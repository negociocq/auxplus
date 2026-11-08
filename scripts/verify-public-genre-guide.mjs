import assert from "node:assert/strict";
import { buildGenreGuideQuery, getCatalogGenreGuide, catalogGenreGuideHandler } from "./lib/catalog-genre-guide.mjs";
import { matchPublicGenreGuide } from "../src/lib/catalogGenreIdentity.mjs";
import { catalogGenreOptions } from "../src/lib/catalogBrowsing.ts";

const query = buildGenreGuideQuery("movie", 2026);
assert.ok(query.includes("rangeSafe true"));
assert.ok(query.includes("2026-01-01") && query.includes("2027-01-01"));
assert.ok(!query.includes("VALUES ?label"), "the source sees no list of account titles");
assert.ok(buildGenreGuideQuery("series", 2022).includes("P580"));
const title = { key: "movie:1", name: "Teste (2026)", kind: "movie", releaseYear: 2026 };
const candidate = { id: "Q1", kind: "movie", names: ["Teste"], years: [2026], genres: ["Drama"] };
const matches = matchPublicGenreGuide([title], [candidate]);
assert.deepEqual(Object.values(matches)[0].genres, ["Drama"]);
assert.equal(Object.keys(matchPublicGenreGuide([{ ...title, releaseYear: 1990 }], [candidate])).length, 0);
assert.equal(Object.keys(matchPublicGenreGuide([{ ...title, name: "Teste", releaseYear: undefined }], [candidate])).length, 0, "a partial public guide cannot disambiguate a title without its year");
assert.equal(Object.keys(matchPublicGenreGuide([title], [candidate, { ...candidate, id: "Q2" }])).length, 0);
assert.equal(catalogGenreOptions([{ ...title, genres: Object.values(matches)[0].genres }])[0].value, "drama", "a real matched genre reaches the selector options");
let calls = 0;
const guide = await getCatalogGenreGuide("movie", 2026, async (url, options) => {
  calls++; assert.equal(url, "https://query.wikidata.org/sparql");
  return { ok: true, json: async () => ({ results: { bindings: [{ item: { value: "http://www.wikidata.org/entity/Q1" }, label: { value: "Teste" }, date: { value: "2026-01-10T00:00:00Z" }, genreLabel: { value: "drama" } }] } }) };
});
assert.equal(guide.candidates.length, 1);
await getCatalogGenreGuide("movie", 2026, () => { throw new Error("Extra request"); }); assert.equal(calls, 1);
const response = () => ({ statusCode: 200, setHeader() {}, end() {} });
const invalid = response(); await catalogGenreGuideHandler({ method: "GET", url: "/?kind=movie&year=evil" }, invalid); assert.equal(invalid.statusCode, 400);
const post = response(); await catalogGenreGuideHandler({ method: "POST", url: "/" }, post); assert.equal(post.statusCode, 405);
console.log("PASS: anonymous year/type guide, typed date range, local matching, year and ambiguity safeguards, selector options and HTTP validation");
