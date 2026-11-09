import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { patchInboundQueue } from './evolution-inbound-queue.mjs';
import { patchOfflineDelivery, recoverOfflineDelivery } from './evolution-offline-delivery.mjs';

const container = 'clickpede-app-evolution-api-1';
const run = (code, input) => execFileSync('docker', ['exec', '-i', container, 'node', '-e', code], { input, encoding: 'utf8', maxBuffer: 16e6 });
const file = '/evolution/dist/main.js';
const original = run(`process.stdout.write(require('fs').readFileSync('${file}','utf8'))`);
const patched = patchOfflineDelivery(patchInboundQueue(original));
new vm.Script(patched);
const sha = crypto.createHash('sha256').update(original).digest('hex');
console.log(JSON.stringify({ syntax: 'passed', previousSha256: sha }));
if (process.argv.includes('--apply')) {
  fs.mkdirSync('tmp/offline-delivery', { recursive: true });
  fs.writeFileSync(`tmp/offline-delivery/main-${sha}.js`, original);
  run(`const fs=require('fs'),crypto=require('crypto');const p='${file}';if(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!=='${sha}')throw Error('Source changed');fs.copyFileSync(p,p+'.auxplus-offline-delivery-backup');fs.writeFileSync(p,fs.readFileSync(0,'utf8'));`, patched);
}
if (process.argv.includes('--attach')) {
  // The temporary local probe must have been explicitly installed beforehand.
  const expression = `(function(){const x=globalThis.__auxMonitor?.waInstances['auxplus-tarciocq1'];if(!x)throw Error('Owner probe missing');x.auxplusOfflineRecovery?.stop();x.auxplusOfflineRecovery=(${recoverOfflineDelivery.toString()})(x.client);return x.auxplusOfflineRecovery.stats()})()`;
  const remote = `(async()=>{const target=(await(await fetch('http://127.0.0.1:9229/json')).json())[0],ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise(r=>ws.onopen=r);ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id===1){console.log(JSON.stringify(m.result?.result?.value||{error:m.result?.exceptionDetails?.text||m.error?.message}));ws.close()}};ws.send(JSON.stringify({id:1,method:'Runtime.evaluate',params:{expression:${JSON.stringify(expression)},returnByValue:true}}));})().catch(e=>{console.error(e.message);process.exitCode=1});`;
  console.log(execFileSync('docker', ['exec', '-i', container, 'node'], { input: remote, encoding: 'utf8' }).trim());
}
