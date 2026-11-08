import assert from 'node:assert/strict';
import { resolveStatusAudience } from './evolution-status-audience.mjs';
const queried = [];
const client = {
  user: { id: '111111:8@s.whatsapp.net', lid: '999999:8@lid' },
  signalRepository: { lidMapping: { async getLIDsForPNs(pns) {
    queried.push(pns);
    return pns.flatMap(pn => pn === '111111@s.whatsapp.net' ? [{ pn, lid: '999999@lid' }] : pn === '222222@s.whatsapp.net' ? [{ pn, lid: '888888@lid' }] : []);
  } } },
};
assert.deepEqual(await resolveStatusAudience(client, ['111111@s.whatsapp.net', '999999@lid', '222222@s.whatsapp.net', '888888@lid', '333333@s.whatsapp.net', 'bad', '1@g.us']), ['888888@lid', '333333@s.whatsapp.net']);
const many = Array.from({ length: 251 }, (_, i) => `${1000000 + i}@s.whatsapp.net`);
assert.equal((await resolveStatusAudience(client, many)).length, 251);
assert(queried.every(batch => batch.length <= 100));
await assert.rejects(resolveStatusAudience(client, ['111111@s.whatsapp.net']), /No external/);
console.log('PASS: verified PN/LID aliases, alias deduplication, sender exclusion, unresolved PN preserved, bounded queries, empty audience rejected');
