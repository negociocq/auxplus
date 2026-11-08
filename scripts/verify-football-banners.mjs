import assert from "node:assert/strict";
import fs from "node:fs";
import ts from "typescript";
import { brasiliaDay } from "../src/lib/uniplayDiscover.ts";

const js = ts.transpileModule(fs.readFileSync("src/lib/footballBanner.ts", "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
}).outputText;
const api = {};
new Function("require", "exports", js)(() => ({ brasiliaDay }), api);
assert.deepEqual(api.bannerDays(new Date("2026-10-28T02:59:59Z")), ["2026-10-27", "2026-10-28"]);
assert.deepEqual(api.bannerDays(new Date("2026-10-28T03:00:00Z")), ["2026-10-28", "2026-10-29"]);
assert.deepEqual(api.bannerDays(new Date("2026-12-31T12:00:00Z")), ["2026-12-31", "2027-01-01"]);
const matches = Array.from({ length: 11 }, (_, n) => ({ id: String(n), date: "2026-10-28T22:30:00Z", brazil: true,
  home: `Casa ${n}`, away: `Visitante ${n}`, channels: ["Premiere"] }));
const pages = api.bannerPages([...matches, { ...matches[0], id: "outside", brazil: false },
  { ...matches[0], id: "wrong-day", date: "2026-10-29T03:00:00Z" }], "2026-10-28");
assert.deepEqual(pages.map(p => p.length), [5, 5, 1]);
assert.equal(pages.flat().length, matches.length, "pagination must not silently omit matches");
assert.deepEqual(api.bannerPages([], "2026-10-28"), [[]]);
const international = [
  { ...matches[0], id: "intl-featured", brazil: false, highlight: true },
  { ...matches[0], id: "intl-minor", brazil: false, highlight: false },
  { ...matches[0], id: "intl-other-day", brazil: false, highlight: true, date: "2026-10-29T22:30:00Z" },
];
assert.deepEqual(api.bannerPages([...matches, ...international], "2026-10-28", "international").flat().map(m => m.id), ["intl-featured"], "international banners must exclude national fixtures, minor games and other dates");
const drawn = [];
const context = new Proxy({ measureText: str => ({ width: str.length * 12 }),
  createLinearGradient: () => ({ addColorStop() {} }), createRadialGradient: () => ({ addColorStop() {} }),
  fillText: text => drawn.push(text),
}, { get: (obj, key) => key in obj ? obj[key] : () => {} });
const canvas = { getContext: () => context };
api.drawFootballBanner(canvas, "2026-10-28", "Amanhã", pages[0], 0, pages.length, true);
assert.equal(canvas.width, 1080); assert.equal(canvas.height, 1920);
assert.ok(drawn.includes("AUXPLUS")); assert.ok(!drawn.some(s => s.includes("VYNEX PLAY")));
assert.ok(drawn.includes("AMANHÃ")); assert.ok(drawn.includes("19h30"));
assert.ok(drawn.some(s => s.includes("AGENDA PARCIAL")));
assert.ok(drawn.includes("FUTEBOL NACIONAL"));
drawn.length = 0;
api.drawFootballBanner(canvas, "2026-10-28", "Hoje", international.slice(0, 1), 0, 1, false, "international");
assert.ok(drawn.includes("FUTEBOL INTERNACIONAL"));
assert.ok(!drawn.includes("FUTEBOL NACIONAL"));
drawn.length = 0;
api.drawFootballBanner(canvas, "2026-10-28", "Hoje", [], 0, 1, false);
assert.ok(drawn.includes("Nenhum jogo brasileiro"));
drawn.length = 0;
api.drawFootballBanner(canvas, "2026-10-28", "Hoje", [], 0, 1, false, "international");
assert.ok(drawn.includes("Nenhum destaque internacional"));
assert.throws(() => api.drawFootballBanner({ getContext: () => null }, "2026-10-28", "Hoje", [], 0, 1, false));
console.log("Football banners: Brasília rollover, year boundary, pagination, branding, dimensions and empty/error states passed.");
