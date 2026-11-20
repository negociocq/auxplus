import fs from 'node:fs';
const token=fs.readFileSync('C:/Users/Premium PC/.supabase/access-token','utf8').trim();
async function sql(query){const r=await fetch('https://api.supabase.com/v1/projects/jcuehnzaonhdcjbxhadz/database/query',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({query})});if(!r.ok){const j=await r.json();throw Error(JSON.stringify(j));}return r.json();}
await sql(fs.readFileSync('supabase/migrations/20261110093000_durable_whatsapp_trial_history.sql','utf8'));
await sql(`begin;
do $$ declare first_claim uuid; second_claim uuid; begin
 first_claim:=public.claim_wa_trial('__codex_trial_verify__','5511990000000');
 if first_claim is null then raise exception 'first claim failed'; end if;
 second_claim:=public.claim_wa_trial('__codex_trial_verify__','5511990000000');
 if second_claim is not null then raise exception 'duplicate claim allowed'; end if;
 perform public.release_wa_trial('__codex_trial_verify__','5511990000000');
 second_claim:=public.claim_wa_trial('__codex_trial_verify__','5511990000000');
 if second_claim is null or second_claim=first_claim then raise exception 'one-use release failed'; end if;
 if public.claim_wa_trial('__codex_trial_verify__','5511990000000') is not null then raise exception 'release replay allowed'; end if;
 if has_function_privilege('anon','public.release_wa_trial(text,text)','EXECUTE') then raise exception 'anonymous release allowed'; end if;
end $$; rollback;`);
console.log('PASS: actual database claim, duplicate block, one-use release and denied anonymous release. Synthetic rows rolled back.');
console.log(JSON.stringify(await sql("select count(*)::int as preserved_trials,count(*) filter(where user_id='1' and username='354125060' and not allow_retest)::int as saulo_blocked from wa_trial_history")));
