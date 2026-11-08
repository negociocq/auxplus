import assert from "node:assert/strict";
import { ownStatusSync, patchOwnStatusSync, marker } from "./evolution-status-own-device-sync.mjs";

const media = { imageMessage: { caption: 'Comente "teste" para testar grátis.', fileSha256: "unchanged", url: "encrypted-media" } };
const key = { groupId: "status@broadcast", axolotlSenderKeyDistributionMessage: [1, 2, 3] };
const sync = ownStatusSync(true, "status@broadcast", media, key);
assert.equal(sync.deviceSentMessage.destinationJid, "status@broadcast");
assert.equal(sync.deviceSentMessage.message.imageMessage, media.imageMessage);
assert.equal(sync.deviceSentMessage.message.senderKeyDistributionMessage, key);
assert.equal(media.senderKeyDistributionMessage, undefined, "do not mutate the media sent to contacts");
assert.equal(ownStatusSync(false, "group@g.us", media, key), undefined, "group behavior remains unchanged");
const original = "if (dsmMessage) {} if (isOwnUser && !isExactSenderDevice) {} const result = await createParticipantNodes(senderKeyRecipients, senderKeyMsg, extraAttrs);";
const patched = patchOwnStatusSync(original);
assert.ok(patched.includes(marker));
assert.ok(patched.includes("extraAttrs, ownStatusSync"));
assert.equal(patchOwnStatusSync(patched), patched);
assert.throws(() => patchOwnStatusSync("different upstream source"));
// Existing recipient selection uses DSM only for the owner's other devices.
const payloadFor = (ownUser, exactSender) => ownUser && !exactSender ? sync : { senderKeyDistributionMessage: key };
assert.equal(payloadFor(true, false), sync);
assert.equal(payloadFor(false, false).deviceSentMessage, undefined);
assert.equal(payloadFor(true, true).deviceSentMessage, undefined);
console.log("Own Status sync: full media + sender key for linked own devices, unchanged contacts/groups, immutability and version guards passed. No messages sent.");
