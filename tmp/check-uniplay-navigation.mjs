import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { chromium } = createRequire(import.meta.url)("C:/Users/Premium PC/AppData/Local/npm-cache/_npx/e41f203b7505f1fb/node_modules/playwright");
const browser = await chromium.launch({ executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const page = await browser.newPage();
await page.route("**/*", route => {
  const url = new URL(route.request().url());
  if (url.pathname === "/__navigation") return route.fulfill({ contentType: "text/html", body: `<!doctype html><main class="space-y-4 p-4"><h1 class="text-2xl font-bold">UniPlay</h1><p class="text-sm text-muted-foreground">Clientes, revendedores, testes, renovações e atendimento do seu painel IPTV.</p><div id="root"></div></main><script type="module">
    import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;
    await import('/src/globals.css');const R=await import('/node_modules/.vite/deps/react.js');const React=R.default||R;const D=await import('/node_modules/.vite/deps/react-dom_client.js');
    const {Tabs}=await import('/src/components/ui/tabs.tsx');const {UniPlayNavigation}=await import('/src/components/UniPlayNavigation.tsx');
    (D.createRoot||D.default.createRoot)(document.getElementById('root')).render(React.createElement(Tabs,{defaultValue:'novidades'},React.createElement(UniPlayNavigation,{clients:258,resellers:4,tests:7})));
    </script>` });
  if (url.hostname === "127.0.0.1") return route.continue();
  return route.abort();
});
try {
  for (const width of [320, 360, 768, 1440]) {
    await page.setViewportSize({ width, height: 850 });
    await page.goto("http://127.0.0.1:43177/__navigation");
    await page.getByRole("tab", { name: "Novidades e jogos" }).waitFor();
    const geometry = await page.getByRole("tab").evaluateAll(nodes => nodes.map(node => { const r=node.getBoundingClientRect(); return {x:r.x,right:r.right,height:r.height,icons:node.querySelectorAll('svg').length}; }));
    assert.equal(geometry.length, 7);
    assert.ok(geometry.every(r => r.x >= 0 && r.right <= width && Math.round(r.height) >= (width < 1280 ? 48 : 40) && r.icons === 1), JSON.stringify({width,geometry}));
    await page.getByRole("tab", { name: /Clientes/ }).click();
    assert.equal(await page.getByRole("tab", { name: /Clientes/ }).getAttribute("data-state"), "active");
    await page.getByRole("tab", { name: "Novidades e jogos" }).click();
    if (width===360) await page.screenshot({path:"tmp/uniplay-primary-navigation-mobile.png"});
    console.log(JSON.stringify({width,tabsAligned:true,noOverflow:true,iconsAndCounters:true,navigationWorks:true}));
  }
} finally { await browser.close(); }
