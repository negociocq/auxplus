import fs from 'node:fs';
import crypto from 'node:crypto';
import vm from 'node:vm';
import { execFileSync } from 'node:child_process';
import { patchInboundQueue } from './evolution-inbound-queue.mjs';

const container = 'clickpede-app-evolution-api-1';
const run = (code, input) => execFileSync('docker', ['exec', '-i', container, 'node', '-e', code], { input, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 });
const file = '/evolution/dist/main.js';
const original = run(`process.stdout.write(require('fs').readFileSync('${file}','utf8'))`);
const patched = patchInboundQueue(original);
new vm.Script(patched);
if (patched === original) { console.log('Inbound queue protection already installed.'); process.exit(0); }
const sha = crypto.createHash('sha256').update(original).digest('hex');
console.log(JSON.stringify({ syntax: 'passed', originalSha256: sha, scope: 'owner connection lifecycle and bounded auxiliary queries' }));
if (process.argv.includes('--apply')) {
  fs.mkdirSync('tmp/inbound-queue', { recursive: true });
  fs.writeFileSync(`tmp/inbound-queue/main-${sha}.js`, original);
  run(`const fs=require('fs'),crypto=require('crypto');const p='${file}';if(crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')!=='${sha}')throw Error('Source changed');fs.copyFileSync(p,p+'.auxplus-inbound-queue-backup');fs.writeFileSync(p,fs.readFileSync(0,'utf8'));console.log('Inbound protection installed with backup');`, patched);
}
