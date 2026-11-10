import assert from 'node:assert/strict';
import handler from '../api/gesapi.js';

// Import the real module as ESM, matching package.json and the Vercel runtime.
assert.equal(typeof handler, 'function');
function response() {
  return { headers: {}, statusCode: 0, body: undefined,
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    end(value) { this.body = value; return this; },
    send(value) { this.body = value; return this; },
    json(value) { this.body = value; return this; },
  };
}
let res = response(); await handler({ method: 'OPTIONS', headers: {} }, res);
assert.equal(res.statusCode, 200); assert.equal(res.headers['access-control-allow-origin'], '*');
res = response(); await handler({ method: 'GET', headers: {} }, res); assert.equal(res.statusCode, 400);
const actualFetch = globalThis.fetch;
const calls = [];
try {
  globalThis.fetch = async (url, init) => { calls.push({ url, init }); return Response.json([{ id: 1 }]); };
  res = response();
  await handler({ method: 'GET', url: '/api/gesapi', headers: { 'x-iptv-path': '/users-iptv?_refresh=123', 'x-iptv-authorization': 'Bearer fixture' } }, res);
  assert.equal(res.statusCode, 200); assert.equal(calls[0].url, 'https://gesapioffice.com/api/users-iptv?_refresh=123');
  assert.equal(calls[0].init.headers.Authorization, 'Bearer fixture');
  assert.equal(res.headers['access-control-allow-origin'], '*');
  globalThis.fetch = async (_url, init) => { calls.push(init); return Response.json({ error: 'fixture upstream error' }, { status: 500 }); };
  res = response();
  await handler({ method: 'PUT', url: '/api/gesapi', headers: { 'x-iptv-path': '/users-iptv/1' }, body: { action: 8 } }, res);
  assert.equal(res.statusCode, 500); assert.equal(calls.length, 2, 'proxy must not retry an upstream mutation');
  assert.equal(calls[1].body, '{"action":8}'); assert.equal(res.headers['access-control-allow-origin'], '*');
  globalThis.fetch = async () => { throw Error('fixture connection failure'); };
  res = response(); await handler({ method: 'GET', headers: { 'x-iptv-path': '/users-iptv' } }, res);
  assert.equal(res.statusCode, 502); assert.equal(res.headers['access-control-allow-origin'], '*');
} finally { globalThis.fetch = actualFetch; }
console.log('PASS: real ESM import, CORS preflight, missing-path validation, authenticated forwarding, upstream status, no mutation replay and safe network error. No real panel calls.');
