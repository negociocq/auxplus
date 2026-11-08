import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

export async function sendStatusWireBatches(stanza, sendNode, ws, newId, remember, stablePublicationId = false, options = {}) {
  const maxAccounts = Math.min(40, Math.max(1, options.maxAccounts || 10));
  const maxDevices = Math.min(80, Math.max(1, options.maxDevices || 20));
  const spacingMs = Math.min(1000, Math.max(0, options.spacingMs || 0));
  const participants = stanza.content.find(n => n.tag === 'participants');
  const devices = [...new Map((participants?.content || []).map(n => [n.attrs.jid, n])).values()];
  if (!devices.length) throw new Error('Status has no resolved recipient devices');
  const users = new Map();
  for (const device of devices) {
    const user = device.attrs.jid.replace(/:\d+@/, '@');
    if (!users.has(user)) users.set(user, []);
    users.get(user).push(device);
  }
  const accounts = [...users.values()], accepted = new Set(), batches = [];
  const domains = [...new Set(accounts.map(a => a[0].attrs.jid.split('@')[1]))].sort((a, b) => a === 'lid' ? -1 : b === 'lid' ? 1 : a.localeCompare(b));
  for (const domain of domains) {
    const sameDomain = accounts.filter(a => a[0].attrs.jid.endsWith('@' + domain));
    let batch = [], accountCount = 0;
    for (const account of sameDomain) {
      if (batch.length && (accountCount >= maxAccounts || batch.length + account.length > maxDevices)) { batches.push(batch); batch = []; accountCount = 0; }
      batch.push(...account); accountCount++;
    }
    if (batch.length) batches.push(batch);
  }
  let activeId, rejection, acknowledged = false, batchIndex = -1;
  const onAck = node => {
    if (node.attrs?.id !== activeId || node.attrs?.from !== 'status@broadcast') return;
    if (!node.attrs.error) accepted.add(activeId);
    if (!node.attrs.error) acknowledged = true;
    if (node.attrs.error) rejection = new Error('WhatsApp rejected Status: ' + node.attrs.error + ' (batch ' + (batchIndex + 1) + '/' + batches.length + ', devices ' + batches[batchIndex]?.length + ', domain ' + (batches[batchIndex]?.[0]?.attrs?.jid?.split('@')[1] || 'unknown') + ', addressing ' + (stanza.attrs.addressing_mode || 'default') + ')');
  };
  ws.on('CB:ack,class:message', onAck);
  try {
    for (let index = 0; index < batches.length; index++) {
      batchIndex = index;
      activeId = stablePublicationId || index === 0 ? stanza.attrs.id : newId();
      acknowledged = false;
      const batch = batches[index];
      const content = stanza.content.map(n => n === participants ? { ...n, content: batch } : n);
      remember?.(activeId);
      await sendNode({ ...stanza, attrs: { ...stanza.attrs, id: activeId, to: 'status@broadcast' }, content });
      const deadline = Date.now() + 15000;
      while (!acknowledged && !rejection && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 20));
      if (rejection) throw rejection;
      if (!acknowledged) throw new Error('WhatsApp Status acknowledgement timed out');
      if (spacingMs && index+1<batches.length) await new Promise(resolve=>setTimeout(resolve,spacingMs));
    }
  } finally { ws.off('CB:ack,class:message', onAck); }
}

export function patchWireBatches(source) {
  if (source.includes('auxplus:status-distinct-audiences:v3')) return source;
  const replacement = '/* auxplus:status-distinct-audiences:v3 */\n            if (isStatus) await (' + sendStatusWireBatches.toString() + ')(stanza, sendNode, sock.ws, () => generateMessageIDV2(meId), id => { if (messageRetryManager) messageRetryManager.addRecentMessage(destinationJid, id, message); });\n            else await sendNode(stanza);\n            ';
  let previous = source.indexOf('/* auxplus:status-single-stanza:v2 */');
  if (previous < 0) previous = source.indexOf('/* auxplus:status-wire-batches:v1 */');
  if (previous >= 0) {
    const end = source.indexOf('// Add message to retry cache', previous);
    if (end < previous) throw new Error('Unrecognized previous transport');
    return source.slice(0, previous) + replacement + source.slice(end);
  }
  const old = 'await sendNode(stanza);\n            // Add message to retry cache';
  if (source.split(old).length !== 2) throw new Error('Unrecognized Baileys source');
  return source.replace(old, replacement + '// Add message to retry cache');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const run = (code, input) => execFileSync('docker', ['exec', ...(input ? ['-i'] : []), 'clickpede-app-evolution-api-1', 'node', '-e', code], { input, encoding: 'utf8', maxBuffer: 4 * 1024 * 1024 });
  const file = '/evolution/node_modules/baileys/lib/Socket/messages-send.js';
  const source = run(`process.stdout.write(require('fs').readFileSync('${file}','utf8'))`);
  const patched = patchWireBatches(source);
  execFileSync(process.execPath, ['--check', '--input-type=module'], { input: patched });
  if (process.argv.includes('--apply') && source !== patched) {
    run(`const fs=require('fs'),p='${file}',b=p+'.auxplus-distinct-audiences-backup';if(fs.existsSync(b))throw Error('Backup exists');fs.copyFileSync(p,b);fs.writeFileSync(p,fs.readFileSync(0,'utf8'));`, patched);
  }
  console.log(JSON.stringify({ changed: source !== patched, applied: process.argv.includes('--apply'), scope: 'Status only; disjoint accounts; distinct publication IDs; acknowledgement required' }));
}
