import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { resolveStatusAudience } from './evolution-status-audience.mjs';
import { patchEvolutionStatus } from './evolution-status-single-upload.mjs';
import { patchWireBatches } from './evolution-status-wire-batches.mjs';
const run = (code, input) => execFileSync('docker', ['exec', ...(input ? ['-i'] : []), 'clickpede-app-evolution-api-1', 'node', '-e', code], { input, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
const mainFile = '/evolution/dist/main.js', sendFile = '/evolution/node_modules/baileys/lib/Socket/messages-send.js';
const main = run(`process.stdout.write(require('fs').readFileSync('${mainFile}','utf8'))`);
const sender = run(`process.stdout.write(require('fs').readFileSync('${sendFile}','utf8'))`);
if (main.includes('auxplus:status-resolved-delivery:v1') && sender.includes('auxplus:status-distinct-audiences:v3')) {
  console.log('Already installed');
} else {
  let next = main;
  if (!main.includes('auxplus:status-resolved-delivery:v1')) {
  next = patchEvolutionStatus(main);
  const start = next.indexOf('/* auxplus:status-single-upload:v1 */');
  const end = next.indexOf('}return await this.client.sendMessage(e,t,l)', start);
  if (start < 0 || end < start) throw new Error('Unexpected main source');
  const branch = '/* auxplus:status-resolved-delivery:v1 */const recipients=await (' + resolveStatusAudience.toString() + ')(this.client,u);const confirmed=await this.client.sendMessage(e,t.status.content,{backgroundColor:t.status.option.backgroundColor,font:t.status.option.font,statusJidList:recipients,broadcast:true});return {...confirmed,status:2}';
  next = next.slice(0, start) + branch + next.slice(end);
  }
  const nextSender = patchWireBatches(sender);
  new Function(next);
  execFileSync(process.execPath, ['--check', '--input-type=module'], { input: nextSender });
  if (process.argv.includes('--apply')) {
    const files = [{ file: mainFile, before: main, after: next }, { file: sendFile, before: sender, after: nextSender }];
    for (const row of files) row.sha = createHash('sha256').update(row.before).digest('hex');
    run(`const fs=require('fs'),crypto=require('crypto');const rows=JSON.parse(fs.readFileSync(0,'utf8'));for(const r of rows){if(fs.existsSync(r.file+'.auxplus-resolved-wire-backup'))throw Error('Backup exists');if(crypto.createHash('sha256').update(fs.readFileSync(r.file)).digest('hex')!==r.sha)throw Error('Source changed');}for(const r of rows){fs.copyFileSync(r.file,r.file+'.auxplus-resolved-wire-backup');fs.writeFileSync(r.file,r.after);}`, JSON.stringify(files));
  }
  console.log(JSON.stringify({ applied: process.argv.includes('--apply'), scope: 'PN/LID alias resolution, own-account exclusion, one media/encryption preparation, same-ciphertext device batches, explicit acknowledgement required' }));
}
