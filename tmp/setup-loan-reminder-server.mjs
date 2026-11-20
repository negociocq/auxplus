import fs from 'node:fs';
import crypto from 'node:crypto';
const token=fs.readFileSync('C:/Users/Premium PC/.supabase/access-token','utf8').trim();
const root='https://api.supabase.com/v1/projects/jcuehnzaonhdcjbxhadz';
async function sql(query){const r=await fetch(`${root}/database/query`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query})});if(!r.ok)throw Error(`Management query ${r.status}`);return r.json();}
const info=await sql("select exists(select 1 from pg_extension where extname='pg_cron') as cron, exists(select 1 from pg_extension where extname='pg_net') as network, exists(select 1 from pg_extension where extname='supabase_vault') as vault");
console.log(JSON.stringify(info));
if(!info[0]?.cron||!info[0]?.network||!info[0]?.vault)throw Error('Required scheduler infrastructure unavailable');
let rows=await sql("select decrypted_secret from vault.decrypted_secrets where name='auxplus_loan_cron_secret' limit 1");
let secret=rows[0]?.decrypted_secret;
if(!secret){secret=crypto.randomBytes(32).toString('hex');await sql(`select vault.create_secret('${secret}', 'auxplus_loan_cron_secret', 'Authenticated loan reminder scheduler') is not null as created`);}
fs.writeFileSync('.local/loan-cron.env',`AUXPLUS_LOAN_CRON_SECRET=${secret}\n`);
const r=await fetch(`${root}/secrets`,{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify([{name:'AUXPLUS_LOAN_CRON_SECRET',value:secret}])});
if(!r.ok)throw Error(`Secret configuration ${r.status}`);
console.log('Cron secret configured; value not displayed.');
