import { execFileSync } from 'node:child_process';
import { sendStatusWireBatches } from './evolution-status-wire-batches.mjs';
const container='clickpede-app-evolution-api-1';
const read=file=>execFileSync('docker',['exec',container,'node','-e',`process.stdout.write(require('fs').readFileSync('${file}','utf8'))`],{encoding:'utf8',maxBuffer:32*1024*1024});
const senderFile='/evolution/node_modules/baileys/lib/Socket/messages-send.js',mainFile='/evolution/dist/main.js';
let sender=read(senderFile),main=read(mainFile),count=0,offset=0;
while(true){const start=sender.indexOf('async function sendStatusWireBatches(',offset);if(start<0)break;const end=sender.indexOf(')(stanza, sendNode',start);if(end<start)throw Error('Unrecognized Status helper');const replacement=sendStatusWireBatches.toString();sender=sender.slice(0,start)+replacement+sender.slice(end);offset=start+replacement.length;count++;}
if(count!==2)throw Error('Expected exactly two Status paths');
if(process.argv.includes('--distinct')){
  const token='}, config.auxplusStatusStableId === true);';
  if(sender.split(token).length!==3)throw Error('Expected exactly two Status publication flags');
  sender=sender.replaceAll(token,'}, false); /* auxplus:status-publication-ids:v5 */');
}
if(process.argv.includes('--compact')){
  const token='}, false);';
  if(sender.split(token).length!==3)throw Error('Expected two independent-ID Status calls');
  sender=sender.replaceAll(token,'}, false, config.auxplusStatusStableId === true ? {maxAccounts:40,maxDevices:80,spacingMs:150} : undefined);');
}
const before='statusJidList:recipients,broadcast:true';
const after='statusJidList:recipients,broadcast:true,useUserDevicesCache:this.instance.name==="auxplus-tarciocq1"?false:undefined';
if(!main.includes(after)){if(main.split(before).length!==2)throw Error('Unrecognized Status send branch');main=main.replace(before,after);}
new Function(main);execFileSync(process.execPath,['--check','--input-type=module'],{input:sender});
if(!process.argv.includes('--apply')){console.log('Validated Status-only diagnostics and fresh owner device lookup.');process.exit(0);}
for(const [file,source] of [[mainFile,main],[senderFile,sender]])execFileSync('docker',['exec','-i',container,'node','-e',`const fs=require('fs'),file='${file}',backup=file+'.status-479-before';if(!fs.existsSync(backup))fs.copyFileSync(file,backup);fs.writeFileSync(file,fs.readFileSync(0,'utf8'));`],{input:source});
console.log('Installed Status diagnostics and fresh owner device lookup. Restart required; auth/session records unchanged.');
