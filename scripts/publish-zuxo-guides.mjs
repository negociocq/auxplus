import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const project = 'jcuehnzaonhdcjbxhadz';
const files = ['tv-v2', 'android', 'ios', 'samsung'].map(device => `zuxo-${device}-guide.png`);
for (const file of files) if (!fs.existsSync(`public/atendimento/${file}`)) throw Error(`Missing ${file}`);
const token = fs.readFileSync(path.join(os.homedir(), '.supabase/access-token'), 'utf8').trim();
const response = await fetch(`https://api.supabase.com/v1/projects/${project}/api-keys`, { headers: { Authorization: `Bearer ${token}` } });
if (!response.ok) throw Error(`Management HTTP ${response.status}`);
const keys = await response.json();
const key = keys.find(item => item.name === 'service_role')?.api_key;
if (!key) throw Error('Service role unavailable');
const base = `https://${project}.supabase.co/storage/v1`;
const headers = { Authorization: `Bearer ${key}`, apikey: key };
let bucket = await fetch(`${base}/bucket/whatsapp-guides`, { headers });
if (bucket.status === 404 || bucket.status === 400) {
  bucket = await fetch(`${base}/bucket`, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'whatsapp-guides', name: 'whatsapp-guides', public: true, allowed_mime_types: ['image/png'], file_size_limit: 10485760 }) });
}
if (!bucket.ok) throw Error(`Bucket HTTP ${bucket.status}`);
for (const file of files) {
  const data = fs.readFileSync(`public/atendimento/${file}`);
  const upload = await fetch(`${base}/object/whatsapp-guides/atendimento/${file}`, { method: 'POST', headers: { ...headers, 'Content-Type': 'image/png', 'x-upsert': 'true', 'cache-control': '3600' }, body: data });
  if (!upload.ok) throw Error(`Upload ${file} HTTP ${upload.status}`);
  const check = await fetch(`${base}/object/public/whatsapp-guides/atendimento/${file}`);
  if (!check.ok || !check.headers.get('content-type')?.includes('image/png')) throw Error(`Public image unavailable: ${file}`);
  const actual = Buffer.from(await check.arrayBuffer());
  if (!actual.equals(data)) throw Error(`Image mismatch: ${file}`);
  console.log(`Published and verified: ${file}`);
}
