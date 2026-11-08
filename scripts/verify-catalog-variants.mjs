import assert from "node:assert/strict";
import { groupCatalogVariants, catalogPage } from "../src/lib/catalogBrowsing.ts";
import { catalogNews } from "../src/lib/uniplayDiscover.ts";

const now = Date.parse("2026-10-28T12:00:00Z");
const movie = (name, extra = {}) => ({ key: `movie:${name}`, name, kind: "movie", ...extra });
const input = [
  movie("18 Rosas (2026)", { addedAt: now - 10 * 86400000, genres: ["Romance"] }),
  movie("18 Rosas (2026) 4K", { image: "https://example.com/poster.jpg" }),
  movie("18 Rosas (2026) LEG", { observedAt: now, genres: ["Drama"], genreSource: "https://www.wikidata.org/wiki/Q1" }),
];
const before = JSON.stringify(input);
const grouped = groupCatalogVariants(input);
assert.equal(grouped.length, 1);
assert.equal(grouped[0].name, "18 Rosas (2026)");
assert.equal(grouped[0].audioLabel, "DUB/LEG");
assert.deepEqual(grouped[0].qualities, ["4K"]);
assert.equal(grouped[0].variantCount, 3);
assert.equal(grouped[0].addedAt, undefined);
assert.equal(grouped[0].observedAt, now, "a newly added language keeps the grouped title in weekly additions");
assert.equal(grouped[0].image, "https://example.com/poster.jpg");
assert.deepEqual(grouped[0].genres, ["Romance", "Drama"]);
assert.equal(grouped[0].releaseYear, 2026);
assert.ok(catalogNews(grouped[0], now), "group keys retain release evidence");
assert.equal(JSON.stringify(input), before, "provider rows and tracking history are not mutated");
assert.equal(groupCatalogVariants([...input].reverse())[0].key, grouped[0].key, "group identity does not depend on provider order");
assert.equal(groupCatalogVariants([movie("Filme (2026) DUB"), movie("Filme (2026) [LEG]")])[0].audioLabel, "DUB/LEG");
assert.equal(groupCatalogVariants([movie("Filme (2026) Dublado"), movie("Filme (2026) Legendado")]).length, 1);
assert.equal(groupCatalogVariants([movie("Filme (2026) LEG")])[0].audioLabel, "LEG", "a subtitle-only title is never marked dubbed");
assert.equal(groupCatalogVariants([movie("Filme (2026) DUB")])[0].audioLabel, "DUB");
assert.equal(groupCatalogVariants([movie("Filme (2026)")])[0].audioLabel, undefined, "an unmarked single title does not assert audio availability");
assert.equal(groupCatalogVariants([movie("Filme (2026) DUB/LEG")])[0].audioLabel, "DUB/LEG");
assert.equal(groupCatalogVariants([movie("Filme (2026) DUAL AUDIO")])[0].audioLabel, "DUAL", "dual audio alone does not prove subtitles");
assert.equal(groupCatalogVariants([movie("Filme (2026) 4K LEG"), movie("Filme (2026) DUB")]).length, 1);
assert.equal(groupCatalogVariants([movie("Filme (2026)"), movie("Filme (1987)")]).length, 2, "remakes stay separate");
assert.equal(groupCatalogVariants([movie("Filme 1 (2026)"), movie("Filme 2 (2026)")]).length, 2, "sequels stay separate");
assert.equal(groupCatalogVariants([movie("Filme (2026)"), { ...movie("Filme (2026) LEG"), kind: "series" }]).length, 2);
assert.equal(groupCatalogVariants([movie("Série T1 (2026)"), movie("Série T2 (2026)")]).length, 2, "explicit seasons stay separate");
assert.equal(groupCatalogVariants([movie("1917")])[0].name, "1917");
assert.equal(catalogPage(grouped, 1).items.length, 1, "pagination counts works, not editions");
console.log("PASS: one card per work, DUB/LEG and 4K, weekly recency, genre aggregation, release evidence, stable keys, remakes/sequels/seasons and immutable source history");
