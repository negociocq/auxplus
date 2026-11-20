import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import vm from 'node:vm';

const container = 'clickpede-app-evolution-api-1';
const file = '/evolution/dist/main.js';
const marker = '/* auxplus:inbound-diagnostic:v1 */';
const run = (code, input) => execFileSync('docker', ['exec', '-i', container, 'node', '-e', code], { input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
const original = run(`process.stdout.write(require('fs').readFileSync('${file}','utf8'))`);
if (original.includes(marker)) { console.log('Diagnostics already installed'); process.exit(0); }
let patched = original;
function replace(old, next) {
  if (patched.split(old).length !== 2) throw Error('Unexpected source: ' + old);
  patched = patched.replace(old, next);
}
replace('this.eventHandler(),this.client.ws.on("CB:call",', `${marker}this.client.ws.on("CB:message",()=>{if(this.instance.name==="auxplus-tarciocq1"&&(this.auxInboundWireCount=(this.auxInboundWireCount||0)+1)<=100)console.warn("AUX_INBOUND_DIAG",JSON.stringify({stage:"wire",count:this.auxInboundWireCount,at:Date.now()}))}),this.eventHandler(),this.client.ws.on("CB:call",`);
replace('this.client.ev.process(async e=>{this.eventProcessingQueue=', 'this.client.ev.process(async e=>{if(this.instance.name==="auxplus-tarciocq1"&&(this.auxInboundEventCount=(this.auxInboundEventCount||0)+1)<=150)console.warn("AUX_INBOUND_DIAG",JSON.stringify({stage:"queued",events:Object.keys(e),connection:e["connection.update"]?.connection,at:Date.now()}));this.eventProcessingQueue=');
replace('this.eventProcessingQueue.then(async()=>{try{if(!this.endSession){', 'this.eventProcessingQueue.then(async()=>{try{if(this.instance.name==="auxplus-tarciocq1"&&this.auxInboundEventCount<=150)console.warn("AUX_INBOUND_DIAG",JSON.stringify({stage:"started",events:Object.keys(e),at:Date.now()}));if(!this.endSession){');
replace('catch(t){this.logger.error(t)}})})}historySyncNotification', 'catch(t){this.logger.error(t)}finally{if(this.instance.name==="auxplus-tarciocq1"&&this.auxInboundEventCount<=150)console.warn("AUX_INBOUND_DIAG",JSON.stringify({stage:"finished",events:Object.keys(e),at:Date.now()}))}})})}historySyncNotification');
new vm.Script(patched);
const sha = crypto.createHash('sha256').update(original).digest('hex');
console.log(JSON.stringify({ syntax: 'passed', sha, scope: 'counts, event names and connection state only; no message content or phone numbers' }));
if (process.argv.includes('--apply')) {
  fs.mkdirSync('tmp/evolution-inbound-diagnostic', { recursive: true });
  fs.writeFileSync(`tmp/evolution-inbound-diagnostic/main-${sha}.js`, original);
  run(`const fs=require('fs'),crypto=require('crypto');const p='${file}',b=p+'.auxplus-inbound-diagnostic-backup';if(fs.existsSync(b)||crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!=='${sha}')throw Error('Source changed or backup exists');fs.copyFileSync(p,b);fs.writeFileSync(p,fs.readFileSync(0,'utf8'));console.log('Diagnostic installed with backup');`, patched);
}
