import fs from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import ts from "typescript";

const compile = (path) => ts.transpileModule(fs.readFileSync(path, "utf8"), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText;
const guardExports = {};
vm.runInNewContext(compile("supabase/functions/_shared/waBotGuard.ts"), {
  exports: guardExports, crypto: webcrypto, setTimeout, setInterval, clearInterval,
});
const dueExports = {};
vm.runInNewContext(compile("supabase/functions/_shared/itemDue.ts"), { exports: dueExports, Intl, Date });

class Database {
  constructor() { this.tables = { platform_settings: [], platform_private_secrets: [], folders: [], items: [], wa_recovery_contacts: [] }; }
  setting(key, value) { this.tables.platform_settings.push({ key, value: structuredClone(value) }); }
  from(name) {
    const db = this;
    let mode = "select", values, single = false;
    const filters = [];
    const valueAt = (row, key) => key === "value->>token" ? row.value?.token : row[key];
    const query = {
      select() { return query; },
      eq(key, value) { filters.push((r) => String(valueAt(r, key)) === String(value)); return query; },
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
            const existing = table.find((r) => r[primary] === values[primary]);
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
let handler;
const context = {
  exports: {}, console, Request, Response, URL, AbortSignal, crypto: webcrypto,
  setTimeout, clearTimeout, setInterval, clearInterval,
  Deno: { env: { get: () => "fixture" }, serve: (fn) => { handler = fn; } },
  require: (path) => {
    if (path.includes("waBotGuard")) return guardExports;
    if (path.includes("itemDue")) return dueExports;
    if (path.includes("supabase-js")) return { createClient: () => db };
    if (path.includes("waRecovery")) return { recoveryPhone: (p) => p, recoveryPanel: async () => ({}) };
    if (path.includes("partnerTestFlow")) return { upgradePartnerTestFlow: (flow) => flow };
    return {};
  },
  fetch: async (url, init) => {
    assert.match(String(url), /^https:\/\/evolution\.invalid\/message\/sendText\//);
    sent.push(JSON.parse(init.body).text);
    return Response.json({ ok: true });
  },
};
vm.runInNewContext(compile("supabase/functions/evolution-webhook/index.ts"), context);
let nextId = 0;
async function receive(text, { fromMe = false, id = String(++nextId), media = false } = {}) {
  const response = await handler(new Request("https://webhook.invalid", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "messages.upsert", instance: "test", data: {
      key: { id, remoteJid: `${phone}@s.whatsapp.net`, fromMe },
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
assert.equal(sent.length, 1, "four free-text messages must not repeat the menu");
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

const history = [{ body: "menu", at: Date.now() }, { body: "outro", at: Date.now() }];
assert.equal(guardExports.isRepeatedBotReply(history, "menu"), true);
assert.equal(guardExports.isRepeatedBotReply(history, "novo"), false);
console.log("PASS: concurrent messages, option 3 from idle, silent human mode, media, dedup and owner resume.");
