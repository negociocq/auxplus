import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { sendStatusWireBatches } from './evolution-status-wire-batches.mjs';
const run=(code,input)=>execFileSync('docker',['exec','-i','clickpede-app-evolution-api-1','node','-e',code],{input,encoding:'utf8',maxBuffer:8*1024*1024});
const mainFile='/evolution/dist/main.js',senderFile='/evolution/node_modules/baileys/lib/Socket/messages-send.js';
const rows=[mainFile,senderFile].map(file=>({file,before:run(`process.stdout.write(require('fs').readFileSync('${file}','utf8'))`)}));
if(rows.every(r=>r.before.includes('auxplus:status-stable-id:v4'))){console.log('Already installed');process.exit(0)}
const mainToken='this.endSession=!1,this.client=(0,R.default)(c)';
if(rows[0].before.split(mainToken).length!==2)throw Error('Unrecognized socket creation');
rows[0].after=rows[0].before.replace(mainToken,'this.endSession=!1,/* auxplus:status-stable-id:v4 */c.auxplusStatusStableId=this.instance.name==="auxplus-tarciocq1",this.client=(0,R.default)(c)');
const start=rows[1].before.indexOf('/* auxplus:status-distinct-audiences:v3 */'),end=rows[1].before.indexOf('// Add message to retry cache',start);
if(start<0||end<start)throw Error('Unrecognized Status transport');
const replacement='/* auxplus:status-stable-id:v4 */\n            if (isStatus) await ('+sendStatusWireBatches.toString()+')(stanza, sendNode, sock.ws, () => generateMessageIDV2(meId), id => { if (messageRetryManager) messageRetryManager.addRecentMessage(destinationJid, id, message); }, config.auxplusStatusStableId === true);\n            else await sendNode(stanza);\n            ';
rows[1].after=rows[1].before.slice(0,start)+replacement+rows[1].before.slice(end);
new vm.Script(rows[0].after);
execFileSync(process.execPath,['--check','--input-type=module'],{input:rows[1].after});
for(const r of rows)r.sha=crypto.createHash('sha256').update(r.before).digest('hex');
console.log(JSON.stringify({syntax:'passed',scope:'Status publication ID only, target instance only; per-batch acknowledgements preserved'}));
if(process.argv.includes('--apply')){
 fs.mkdirSync('tmp/evolution-status-backup',{recursive:true});for(const r of rows)fs.writeFileSync(`tmp/evolution-status-backup/stable-id-${r.sha}.js`,r.before);
 console.log(run(`const fs=require('fs'),crypto=require('crypto'),rows=JSON.parse(fs.readFileSync(0,'utf8'));for(const r of rows){if(fs.existsSync(r.file+'.auxplus-stable-id-backup')||crypto.createHash('sha256').update(fs.readFileSync(r.file)).digest('hex')!==r.sha)throw Error('Source changed or backup exists')}for(const r of rows){fs.copyFileSync(r.file,r.file+'.auxplus-stable-id-backup');fs.writeFileSync(r.file,r.after)}console.log('Installed with backups; restart required')`,JSON.stringify(rows)));
}
