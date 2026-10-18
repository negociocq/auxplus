import fs from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";
const source = fs.readFileSync("supabase/functions/_shared/adminPhotoConfig.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }, reportDiagnostics: true });
assert.equal(compiled.diagnostics.length, 0);
const { createPhotoConfigHandler } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
const testKey = "sk-test_dummy_not_a_real_key_123456789";
const rows = new Map();
let secretWrites = 0;
const user = { id: "1", username: "admin", password: "stored-password", is_admin: true, is_active: true };
const db = { from(table) { return {
  select() { return this; }, delete() { this.remove = true; return this; },
  eq(field, value) { this.filter = { field, value }; return this; },
  then(resolve, reject) { return Promise.resolve().then(() => { if (this.remove) rows.delete(this.filter.value); return { error: null }; }).then(resolve, reject); },
  async maybeSingle() { return { data: table === "users" ? (String(user[this.filter.field]) === this.filter.value ? { ...user } : null) : rows.get(this.filter.value), error: null }; },
  async upsert(value) { assert.equal(table, "platform_private_secrets"); rows.set(value.name, value); if (value.name === "openai_device_photo") secretWrites++; return { error: null }; },
}; } };
const handler = createPhotoConfigHandler(db, async (plain, hash) => plain === "correct-password" && hash === "stored-password");
const post = (body, token) => new Request("https://example.test", { method: "POST", headers: token ? { Authorization: `Bearer ${token}` } : {}, body: JSON.stringify(body) });
const login = { action: "login", username: "admin", password: "correct-password" };
assert.equal((await handler(post({ apiKey: testKey }))).status, 401);
assert.equal((await handler(post({ apiKey: testKey }, "a".repeat(64)))).status, 401);
assert.equal((await handler(post({ ...login, password: "wrong" }))).status, 403);
user.is_admin = false;
assert.equal((await handler(post(login))).status, 403);
user.is_admin = true;
let res = await handler(post(login));
assert.equal(res.status, 200);
const session = await res.json();
assert.match(session.token, /^[a-f0-9]{64}$/);
assert.equal([...rows.keys()].some(key => key.includes(session.token)), false);
res = await handler(post({ apiKey: testKey }, session.token));
assert.equal(res.status, 200);
assert.equal(secretWrites, 1);
assert.equal((await res.text()).includes(testKey), false);
const status = await (await handler(new Request("https://example.test"))).text();
assert.equal(JSON.parse(status).configured, true);
assert.equal(status.includes(testKey), false);
user.is_admin = false;
assert.equal((await handler(post({ apiKey: testKey }, session.token))).status, 403);
user.is_admin = true; user.is_active = false;
assert.equal((await handler(post({ apiKey: testKey }, session.token))).status, 403);
user.is_active = true; user.password = "changed-password";
assert.equal((await handler(post({ apiKey: testKey }, session.token))).status, 403);
user.password = "stored-password";
const row = [...rows.values()].find(row => row.name.startsWith("admin_session_"));
const originalExpiry = row.value.expiresAt;
row.value.expiresAt = "2000-01-01T00:00:00Z";
assert.equal((await handler(post({ apiKey: testKey }, session.token))).status, 401);
row.value.expiresAt = originalExpiry;
assert.equal((await handler(post({ action: "logout" }, session.token))).status, 200);
assert.equal((await handler(post({ apiKey: testKey }, session.token))).status, 401);
assert.equal(secretWrites, 1);
const throttled = createPhotoConfigHandler(db, async () => false);
for (let n = 0; n < 5; n++) assert.equal((await throttled(post(login))).status, 403);
assert.equal((await throttled(post(login))).status, 429);
const form = fs.readFileSync("src/components/AdminPhotoApiConfig.tsx", "utf8");
assert.equal(form.includes("openai-admin-password"), false);
console.log("PASS: login/session creation, random token hashes, password-free save, forged/expired/revoked tokens, changed password/role, inactive account, no key disclosure, login attempt limits. No network calls.");
