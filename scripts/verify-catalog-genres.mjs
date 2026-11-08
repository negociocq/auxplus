import assert from "node:assert/strict";
import { genreIdentity, matchGenreEntity, genreTitleVariants } from "../src/lib/catalogGenreIdentity.mjs";
import { buildGenreQuery, lookupCatalogGenres, catalogGenresHandler, parseGenreEntities } from "./lib/catalog-genres.mjs";

const title = { name: "Viúva Negra (2021) 4K LEG", kind: "movie", releaseYear: 2021 };
const identity = genreIdentity(title);
assert.equal(identity.name, "Viúva Negra");
assert.equal(genreIdentity({ ...title, name: "Viúva Negra (2021)" }).key, identity.key, "quality variants share a cache key");
assert.equal(genreIdentity({ name: "1917", kind: "movie" }).name, "1917", "numeric titles are not stripped as years");
assert.equal(genreIdentity({ name: "Tulsa King 2022 Leg", kind: "series" }).name, "Tulsa King");
assert.ok(genreTitleVariants("O MORRO DOS VENTOS UIVANTES").includes("O Morro dos Ventos Uivantes"));
const candidate = { id: "Q23894626", kind: "movie", names: ["Viúva Negra"], years: [2021], genres: ["Ação"] };
assert.equal(matchGenreEntity(identity, [candidate]), candidate);
assert.equal(matchGenreEntity({ ...identity, year: 1987 }, [candidate]), undefined, "do not classify a remake as the newer movie");
assert.equal(matchGenreEntity({ ...identity, kind: "series" }, [candidate]), undefined, "film and series are distinct");
assert.equal(matchGenreEntity(identity, [candidate, { ...candidate, id: "Q123" }]), undefined, "ambiguous titles stay unknown");
const binding = { item: { value: "http://www.wikidata.org/entity/Q23894626" }, label: { value: "Viúva Negra" },
  kind: { value: "movie" }, genreLabel: { value: "filme de ação" }, date: { value: "2021-07-09T00:00:00Z" } };
assert.deepEqual(parseGenreEntities([binding])[0].genres, ["Ação"]);
let calls = 0;
const fetcher = async (url, options) => {
  calls++;
  assert.equal(url, "https://query.wikidata.org/sparql");
  assert.equal(options.method, "POST");
  const query = options.body.get("query");
  assert.ok(query.includes('"Viúva Negra"@pt'));
  return { ok: true, json: async () => ({ results: { bindings: [binding] } }) };
};
const entries = await lookupCatalogGenres([title], fetcher);
assert.deepEqual(entries[identity.key].genres, ["Ação"]);
assert.equal(entries[identity.key].source, "https://www.wikidata.org/wiki/Q23894626");
await lookupCatalogGenres([title], fetcher);
assert.equal(calls, 1, "a cached match does not make another external request");
const injected = buildGenreQuery([{ name: 'Title" } SERVICE <https://bad.example> { "', kind: "movie" }]);
assert.ok(injected.includes('Title\\"'), "title literals are escaped inside the fixed query");
function response() { return { statusCode: 200, setHeader() {}, end(text) { this.body = text; } }; }
const get = response(); await catalogGenresHandler({ method: "GET" }, get); assert.equal(get.statusCode, 405);
const tooMany = response(); await catalogGenresHandler({ method: "POST", body: { titles: Array.from({ length: 41 }, () => title) } }, tooMany); assert.equal(tooMany.statusCode, 400);
const invalid = response(); await catalogGenresHandler({ method: "POST", body: { titles: [{ ...title, kind: "person" }] } }, invalid); assert.equal(invalid.statusCode, 400);
console.log("PASS: localized title/year/kind matching, ambiguous remakes, quality variants, genre translation, request caching, escaping and input limits; no external requests made");
