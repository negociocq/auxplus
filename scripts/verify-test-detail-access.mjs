import fs from 'node:fs';
import vm from 'node:vm';
import assert from 'node:assert/strict';
import ts from 'typescript';

const source = fs.readFileSync('src/pages/UniPlay.tsx', 'utf8');
const ast = ts.createSourceFile('UniPlay.tsx', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
let effect;
function walk(node) {
  if (ts.isCallExpression(node) && node.expression.getText(ast) === 'useEffect' && node.arguments[0]?.getText(ast).includes('setDetailJobAccessState')) effect = node.arguments[0];
  ts.forEachChild(node, walk);
}
walk(ast); assert.ok(effect, 'test detail must fetch panel access independently of stored job links');
const changes = [], calls = [], pending = new Map();
const ctx = vm.createContext({
  detailJobAccessKey: 'owner|a', detailJob: { id: 'a', panelUsername: 'user-a', panelPassword: 'old-password', m3u: 'https://old.invalid/list', dnsSmarters: 'https://old.invalid' },
  bearer: 'fixture', panelUser: '', panelPass: '',
  panelCreds: () => ({ bearerToken: 'fixture' }), ensureIptvToken: async () => ({ token: 'fresh-fixture', renewed: true }), persistToken: () => {},
  setDetailJobAccessState: value => changes.push(value),
  fetchIptvUserAccess: async (creds, username) => { calls.push({ creds, username }); return new Promise((resolve, reject) => pending.set(username, { resolve, reject })); },
});
vm.runInContext(ts.transpileModule('globalThis.run = ' + effect.getText(ast), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, ctx);
const flush = () => new Promise(resolve => setImmediate(resolve));
const cancelA = ctx.run(); await flush();
assert.equal(calls.length, 1, 'fetch even when the historical job already has password and M3U');
assert.equal(changes.at(-1).access, null);
cancelA(); ctx.detailJobAccessKey = 'owner|b'; ctx.detailJob = { id: 'b', panelUsername: 'user-b' };
const cancelB = ctx.run(); await flush();
pending.get('user-b').resolve({ password: 'current-password', m3u: 'https://panel.invalid/current', dnsSmarters: 'https://dns.invalid', webPlayer: 'https://web.invalid' }); await flush();
assert.equal(changes.at(-1).key, 'owner|b'); assert.equal(changes.at(-1).access.m3u, 'https://panel.invalid/current');
const count = changes.length;
pending.get('user-a').resolve({ password: 'stale', m3u: 'https://stale.invalid' }); await flush();
assert.equal(changes.length, count, 'late response cannot display another trial credentials');
cancelB(); ctx.detailJobAccessKey = 'owner|b|retry'; const cancelRetry = ctx.run(); await flush();
assert.equal(calls.length, 3, 'retry/reopen always requests current panel data');
pending.get('user-b').reject(Error('Panel unavailable')); await flush();
assert.equal(changes.at(-1).access, null); assert.ok(changes.at(-1).error);
cancelRetry(); ctx.detailJobAccessKey = ''; ctx.run(); assert.equal(changes.at(-1), null);

const api = ts.createSourceFile('api.ts', fs.readFileSync('src/lib/iptvPanelApi.ts', 'utf8'), ts.ScriptTarget.Latest, true);
const fetchAccess = api.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'fetchIptvUserAccess');
const requests = [];
const apiCtx = vm.createContext({
  listIptvUsers: async (_creds, opts) => { assert.equal(opts.fresh, true); return [{ id: 42, username: 'user-b' }]; },
  panelFetch: async (_creds, path, init) => { requests.push({ path, init }); return {}; },
  extractIptvClientAccess: () => ({ password: 'actual', m3u: 'https://actual.invalid/list', dnsSmarters: 'https://actual-dns.invalid', webPlayer: '' }),
  enrichCreateTestResult: () => ({}), deepFindPassword: () => '',
});
vm.runInContext(ts.transpileModule(fetchAccess.getText(api).replace(/^export /, ''), { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText, apiCtx);
assert.equal((await apiCtx.fetchIptvUserAccess({ regPassword: 'fixture' }, 'user-b')).m3u, 'https://actual.invalid/list');
assert.equal(requests[0].path, '/users-iptv/42'); assert.equal(requests[0].init.method, 'PUT');
assert.equal(requests[0].init.cache, 'no-store'); assert.equal(JSON.parse(requests[0].init.body).action, 8, 'read links, never renew or recreate');
apiCtx.extractIptvClientAccess = () => ({ password: '', m3u: '', dnsSmarters: '', webPlayer: '' });
assert.equal((await apiCtx.fetchIptvUserAccess({}, 'user-b')).m3u, '', 'missing panel data stays empty');
const modal = source.slice(source.indexOf('{/* Detalhes do teste /'));
assert.match(modal, /M3U:\{" "\}[\s\S]*?Telefone:\{" "\}[\s\S]*?DNS Smarters:\{" "\}/);
assert.doesNotMatch(modal, /linksForJob|detailJob\.panelPassword/);
assert.ok(modal.includes('disabled={!links?.m3u || detailJobAccessLoading}'));
console.log('PASS: fresh panel read despite old saved links, current copy fields, cancellation between trials, error/retry/close, read-only action 8, empty missing data, phone below M3U. No real account requests.');
