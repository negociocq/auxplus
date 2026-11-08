import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { sendStatusWireBatches } from './evolution-status-wire-batches.mjs';
for (const error of [null, '400']) {
  const ws = new EventEmitter(), sent = [], encrypted = { tag: 'enc', content: Buffer.from('same ciphertext') };
  const devices = Array.from({ length: 53 }, (_, i) => ({ tag: 'to', attrs: { jid: `${i}@lid` }, content: [] }));
  const stanza = { tag: 'message', attrs: { id: 'one-id' }, content: [{ tag: 'participants', content: [...devices, devices[0]] }, encrypted] };
  const send = async node => { sent.push(node); ws.emit('CB:ack,class:message', { attrs: { id: node.attrs.id, from: 'status@broadcast', ...(error ? { error } : {}) } }); };
  let seq = 0;
  const newId = () => 'child-' + ++seq;
  if (error) { await assert.rejects(sendStatusWireBatches(stanza, send, ws, newId), /400/); assert.equal(sent.length, 1); }
  else {
    await sendStatusWireBatches(stanza, send, ws, newId);
    assert.equal(sent.length, 6);
    assert.deepEqual(sent.flatMap(n => n.content[0].content), devices);
    assert.equal(new Set(sent.map(n => n.attrs.id)).size, sent.length);
    assert(sent.every(n => n.attrs.to === 'status@broadcast' && n.content[1] === encrypted && n.content[0].content.length <= 10));
  }
  assert.equal(ws.listenerCount('CB:ack,class:message'), 0);
}
console.log('PASS: Status-only destination; distinct audience IDs; every recipient once; same uploaded media; rejection and cleanup');

for (const rejectionAt of [-1, 2]) {
 const ws=new EventEmitter(),ids=[];let acknowledgements=0;
 const stanza={attrs:{id:'one-publication'},content:[{tag:'participants',content:Array.from({length:35},(_,i)=>({attrs:{jid:`${i+10000}@lid`}}))},{tag:'enc',content:Buffer.from('same-ciphertext')}]};
 const send=async node=>{assert.equal(acknowledgements,ids.length,'wait for each previous batch acknowledgement');ids.push(node.attrs.id);setTimeout(()=>{acknowledgements++;ws.emit('CB:ack,class:message',{attrs:{id:node.attrs.id,from:'status@broadcast',...(ids.length===rejectionAt?{error:'479'}:{})}})},5)};
 const sending=sendStatusWireBatches(stanza,send,ws,()=>{throw Error('must retain publication ID')},undefined,true);
 if(rejectionAt>0){await assert.rejects(sending,/479/);assert.equal(ids.length,rejectionAt)}else{await sending;assert.equal(ids.length,4)}
 assert.equal(new Set(ids).size,1);assert.equal(ws.listenerCount('CB:ack,class:message'),0);
}
console.log('PASS: stable publication ID retains per-batch acknowledgement waits and stops on explicit rejection.');

{
 const ws=new EventEmitter(),sent=[];
 const devices=Array.from({length:12},(_,user)=>Array.from({length:4},(_,device)=>({tag:'to',attrs:{jid:`${10000+user}:${device}@lid`}}))).flat();
 const stanza={attrs:{id:'many-devices'},content:[{tag:'participants',content:devices},{tag:'enc',content:Buffer.from('same')}]};
 await sendStatusWireBatches(stanza,async node=>{sent.push(node);ws.emit('CB:ack,class:message',{attrs:{id:node.attrs.id,from:'status@broadcast'}})},ws,()=>'',undefined,true);
 assert(sent.every(n=>n.content[0].content.length<=20));
 assert.deepEqual(sent.flatMap(n=>n.content[0].content),devices);
 for(const user of new Set(devices.map(d=>d.attrs.jid.split(':')[0])))assert.equal(sent.filter(n=>n.content[0].content.some(d=>d.attrs.jid.startsWith(user+':'))).length,1);
 console.log('PASS: multi-device accounts remain together and wire batches cap at twenty devices.');
}

{
 const ws=new EventEmitter(),sent=[];
 const devices=Array.from({length:80},(_,user)=>Array.from({length:2},(_,device)=>({tag:'to',attrs:{jid:`${20000+user}:${device}@lid`}}))).flat();
 const stanza={attrs:{id:'compact'},content:[{tag:'participants',content:devices},{tag:'enc',content:Buffer.from('same')}]};
 let id=0;
 await sendStatusWireBatches(stanza,async node=>{sent.push(node);ws.emit('CB:ack,class:message',{attrs:{id:node.attrs.id,from:'status@broadcast'}})},ws,()=>`compact-${++id}`,undefined,false,{maxAccounts:40,maxDevices:80});
 assert.equal(sent.length,2,'the owner option reduces eighty-account fanout from eight packets to two');
 assert(sent.every(n=>n.content[0].content.length<=80));assert.equal(new Set(sent.map(n=>n.attrs.id)).size,2);
 assert.deepEqual(sent.flatMap(n=>n.content[0].content),devices);
 console.log('PASS: scoped compact fanout preserves each device and distinct packet IDs with fewer requests.');
}
