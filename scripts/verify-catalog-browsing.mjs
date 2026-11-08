import assert from "node:assert/strict";
import { catalogPage, catalogGenreOptions, catalogGenres, genreKey } from "../src/lib/catalogBrowsing.ts";
import { normalizeCatalog } from "../src/lib/uniplayDiscover.ts";

const items = Array.from({ length: 117 }, (_, i) => ({ key: String(i), name: String(i), kind: i % 2 ? "series" : "movie" }));
const first = catalogPage(items, 1), second = catalogPage(items, 2), last = catalogPage(items, 3);
assert.equal(first.items.length, 48);
assert.equal(second.items.length, 48);
assert.equal(last.items.length, 21);
assert.equal(last.totalPages, 3);
assert.deepEqual([...first.items, ...second.items, ...last.items], items, "every result appears exactly once across pages");
assert.equal(catalogPage(items.slice(0, 2), 3).page, 1, "a smaller filtered result clamps an old page");
assert.equal(catalogPage([], 4).first, 0);
assert.equal(catalogPage([], 4).items.length, 0);
assert.equal(catalogPage(items, -1).page, 1);
const many = catalogPage(Array.from({ length: 30000 }), 400);
assert.ok(many.pages.length <= 5, "large catalogs keep page controls compact");
assert.ok(many.pages.includes(1) && many.pages.includes(many.totalPages));
const [movie, series, unknown] = normalizeCatalog({ movies: [
  { name: "Filme", info: { genres: [{ id: 1, name: "Ação" }, { name: "Drama" }, { name: "AÇÃO" }] } },
], series: [{ name: "Série", genre: "Drama / Comédia" }, { name: "Ação no título", category_name: "LANÇAMENTOS" }] });
assert.equal(movie.genres.length, 2, "genre spelling is deduplicated without guessing from names");
assert.deepEqual(series.genres, ["Drama", "Comédia"]);
assert.deepEqual(unknown.genres, [], "a title or category is never treated as genre evidence");
assert.deepEqual(catalogGenres([12, 18, "18", null, {}]), [], "numeric genre IDs need an authoritative mapping");
const genres = catalogGenreOptions([movie, series, unknown]);
assert.equal(genres.length, 3);
assert.equal(genreKey(" AÇÃO "), "acao");
const filtered = [movie, series, unknown].filter(item => item.genres.some(g => genreKey(g) === "drama"));
assert.equal(catalogPage(filtered, 8).items.length, 2, "genre filtering happens before pagination");
console.log("PASS: fixed page size, full traversal, filter clamping, compact navigation and explicit genre metadata");
