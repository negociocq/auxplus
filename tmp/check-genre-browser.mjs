import fs from "node:fs";
import { createRequire } from "node:module";
import { normalizeCatalog } from "../src/lib/uniplayDiscover.ts";
import { parseGenreEntities } from "../scripts/lib/catalog-genres.mjs";
const require = createRequire(import.meta.url);
const { chromium } = require("C:/Users/Premium PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright");
const raw = JSON.parse(fs.readFileSync("tmp/catalog-diagnostic.json", "utf8"));
const normalized = normalizeCatalog(raw), now = Date.now();
const seen = Object.fromEntries(normalized.map(title => [title.key, now - 2 * 86400000]));
if (!process.argv.includes("--empty-recent")) normalized.filter(title => title.releaseYear === 2026).slice(0, 17).forEach(title => { seen[title.key] = now - 1000; });
const snapshot = { version: 1, baselineAt: now - 2 * 86400000, seen };
const guides = {
  "movie:2026": { candidates: parseGenreEntities(JSON.parse(fs.readFileSync("tmp/public-genres-2026.json", "utf8")).results.bindings.map(row => ({ ...row, kind: { value: "movie" } }))) },
  "movie:2021": JSON.parse(fs.readFileSync("tmp/public-genre-guide-movie-2021.json", "utf8")),
  "series:2026": JSON.parse(fs.readFileSync("tmp/public-genre-guide-series-2026.json", "utf8")),
};
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
const errors = [], requests = [];
page.on("pageerror", error => errors.push(error.message));
page.on("console", message => { if (message.type() === "error") errors.push(message.text().slice(0, 300)); });
await page.route("**/*", async route => {
  const request = route.request(), url = new URL(request.url());
  if (url.pathname === "/__genre_test") return route.fulfill({ contentType: "text/html", body: `<!doctype html><div id="root"></div><script type="module">
    import RefreshRuntime from '/@react-refresh';
    RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>type=>type; window.__vite_plugin_react_preamble_installed__=true;
    const ReactModule=await import('/node_modules/.vite/deps/react.js'); const React=ReactModule.default||ReactModule; const ReactDom=await import('/node_modules/.vite/deps/react-dom_client.js'); const createRoot=ReactDom.createRoot||ReactDom.default.createRoot;
    const {UniplayDiscoverPanel}=await import('/src/components/UniplayDiscoverPanel.tsx');
    const jwt=btoa(JSON.stringify({alg:'none'}))+'.'+btoa(JSON.stringify({exp:4102444800}))+'.test';
    createRoot(document.getElementById('root')).render(React.createElement(UniplayDiscoverPanel,{accountId:'browser-fixture',onToken:()=>{},creds:{apiBaseUrl:'https://gesapioffice.com/api',bearerToken:jwt,username:'fixture',defaultPackage:'1'}}));
    </script>` });
  if (url.pathname.includes("get-available-movies")) return route.fulfill({ json: raw });
  if (url.pathname === "/metadata/genre-reference-20261028.json") return route.fulfill({ contentType: "application/json", body: fs.readFileSync("public/metadata/genre-reference-20261028.json", "utf8") });
  if (url.pathname === "/api/catalog-genre-guide") {
    const key = `${url.searchParams.get("kind")}:${url.searchParams.get("year")}`; requests.push(key);
    return route.fulfill({ json: guides[key] || { candidates: [] } });
  }
  if (url.hostname.includes("supabase.co")) return route.fulfill(request.method() === "GET" ? { json: [{ value: snapshot }] } : { status: 204, body: "" });
  if (url.hostname === "127.0.0.1") return route.continue();
  return route.abort();
});
try {
  await page.goto("http://127.0.0.1:43177/__genre_test");
  if (!process.argv.includes("--empty-recent")) await page.getByRole("button", { name: "Últimos lançamentos", exact: true }).click({ timeout: 20000 });
  await page.waitForFunction(() => document.querySelector('select[aria-label="Filtrar por gênero"]')?.options.length > 2, null, { timeout: 8000 });
  const select = page.getByRole("combobox", { name: "Filtrar por gênero" });
  const options = await select.locator("option").allTextContents();
  await select.selectOption("drama");
  if (process.argv.includes("--empty-recent")) await page.getByRole("button", { name: "Catálogo completo", exact: true }).click();
  console.log(JSON.stringify({ optionCount: options.length, hasDrama: options.includes("Drama"), requests, errors, filteredCards: await page.locator("article").count() }));
  await page.screenshot({ path: "tmp/genre-browser-check.png" });
} catch (error) {
  console.log(JSON.stringify({ error: error.message, requests, errors, body: (await page.locator("body").innerText()).slice(0, 1800) }));
  await page.screenshot({ path: "tmp/genre-browser-check.png" });
  process.exitCode = 1;
} finally { await browser.close(); }
