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
for (const version of [2, 3, 4, 5, 6, 7]) {
  const input = { ...base, appCatalogVersion: version };
  const flow = upgrade(input);
  assert.equal(flow.appCatalogVersion, 7);
  assert.equal(flow.texts.askName, "Custom name");
  assert.equal(flow.texts.macOk, "Custom success");
  assert.equal(flow.monthPriceBrl, 29);
  assert.equal(flow.offerMenu, base.offerMenu);
  assert.equal(upgrade(flow), flow);
  const menus = new Map(flow.appMenus.map(menu => [menu.id, menu.menu]));
  assert.equal(menus.size, flow.appMenus.length);
  for (const brand of ["samsung", "lg", "roku"]) {
    const choice = flow.tvMenu.options.find(option => option.nextMenuId === brand);
    assert.equal(choice.action, "ask_app");
    const menu = menus.get(choice.nextMenuId);
    assert.ok(menu.message.length < 120);
    assert.equal(menu.options.find(option => option.key === "1").action, "app_prime");
    assert.equal(menu.options.find(option => option.key === "2").action, "app_pixel");
    assert.equal(menu.options.find(option => option.key === "3").action, "app_utm");
    const help = menu.options.find(option => option.key === "4");
    assert.equal(help.action, "ask_app");
    assert.equal(help.label, "Não sei instalar");
    const guide = menus.get(help.nextMenuId);
    assert.ok(guide.message.includes("casinha"));
    assert.ok(guide.message.includes("4."));
    assert.ok(guide.message.length < 280);
    assert.deepEqual(guide.options.filter(option => option.action.startsWith("app_")).map(option => option.action), ["app_prime", "app_pixel", "app_utm"]);
    assert.equal(guide.options.find(option => option.key === "9").action, "human");
  }
  assert.equal(flow.tvMenu.options.find(option => option.key === "4").action, "app_pixel");
  for (const menu of [flow.tvMenu, ...menus.values()]) for (const option of menu.options) {
    if (option.action === "ask_app") assert.ok(menus.has(option.nextMenuId), option.nextMenuId);
  }
  for (const menu of menus.values()) assert.equal(new Set(menu.options.map(option => option.key)).size, menu.options.length);
}
for (const app of ["prime", "utm", "pixel"]) {
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
