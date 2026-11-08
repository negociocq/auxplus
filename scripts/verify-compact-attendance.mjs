import fs from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";
async function load(path) {
  const result = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }, reportDiagnostics: true });
  assert.equal(result.diagnostics.length, 0, path);
  return import(`data:text/javascript;base64,${Buffer.from(result.outputText).toString("base64")}`);
}
const { upgradePartnerTestFlow: upgrade } = await load("supabase/functions/_shared/partnerTestFlow.ts");
const { partnerDeviceGuide, partnerDeviceHelp } = await load("supabase/functions/_shared/partnerDeviceGuide.ts");
const base = upgrade({ texts: { askName: "Custom name", macOk: "Custom success" }, monthPriceBrl: 29, deviceMenu: { options: [] }, offerMenu: { options: [{ key: "1", action: "activate_month" }] } });

for (const version of [2,3,4,5,6,7,8,9,10,12]) {
 const flow=upgrade({...base,appCatalogVersion:version});
 assert.equal(flow.appCatalogVersion,13);
 assert.equal(flow.texts.askName,'Custom name');assert.equal(flow.texts.macOk,'Custom success');
 assert.equal(flow.monthPriceBrl,29);assert.deepEqual(flow.offerMenu,base.offerMenu);assert.deepEqual(upgrade(flow),flow);
 const menus=new Map(flow.appMenus.map(m=>[m.id,m.menu]));assert.equal(menus.size,flow.appMenus.length);
 for(const brand of ['samsung','lg','roku','android']) {
  assert.equal(flow.tvMenu.options.find(o=>o.nextMenuId===brand).action,'ask_app');
  const menu=menus.get(brand);
  assert.deepEqual(menu.options.filter(o=>o.action.startsWith('app_')).map(o=>o.action),['app_zuxo']);
  assert(menu.options.some(o=>o.action==='human'));
  assert.equal(new Set(menu.options.map(o=>o.key)).size,menu.options.length);
  assert.match(menu.message,brand==='samsung'?/manual/:/MAC/);
 }
 assert.match(flow.phoneApkUrl,/com.zuxoplayer.app/);assert.match(flow.phoneIosUrl,/id6782688104/);
}
for (const app of ["zuxo", "utm", "pixel"]) {
  const prompt = partnerDeviceGuide(app, true);
  assert.ok(prompt.includes("Mande uma foto"));
  assert.ok(prompt.includes("ou digite"));
  assert.ok(prompt.length < 290);
  assert.equal(prompt.includes("Se mandar foto:"), false);
  assert.equal(partnerDeviceGuide(app, false).includes("Mande uma foto"), false);
  assert.ok(partnerDeviceHelp(app, true).includes("instalar"));
}
assert.ok(partnerDeviceGuide("utm", true).includes("Settings → User Account"));
assert.ok(partnerDeviceGuide("pixel", true).includes("duas linhas"));
console.log("PASS: compact menus, direct Android route, visible installation help, brand-specific steps, direct continuation, preserved plans/texts, migration v2-v7, no duplicate options.");
