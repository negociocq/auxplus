import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

function functionsFrom(path, names, globals = {}) {
  const text = readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true);
  const functions = source.statements.filter((node) =>
    ts.isFunctionDeclaration(node) && names.includes(node.name?.text),
  ).map((node) => node.getText(source).replace(/^export\s+/, ""));
  assert.equal(functions.length, names.length);
  const context = vm.createContext(globals);
  vm.runInContext(ts.transpile(functions.join("\n")), context);
  return context;
}

const bot = functionsFrom("supabase/functions/evolution-webhook/index.ts", [
  "fill", "formatDue", "formatDueTime", "formatDueWithTime", "fillDueTemplate",
  "todayYmdBrazil", "isClientStillActive", "clientRenewLabel", "clientRenewKind",
  "fillClientAskIntent", "fillClientRenewPix", "nextDueAfterRenewYmd",
  "addMonthsYmd", "nextDueAfterRenewDisplay",
]);
const due = "2026-11-19 19:54:31";
const dueModule = {};
vm.runInNewContext(ts.transpile(readFileSync(new URL("../supabase/functions/_shared/itemDue.ts", import.meta.url), "utf8")), { exports: dueModule, Intl, Date });
assert.equal(dueModule.mergeItemDue("2026-11-19", "19:54:31"), due);
assert.equal(dueModule.mergeItemDue("2026-11-19", null), "2026-11-19");
assert.equal(dueModule.normalizePanelDue("19/11/2026 19:54:31"), due);
assert.equal(dueModule.normalizePanelDue("2026-11-19T22:54:31Z"), due);
assert.equal(dueModule.dueTime("2026-11-19"), null, "date-only records must not invent midnight");
const models = functionsFrom("src/lib/whatsappBotConfig.ts", ["includeExpirationTime"]);
const oldIntro = "Vencimento atual: *{due}*\nVencimento após pagamento: *{newDue}*";
const updatedIntro = models.includeExpirationTime(oldIntro);
assert.equal(updatedIntro, "Vencimento atual: *{due}* {dueTime}\nVencimento após pagamento: *{newDue}* {newDueTime}");
assert.equal(models.includeExpirationTime(updatedIntro), updatedIntro);
const renderedIntro = bot.fillClientRenewPix(updatedIntro, { months: 1 }, due);
assert.match(renderedIntro, /Vencimento atual: \*19\/11\/2026\* 19:54:31/);
assert.match(renderedIntro, /Vencimento após pagamento: \*19\/12\/2026\* 19:54:31/);
assert.equal(renderedIntro.match(/19:54:31/g)?.length, 2);
for (const template of ["Vencimento: {due}", "Vencimento: {due} {dueTime}"]) {
  const menu = bot.fillClientAskIntent(template, { user: "example", dueDate: due });
  assert.match(menu, /19\/11\/2026 19:54:31/);
  assert.equal(menu.match(/19:54:31/g)?.length, 1);
  const pix = bot.fillClientRenewPix(template, { months: 1 }, due);
  assert.equal(pix.match(/19:54:31/g)?.length, 1);
}
assert.equal(bot.formatDueTime("2026-11-19T19:54"), "19:54:00");
assert.equal(bot.formatDueTime("2026-11-19"), "horário não informado");

for (const path of ["src/lib/whatsappAutomation.ts", "supabase/functions/wa-auto-send/index.ts"]) {
  const reminders = functionsFrom(path, ["formatDueForMessage", "fillWhatsappTemplate"], {
    greeting: () => "Olá", getWhatsappGreeting: () => "Olá",
  });
  for (const template of ["{due_date}", "{due_date} {dueTime}", "{due} {dueTime}"]) {
    assert.equal(reminders.fillWhatsappTemplate(template, { dueDate: due }, "before"), "19/11/2026 19:54:31");
  }
  assert.match(reminders.formatDueForMessage("2026-11-19"), /horário não informado/);
}
const pix = functionsFrom("src/lib/mercadoPagoOrders.ts", ["formatDueBr"]);
assert.equal(pix.formatDueBr(due), "19/11/2026 19:54:31");
const receipt = functionsFrom("supabase/functions/mp-webhook/index.ts", ["formatBrDate"]);
assert.equal(receipt.formatBrDate(due), "19/11/2026 19:54:31");
console.log("PASS: menus, Pix, reminders and receipts include expiration time without duplication.");
