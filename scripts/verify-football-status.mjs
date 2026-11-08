import { mockStatusDb } from "./lib/mock-status-db.mjs";
import fs from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";
const api = {};
const js = ts.transpileModule(fs.readFileSync("supabase/functions/_shared/footballStatus.ts", "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
new Function("require", "exports", js)(() => ({ recoverySetting: async () => ({ apiBaseUrl: "https://evolution.example", apiKey: "test-only", instancePrefix: "auxplus" }) }), api);
globalThis.Deno = { env: { get: name => name === "SUPABASE_URL" ? "https://project.example" : undefined } };
const originalFetch = globalThis.fetch;
const clock = api.footballClock();
assert.equal(api.footballClock(new Date("2026-10-28T02:59:00Z")).today, "2026-10-27");
assert.deepEqual(api.footballClock(new Date("2026-12-31T23:59:00-03:00")), { today: "2026-12-31", tomorrow: "2027-01-01", time: "23:59" });
assert.equal(api.footballInstance("auxplus", { id: "a-b-c", username: "João!" }), "auxplus-Jooabc");
assert.equal(api.footballReceipt("PENDING"), "provider_recorded");
assert.equal(api.footballReceipt("SERVER_ACK"), "sent");
assert.equal(api.footballReceipt(undefined), "provider_recorded");
assert.equal(api.FOOTBALL_STATUS_CAPTION, 'Comente "teste" para testar grátis.');
assert.equal(api.footballMediaHash(Buffer.alloc(32, 1).toString("base64")), "01".repeat(32));
assert.equal(api.footballMediaHash({ type: "Buffer", data: Array(32).fill(1) }), "01".repeat(32));
assert.equal(api.footballMediaHash("invalid"), "");
assert.deepEqual(api.footballRecipients([{ remoteJid: "5511888888888@s.whatsapp.net", pushName: "Contact" },
  { remoteJid: "123456789@g.us", pushName: "Group" }, { remoteJid: "5511888888888@s.whatsapp.net", pushName: "Duplicate" }], "5511999999999:4@s.whatsapp.net"),
  ["5511999999999@s.whatsapp.net", "5511888888888@s.whatsapp.net"]);
assert.throws(() => api.footballRecipients([], "5511999999999@s.whatsapp.net"));
const entry = { day: clock.today, region: "national", page: 0, total: 1 };
assert.equal(api.footballManifest({ postDay: clock.today, entries: [entry] }, clock.today, clock.tomorrow).length, 1);
for (const entries of [[entry, entry], [{ ...entry, page: 1 }], [{ ...entry, day: "2000-01-01" }], [{ ...entry, region: "all" }]]) {
  assert.throws(() => api.footballManifest({ postDay: clock.today, entries }, clock.today, clock.tomorrow));
}

function database(enabled = true) { return mockStatusDb({wa_football_status_settings:[{user_id:"user1",enabled,send_time:"00:00",lease_until:null}],wa_football_status_posts:[],users:[{id:"user1",username:"owner",is_active:true}]}); }
let sends = 0, calls = 0, rejectSend = false, rateLimited = false, disableDuringRender, providerRecords = [];
globalThis.fetch = async (url, init) => {
  calls++;
  if (url.includes("connectionState")) return { ok: true, json: async () => ({ instance: { state: "open" } }) };
  if (url.includes("fetchInstances")) return { ok: true, json: async () => [{ name: "auxplus-owneruser1", ownerJid: "5511999999999@s.whatsapp.net" }] };
  if (url.includes("findContacts")) return { ok: true, json: async () => [{ remoteJid: "5511888888888@s.whatsapp.net", pushName: "Contact" }] };
  if (url.includes("findMessages")) return { ok: true, json: async () => ({ messages: { records: providerRecords } }) };
  if (url.includes("mode=manifest")) return { ok: true, json: async () => ({ postDay: clock.today, entries: [entry, { ...entry, day: clock.tomorrow }] }) };
  if (url.includes("message/sendStatus")) {
    sends++; const body = JSON.parse(init.body);
    assert.equal(body.type, "image"); assert.equal(body.allContacts, false);
    assert.equal(body.caption, 'Comente "teste" para testar grátis.', "new posts use only the requested promotional caption");
    assert.ok(body.statusJidList.includes("5511999999999@s.whatsapp.net"), "include the sender so the linked phone can see its own story");
    assert.match(body.content, /^data:image\/png;base64,/);
    assert.deepEqual([...Buffer.from(body.content.split(',')[1], 'base64')], [137,80,78,71,13,10,26,10], "send exactly the PNG already rendered; provider must not render/download it again");
    if (rejectSend) throw new Error("Network response lost");
    if (rateLimited) return {ok:false,json:async()=>({response:{message:['Error: WhatsApp rejected Status: 429 (batch 1/50)']}})};
    return { ok: true, json: async () => ({ key: { remoteJid: "status@broadcast", id: "wa-id" }, status: "SERVER_ACK" }) };
  }
  if (disableDuringRender) disableDuringRender.tables.wa_football_status_settings[0].enabled = false;
  return { ok: true, headers: { get: () => "image/png" }, arrayBuffer: async () => Uint8Array.from([137,80,78,71,13,10,26,10]).buffer };
};
try {
  const off = database(false); await api.runFootballStatusQueue(off); assert.equal(calls, 0, "disabled switch never posts or fetches schedules");
  const db = database(); await api.runFootballStatusQueue(db); assert.equal(sends, 1); assert.equal(db.tables.wa_football_status_posts[0].status, "sent");
  await api.runFootballStatusQueue(db); assert.equal(sends, 1, "same day and page are never reposted");
  db.tables.wa_football_status_settings[0].enabled = false; await api.runFootballStatusQueue(db); assert.equal(sends, 1);
  const inFlight = database(); disableDuringRender = inFlight; await api.runFootballStatusQueue(inFlight); assert.equal(sends, 1, "turning off while rendering prevents the send"); disableDuringRender = undefined;
  const uncertain = database(); rejectSend = true; await api.runFootballStatusQueue(uncertain); assert.equal(uncertain.tables.wa_football_status_posts[0].status, "uncertain");
  await api.runFootballStatusQueue(uncertain); assert.equal(sends, 2, "uncertain publications are not retried");
  const recovered = database(); rejectSend = true; await api.runFootballStatusQueue(recovered);
  const recoveredPost = recovered.tables.wa_football_status_posts[0];
  recoveredPost.attempted_at = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  rejectSend = false; providerRecords = [];
  await api.runFootballStatusQueue(recovered);
  assert.equal(recovered.tables.wa_football_status_posts[0].status, "sent", "retry an old uncertain post once when a successful history check finds no matching status");
  assert.equal(recovered.tables.wa_football_status_posts[0].recovery_attempts, 1, "record the single recovery retry");
  const recoverySends = sends;
  await api.runFootballStatusQueue(recovered);
  assert.equal(sends, recoverySends, "recovery must never send a page more than once after its retry");
  const sendsAfterRecovery = sends;
  const lost = uncertain.tables.wa_football_status_posts[0];
  providerRecords = [{ key: { remoteJid: "status@broadcast", fromMe: true, id: "recorded-id" }, status: "PENDING", messageTimestamp: Math.floor(Date.parse(lost.attempted_at) / 1000),
    message: { imageMessage: { caption: `AuxPlus · Hoje · Nacional · 1/1 · Horários de Brasília` } } }];
  await api.runFootballStatusQueue(uncertain); assert.equal(lost.status, "provider_recorded"); assert.equal(sends, sendsAfterRecovery, "reconcile existing records instead of sending again");
  providerRecords[0].status = "SERVER_ACK";
  await api.runFootballStatusQueue(uncertain); assert.equal(lost.status, "sent"); assert.equal(sends, sendsAfterRecovery);
  lost.status = "uncertain"; lost.message_id = null;
  providerRecords[0].message.imageMessage = { caption: api.FOOTBALL_STATUS_CAPTION, fileSha256: Buffer.alloc(32, 1).toString("base64") };
  await api.runFootballStatusQueue(uncertain); assert.equal(lost.status, "uncertain", "identical captions must not match another image");
  providerRecords[0].message.imageMessage.fileSha256 = Buffer.from(lost.media_sha256, "hex").toString("base64");
  await api.runFootballStatusQueue(uncertain); assert.equal(lost.status, "sent"); assert.equal(sends, sendsAfterRecovery, "match by image hash without reposting");
  providerRecords = [];
  rejectSend = false;
  const crashed = database(); crashed.tables.wa_football_status_posts.push({ id: "crash", user_id: "user1", post_day: clock.today, banner_day: entry.day, region: entry.region, page: 0, total: 1, status: "sending" });
  await api.runFootballStatusQueue(crashed); assert.equal(crashed.tables.wa_football_status_posts[0].status, "uncertain"); assert.equal(sends, sendsAfterRecovery);
  const leased = database(); leased.tables.wa_football_status_settings[0].lease_until = new Date(Date.now() + 60000).toISOString();
  const before = calls; await api.runFootballStatusQueue(leased); assert.equal(calls, before, "concurrent cron cannot claim an active account lease");
  assert(db.tables.wa_football_status_posts.every(post => post.banner_day === clock.today), "tomorrow's manifest entries must never enter the automatic queue");
  const oldFuture = database();
  oldFuture.tables.wa_football_status_posts.push({ id: "future", user_id: "user1", post_day: clock.today, banner_day: clock.tomorrow, region: "national", page: 0, total: 1, status: "queued" });
  const priorSends = sends;
  await api.runFootballStatusQueue(oldFuture);
  assert.equal(sends, priorSends + 1);
  assert.equal(oldFuture.tables.wa_football_status_posts.find(post => post.id === "future").status, "queued", "future jobs left by the previous version must not be sent");
  assert.equal(oldFuture.tables.wa_football_status_posts.find(post => post.banner_day === clock.today).status, "sent");
  const manual = database(false); manual.tables.wa_football_status_settings[0].send_time = "23:59";
  const manualBefore = sends;
  await api.manageFootballStatus(manual, "user1", { action: "football-status-post-now" });
  assert.equal(manual.tables.wa_football_status_settings[0].enabled, false, "manual posting must not enable automation");
  assert.equal(manual.tables.wa_football_status_settings[0].send_time, "23:59", "manual posting preserves the saved schedule");
  await api.runFootballStatusQueue(manual, "other-user"); assert.equal(sends, manualBefore, "manual jobs remain account scoped");
  await api.runFootballStatusQueue(manual, "user1"); assert.equal(sends, manualBefore + 1, "manual request bypasses the time and disabled automatic switch");
  await api.manageFootballStatus(manual, "user1", { action: "football-status-post-now" });
  await api.runFootballStatusQueue(manual, "user1"); assert.equal(sends, manualBefore + 1, "Post now never repeats today's confirmed pages");
  const sharedLock = database(); sharedLock.tables.wa_status_delivery_locks = [{ user_id: "user1", token: "other-status-worker", expires_at: new Date(Date.now()+60000).toISOString() }];
  const lockCalls = calls; await api.runFootballStatusQueue(sharedLock); assert.equal(calls, lockCalls, "catalog and game queues share an instance delivery lock");
  const limited=database();rateLimited=true;
  await api.runFootballStatusQueue(limited);
  assert.equal(limited.tables.wa_football_status_posts[0].status,'queued','an explicit rate rejection waits for a permitted retry');
  assert(Date.parse(limited.tables.wa_football_status_settings[0].cooldown_until)>=Date.now()+29*60000);
  const beforePause=calls;await api.runFootballStatusQueue(limited);assert.equal(calls,beforePause,'cooldown makes no network calls');
  await api.manageFootballStatus(limited,'user1',{action:'football-status-post-now'});
  const beforeManualRun=calls;await api.runFootballStatusQueue(limited);assert.equal(calls,beforeManualRun,'manual requests cannot bypass the WhatsApp cooldown');
  limited.tables.wa_football_status_settings[0].cooldown_until=new Date(Date.now()-1000).toISOString();rateLimited=false;
  await api.runFootballStatusQueue(limited);assert.equal(limited.tables.wa_football_status_posts[0].status,'sent','automatic resume after the interval');
} finally { globalThis.fetch = originalFetch; delete globalThis.Deno; }
console.log("Football Status: opt-in, account instance, dated manifest, deduplication, disabling mid-render, uncertain sends and concurrent lease passed.");
