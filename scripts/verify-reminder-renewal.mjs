import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import ts from "typescript";
import { format, differenceInCalendarDays } from "date-fns";

function functions(path, names, globals = {}) {
  const source = ts.createSourceFile(path, fs.readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const code = source.statements.filter((node) => ts.isFunctionDeclaration(node) && names.includes(node.name?.text))
    .map((node) => node.getText(source).replace(/^export\s+/, "")).join("\n");
  const context = vm.createContext(globals);
  vm.runInContext(ts.transpile(code), context);
  return context;
}
const due = functions("supabase/functions/_shared/itemDue.ts", ["dueTime", "mergeItemDue", "normalizePanelDue"], { Intl, Date });
const { isPaidReminderCycle } = functions("supabase/functions/_shared/reminderRenewal.ts", ["isPaidReminderCycle"]);
const oldItem = { id: 1, item_id: "839607443", due_date: "2026-10-23", due_time: "20:06:51", folder_id: 2, is_active: true, phone: "5571999999999", name: "Client" };
const order = { status: "released", kind: "renew", itemRefId: "1", panelUsername: "839607443", dueDate: "2026-10-23 20:06:51", paidAt: "2026-10-22T23:43:00Z" };
assert.equal(isPaidReminderCycle(oldItem, [order]), true, "payment yesterday retires today's old expiration");
assert.equal(isPaidReminderCycle({ ...oldItem, id: 9 }, [order]), true, "same username covers duplicate records");
assert.equal(isPaidReminderCycle({ ...oldItem, due_date: "2026-11-23" }, [order]), false, "next month's unpaid expiration remains eligible");
for (const status of ["pending", "rejected", "cancelled"]) assert.equal(isPaidReminderCycle(oldItem, [{ ...order, status }]), false);
assert.equal(isPaidReminderCycle(oldItem, [{ ...order, kind: "reseller_credits" }]), false);
assert.equal(isPaidReminderCycle({ ...oldItem, id: 7, item_id: "other" }, [order]), false, "another account on the same phone remains eligible");

const settings = { sendTime: "08:00", sendOnDay: true, sendBefore: true, daysBefore: 3, messageOnDay: "{due_date}", messageBefore: "{due_date}" };
const server = functions("supabase/functions/wa-auto-send/index.ts", ["buildTodayQueue", "pad2", "parseSendTime", "ymdOnly", "calendarDaysBetween", "phoneDigits", "normalizeBrPhone"], {
  mergeItemDue: due.mergeItemDue, fillWhatsappTemplate: (_template, row) => row.dueDate,
});
const folders = [{ id: 2, type: "Cliente" }];
assert.equal(server.buildTodayQueue(settings, [oldItem], folders, [], "2026-10-23").length, 1);
assert.equal(server.buildTodayQueue(settings, [oldItem].filter((item) => !isPaidReminderCycle(item, [order])), folders, [], "2026-10-23").length, 0);
assert.equal(server.buildTodayQueue(settings, [{ ...oldItem, due_date: "2026-11-23" }], folders, [{ day: "2026-10-23", kind: "onday", phone: oldItem.phone }], "2026-11-23").length, 1, "last month's reminder must not suppress the next cycle");
assert.equal(server.buildTodayQueue(settings, [{ ...oldItem, due_date: "2026-10-26" }], folders, [], "2026-10-23").length, 1, "before reminder must not consider itself a newer duplicate");
const browserQueue = functions("src/lib/whatsappAutomation.ts", ["buildTodayQueue", "parseSendTime", "ymdOnly", "parseLocalYmd", "phoneDigits", "normalizeBrPhone"], {
  format, differenceInCalendarDays, isRevenueFolderType: () => true,
  fillWhatsappTemplate: (_template, row) => row.dueDate,
});
const browserItem = { id: "1", folderId: "2", itemId: "839607443", isActive: true, dueDate: "2026-10-26 20:06:51", phone: oldItem.phone };
assert.equal(browserQueue.buildTodayQueue(settings, [browserItem], [{ id: "2", type: "Cliente" }], [], new Date(2026, 9, 23)).length, 1);
assert.equal(browserQueue.buildTodayQueue(settings, [{ ...browserItem, dueDate: "2026-11-23 20:06:51" }], [{ id: "2", type: "Cliente" }], [], new Date(2026, 9, 23)).length, 0);

let remoteRows = [oldItem], remoteOrders = [order], fail = false;
const supabase = { from(table) {
  const q = { select: () => q, in: () => q, eq: () => q, maybeSingle: () => q,
    then: (resolve) => Promise.resolve({ data: table === "items" ? remoteRows : { value: { orders: remoteOrders } }, error: fail ? { message: "offline" } : null }).then(resolve) };
  return q;
} };
const app = functions("src/lib/whatsappAutomation.ts", ["loadCurrentReminderQueue"], { supabase, isPaidReminderCycle, buildTodayQueue: (s, items) => items });
assert.equal((await app.loadCurrentReminderQueue("1", settings, folders, [])).length, 0);
remoteOrders = [];
remoteRows = [{ ...oldItem, due_date: "2026-11-23" }];
assert.equal((await app.loadCurrentReminderQueue("1", settings, folders, []))[0].dueDate, "2026-11-23 20:06:51", "uses fresh persisted expiration and time, never cached queue");
fail = true;
await assert.rejects(() => app.loadCurrentReminderQueue("1", settings, folders, []));
const renewal = functions("supabase/functions/mp-webhook/index.ts", ["ymdOnly", "nextDueAfterRenew"], { ...due, Date });
assert.match(renewal.nextDueAfterRenew("2090-10-23 20:06:51", 1), /^2090-11-23 20:06:51$/);
console.log("PASS: previous-day payments, stale queue, duplicate accounts, future cycles, early reminders, query failure and renewal time.");
