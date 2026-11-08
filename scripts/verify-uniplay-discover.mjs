import assert from "node:assert/strict";
import { catalogDate, normalizeCatalog, observeCatalog, brasiliaDay, getFootballMatches, isFeaturedMatch, attachBrazilBroadcasts, attachSupplementalBroadcasts } from "../src/lib/uniplayDiscover.ts";
import { parseFootballTv, footballTvHandler } from "./lib/football-tv.mjs";

const baseline = Date.parse("2026-10-01T12:00:00Z");
const later = baseline + 86400000;
const initial = normalizeCatalog({ movies: [{ id: 1, name: "Antigo", thumb: "javascript:bad" }], series: [{ id: 1, name: "Série" }] });
assert.equal(initial.length, 2, "film and series IDs do not collide");
assert.equal(initial[0].image, undefined, "reject non-http image sources");
const first = observeCatalog(initial, null, baseline);
assert.ok(first.items.every(t => !t.observedAt), "initial catalog must not be advertised as new");
const next = observeCatalog([...initial, { key: "movie:2", name: "Novo", kind: "movie" }], first.snapshot, later);
assert.equal(next.items[0].observedAt, undefined);
assert.equal(next.items[2].observedAt, later);
assert.equal(observeCatalog(next.items, next.snapshot, later + 1000).items[2].observedAt, later, "refresh preserves first observation");
const removed = observeCatalog([], first.snapshot, later);
assert.equal(observeCatalog(initial, removed.snapshot, later + 1000).items[0].observedAt, undefined, "reappearing old titles must not be advertised as new");
assert.equal(catalogDate("2026"), undefined, "year alone does not establish a release date");
assert.equal(catalogDate("invalid"), undefined);
assert.equal(catalogDate("1793102400"), 1793102400000);
assert.equal(brasiliaDay(new Date(catalogDate("2026-10-27"))), "2026-10-27", "date-only release is not shifted to previous day");
assert.equal(brasiliaDay(new Date("2026-10-28T02:59:59Z")), "2026-10-27");
assert.equal(brasiliaDay(new Date("2026-10-28T03:00:00Z")), "2026-10-28");
assert.equal(isFeaturedMatch("Ceará", "Goiás", "Brazilian Serie B"), true);
assert.equal(isFeaturedMatch("Fleetwood", "Arsenal", "Carabao Cup"), true);
assert.equal(isFeaturedMatch("Real Madrid", "Barcelona", "U-19 Youth League"), false);
assert.equal(isFeaturedMatch("Town A", "Town B", "Regional Cup"), false);
const fixture = { id: "tv", date: "2026-10-27T23:00:00Z", home: "Ceará", away: "Goiás", channels: [] };
const feedItem = { title: "Ceara x Goias: onde assistir", content_text: "Série B, 27/10/2026 às 20:00 (Brasília); ESPN, Disney+.",
  url: "https://ondeassistir.com.br/jogo/ceara-x-goias-2026-10-27", date_modified: "2026-10-27T12:00:00Z" };
assert.deepEqual(attachBrazilBroadcasts([fixture], { items: [feedItem] })[0].channels, ["ESPN", "Disney+"]);
assert.deepEqual(attachBrazilBroadcasts([{ ...fixture, away: "Outro time" }], { items: [feedItem] })[0].channels, []);
assert.deepEqual(attachBrazilBroadcasts([{ ...fixture, date: "2026-10-28T23:00:00Z" }], { items: [feedItem] })[0].channels, []);
assert.deepEqual(attachBrazilBroadcasts([fixture], { items: [feedItem, { ...feedItem, date_modified: "2026-10-27T13:00:00Z", content_text: "Série B, 27/10/2026 às 20:00 (Brasília); transmissão a confirmar." }] })[0].channels, [], "latest source correction overrides old channel information");
const international = { ...fixture, home: "Bayern Munich", away: "Real Madrid", competition: "UEFA Women's Champions League" };
assert.deepEqual(attachBrazilBroadcasts([international], { items: [{ ...feedItem, title: "Bayern de Munique x Real Madrid: onde assistir", tags: ["UEFA Women's Champions League"] }] })[0].channels, ["ESPN", "Disney+"], "recognize translated team names");
const extra = { home: "FC Bayern Feminino", away: "Real Madrid Feminino", date: fixture.date, channels: ["Disney+ Premium", "ESPN"], url: "https://futebol.tv.br/jogo/bayern-real" };
assert.deepEqual(attachSupplementalBroadcasts([international], { fixtures: [extra] })[0].channels, extra.channels);
assert.deepEqual(attachSupplementalBroadcasts([{ ...international, competition: "Champions League" }], { fixtures: [extra] })[0].channels, [], "do not confuse men's and women's fixtures");
assert.deepEqual(attachSupplementalBroadcasts([international], { fixtures: [{ ...extra, date: "2026-10-28T23:00:00Z" }] })[0].channels, [], "do not reuse other dates' broadcasts");
assert.deepEqual(attachSupplementalBroadcasts([{ ...international, channels: ["Existing"] }], { fixtures: [extra] })[0].channels, ["Existing"], "preserve channels already found");
assert.deepEqual(attachSupplementalBroadcasts([international], { fixtures: [{ ...extra, url: "https://example.com/unknown" }] })[0].channels, []);
const html = `<article class="fixture-row relative"><a href="https://futebol.tv.br/jogo/milan-bologna" aria-label="Ver detalhes de AC Milan x Bologna"></a><time datetime="2026-10-28T14:30:00-03:00"></time><span class="channel-pill inline"><span>▻</span>Disney+ Premium</span><span class="channel-pill inline"><span>▻</span>ESPN 4</span></article>`;
assert.deepEqual(parseFootballTv(html)[0].channels, ["Disney+ Premium", "ESPN 4"]);
assert.equal(parseFootballTv(html + html).length, 1);
assert.deepEqual(parseFootballTv("<html>Source layout changed</html>"), []);
const methodResponse = { statusCode: 200, setHeader() {}, end() {} };
await footballTvHandler({ method: "POST" }, methodResponse);
assert.equal(methodResponse.statusCode, 405);

const originalFetch = globalThis.fetch;
const event = (id, date, status = "STATUS_SCHEDULED") => ({ id, date, status: { type: { name: status, state: "pre" } },
  competitions: [{ altGameNote: "Campeonato", competitors: [
    { homeAway: "home", team: { displayName: "Casa" } }, { homeAway: "away", team: { displayName: "Fora" } },
  ] }] });
try {
  globalThis.fetch = async url => {
    if (url === "/api/football-tv") return { ok: true, json: async () => ({ fixtures: [] }) };
    if (url.includes("/feed/jogos.json")) return { ok: true, json: async () => ({ items: [] }) };
    assert.match(url, /dates=2026102[78]&/, "query individual UTC days, including late Brazil matches");
    if (url.includes("bra.2")) throw new Error("Unavailable");
    return { ok: true, json: async () => ({ events: [event("1", "2026-10-28T02:00:00Z", "STATUS_POSTPONED"), event("2", "2026-10-28T03:00:00Z")] }) };
  };
  const result = await getFootballMatches("2026-10-27");
  assert.equal(result.matches.length, 1, "deduplicate source results and exclude next Brasília day");
  assert.equal(result.matches[0].brazil, true);
  assert.equal(result.matches[0].status, "Adiado");
  assert.equal(result.partial, true, "report incomplete source coverage");
  assert.equal(result.broadcastsUnavailable, false);
  globalThis.fetch = async url => {
    if (url === "/api/football-tv") throw new Error("Supplemental guide offline");
    if (url.includes("/feed/")) throw new Error("TV guide offline");
    return { ok: true, json: async () => ({ events: [event("1", "2026-10-27T23:00:00Z")] }) };
  };
  assert.equal((await getFootballMatches("2026-10-27")).broadcastsUnavailable, true, "TV guide failure must not hide the matches");
  globalThis.fetch = async () => { throw new Error("Offline"); };
  await assert.rejects(() => getFootballMatches("2026-10-27"), /Não foi possível/);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(() => getFootballMatches("2026-10-27", controller.signal), { name: "AbortError" });
} finally { globalThis.fetch = originalFetch; }
console.log("Uniplay discover: catalog baseline, dates, games, partial failure and cancellation passed.");
