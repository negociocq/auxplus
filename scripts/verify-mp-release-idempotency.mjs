import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

function functions(path, names, context) {
  const file = ts.createSourceFile(path, fs.readFileSync(path, 'utf8'), ts.ScriptTarget.Latest, true);
  for (const name of names) {
    const node = file.statements.find(n => ts.isFunctionDeclaration(n) && n.name?.text === name);
    assert.ok(node, name);
    const source = node.getText(file).replace(/^export /, '');
    vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, context);
  }
}

const keys = new Map();
let deletes = 0;
const client = { from: () => ({
  insert: row => ({ select: async () => {
    if (keys.has(row.key)) return { error: { code: '23505' }, data: null };
    keys.set(row.key, row.value);
    return { data: [{ key: row.key }], error: null };
  } }),
  delete: () => { deletes++; throw Error('Claims must never be deleted'); },
}) };
const ctx = vm.createContext({ Date, claimKey: id => `mp_claim_${id}` });
functions('supabase/functions/mp-webhook/index.ts', ['acquireReleaseClaim'], ctx);
const attempts = await Promise.all(Array.from({ length: 25 }, (_, i) => ctx.acquireReleaseClaim(client, `order-${i}`, 'server', 'owner', 'same-payment')));
assert.equal(attempts.filter(Boolean).length, 1, 'one winner across concurrent tabs and different order IDs');
keys.set('mp_claim_legacy', { at: 1, claimer: 'client' });
assert.equal(await ctx.acquireReleaseClaim(client, 'legacy', 'server', 'owner', 'old-payment'), false, 'old two-minute claims cannot be reclaimed');
assert.equal(deletes, 0);
assert.equal(await ctx.acquireReleaseClaim(client, 'independent-order', 'server', 'owner', 'independent-payment'), true);
const broken = { from: () => ({ insert: () => ({ select: async () => ({ data: null, error: { code: '08006' } }) }) }) };
await assert.rejects(ctx.acquireReleaseClaim(broken, 'failure', 'server', 'owner', 'failure-payment'));

const mergeCtx = vm.createContext({ trimOrders: rows => rows });
functions('src/lib/mercadoPagoOrders.ts', ['mergeOrders'], Object.assign(mergeCtx, { isOrder: row => Boolean(row.id && row.mpPaymentId) }));
const completed = { id: 'one', mpPaymentId: 'paid', status: 'released', releasedAt: '2026-11-08T15:29:17Z', updatedAt: '2026-11-08T15:29:17Z' };
const stale = { id: 'one', mpPaymentId: 'paid', status: 'approved', updatedAt: '2026-11-08T16:21:24Z' };
for (const rows of [[completed, stale], [stale, completed]]) {
  assert.equal(mergeCtx.mergeOrders([rows[0]], [rows[1]])[0].status, 'released', 'a newer browser timestamp cannot undo completion');
}

// Unknown upstream response must not retry a financial write via another proxy.
let requests = 0;
const transport = vm.createContext({
  UPSTREAM: 'https://fixture.invalid/api', PANEL_ORIGIN: 'https://fixture.invalid',
  uniplayProxyCandidates: () => ['https://proxy-one.invalid', 'https://proxy-two.invalid'],
  fetch: async () => { requests++; throw Error('connection lost after upstream acceptance'); },
});
functions('supabase/functions/mp-webhook/index.ts', ['uniplayFetch', 'renewIptvUser', 'addResellerCredits'], transport);
await assert.rejects(transport.renewIptvUser('fixture', 1, 1));
assert.equal(requests, 1, 'renewal must not try another proxy or HTTP method');
requests = 0;
await assert.rejects(transport.addResellerCredits('fixture', 1, 10, 20, 'fixture'));
assert.equal(requests, 1, 'credit recharge must not replay via another endpoint');
requests = 0;
await assert.rejects(transport.uniplayFetch('/users-iptv', 'fixture'));
assert.equal(requests, 3, 'read-only requests retain safe failover');

const frontend = fs.readFileSync('src/lib/mpOrderAutoRelease.ts', 'utf8');
assert.doesNotMatch(frontend, /renewIptvUser|addIptvResellerCredits|acquireReleaseClaim|applyRenewalToItem/);
let invokes = 0, active = false;
const browser = vm.createContext({
  releasingIds: new Set(), loadMpOrdersRemote: async () => [{ id: 'one', status: 'approved', mpPaymentId: 'paid' }],
  supabase: { functions: { invoke: async () => { invokes++; await new Promise(resolve => setTimeout(resolve, 5)); return { error: Error('network timeout') }; } } },
  toast: { error: () => {} }, notifyOrdersChanged: () => {},
});
functions('src/lib/mpOrderAutoRelease.ts', ['releasePaidMpOrder'], browser);
await Promise.all(Array.from({ length: 10 }, () => browser.releasePaidMpOrder({ user: { id: 'owner' }, items: [], setData: () => { active = true; } }, { id: 'one' })));
assert.equal(invokes, 1, 'local in-flight guard is acquired before awaiting cloud reads');
assert.equal(active, false, 'a timeout cannot fabricate an item renewal');
const serverOnly = fs.readFileSync('supabase/migrations/20261108151000_mp_server_only_claims.sql', 'utf8');
assert.match(serverOnly, /before insert or update or delete/);
assert.match(serverOnly, /current_user not in \('postgres','service_role','supabase_admin'\)/);
assert.match(serverOnly, /errcode='42501'/);
console.log('PASS: one permanent execution per payment, concurrent order aliases, legacy claim preservation, fail-closed database errors, monotonic completion, no mutation retries/failover, server-only browser release. No real payments or credits.');
