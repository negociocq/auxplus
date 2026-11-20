import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("C:/Users/Premium PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright");
const day = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const states = { football: { settings: { enabled: false, send_time: "07:00" }, posts: [] }, content: { settings: { enabled: false, send_time: "09:00", pages_per_kind: 1 }, posts: [] } };
const postActions = [], uiErrors = [];
const image = "data:image/png;base64," + fs.readFileSync("tmp/catalog-banner-render-check.png").toString("base64");
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", error => uiErrors.push(error.message));
await page.route("**/*", async route => {
  const req = route.request(), url = new URL(req.url());
  if (url.pathname === "/__hub_test") return route.fulfill({ contentType: "text/html", body: `<!doctype html><main id="root" class="mx-auto max-w-6xl space-y-4 p-5"></main><script type="module">
    import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
    await import('/src/globals.css');
    localStorage.setItem('auxplus-recovery-session-v1',JSON.stringify({userId:'fixture',token:'fixture-session',expiresAt:'2100-01-01'}));
    const R=await import('/node_modules/.vite/deps/react.js');const React=R.default||R;const D=await import('/node_modules/.vite/deps/react-dom_client.js');const createRoot=D.createRoot||D.default.createRoot;
    const {StatusBannerHub}=await import('/src/components/StatusBannerHub.tsx');createRoot(document.getElementById('root')).render(React.createElement(StatusBannerHub));
    </script>` });
  if (url.pathname === "/src/context/AppContext.tsx") return route.fulfill({ contentType: "application/javascript", body: "export const useApp=()=>({user:{id:'fixture',username:'fixture'}});" });
  if (url.pathname.includes("/functions/v1/wa-football-status") || url.pathname.includes("/functions/v1/wa-content-status")) {
    const body = req.postDataJSON(), prefix = body.action.startsWith("football") ? "football" : "content", state = states[prefix];
    if (body.action.endsWith("-post-now")) {
      postActions.push(body.action);
      state.posts = [0,1].map((i) => ({ id: `${prefix}-${i}`, post_day: day, banner_day: prefix === "football" ? day : undefined, region: prefix === "football" ? i ? "international" : "national" : undefined, kind: prefix === "content" ? i ? "series" : "movie" : undefined, page: 0, total: 1, status: "queued" }));
    } else if (body.action.endsWith("-state") && state.posts.length) state.posts.forEach(post => { post.status = "sent"; });
    else if (body.action.endsWith("-save")) { state.settings.enabled = body.enabled; state.settings.send_time = body.sendTime; if (prefix === "content") state.settings.pages_per_kind = body.pagesPerKind; }
    else if (body.action === "content-status-preview") {
      if (body.kind) return route.fulfill({ json: { image } });
      return route.fulfill({ json: { day, pages: ["movie", "series"].map(kind => ({ kind, page: 0, total: 1, titles: [{ name: "Título de teste (2026)" }] })) } });
    }
    return route.fulfill({ json: state });
  }
  if (url.hostname === "site.api.espn.com") return route.fulfill({ json: { events: [] } });
  if (url.hostname === "ondeassistir.com.br") return route.fulfill({ json: { items: [] } });
  if (url.pathname === "/api/football-tv") return route.fulfill({ json: { fixtures: [] } });
  if (url.hostname.includes("supabase.co")) return route.fulfill({ json: [] });
  if (url.hostname === "127.0.0.1") return route.continue();
  return route.abort();
});
try {
  await page.goto("http://127.0.0.1:43177/__hub_test");
  await page.getByRole("button", { name: "Postar agora", exact: true }).waitFor({ timeout: 20000 });
  assert.equal(postActions.length, 0, "merely viewing banners cannot start a queue");
  await page.getByRole("button", { name: "Postar agora", exact: true }).click();
  await page.getByText("Concluído", { exact: true }).waitFor({ timeout: 12000 });
  assert.deepEqual(postActions, ["football-status-post-now"]);
  assert.equal(states.football.settings.enabled, false); assert.equal(states.football.settings.send_time, "07:00");
  await page.getByRole("button", { name: "Filmes e séries", exact: true }).click();
  await page.getByRole("button", { name: "Postar agora", exact: true }).waitFor();
  await page.getByRole("button", { name: "Postar agora", exact: true }).click();
  await page.getByText("Concluído", { exact: true }).waitFor({ timeout: 12000 });
  assert.deepEqual(postActions, ["football-status-post-now", "content-status-post-now"]);
  assert.equal(states.content.settings.enabled, false);
  await page.screenshot({ path: "tmp/status-hub-ui-check.png" });
  console.log(JSON.stringify({ passed: true, mockedPostActions: postActions, realWhatsAppCalls: 0, completionDisplayedForBothQueues: true, schedulesPreserved: true, uiErrors }));
} finally { await browser.close(); }
