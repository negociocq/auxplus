import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const token = fs.readFileSync(path.join(os.homedir(), '.supabase/access-token'), 'utf8').trim();
const query = async sql => {
  const r = await fetch('https://api.supabase.com/v1/projects/jcuehnzaonhdcjbxhadz/database/query', {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: sql }),
  });
  if (!r.ok) throw Error(`Database HTTP ${r.status}`);
  return r.json();
};
const posts = await query(`select id,region,page,media_sha256 from wa_football_status_posts where user_id='1' and post_day=(now() at time zone 'America/Sao_Paulo')::date and status='uncertain'`);
const code = `const {PrismaClient}=require('@prisma/client');const fs=require('fs');const p=new PrismaClient();(async()=>{
 const posts=JSON.parse(fs.readFileSync(0,'utf8'));
 const instance=await p.instance.findUnique({where:{name:'auxplus-tarciocq1'},select:{id:true}});
 const records=await p.message.findMany({where:{instanceId:instance.id,key:{path:['remoteJid'],equals:'status@broadcast'},messageTimestamp:{gte:Math.floor(Date.now()/1000)-86400}},select:{key:true,message:true,status:true,messageTimestamp:true}});
 const hash=v=>{try{return typeof v==='string'?Buffer.from(v,'base64').toString('hex'):Buffer.from(v?.data||v||[]).toString('hex')}catch{return ''}};
 console.log(JSON.stringify(posts.map(post=>{const m=records.find(r=>r.key.fromMe&&hash(r.message?.imageMessage?.fileSha256)===post.media_sha256);return {...post,record:m?{id:m.key.id,status:m.status,at:new Date(m.messageTimestamp*1000).toISOString()}:null}})));
 await p.$disconnect();})().catch(()=>{console.error('Provider history lookup failed');process.exitCode=1});`;
const checked = JSON.parse(execFileSync('docker', ['exec', '-i', 'clickpede-app-evolution-api-1', 'node', '-e', code], { input: JSON.stringify(posts), encoding: 'utf8' }));
for (const post of checked) console.log(JSON.stringify({ region: post.region, page: post.page + 1, foundInHistory: !!post.record, status: post.record?.status }));
if (process.argv.includes('--apply')) {
  for (const post of checked) {
    if (!/^[a-f0-9-]{36}$/.test(post.id)) throw Error('Invalid job ID');
    if (post.record) continue; // Existing provider records must be reconciled, never resent.
    const result = await query(`update wa_football_status_posts set status='queued',error='Recuperação solicitada após reconectar: imagem ausente no histórico local do WhatsApp.' where id='${post.id}' and user_id='1' and status='uncertain' and post_day=(now() at time zone 'America/Sao_Paulo')::date returning region,page`);
    console.log(JSON.stringify({ requeued: result }));
  }
}
