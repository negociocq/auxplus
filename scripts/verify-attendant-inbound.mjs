import assert from 'node:assert/strict';
import { skipAttendantEvent } from '../supabase/functions/_shared/waInbound.ts';
for (const message of [{ conversation: 'Olá' }, { audioMessage: {} }, { imageMessage: { caption: 'teste' } }]) {
  assert.equal(skipAttendantEvent('messages.upsert', { key: { remoteJid: 'status@broadcast', participant: '5511000000000@s.whatsapp.net', participantAlt: '12345678900@lid' }, message }), 'status');
}
assert.equal(skipAttendantEvent('MESSAGES_UPSERT', { key: { remoteJid: '5511000000000@s.whatsapp.net' }, message: { conversation: 'Oi' } }), null);
assert.equal(skipAttendantEvent('messages.upsert', { key: { remoteJid: '12345678900@lid', remoteJidAlt: '5511000000000@s.whatsapp.net' }, message: { audioMessage: {} } }), null);
assert.equal(skipAttendantEvent('messages.upsert', { key: { remoteJid: '12345678900@lid' }, message: { extendedTextMessage: { text: 'teste', contextInfo: { remoteJid: 'status@broadcast', quotedMessage: { imageMessage: {} } } } } }), null, 'a real private reply to a Status must still reach the attendant');
assert.equal(skipAttendantEvent('messages.update', { key: { remoteJid: '5511000000000@s.whatsapp.net' }, message: { conversation: 'old message' } }), 'not_message_upsert');
assert.equal(skipAttendantEvent('messages.set', { key: { remoteJid: '5511000000000@s.whatsapp.net' } }), 'not_message_upsert');
for (const [jid, reason] of [['123456789@g.us', 'group'], ['123456789@newsletter', 'newsletter'], ['123456789@broadcast', 'broadcast'], ['', 'not_private_chat']]) assert.equal(skipAttendantEvent('messages.upsert', { key: { remoteJid: jid } }), reason);
console.log('PASS: Status audio/text/images cannot trigger private replies; normal private messages and genuine Status replies allowed; receipt/history/group/newsletter events ignored');
