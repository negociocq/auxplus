import assert from 'node:assert/strict';
import { releaseStatusTransaction } from './evolution-status-release-transaction.mjs';

const source=`async function relayMessage(){
        await authState.keys.transaction(async () => {
            const mediaType = getMediaType(message);
            /* auxplus:status-stable-id:v4 */
            if (isStatus) await (dispatch)(stanza, sendNode, sock.ws, newId, remember, config.auxplusStatusStableId === true);
            else await sendNode(stanza);
            // Add message to retry cache
        }, meId);
        return msgId;
}`;
const patched=releaseStatusTransaction(source);
for(const target of [true,false]){
 let held=false,committed=false,finish;
 const pending=new Promise(resolve=>{finish=resolve});
 const authState={keys:{async transaction(fn){assert.equal(held,false);held=true;try{await fn();committed=true}finally{held=false}}}};
 const dispatch=async()=>{assert.equal(held,!target,'Status server acknowledgements must not hold the target account encryption transaction');if(target)assert.equal(committed,true,'ratchet/session writes commit before any Status dispatch');await pending;};
 const fn=new Function('authState','getMediaType','message','isStatus','dispatch','stanza','sendNode','sock','newId','remember','config','meId','msgId',patched+';return relayMessage')(
  authState,()=>'',{},true,dispatch,{},async()=>{}, {ws:{}},()=>'',()=>{}, {auxplusStatusStableId:target},'owner','id');
 const sending=fn();await new Promise(resolve=>setTimeout(resolve,0));
 if(target)await authState.keys.transaction(async()=>{assert.equal(held,true,'private-message encryption can run while Status awaits server ACKs')});
 finish();assert.equal(await sending,'id');
}
assert.equal(releaseStatusTransaction(patched),patched);
console.log('PASS: pending Status acknowledgements release the target account Signal lock, commit before dispatch, preserve other accounts and complete the original send promise.');
