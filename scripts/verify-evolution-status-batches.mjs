import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { sendStatusBatches } from './evolution-status-batches.mjs';

async function check(error) {
  const ws = new EventEmitter(), calls = [], id = 'test-id', message = { imageMessage: { url: 'already-uploaded' } };
  const ack = ackId => ws.emit('CB:ack,class:message', { attrs: { id: ackId, from: 'status@broadcast', ...(error ? { error } : {}) } });
  const client = {
    ws,
    async sendMessage(jid, content, options) { calls.push({ first: true, jid, content, options }); ack(options.messageId); return { key: { id, remoteJid: jid }, message }; },
    async relayMessage(jid, content, options) { assert.equal(content, message); calls.push({ first: false, jid, options }); ack(options.messageId); },
  };
  const audience = Array.from({ length: 3104 }, (_, i) => `${100000 + i}@s.whatsapp.net`);
  let seq = 0; const newId = () => 'native-' + ++seq;
  if (error) {
    await assert.rejects(sendStatusBatches(client, 'status@broadcast', { image: { url: 'original' } }, {}, audience, id, newId), /rejected Status: 400/);
    assert.equal(calls.length, 1);
  } else {
    const result = await sendStatusBatches(client, 'status@broadcast', { image: { url: 'original' } }, {}, [...audience, audience[0], 'group@g.us'], id, newId);
    assert.equal(result.status, 2);
    assert.equal(calls.filter(c => c.first).length, 1);
    assert.equal(calls.length, 311);
    assert.deepEqual(calls.flatMap(c => c.options.statusJidList), audience);
    assert.equal(new Set(calls.map(c => c.options.messageId)).size, calls.length);
    assert(calls.every(c => c.jid === 'status@broadcast' && c.options.statusJidList.length <= 10));
  }
  assert.equal(ws.listenerCount('CB:ack,class:message'), 0);
}
await check();
await check('400');
console.log('PASS: 3104 recipients once each; Status-only native calls; one upload; distinct IDs; native fresh encryption; rejection and cleanup');
