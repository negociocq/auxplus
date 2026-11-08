import assert from 'node:assert/strict';
import vm from 'node:vm';
import { inboundDeadline, patchInboundQueue } from './evolution-inbound-queue.mjs';

await assert.rejects(inboundDeadline(new Promise(() => {}), 15), /deadline/);
assert.equal(await inboundDeadline(Promise.resolve('photo'), 100), 'photo');
const fixture = 'this.client.ev.process(async e=>{this.eventProcessingQueue=this.eventProcessingQueue.then(async()=>{await this.work(e)})});const opts={connectTimeoutMs:3e4,keepAliveIntervalMs:3e4,};async function photo(){let o=await this.client.profilePictureUrl(t,"image");return o}async function read(){await this.client.readMessages([n.key]);await this.client.readMessages([n.key])}';
const patched = patchInboundQueue(fixture);
new vm.Script(patched);
assert.equal(patchInboundQueue(patched), patched);
assert.throws(() => patchInboundQueue('unknown build'), /Unrecognized/);
let handler;
const controls = [], credentials = [], queued = [];
const app = {
  instance: { name: 'auxplus-tarciocq1', authState: { saveCreds: async () => credentials.push(true) } },
  client: { ev: { process: fn => { handler = fn; } } },
  logger: { error: error => { throw error; } },
  connectionUpdate: async update => controls.push(update.connection),
  eventProcessingQueue: new Promise(() => {}), // Simulate the real stalled lane.
  work: async event => queued.push(event),
};
const callback = patched.slice(0, patched.indexOf(';const opts'));
vm.runInNewContext(`(function(){${callback}}).call(app)`, { app });
await handler({ 'connection.update': { connection: 'close' }, 'creds.update': {} });
assert.deepEqual(controls, ['close'], 'reconnect must run even while message processing is stuck');
assert.equal(credentials.length, 1, 'credential saves cannot wait behind slow messages');
assert.equal(queued.length, 0);
app.instance.name = 'other-account';
await handler({ 'connection.update': { connection: 'open' }, 'creds.update': {} });
assert.deepEqual(controls, ['close'], 'other accounts retain their original event ordering');
console.log('PASS: connection lifecycle bypasses stuck owner lane, credentials save independently, auxiliary queries are bounded, other accounts unchanged, patch is syntax-checked and idempotent. No messages sent.');
