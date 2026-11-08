import fs from 'node:fs';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export function releaseStatusTransaction(source) {
  if (source.includes('auxplus:status-release-transaction:v1')) return source;
  let next=source;
  const replace=(old,value)=>{if(next.split(old).length!==2)throw Error('Unrecognized transaction boundary');next=next.replace(old,value)};
  replace('        await authState.keys.transaction(async () => {\n            const mediaType = getMediaType(message);',
    '        /* auxplus:status-release-transaction:v1 */\n        let deferredStatusSend;\n        await authState.keys.transaction(async () => {\n            const mediaType = getMediaType(message);');
  const start=next.indexOf('/* auxplus:status-stable-id:v4 */'),end=next.indexOf('// Add message to retry cache',start);
  if(start<0||end<start)throw Error('Stable Status transport missing');
  const branch=next.slice(start,end);
  const callStart=branch.indexOf('await ('), callEnd=branch.indexOf(';\n            else await sendNode(stanza);');
  if(callStart<0||callEnd<callStart)throw Error('Unrecognized Status dispatch');
  const call=branch.slice(callStart+6,callEnd);
  next=next.slice(0,start)+'/* auxplus:status-stable-id:v4 */\n            if (isStatus && config.auxplusStatusStableId === true) deferredStatusSend = () => '+call+';\n            else if (isStatus) await '+call+';\n            else await sendNode(stanza);\n            '+next.slice(end);
  replace('        }, meId);\n        return msgId;', '        }, meId);\n        if (deferredStatusSend) await deferredStatusSend();\n        return msgId;');
  return next;
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const file='/evolution/node_modules/baileys/lib/Socket/messages-send.js';
 const run=(code,input)=>execFileSync('docker',['exec','-i','clickpede-app-evolution-api-1','node','-e',code],{input,encoding:'utf8',maxBuffer:4*1024*1024});
 const source=run(`process.stdout.write(require('fs').readFileSync('${file}','utf8'))`),patched=releaseStatusTransaction(source);
 execFileSync(process.execPath,['--check','--input-type=module'],{input:patched});
 const sha=crypto.createHash('sha256').update(source).digest('hex');
 if(process.argv.includes('--apply')&&source!==patched){
  fs.mkdirSync('tmp/evolution-status-backup',{recursive:true});fs.writeFileSync(`tmp/evolution-status-backup/transaction-${sha}.js`,source);
  console.log(run(`const fs=require('fs'),crypto=require('crypto'),p='${file}',b=p+'.auxplus-release-transaction-backup';if(fs.existsSync(b)||crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!=='${sha}')throw Error('Source changed or backup exists');fs.copyFileSync(p,b);fs.writeFileSync(p,fs.readFileSync(0,'utf8'));console.log('Installed with backup; restart required')`,patched));
 }
 console.log(JSON.stringify({changed:source!==patched,syntax:'passed',scope:'target account Status network dispatch after Signal transaction commit; private-message and group transport unchanged'}));
}
