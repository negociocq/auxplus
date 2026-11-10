import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import ts from "typescript";
import * as conversationExports from '../supabase/functions/_shared/waConversationState.ts';
import * as trialExports from '../supabase/functions/_shared/waTrialHistory.ts';

const compile = (path) => ts.transpileModule(fs.readFileSync(path, "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const guardExports = {};
vm.runInNewContext(compile("supabase/functions/_shared/waBotGuard.ts"), {
  exports: guardExports, crypto: webcrypto, setTimeout, setInterval, clearInterval,
});
const dueExports = {};
vm.runInNewContext(compile("supabase/functions/_shared/itemDue.ts"), { exports: dueExports, Intl, Date });
const inboundExports = {};
vm.runInNewContext(compile("supabase/functions/_shared/waInbound.ts"), { exports: inboundExports });
const reminderExports = {};
vm.runInNewContext(compile("supabase/functions/_shared/waReminderReply.ts"), { exports: reminderExports });
const partnerExports = {};
vm.runInNewContext(compile("supabase/functions/_shared/partnerTestFlow.ts"), { exports: partnerExports });

class Database {
  constructor() { this.tables = { platform_settings: [], platform_private_secrets: [], folders: [], items: [], wa_recovery_contacts: [] }; }
  setting(key, value) { this.tables.platform_settings.push({ key, value: structuredClone(value) }); }
  async rpc(name, { p_user_id, p_phone }) {
    const rows = this.tables.wa_trial_history ||= [];
    let row = rows.find(r => r.user_id === p_user_id && r.phone === p_phone);
    if (name === 'release_wa_trial') {
      if (!row) { row = { user_id: p_user_id, phone: p_phone }; rows.push(row); }
      row.allow_retest = true; return { data: null, error: null };
    }
    if (name === 'claim_wa_trial') {
      if (row && !row.allow_retest) return { data: null, error: null };
      if (!row) { row = { user_id: p_user_id, phone: p_phone }; rows.push(row); }
      row.allow_retest = false; row.reservation_id = webcrypto.randomUUID(); row.last_used_at = new Date().toISOString();
      return { data: row.reservation_id, error: null };
    }
    throw Error('Unexpected RPC');
  }
  from(name) {
    const db = this;
    let mode = "select", values, single = false;
    const filters = [];
    const valueAt = (row, key) => key === "value->>token" ? row.value?.token : row[key];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push((r) => String(valueAt(r, key)) === String(value)); return query; },
      like(key, value) { const prefix = value.replace(/%$/, ""); filters.push(r => String(r[key]).startsWith(prefix)); return query; },
      lt(key, value) { filters.push((r) => valueAt(r, key) < value); return query; },
      maybeSingle() { single = true; return query; },
      insert(value) { mode = "insert"; values = value; return query; },
      upsert(value) { mode = "upsert"; values = value; return query; },
      update(value) { mode = "update"; values = value; return query; },
      delete() { mode = "delete"; return query; },
      then(resolve, reject) {
        try {
          const table = db.tables[name] ||= [];
          let rows = table.filter((r) => filters.every((f) => f(r)));
          const primary = name === "platform_private_secrets" ? "name" : "key";
          if (mode === "insert" || mode === "upsert") {
            const existing = table.find((r) => name === "wa_trial_history" ? r.user_id === values.user_id && r.phone === values.phone : r[primary] === values[primary]);
            if (existing && mode === "insert") return Promise.resolve({ data: null, error: { code: "23505" } }).then(resolve, reject);
            if (existing) Object.assign(existing, structuredClone(values));
            else table.push(structuredClone(values));
            rows = [values];
          }
          if (mode === "update") rows.forEach((row) => Object.assign(row, structuredClone(values)));
          if (mode === "delete") db.tables[name] = table.filter((r) => !rows.includes(r));
          return Promise.resolve({ data: structuredClone(single ? rows[0] || null : rows), error: null }).then(resolve, reject);
        } catch (error) { return Promise.reject(error).then(resolve, reject); }
      },
    };
    return query;
  }
}

const db = new Database();
const phone = "5511991234567";
db.setting("wa_instance_test", { userId: "1" });
db.setting("wa_bot_user_1", { enabled: true, endHumanPhrase: "encerrar" });
db.setting("evolution_api", { apiBaseUrl: "https://evolution.invalid", apiKey: "fixture" });
db.setting("notif_settings_user_1", { enabled: false });
db.tables.folders.push({ id: "folder", user_id: 1, type: "Cliente" });
db.tables.items.push({ id: "customer", folder_id: "folder", item_id: "sample", phone, is_active: true, due_date: "2026-11-19", due_time: "19:54:31" });
const sent = [];
let beforeSend;
let handler;
const context = {
  exports: {}, console, Request, Response, URL, AbortSignal, crypto: webcrypto, structuredClone, TextEncoder, Uint8Array,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Deno: { env: { get: () => "fixture" }, serve: (fn) => { handler = fn; } },
  require: (path) => {
    if (path.includes("waBotGuard")) return guardExports;
    if (path.includes("waConversationState")) return conversationExports;
    if (path.includes("waTrialHistory")) return trialExports;
    if (path.includes("itemDue")) return dueExports;
    if (path.includes("waInbound")) return inboundExports;
    if (path.includes("waReminderReply")) return reminderExports;
    if (path.includes("supabase-js")) return { createClient: () => db };
    if (path.includes("waRecovery")) return { recoveryPhone: (p) => p, recoveryPanel: async () => ({}) };
    if (path.includes("partnerTestFlow")) return partnerExports;
    return {};
  },
  fetch: async (url, init) => {
    assert.match(String(url), /^https:\/\/evolution\.invalid\/message\/sendText\//);
    assert.equal(JSON.parse(init.body).delay,0,'bot replies must not simulate a typing delay');
    const body = JSON.parse(init.body);
    if (beforeSend) await beforeSend(body);
    sent.push(body.text);
    return Response.json({ ok: true });
  },
};
vm.runInNewContext(compile("supabase/functions/evolution-webhook/index.ts"), context);
let nextId = 0;
async function receive(text, { fromMe = false, id = String(++nextId), media = false, targetPhone = phone } = {}) {
  const response = await handler(new Request("https://webhook.invalid", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "messages.upsert", instance: "test", data: {
      key: { id, remoteJid: `${targetPhone}@s.whatsapp.net`, fromMe },
      message: media ? { imageMessage: { mimetype: "image/jpeg" } } : { conversation: text },
    } }),
  }));
  const result = await response.json();
  assert.equal(response.status, 200, JSON.stringify(result));
  return result;
}
assert.equal((await receive("oi")).action, "ask_intent");
assert.equal(sent.length, 1);
assert.match(sent[0], /19:54:31/, "menu combines persisted date and actual expiration time");
await Promise.all([receive("olá"), receive("mensagem seguinte"), receive("bom dia"), receive("oi novamente")]);
assert.equal(sent.length, 5, "each free-text reply must repeat the menu");
assert.ok(sent.every((message) => message === sent[0]));
const state = () => db.tables.platform_settings.find((row) => row.key === "wa_bot_state_user_1").value;
state().humanPaused = {};
state().sessions = { [phone.replace("55119", "5511")]: { state: "idle", role: "client" } };
const before = sent.length;
assert.equal((await receive("3", { id: "handoff" })).action, "human");
assert.equal(sent.length, before + 1);
assert.match(sent.at(-1), /atendentes|atendimento/i);
await Promise.all([receive("3"), receive("oi"), receive("3"), receive("mensagem seguinte")]);
assert.equal(sent.length, before + 1, "concurrent messages during handoff stay silent");
for (const text of ["3", "oi", "voltar", "1"]) assert.equal((await receive(text)).skipped, "human_paused");
assert.equal((await receive("", { media: true })).skipped, "human_paused");
assert.equal((await receive("3", { id: "handoff" })).skipped, "dup_message");
assert.equal(sent.length, before + 1);
state().sessions[phone.replace("55119", "5511")] = { state: "human", updatedAt: new Date().toISOString() };
await receive("encerrar", { fromMe: true });
assert.equal(Object.keys(state().humanPaused).length, 0);
assert.equal(Object.values(state().sessions).some((session) => session.state === "human"), false, "owner resume removes obsolete phone aliases too");
assert.equal((await receive("olá")).action, "ask_intent");
assert.equal(db.tables.platform_private_secrets.length, 0, "request leases must be released");

// A reply to a renewal reminder must not infer a human request from prose.
state().sessions = {};
state().recentRepliesByPhone = {};
const reminderReply = "Desculpa o atraso no pagamento tive problema com a conta";
assert.equal((await receive(reminderReply)).action, "ask_intent");
assert.match(sent.at(-1), /1[\s\S]*2/);
const beforeRepeat = sent.length;
assert.equal((await receive(reminderReply)).action, "ask_intent_repeat");
assert.equal(sent.length, beforeRepeat + 1);
assert.equal(sent.at(-1), sent.at(-2));
assert.equal(Object.keys(state().humanPaused).length, 0);
assert.equal((await receive("2")).action, "ask_problem_kind");
assert.equal((await receive("0")).action, "ask_intent");
assert.equal((await receive("atendente")).action, "human");
await receive("encerrar", { fromMe: true });
state().sessions = {};
assert.equal((await receive("problema")).action, "ask_intent", "first reply opens menu before interpreting a problem keyword");
db.setting("automations_user_1", { mpAccessToken: "fixture", mpPayerEmail: "fixture@example.invalid" });
db.tables.items[0].price = 38;
db.setting("mp_orders_user_1", { orders: [{
  status: "pending", itemRefId: "customer", pixCopyPaste: "fixture-pix-code",
  expiresAt: new Date(Date.now() + 3600000).toISOString(), amount: 38, months: 1,
}] });
assert.equal((await receive("1")).action, "pix_exists");
assert.equal(sent.at(-1), "fixture-pix-code", "renewal option still delivers the PIX after the reminder reply");

const history = [{ body: "menu", at: Date.now() }, { body: "outro", at: Date.now() }];
assert.equal(guardExports.isRepeatedBotReply(history, "menu"), true);
assert.equal(guardExports.isRepeatedBotReply(history, "novo"), false);
const humanExports = {};
vm.runInNewContext(compile("src/lib/waHumanConversations.ts"), { exports: humanExports });
const phoneSource = ts.createSourceFile("phone.ts", fs.readFileSync("src/lib/whatsappAutomation.ts", "utf8"), ts.ScriptTarget.Latest, true);
const phoneFunctions = phoneSource.statements.filter((node) => ts.isFunctionDeclaration(node) && ["phoneDigits", "normalizeBrPhone"].includes(node.name?.text)).map((node) => node.getText(phoneSource).replace(/^export\s+/, "")).join("\n");
const phoneContext = {};
vm.runInNewContext(ts.transpile(phoneFunctions), phoneContext);
const normalize = phoneContext.normalizeBrPhone;
const legacyPhone = phone.replace("55119", "5511");
const humanState = { sessions: { [legacyPhone]: { state: "human" }, [phone]: { state: "human" }, "5511988888888": { state: "idle" } }, humanPaused: { [phone]: true, "5511977777777": false } };
const visibleHumans = humanExports.humanConversationPhones(humanState, normalize);
assert.equal(visibleHumans.length, 1, "panel unifies paused flags and human sessions without duplicate phone aliases");
assert.equal(visibleHumans[0], normalize(phone));
assert.equal(humanExports.humanConversationPhones({ sessions: { [legacyPhone]: { state: "human" } }, humanPaused: {} }, normalize).length, 1, "legacy human session must be visible even when the pause flag is absent");
console.log("PASS: concurrent messages, option 3 from idle, silent human mode, media, dedup and owner resume.");

// An external outage must not consume the incoming ID before a reply is delivered.
state().sessions = {};
state().humanPaused = {};
state().recentRepliesByPhone = {};
const workingFetch = context.fetch;
context.fetch = async (_url, init) => {
  assert.ok(init.signal, "WhatsApp delivery must have an abort deadline");
  throw new Error("simulated delivery outage");
};
const failureRequest = () => new Request("https://webhook.invalid", {
  method: "POST", headers: { "content-type": "application/json" },
  body: JSON.stringify({ event: "messages.upsert", instance: "test", data: {
    key: { id: "retry-after-outage", remoteJid: `${phone}@s.whatsapp.net`, fromMe: false },
    message: { conversation: "oi" },
  } }),
});
assert.equal((await handler(failureRequest())).status, 500);
assert.equal(state().recentMsgIds["retry-after-outage"], undefined);
context.fetch = workingFetch;
const retried = await handler(failureRequest());
assert.equal(retried.status, 200);
assert.notEqual((await retried.json()).skipped, "dup_message");
assert.equal((await receive("oi", { id: "retry-after-outage" })).skipped, "dup_message");

// Even expired panel credentials cannot force a login before a simple menu reply.
const auto = db.tables.platform_settings.find(row => row.key === "automations_user_1");
auto.value = { iptvUsername: "fixture", iptvPassword: "fixture", iptvBearerToken: "" };
state().sessions = {};
assert.equal((await receive("oi")).action, "ask_intent");
db.tables.items = [];
state().sessions = {};
assert.equal((await receive("Olá!")).action, "new_contact_greeting");
assert.match(sent.at(-1), /teste/);
console.log("PASS: failed delivery can retry, successful delivery deduplicates, menus do not log into the panel.");

db.tables.items.push({ id: "customer", folder_id: "folder", item_id: "sample", phone, is_active: true, due_date: "2026-11-19", due_time: "19:54:31" });
const aged = ms => new Date(Date.now() - ms).toISOString();
state().sessions = { [phone]: { state: "human", updatedAt: aged(59 * 60_000), testUsername: "preserved" } };
state().humanPaused = { [phone]: true };
assert.equal((await receive("estou aguardando")).skipped, "human_paused");
assert.ok(Date.now() - Date.parse(state().sessions[phone].updatedAt) < 2000, "customer activity renews the hour");
state().sessions[phone].updatedAt = aged(59 * 60_000);
await receive("vou verificar", { fromMe: true });
assert.ok(Date.now() - Date.parse(state().sessions[phone].updatedAt) < 2000, "attendant activity renews the hour");
state().sessions[phone].updatedAt = aged(61 * 60_000);
state().humanPaused[legacyPhone] = true;
await guardExports.sweepHumanConversations(db);
assert.equal(state().sessions[phone].state, "idle");
assert.equal(state().sessions[phone].testUsername, "preserved");
assert.equal(Object.keys(state().humanPaused).length, 0, "scheduled sweep clears phone aliases");
state().sessions[phone] = { state: "human", updatedAt: aged(61 * 60_000) };
state().humanPaused[phone] = true;
assert.equal((await receive("oi")).action, "ask_intent", "first message after expiry reaches the bot immediately");
console.log("PASS: customer and attendant activity, scheduled idle expiry, aliases, trial preservation and bot resume.");

// A held WhatsApp send in one chat must not stall a different chat on owner 1.
let unblock, entered;
const blocked = new Promise(resolve => { unblock = resolve; });
const started = new Promise(resolve => { entered = resolve; });
beforeSend = async body => { if (body.number === phone) { entered(); await blocked; } };
const slow = receive('liberar teste', { fromMe: true, id: 'slow-owner-command' });
await started;
try {
  const other = await Promise.race([
    receive('atender', { fromMe: true, id: 'independent-chat-command', targetPhone: '5511987654321' }),
    new Promise((_, reject) => setTimeout(() => reject(Error('Independent chat blocked behind network work')), 1000)),
  ]);
  assert.equal(other.action, 'human_assumed');
} finally { beforeSend = undefined; unblock(); }
assert.equal((await slow).action, 'test_released');
assert.equal(state().sessions[phone].state, 'idle');
assert.equal(state().sessions['5511987654321'].state, 'human');
assert.ok(state().recentMsgIds['slow-owner-command']);
assert.ok(state().recentMsgIds['independent-chat-command']);
console.log('PASS: independent chat responds while another network send is held; both states and message IDs survive.');

// Owner billing shortcut must retain human service, even when automatic caps apply.
auto.value = { mpAccessToken: 'fixture-token', mpPayerEmail: 'fixture@example.invalid' };
db.tables.platform_settings.find(row => row.key === 'mp_orders_user_1').value.orders = [];
db.tables.items = [{ id: 'customer', folder_id: 'folder', item_id: 'sample', phone, name: 'Fixture customer', price: 25, is_active: true, due_date: '2026-11-19', due_time: '19:54:31' }];
state().sessions[phone] = { state: 'human', role: 'client', itemRefId: 'customer', updatedAt: new Date().toISOString() };
state().humanPaused[phone] = true;
state().botSendLog = Array.from({ length: 40 }, (_, i) => ({ phone, at: new Date(Date.now() - i * 1000).toISOString() }));
state().recentRepliesByPhone = {};
const paymentRequests = [];
context.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.mercadopago.com/')) {
    paymentRequests.push(JSON.parse(init.body));
    return Response.json({ id: `fixture-payment-${paymentRequests.length}`, transactions: { payments: [{ payment_method: { qr_code: `fixture-pix-${paymentRequests.length}` }, date_of_expiration: new Date(Date.now() + 3600000).toISOString() }] } });
  }
  return workingFetch(url, init);
};
const untouched = structuredClone(db.tables.items[0]);
const beforePix = sent.length;
assert.equal((await receive('enviar pix', { fromMe: true, id: 'owner-pix-one' })).action, 'renew_pix');
assert.equal(paymentRequests.length, 1); assert.equal(paymentRequests[0].total_amount, '25.00');
assert.equal(sent.length - beforePix, 2, 'owner shortcut sends the intro and copy/paste code without automatic menus');
assert.equal(sent.at(-1), 'fixture-pix-1');
assert.equal(state().sessions[phone].state, 'human'); assert.equal(state().humanPaused[phone], true);
assert.deepEqual(db.tables.items[0], untouched, 'creating PIX must not renew or change the client');
assert.equal((await receive('enviar pix', { fromMe: true, id: 'owner-pix-one' })).skipped, 'dup_message');
const beforeManualPixRepeat = sent.length;
assert.equal((await receive('ENVIAR PIX', { fromMe: true, id: 'owner-pix-two' })).action, 'pix_exists');
assert.equal(paymentRequests.length, 1); assert.equal(sent.length - beforeManualPixRepeat, 2, 'explicit owner resend reuses the valid invoice');
assert.equal((await receive('enviar pix', { id: 'customer-cannot-authorize-pix' })).skipped, 'human_paused');
assert.equal(paymentRequests.length, 1);

const beforeUnknown = paymentRequests.length;
assert.equal((await receive('enviar pix', { fromMe: true, targetPhone: '5511987654321' })).action, 'owner_pix_identification_required');
assert.equal(paymentRequests.length, beforeUnknown);
db.tables.items.push({ ...untouched, id: 'customer-two', item_id: 'sample-two', price: 30 });
state().sessions[phone] = { state: 'human', updatedAt: new Date().toISOString() };
assert.equal((await receive('enviar pix', { fromMe: true })).action, 'owner_pix_identification_required');
assert.equal(paymentRequests.length, 1, 'ambiguous access cannot generate a charge');
assert.equal((await receive('enviar pix sample-two', { fromMe: true })).action, 'renew_pix');
assert.equal(paymentRequests.at(-1).total_amount, '30.00');
const invoices = () => db.tables.platform_settings.find(row => row.key === 'mp_orders_user_1').value.orders;
assert.equal(invoices().find(row => row.mpPaymentId === 'fixture-payment-2').itemRefId, 'customer-two');
assert.equal(new Set(invoices().map(row => row.id)).size, invoices().length);
assert.equal(state().sessions[phone].state, 'human');

// The original customer renewal route still creates PIX and returns to idle.
db.tables.items = [untouched];
db.tables.platform_settings.find(row => row.key === 'mp_orders_user_1').value.orders = [];
state().sessions[phone] = { state: 'idle' }; state().humanPaused = {};
state().botSendLog = []; state().recentRepliesByPhone = {};
assert.equal((await receive('1')).action, 'renew_pix');
assert.equal(paymentRequests.length, 3); assert.equal(state().sessions[phone].state, 'idle');
console.log('PASS: owner PIX shortcut during human service, exact owner authorization, saved price, reuse/dedup, ambiguity handling, retained human pause and unchanged customer renewal route. All payments and sends mocked.');

// Two staff commands in different chats must not overwrite each other's invoices.
db.tables.platform_settings.find(row => row.key === 'mp_orders_user_1').value.orders = [];
db.tables.items.push({ ...untouched, id: 'parallel-customer', item_id: 'parallel-user', phone: '5511977654321', price: 40 });
const paymentFetch = context.fetch;
let releasePayment, paymentEntered;
const heldPayment = new Promise(resolve => { releasePayment = resolve; });
const paymentStarted = new Promise(resolve => { paymentEntered = resolve; });
context.fetch = async (url, init) => {
  if (String(url).startsWith('https://api.mercadopago.com/') && JSON.parse(init.body).external_reference.includes('invoice-parallel-a')) {
    paymentEntered(); await heldPayment;
  }
  return paymentFetch(url, init);
};
const firstInvoice = receive('enviar pix', { fromMe: true, id: 'invoice-parallel-a' });
await paymentStarted;
const secondInvoice = receive('enviar pix', { fromMe: true, id: 'invoice-parallel-b', targetPhone: '5511977654321' });
releasePayment();
assert.equal((await firstInvoice).action, 'renew_pix');
assert.equal((await secondInvoice).action, 'renew_pix');
assert.deepEqual(invoices().map(row => row.itemRefId).sort(), ['customer', 'parallel-customer']);
assert.equal(db.tables.platform_private_secrets.length, 0);
console.log('PASS: simultaneous owner PIX commands preserve both invoices and release billing locks; no real payments.');

const previousTester = '5511991111307';
state().testConsumed ||= {};
state().testConsumed[previousTester] = { at: aged(7 * 86400000), username: 'old-deleted-trial', name: 'Saulo fixture' };
state().sessions[previousTester] = { state: 'test_await_mac', testDevice: 'phone', testUsername: 'old-deleted-trial', testPassword: 'fixture', testHours: 6 };
assert.equal((await receive('teste', { targetPhone: previousTester })).action, 'test_expired_blocked', 'expired legacy session must stop before Android migration or OCR');
const trialHistoryRow = db.tables.wa_trial_history.find(row => row.phone === previousTester);
assert.equal(trialHistoryRow.username, 'old-deleted-trial');
delete state().testConsumed[previousTester];
state().sessions[previousTester] = { state: 'idle' };
const beforeBlocked = sent.length;
await receive('teste', { targetPhone: previousTester });
assert.ok(sent.slice(beforeBlocked).some(text => /já usou/i.test(text)), 'durable history blocks after browser/session history is removed');
assert.equal(trialHistoryRow.allow_retest, undefined);
await receive('liberar teste', { targetPhone: previousTester });
assert.ok(!trialHistoryRow.allow_retest, 'customer cannot release their own trial');
assert.equal((await receive('liberar teste', { fromMe: true, targetPhone: previousTester })).action, 'test_released');
assert.equal(trialHistoryRow.allow_retest, true);
await trialExports.claimTrialUse(db, '1', previousTester);
await assert.rejects(trialExports.claimTrialUse(db, '1', previousTester), /já solicitou/);
console.log('PASS: Saulo expired-session regression, durable history despite deleted state, owner-only release and single-use retest authorization. No real trials or activations.');
db.tables.platform_settings.find(r => r.key === 'wa_bot_user_1').value.testFlow = { triggerPhrase: 'teste', deviceMenu: { message: 'Aparelho', options: [{ key: '1', label: 'Celular', action: 'phone' }] } };
const freshIosPhone='5511991111408';
state().testConsumed[freshIosPhone]={at:new Date().toISOString(),username:'valid-trial',name:'iPhone fixture'};
state().sessions[freshIosPhone]={state:'test_await_mac',testDevice:'phone',testPhoneOs:'ios',testApp:'zuxo',testUsername:'valid-trial',testPassword:'fixture',testHours:6};
const beforeMac=sent.length;
assert.equal((await receive('c6:69:e0:f0:a2:d3',{targetPhone:freshIosPhone})).action,'test_device_retry');
assert.match(sent[beforeMac],/Recebi o código/,'valid MAC receives immediate acknowledgement');
assert.match(sent.at(-1),/painel agora/,'provider failure must receive a clear final response');
assert.equal(state().sessions[freshIosPhone].testPhoneOs,'ios');
console.log('PASS: valid iPhone MAC acknowledged before provider work, clear provider failure reply and preserved iOS session. No real activation.');
const releasedPhone='5511991111509';
assert.equal((await receive('liberar teste',{fromMe:true,targetPhone:releasedPhone})).action,'test_released');
state().testConsumed[releasedPhone]={at:aged(7*86400000),username:'stale-browser-trial'};
state().sessions[releasedPhone]={state:'test_await_mac',testUsername:'stale-browser-trial',testPassword:'fixture',testDoneAt:aged(7*86400000),testDevice:'phone'};
assert.equal((await receive('teste',{targetPhone:releasedPhone})).action,'test_ask_name','owner release must override a stale browser state without reviving its old credentials');
assert.equal(state().sessions[releasedPhone].testUsername,undefined);
console.log('PASS: durable owner release survives stale browser writes and starts a clean name/device flow.');
