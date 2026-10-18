import fs from "node:fs";
import assert from "node:assert/strict";
import ts from "typescript";
const source = fs.readFileSync("supabase/functions/_shared/adminPhotoConfig.ts", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 }, reportDiagnostics: true });
assert.equal(compiled.diagnostics.length, 0);
const { createPhotoConfigHandler } = await import(`data:text/javascript;base64,${Buffer.from(compiled.outputText).toString("base64")}`);
const testKey = "sk-test_dummy_not_a_real_key_123456789";
let stored = null;
let writes = 0;
let user = { username: "admin", password: "stored-password", is_admin: true, is_active: true };
const db = { from(table) { return {
  select() { return this; }, eq(field, value) { this.filter = { field, value }; return this; },
  async maybeSingle() { return { data: table === "users" ? (this.filter.value === user?.username ? user : null) : stored, error: null }; },
  async upsert(value) { assert.equal(table, "platform_private_secrets"); stored = value; writes++; return { error: null }; },
}; } };
const verify = async (plain, hash) => plain === "correct-password" && hash === "stored-password";
const handler = createPhotoConfigHandler(db, verify);
const post = body => new Request("https://example.test", { method: "POST", body: JSON.stringify(body) });
const valid = { username: "admin", password: "correct-password", apiKey: testKey };
let res = await handler(new Request("https://example.test"));
assert.equal((await res.json()).configured, false);
assert.equal((await handler(post({ ...valid, password: "wrong" }))).status, 403);
assert.equal(writes, 0);
user.is_admin = false;
assert.equal((await handler(post(valid))).status, 403);
user.is_admin = true; user.is_active = false;
assert.equal((await handler(post(valid))).status, 403);
user.is_active = true;
assert.equal((await handler(post({ ...valid, apiKey: "invalid" }))).status, 400);
res = await handler(post(valid));
assert.equal(res.status, 200);
assert.equal(writes, 1);
assert.equal(stored.value.apiKey, testKey);
assert.equal((await res.text()).includes(testKey), false);
res = await handler(new Request("https://example.test"));
const publicStatus = await res.text();
assert.equal(JSON.parse(publicStatus).configured, true);
assert.equal(publicStatus.includes(testKey), false);
assert.equal(publicStatus.includes("password"), false);
assert.equal((await handler(post([]))).status, 400);
assert.equal((await handler(new Request("https://example.test", { method: "POST", body: "bad json" }))).status, 400);
const throttled = createPhotoConfigHandler(db, verify);
for (let n = 0; n < 5; n++) assert.equal((await throttled(post({ ...valid, password: "wrong" }))).status, 403);
assert.equal((await throttled(post(valid))).status, 429);
assert.equal(writes, 1);
console.log("PASS: admin password verification, role/active checks, no credential disclosure, protected writes, invalid inputs and attempt limits. No network calls.");
