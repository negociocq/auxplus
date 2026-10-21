import fs from "node:fs";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import ts from "typescript";
const nodeRequire = createRequire(import.meta.url);
function load(path, imports = {}) {
  const exports = {};
  const js = ts.transpileModule(fs.readFileSync(path, "utf8"), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function("require", "exports", js)((name) => imports[name] || nodeRequire(name), exports);
  return exports;
}
const extensions = load("src/lib/itemExtensions.ts");
const payments = load("src/lib/payments.ts", { "@/lib/planMonths": {}, "@/lib/itemExtensions": extensions });
const logModule = load("src/lib/uniplayRenewalLogs.ts");
const plans = load("src/lib/planMonths.ts");
const aliasesModule = load("src/lib/iptvUserAliases.ts");
const report = load("src/lib/renewalSummary.ts", { "@/lib/uniplayRenewalLogs": logModule, "@/lib/planMonths": plans, "@/lib/iptvUserAliases": aliasesModule });
const { recordPixPayment } = load("supabase/functions/_shared/renewalPayments.ts");
const { parseUniplayRenewalLogs } = load("src/lib/uniplayRenewalLogs.ts");
const date = "2026-10-20";
assert.equal(report.brazilDay(new Date("2026-10-20T02:30:00Z")), "2026-10-19");
assert.deepEqual(report.renewalRange("yesterday", date), { start: "2026-10-19", end: "2026-10-19" });
assert.deepEqual(report.renewalRange("week", date), { start: "2026-10-19", end: date });
assert.deepEqual(report.renewalRange("week", "2026-10-18"), { start: "2026-10-12", end: "2026-10-18" });

const a = { id: "a", itemId: "user-a", folderId: "iptv", name: "A", price: 30, payments: [{ paidAt: date, amount: 50, kind: "renewal", paymentId: "pix-a" }] };
const b = { ...a, id: "b", itemId: "user-b", name: "B", price: 40 };
const event = (id, username, occurredAt = "2026-10-20T12:00:00-03:00") => ({ id, username, occurredAt, oldDue: "2026-10-19T12:00:00-03:00", newDue: "2026-11-20T12:00:00-03:00" });
const events = [event("1", "user-a"), event("1", "user-a"), event("2", "user-a"), event("3", "user-b"), event("4", "unknown")];
const summary = report.summarizeRenewals([a, b], date, date, events);
assert.equal(summary.count, 4, "exactly one renewal per Uniplay log ID, including unmatched users");
assert.equal(summary.customers, 3, "unique users differ from renewal count");
assert.equal(summary.total, 100, "folder price is applied per log");
assert.equal(summary.missingAmounts, 1);
assert.equal(summary.unmatchedRenewals, 1);
assert.equal(summary.rows.find((row) => row.username === "unknown").item, null);
assert.ok(summary.rows.every((row) => row.source === "Uniplay"));
assert.equal(report.summarizeRenewals([a, b], date, date, []).count, 0, "payment history and Pix receipts never create a renewal row");
assert.equal(report.summarizeRenewals([a, b], date, date, events, false).count, 3, "a folder filter excludes unattributable logs");
assert.equal(report.summarizeRenewals([{ ...a, price: 44.9 }, b], date, date, events).total, 129.8);
assert.equal(a.payments[0].amount, 50, "report does not change actual receipts");
assert.equal(report.summarizeRenewals([a], date, date, [event("5", "user-a", "2026-10-21T02:59:59Z"), event("6", "user-a", "2026-10-21T03:00:00Z")]).count, 1);
assert.equal(report.summarizeRenewals([{ ...a, price: 0 }], date, date, [events[0]]).total, 0);
assert.equal(report.summarizeRenewals([{ ...a, price: undefined }], date, date, [events[0]]).missingAmounts, 1);
const clients = Array.from({ length: 95 }, (_, i) => ({ ...a, id: String(i), itemId: "user-" + i }));
const september = [...Array.from({ length: 98 }, (_, i) => event("log-" + i, "user-" + (i % 95))), ...Array.from({ length: 5 }, (_, i) => event("missing-" + i, "unknown-" + (i % 4)))];
const full = report.summarizeRenewals(clients, date, date, september);
assert.equal(full.count, 103, "the main card must match all 103 Uniplay renewals");
assert.equal(full.customers, 99);
assert.equal(full.unmatchedRenewals, 5);
assert.equal(full.total, 2940);
const log = { id: 101, usuario: "sample", date: "20/10/2026 12:00:00", acao: "[<b>UserPanel</b> -&gt; <u>Extend Line</u>] - Credits: 9 -&gt; 8 - Consumo de: 1<br><b>Vencimento de: 19/10/2026 22:00:00 para 20/11/2026 22:00:00</b>" };
const parsed = parseUniplayRenewalLogs({ logs: [log, log, { ...log, id: 102, acao: "Created" }, { ...log, id: 103, date: "31/02/2026 12:00:00" }, { ...log, id: 104, acao: log.acao.replace("Consumo de: 1", "Consumo de: 0") }] });
assert.equal(parsed.length, 1);
assert.equal(parsed[0].occurredAt, "2026-10-20T12:00:00-03:00");
const recreation = (id, oldUser, newUser, date) => ({ id, usuario: oldUser, date, acao: `[<b>UserPanel</b> -&gt; <u>Recreated</u>] - Usuário recriado para: <b>${newUser}</b>` });
const aliases = logModule.parseUniplayRecreatedLines({ logs: [
  recreation("r1", "old-user", "middle-user", "21/10/2026 12:00:00"),
  recreation("r2", "middle-user", "user-a", "22/10/2026 12:00:00"),
  { ...recreation("r3", "wrong", "user-a", "21/10/2026 12:00:00"), acao: "Edited username" },
] });
assert.equal(aliases.length, 2, "only explicit Recreated actions establish links");
const oldEvent = event("old-log", "old-user");
const recreated = report.summarizeRenewals([a], date, date, [oldEvent], true, aliases);
assert.equal(recreated.count, 1, "recreations do not add renewal events");
assert.equal(recreated.total, 30, "old login uses the current account's folder price");
assert.equal(recreated.unmatchedRenewals, 0);
assert.equal(recreated.rows[0].currentUsername, "user-a");
assert.equal(recreated.rows[0].username, "old-user", "preserve the historical username for review");
assert.equal(report.summarizeRenewals([a], date, "2026-10-31", [oldEvent, event("new-log", "user-a", "2026-10-23T12:00:00-03:00")], true, aliases).customers, 1);
const collision = [...aliases, { ...aliases[0], id: "conflict", newUsername: "other-user" }];
assert.equal(report.summarizeRenewals([a], date, date, [oldEvent], true, collision).unmatchedRenewals, 1, "ambiguous links must not choose a price");
assert.equal(logModule.resolveRecreatedUsername("old-user", "2026-10-23T12:00:00-03:00", aliases).username, "old-user", "a recreation before an event must not redirect a reused login");
const encoded = payments.embedPaymentsInNotes("Personal note", a.payments);
const old = { ...a, dueDate: "2026-10-20 19:00:00" };
const extended = extensions.withProrrogaUsage({ ...old, dueDate: "2026-10-22 19:00:00" }, { oldDue: old.dueDate, newDue: "2026-10-22 19:00:00", kind: "48h", usedAt: "2026-10-20T12:00:00Z" });
assert.deepEqual(payments.paymentsAfterDueChange(old, extended), a.payments, "free extension is not a paid renewal");
assert.deepEqual(payments.extractPaymentsFromNotes(encoded), a.payments);
assert.equal(payments.getRecordedPayments({ ...a, payments: undefined, notes: encoded })[0].paymentId, "pix-a");
const entry = { id: "pix-c", paidAt: `${date}T15:00:00Z`, amount: 25.9, kind: "renewal" };
const notes = recordPixPayment("Personal note", entry);
assert.equal(recordPixPayment(notes, entry), notes, "webhook retry is idempotent");
assert.equal(payments.extractPaymentsFromNotes(notes)[0].amount, 25.9);
assert.ok(notes.startsWith("Personal note"));
const historical = { ...a, createdAt: "2026-01-01", price: 35, planHistory: [
  { from: "2026-01-01", price: 30, planMonths: 1 },
  { from: "2026-10-21", price: 35, planMonths: 1 },
] };
assert.equal(report.summarizeRenewals([historical], date, date, [event("historical", "user-a")]).total, 30);
assert.equal(plans.planPriceOnDate(historical, "2026-10-21"), 35);
assert.equal(plans.planPriceOnDate(historical, "2025-08-01"), 30, "old recreated log uses earliest known price when it predates the folder item");
const segments = plans.resolvePlanSegmentsOnSave(historical, { ...historical, price: 40 }, "2026-11-01");
assert.equal(plans.planPriceOnDate({ ...historical, price: 40, planHistory: segments }, date), 30);
assert.equal(plans.planPriceOnDate({ ...historical, price: 40, planHistory: segments }, "2026-11-01"), 40);
const legacy = { ...a, createdAt: "2026-01-01", planMonths: 1 };
const multiMonth = plans.resolvePlanSegmentsOnSave(legacy, { ...legacy, price: 90, planMonths: 3 }, date);
assert.equal(multiMonth[0].price, 30, "first multi-month change must not overwrite prior prices");
assert.equal(multiMonth[1].price, 90);
const roundTrip = { ...legacy, price: 90, notes: plans.embedPlanState("note", 3, multiMonth) };
assert.equal(plans.planPriceOnDate(roundTrip, "2026-08-01"), 30, "history survives persisted notes and reload");
assert.equal(plans.planPriceOnDate(roundTrip, date), 90, "report uses full package price, not monthly fraction");
const aliasedItem = { ...historical, notes: '<!--AXUSERALIASES:["old-login"]-->' };
const aliasReport = report.summarizeRenewals([aliasedItem], date, date, [event("archived", "old-login")]);
assert.equal(aliasReport.total, 30, "confirmed archived login uses folder price history");
assert.equal(aliasReport.unmatchedRenewals, 0);
assert.equal(aliasReport.rows[0].currentUsername, "user-a");
assert.equal(aliasReport.rows[0].recreated, true);
assert.equal(report.summarizeRenewals([aliasedItem, { ...aliasedItem, id: "duplicate" }], date, date, [event("archived", "old-login")]).missingAmounts, 1, "conflicting aliases must not pick a client");
assert.deepEqual(aliasesModule.historicalIptvUsernames('<!--AXUSERALIASES:invalid-->'), []);
const preservedAliases = aliasesModule.preserveHistoricalIptvUsernames("Edited note", aliasedItem.notes, "another-old-login");
assert.deepEqual(aliasesModule.historicalIptvUsernames(preservedAliases), ["old-login", "another-old-login"], "editing visible notes and changing the login preserve historical links");
assert.equal(aliasesModule.stripHistoricalIptvUsernames(preservedAliases), "Edited note");
const editedLogins = logModule.parseUniplayRecreatedLines({ logs: [
  { id: "edit-1", usuario: "new", date: "20/10/2026 12:00:00", acao: "[UserPanel -> Edited] - Nome do usuário de: old para: new" },
  { id: "edit-2", usuario: "same", date: "20/10/2026 12:00:00", acao: "[UserPanel -> Edited] - Nome do usuário de: same para: same" },
] });
assert.equal(editedLogins.length, 1, "explicit username edits link logins; unchanged edits do not");
assert.equal(editedLogins[0].previousUsername, "old");
const foldersReport = load("src/lib/folderRenewalSummary.ts", { "@/lib/payments": payments, "@/lib/renewalSummary": report });
const offlineItems = [
  { ...a, price: 999, createdAt: "2026-01-01", payments: [
    { paidAt: date, amount: 30, kind: "renewal", paymentId: "confirmed" },
    { paidAt: date, amount: 30, kind: "renewal", paymentId: "confirmed" },
    { paidAt: date, amount: 80, kind: "initial" },
    { paidAt: date, amount: 90, kind: "estimated" },
    { paidAt: "2026-09-20", amount: 30, kind: "renewal" },
  ] },
  { ...b, folderId: "resellers", payments: [{ paidAt: date, amount: 85 }] },
  { ...a, id: "no-history", payments: [], notes: "", dueDate: date },
];
const offline = foldersReport.summarizeFolderRenewals(offlineItems, date, date, "resellers");
assert.equal(offline.renewalCount, 1);
assert.equal(offline.creditOperations, 1);
assert.equal(offline.total, 115, "offline report uses recorded values, not current prices or projected due dates");
assert.ok(offline.rows.every((row) => row.source === "Pasta"));
assert.equal(foldersReport.summarizeFolderRenewals([offlineItems[0]], date, date).total, 30);
let connected = false;
let panelCalls = 0;
let failPanel = false;
const lookup = load("src/lib/uniplayRenewalLookup.ts", {
  "@/lib/automationsConfig": { loadAutomationsConfigRemote: async () => ({ resellerCreditPriceBrl: 8.5, iptvBearerToken: "test" }), isUniplayConnected: () => connected },
  "@/lib/platformApi": { loadIptvPlatformConfig: async () => { panelCalls++; return {}; } },
  "@/lib/renewalSummary": report,
  "@/lib/iptvPanelApi": {
    ensureIptvToken: async () => ({ token: "test" }),
    listUniplayRenewalLogs: async () => { panelCalls++; if (failPanel) throw Error("panel unavailable"); return { events: [event("selected", "old-login", "2024-01-10T12:00:00-03:00"), event("outside", "old-login", "2024-02-01T12:00:00-03:00")], recreations: [] }; },
    listUniplayCreditLogs: async () => { panelCalls++; return []; },
  },
});
assert.equal((await lookup.lookupUniplayRenewals("offline-store", "2024-01-01", "2024-01-31")).source, "folders");
assert.equal(panelCalls, 0, "disconnected stores must not query Uniplay or platform endpoints");
connected = true;
const online = await lookup.lookupUniplayRenewals("online-store", "2024-01-01", "2024-01-31");
assert.equal(online.source, "uniplay");
assert.ok(online.months.length > 24, "historical identity lookup supports periods older than 24 months");
assert.ok(online.events.every((row) => row.id === "selected"), "count only log operations in the selected period, despite later months used to resolve recreated lines");
failPanel = true;
await assert.rejects(() => lookup.lookupUniplayRenewals("online-store", date, date), /panel unavailable/, "a connected panel error must not silently switch to folder counts");
await assert.rejects(() => lookup.lookupUniplayRenewals("online-store", "2026-13-01", date), /período/);
await assert.rejects(() => lookup.lookupUniplayRenewals("online-store", "2024-01-01", "2024-01-31", "2025-01-10"), /primeiro cliente/, "out-of-bounds periods must be rejected before fetching logs");
let scopeCalls = 0;
const scopes = load("src/lib/renewalSearchScope.ts", {
  "@/lib/automationsConfig": { loadAutomationsConfigRemote: async () => ({}), isUniplayConnected: () => connected },
  "@/lib/platformApi": { loadIptvPlatformConfig: async () => { scopeCalls++; return {}; } },
  "@/lib/iptvPanelApi": {
    ensureIptvToken: async () => ({ token: "test" }),
    listIptvUsers: async () => [{ createdAt: "2025-04-10 12:00:00" }, { createdAt: "2025-01-15 12:00:00" }, { createdAt: "2024-01-01", trial: true }],
    isShortLivedIptvTest: (client) => Boolean(client.trial),
  },
});
assert.equal(scopes.firstClientDate([{ createdAt: "invalid" }, { createdAt: "2025-02-30" }, { createdAt: "2025-05-01" }, { createdAt: "2025-01-15T12:00:00Z" }]), "2025-01-15");
assert.equal(scopes.firstClientDate([]), null);
connected = false;
assert.deepEqual(await scopes.loadRenewalSearchScope("offline-store", "2025-03-10"), { source: "folders", firstDate: "2025-03-10" });
assert.equal(scopeCalls, 0, "disconnected date limits must not call Uniplay");
connected = true;
assert.deepEqual(await scopes.loadRenewalSearchScope("online-store", "2020-01-01"), { source: "uniplay", firstDate: "2025-01-15" }, "connected source uses panel clients rather than unrelated folder creation dates or trials");
assert.deepEqual(scopes.boundedRenewalRange({ start: "2024-01-01", end: "2024-12-31" }, "2025-01-15", date), { start: "2025-01-15", end: "2025-01-15" });
assert.deepEqual(scopes.boundedRenewalRange({ start: "2025-01-01", end: "2026-12-31" }, "2025-01-15", date), { start: "2025-01-15", end: date });
const octReseller = { ...a, id: "oct-reseller", itemId: "oct-reseller", folderId: "resellers" };
const received = load("src/lib/receivedOperations.ts", { "@/lib/renewalSummary": report, "@/lib/folderRenewalSummary": foldersReport });
const octoberItems = [a, { ...b, price: 215.4 }, octReseller, ...Array.from({ length: 44 }, (_, index) => ({ ...a, id: `inactive-${index}`, itemId: `inactive-${index}`, price: 40, dueDate: "2026-11-30" }))];
const annualData = { source: "uniplay", events: Array.from({ length: 72 }, (_, index) => event(`oct-${index}`, index === 71 ? b.itemId : a.itemId)), recreations: [], creditEvents: Array.from({ length: 5 }, (_, index) => ({ id: `credit-${index}`, username: octReseller.itemId, credits: 10, occurredAt: "2026-10-20T12:00:00-03:00" })), creditUnitPrice: 8.5, months: [] };
const monthly = received.receivedOperationsByMonth(octoberItems, 2026, date, annualData, "resellers");
const samePeriod = received.summarizeReceivedOperations(octoberItems, "2026-10-01", date, annualData, "resellers");
assert.equal(monthly[9].total, 2770.4, "October graph must equal the report: 2345.40 IPTV plus 425 credits; no 44 projected monthly fees");
assert.equal(monthly[9].total, samePeriod.total);
assert.equal(monthly[9].itens, samePeriod.count);
assert.equal(monthly[10].total, 0, "future months must not project current monthly fees");
assert.equal(received.receivedOperationsByMonth(octoberItems, 2026, date, annualData, "resellers", "resellers")[9].total, 425);
const offlineData = { ...annualData, source: "folders", events: [], creditEvents: [] };
assert.equal(received.receivedOperationsByMonth(offlineItems, 2026, date, offlineData, "resellers")[9].total, foldersReport.summarizeFolderRenewals(offlineItems, "2026-10-01", date, "resellers").total);
const estimates = load("src/lib/monthEndEstimate.ts", { "@/lib/planMonths": plans, "@/lib/iptvUserAliases": aliasesModule });
const forecastBase = report.summarizeRenewals([a], "2026-10-01", date, [event("paid", a.itemId)]);
const forecastItems = [
  { ...a, dueDate: "2026-10-30" },
  { ...b, dueDate: "2026-10-25", price: 90, planMonths: 3 },
  { ...a, id: "late", itemId: "late", price: 40, dueDate: "2026-10-05" },
  { ...a, id: "prior-inactive", itemId: "prior-inactive", dueDate: "2026-09-30" },
  { ...a, id: "future-month", itemId: "future-month", dueDate: "2026-11-01" },
  { ...a, id: "zero-account", itemId: "zero-account", price: 0, dueDate: "2026-10-28" },
  { ...a, id: "disabled", itemId: "disabled", isActive: false, dueDate: "2026-10-28" },
  { ...octReseller, dueDate: "2026-10-28", price: 300 },
];
const forecast = estimates.estimateMonthEnd(forecastItems, date, forecastBase, "resellers");
assert.equal(forecast.pendingCount, 2, "exclude already renewed, old overdue, next month, disabled, zero-price and reseller accounts");
assert.equal(forecast.pendingTotal, 130, "project full package price, not monthly fraction");
assert.equal(forecast.total, 160);
assert.equal(forecast.overdueCount, 1);
assert.equal(forecastBase.total, 30, "projection must never alter recorded revenue");
assert.equal(estimates.estimateMonthEnd([{ ...b, dueDate: "2026-10-25" }, { ...b, id: "duplicate", dueDate: "2026-10-25" }], date, forecastBase).pendingCount, 1);
const noPriceForecast = estimates.estimateMonthEnd([{ ...b, price: undefined, dueDate: "2026-10-25" }], date, forecastBase);
assert.equal(noPriceForecast.missingAmounts, 1);
assert.equal(noPriceForecast.total, forecastBase.total);
const creditLog = { id: 101, revenda: "owner", usuario: "Rev alvo - reseller-a", date: "20/10/2026 12:00:00", acao: "Transferência de 10 no valor unitário de R$: 0.85 (Valor Total: R$8.5). Observação: AuxPlus PIX repeated-ref" };
const creditLogs = logModule.parseUniplayCreditLogs({ logs: [
  creditLog, creditLog,
  { ...creditLog, id: 102, revenda: "supplier", usuario: "Rev alvo - owner" },
  { ...creditLog, id: 103, revenda: "other", usuario: "Rev alvo - reseller-a" },
  { ...creditLog, id: 104, acao: "Transferência de -10. Observação: retirada" },
  { ...creditLog, id: 105, acao: "Transferência de 0. Observação:" },
  { ...creditLog, id: 106, date: "31/02/2026 12:00:00" },
  { ...creditLog, id: 107, usuario: "Rev alvo - owner" },
  { ...creditLog, id: 108, acao: "Transferência de 20. Observação:" },
] }, "OWNER");
assert.equal(creditLogs.length, 2, "only outgoing positive transfers count, once per log ID");
assert.equal(creditLogs[1].credits, 20, "quantity parses the sentence-ending dot");
assert.throws(() => logModule.parseUniplayCreditLogs([], ""), /Configure/);
const reseller = { ...a, id: "reseller-a", itemId: "reseller-a", folderId: "resellers", price: 999 };
const creditOptions = { events: creditLogs, items: [reseller], unitPrice: 8.5 };
const combined = report.summarizeRenewals([a], date, date, [event("101", "user-a")], true, [], creditOptions);
assert.equal(combined.renewalCount, 1);
assert.equal(combined.creditOperations, 2);
assert.equal(combined.credits, 30);
assert.equal(combined.renewalTotal, 30);
assert.equal(combined.creditTotal, 255, "configured unit price overrides malformed log BRL and reseller credit balance");
assert.equal(combined.total, 285);
assert.equal(combined.count, 3, "credit log ID does not collide with IPTV log ID");
assert.equal(new Set(combined.rows.map((row) => row.id)).size, 3);
assert.equal(report.summarizeRenewals([], "2026-10-21", "2026-10-21", [], true, [], creditOptions).creditOperations, 0);
assert.equal(report.summarizeRenewals([], date, date, [], false, [], { ...creditOptions, items: [] }).count, 0, "a folder filter excludes unmatched resellers");
const unknownCredit = report.summarizeRenewals([], date, date, [], true, [], { ...creditOptions, items: [] });
assert.equal(unknownCredit.creditTotal, 255, "own outgoing logs retain the configured value even without a folder match");
assert.equal(unknownCredit.unmatchedRenewals, 2);
assert.equal(report.summarizeRenewals([], date, date, [], true, [], { ...creditOptions, unitPrice: NaN }).missingAmounts, 2);
console.log("PASS: date presets, Brazil timezone, unique clients, folder prices, Uniplay-only counts, unmatched users, durable payment metadata.");
