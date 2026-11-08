import fs from 'node:fs';
import { patchInboundQueue } from './evolution-inbound-queue.mjs';
import { execFileSync } from 'node:child_process';
import { resolveStatusAudience } from './evolution-status-audience.mjs';
import { patchEvolutionStatus } from './evolution-status-single-upload.mjs';
import { patchWireBatches, sendStatusWireBatches } from './evolution-status-wire-batches.mjs';
import { releaseStatusTransaction } from './evolution-status-release-transaction.mjs';

const mainFile='/evolution/dist/main.js',sendFile='/evolution/node_modules/baileys/lib/Socket/messages-send.js';
let main=patchEvolutionStatus(fs.readFileSync(mainFile,'utf8'));
const start=main.indexOf('/* auxplus:status-single-upload:v1 */'),end=main.indexOf('}return await this.client.sendMessage(e,t,l)',start);
if(start<0||end<start)throw Error('Unrecognized Status source');
const branch='/* auxplus:status-resolved-delivery:v1 */const recipients=await ('+resolveStatusAudience.toString()+')(this.client,u);const confirmed=await this.client.sendMessage(e,t.status.content,{backgroundColor:t.status.option.backgroundColor,font:t.status.option.font,statusJidList:recipients,broadcast:true,useUserDevicesCache:this.instance.name==="auxplus-tarciocq1"?false:undefined});return {...confirmed,status:2}';
main=main.slice(0,start)+branch+main.slice(end);
const token='this.endSession=!1,this.client=(0,R.default)(c)';
if(main.split(token).length!==2)throw Error('Unrecognized socket creation');
main=main.replace(token,'this.endSession=!1,/* auxplus:status-stable-id:v4 */c.auxplusStatusStableId=this.instance.name==="auxplus-tarciocq1",this.client=(0,R.default)(c)');
let sender=patchWireBatches(fs.readFileSync(sendFile,'utf8'));
const begin=sender.indexOf('/* auxplus:status-distinct-audiences:v3 */'),finish=sender.indexOf('// Add message to retry cache',begin);
if(begin<0||finish<begin)throw Error('Unrecognized Status transport');
// Keep the owner flag for releasing the Signal transaction, while every disjoint
// audience uses an independent wire ID. Reusing one ID failed with 479 mid-fanout.
const send='/* auxplus:status-stable-id:v4 */ /* auxplus:status-publication-ids:v5 */\n            if (isStatus) await ('+sendStatusWireBatches.toString()+')(stanza, sendNode, sock.ws, () => generateMessageIDV2(meId), id => { if (messageRetryManager) messageRetryManager.addRecentMessage(destinationJid, id, message); }, false, config.auxplusStatusStableId === true ? {maxAccounts:40,maxDevices:80,spacingMs:150} : undefined);\n            else await sendNode(stanza);\n            ';
sender=releaseStatusTransaction(sender.slice(0,begin)+send+sender.slice(finish));
main=patchInboundQueue(main);
new Function(main);execFileSync(process.execPath,['--check','--input-type=module'],{input:sender});
fs.writeFileSync(mainFile,main);fs.writeFileSync(sendFile,sender);
console.log('Status delivery installed; target account private replies no longer wait for Status acknowledgements.');
