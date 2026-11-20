import fs from 'node:fs';
const token=fs.readFileSync('C:/Users/Premium PC/.supabase/access-token','utf8').trim();
async function sql(query){const r=await fetch('https://api.supabase.com/v1/projects/jcuehnzaonhdcjbxhadz/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query})});if(!r.ok)throw Error(`Management query ${r.status}`);return r.json();}
const secret=fs.readFileSync('.local/loan-cron.env','utf8').trim().split('=')[1];
const url='https://jcuehnzaonhdcjbxhadz.supabase.co/functions/v1/loan-reminders';
const blocked=await fetch(url,{method:'POST',body:'{}'});console.log(JSON.stringify({unauthenticated:blocked.status}));
if(blocked.status!==401)throw Error('Missing endpoint authentication');
const response=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json','x-loan-cron':secret},body:JSON.stringify({dryRun:true})});
const result=await response.json();console.log(JSON.stringify({dryRunStatus:response.status,...result}));
if(response.status!==200||!result.ok||result.sent!==0)throw Error('Live read-only verification failed');
await sql(fs.readFileSync('supabase/migrations/20261110090000_loan_reminder_cron.sql','utf8'));
console.log(JSON.stringify(await sql("select jobname,schedule,active from cron.job where jobname='auxplus-loan-reminders'")));
