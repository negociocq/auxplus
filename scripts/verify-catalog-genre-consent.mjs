import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import * as discover from "../src/lib/uniplayDiscover.ts";
import * as identity from "../src/lib/catalogGenreIdentity.mjs";

const source = fs.readFileSync("src/hooks/useCatalogGenres.ts", "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const states = [], storage = new Map();
let stateIndex = 0, effects = [], calls = 0, section = "recent";
const react = {
  useState(initial) {
    const index = stateIndex++;
    if (!(index in states)) states[index] = typeof initial === "function" ? initial() : initial;
    return [states[index], value => { states[index] = typeof value === "function" ? value(states[index]) : value; }];
  },
  useMemo: fn => fn(), useRef: value => ({ current: value }), useEffect: fn => { effects.push(fn); },
};
const title = { key: "movie:1", name: "Viúva Negra (2021)", kind: "movie", releaseYear: 2021, password: "never-send-credentials" };
const key = identity.genreIdentity(title).key;
const context = vm.createContext({ exports: {}, require(name) {
  if (name === "react") return react;
  if (name === "@/lib/uniplayDiscover") return discover;
  if (name === "@/lib/catalogGenreIdentity.mjs") return identity;
  throw new Error(name);
}, localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
AbortController, AbortSignal, fetch: async (url, options = {}) => {
  calls++;
  assert.ok(["/metadata/genre-reference-20261028.json", "/api/catalog-genre-guide?kind=movie&year=2021"].includes(url));
  assert.equal(options.body, undefined, "no private title list is posted");
  assert.equal(options.method, undefined, "the public guide uses GET");
  assert.ok(!url.includes("never-send-credentials") && !url.includes("Negra"));
  return { ok: true, json: async () => ({ candidates: [{ id: "Q23894626", kind: "movie", names: ["Viúva Negra"], years: [2021], genres: ["Ação"] }] }) };
} });
vm.runInContext(code, context);
function render() {
  stateIndex = 0; effects = [];
  const result = context.exports.useCatalogGenres([title], { section, kind: "all", query: "", page: 1 });
  const cleanups = effects.map(fn => fn());
  return { result, cleanup: () => cleanups.forEach(fn => typeof fn === "function" && fn()) };
}
const initial = render();
assert.equal(initial.result.enabled, true, "the anonymous public guide starts automatically");
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(calls, 1, "an empty recent period still loads the initial public reference");
initial.cleanup();
const cached = render();
assert.equal(calls, 1, "cached genres avoid another lookup");
assert.equal(cached.result.titles[0].genres[0], "Ação");
cached.result.pause(); cached.cleanup();
const paused = render();
assert.equal(paused.result.enabled, false);
assert.equal(calls, 1);
assert.equal(storage.get("auxplus:public-genre-guide-paused:v1"), "true");
paused.cleanup();
section = "catalog";
paused.result.checkMore();
const resumed = render();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(calls, 2, "resuming loads the complementary year/type guide without repeating the static asset");
resumed.cleanup();
console.log("PASS: actual hook fills genres despite empty recent results, sends no titles or credentials, classifies locally, caches results and supports pause/resume");
