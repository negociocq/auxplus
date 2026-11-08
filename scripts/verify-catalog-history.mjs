import assert from "node:assert/strict";
import { mergeCatalogSnapshots, observeCatalog, parseCatalogSnapshot } from "../src/lib/uniplayDiscover.ts";

const start = Date.parse("2026-10-27T12:00:00Z"), nextDay = start + 86400000;
const oldTitle = { key: "movie:Antigo", name: "Antigo", kind: "movie" };
const newTitle = { key: "movie:Novo", name: "Novo", kind: "movie" };
const localBaseline = observeCatalog([oldTitle], null, start);
const local = observeCatalog([oldTitle, newTitle], localBaseline.snapshot, nextDay);
const online = observeCatalog([oldTitle, newTitle], null, nextDay + 1000);
assert.equal(online.items.filter(t => t.observedAt).length, 0, "a new origin has no history yet");
const shared = mergeCatalogSnapshots(local.snapshot, online.snapshot);
const recovered = observeCatalog([oldTitle, newTitle], shared, nextDay + 2000);
assert.equal(recovered.items[0].observedAt, undefined, "initial old catalog stays old");
assert.equal(recovered.items[1].observedAt, nextDay, "online recovers localhost's actual new inclusion");
assert.deepEqual(mergeCatalogSnapshots(online.snapshot, local.snapshot), shared, "migration order does not change history");
assert.deepEqual(mergeCatalogSnapshots(shared, shared), shared, "repeated syncing is idempotent");
assert.equal(parseCatalogSnapshot(JSON.stringify(shared)).baselineAt, start);
assert.equal(parseCatalogSnapshot({ version: 1, baselineAt: start, seen: { bad: "today" } }), null);
assert.equal(parseCatalogSnapshot("broken"), null);
assert.equal(mergeCatalogSnapshots(null, undefined), null);
const withSeason = mergeCatalogSnapshots({ ...local.snapshot, series: { s: { season: 2, seasonAt: nextDay } } },
  { ...online.snapshot, series: { s: { season: 3, seasonAt: nextDay + 1000 } } });
assert.equal(withSeason.series.s.season, 3);
assert.equal(withSeason.series.s.seasonAt, nextDay);
console.log("PASS: localhost to online migration, earliest observation, no false additions, repeat sync, invalid history and season preservation");
