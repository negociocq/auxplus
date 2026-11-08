import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Self-contained: this exact function is installed into Evolution's Status branch.
export async function sendStatusBatches(client, destination, content, options, recipients, id, newId) {
  if (destination !== 'status@broadcast') throw new Error('Status-only transport');
  const audience = [...new Set(recipients)].filter(j => /^\d{5,20}@(s\.whatsapp\.net|lid)$/.test(j));
  if (!audience.length) throw new Error('No valid Status recipients');
  const batches = [];
  for (const domain of ['lid', 's.whatsapp.net']) {
    const group = audience.filter(j => j.endsWith('@' + domain));
    for (let i = 0; i < group.length; i += 10) batches.push(group.slice(i, i + 10));
  }
  let received = false, rejection, activeId = id;
  const onAck = node => {
    if (node.attrs?.id !== activeId || node.attrs?.from !== destination) return;
    received = true;
    if (node.attrs.error) rejection = new Error('WhatsApp rejected Status: ' + node.attrs.error);
  };
  const wait = async () => {
    const deadline = Date.now() + 15000;
    while (!received && !rejection && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 25));
    if (rejection) throw rejection;
    if (!received) throw new Error('WhatsApp Status acknowledgement timed out; do not automatically resend');
  };
  client.ws.on('CB:ack,class:message', onAck);
  try {
    const first = await client.sendMessage(destination, content, { ...options, statusJidList: batches[0], messageId: id });
    await wait();
    // relayMessage reuses the uploaded/encrypted media descriptor and the original ID,
    // matching Evolution's original same-ID batches without hundreds of uploads.
    for (let i = 1; i < batches.length; i++) {
      if (rejection) throw rejection;
      activeId = newId(); received = false;
      await client.relayMessage('status@broadcast', first.message, { messageId: activeId, statusJidList: batches[i] });
      await wait();
    }
    return { ...first, status: 2 };
  } finally {
    client.ws.off('CB:ack,class:message', onAck);
  }
}

export function patchBatches(source) {
  const marker = '/* auxplus:status-batches-ack:v1 */';
  if (source.includes(marker)) return source;
  const start = source.indexOf('/* auxplus:status-single-upload:v1 */');
  const end = source.indexOf('}return await this.client.sendMessage(e,t,l)', start);
  if (start < 0 || end < start) throw new Error('Unrecognized Status branch');
  const replacement = marker + 'return await (' + sendStatusBatches.toString() + ')(this.client,e,t.status.content,{backgroundColor:t.status.option.backgroundColor,font:t.status.option.font},u,"3EB0"+require("crypto").randomBytes(9).toString("hex").toUpperCase())';
  const patched = source.slice(0, start) + replacement + source.slice(end);
  new Function(patched);
  return patched;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const container = 'clickpede-app-evolution-api-1';
  const file = '/evolution/dist/main.js';
  const run = (code, input) => execFileSync('docker', ['exec', ...(input ? ['-i'] : []), container, 'node', '-e', code], { input, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
  const source = run(`process.stdout.write(require('fs').readFileSync('${file}','utf8'))`);
  const patched = patchBatches(source);
  if (process.argv.includes('--apply') && patched !== source) {
    fs.mkdirSync('tmp/evolution-status-backup', { recursive: true });
    fs.writeFileSync('tmp/evolution-status-backup/main-before-ack-batches.js', source);
    run(`const fs=require('fs');const p='${file}',b=p+'.auxplus-batches-backup';if(fs.existsSync(b))throw Error('Backup exists');fs.copyFileSync(p,b);const s=fs.readFileSync(0,'utf8');new Function(s);fs.writeFileSync(p,s);`, patched);
  }
  console.log(JSON.stringify({ changed: patched !== source, applied: process.argv.includes('--apply'), scope: 'Status batches of ten; one upload; same message ID; await every server acknowledgement' }));
}
