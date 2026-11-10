create table if not exists public.wa_trial_history (
  user_id text not null,
  phone text not null,
  first_used_at timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  username text,
  client_name text,
  remote_id text,
  allow_retest boolean not null default false,
  reservation_id uuid,
  status text not null default 'consumed',
  primary key (user_id, phone)
);
alter table public.wa_trial_history enable row level security;
revoke all on public.wa_trial_history from anon, authenticated;
grant all on public.wa_trial_history to service_role;

create or replace function public.claim_wa_trial(p_user_id text, p_phone text)
returns uuid language plpgsql security definer set search_path = public as $$
declare reservation uuid;
begin
  insert into wa_trial_history as history (user_id,phone,reservation_id,status)
  values (p_user_id,p_phone,gen_random_uuid(),'reserved')
  on conflict (user_id,phone) do update
    set allow_retest=false,reservation_id=gen_random_uuid(),last_used_at=now(),status='reserved'
    where history.allow_retest
  returning reservation_id into reservation;
  return reservation;
end; $$;
create or replace function public.release_wa_trial(p_user_id text, p_phone text)
returns void language sql security definer set search_path = public as $$
  insert into wa_trial_history (user_id,phone,allow_retest,status)
  values (p_user_id,p_phone,true,'released')
  on conflict (user_id,phone) do update set allow_retest=true,status='released';
$$;
revoke all on function public.claim_wa_trial(text,text) from public, anon, authenticated;
revoke all on function public.release_wa_trial(text,text) from public, anon, authenticated;
grant execute on function public.claim_wa_trial(text,text) to service_role;
grant execute on function public.release_wa_trial(text,text) to service_role;

-- Preserve existing trial usage independently from sessions, panel deletions and browser state.
with history as (
  select replace(b.key,'wa_bot_state_user_','') as owner,
    regexp_replace(s.key,'[^0-9]','','g') as digits,s.value as info
  from platform_settings b
  cross join lateral jsonb_each(case when jsonb_typeof(b.value::jsonb->'testConsumed')='object' then b.value::jsonb->'testConsumed' else '{}'::jsonb end) s
  where b.key like 'wa_bot_state_user_%'
), normalized as (
  select owner,case
    when length(digits)=12 and left(digits,2)='55' then left(digits,4)||'9'||substr(digits,5)
    when length(digits)=11 then '55'||digits
    when length(digits)=10 then '55'||left(digits,2)||'9'||substr(digits,3)
    else digits end as phone,info
  from history
)
insert into public.wa_trial_history(user_id,phone,first_used_at,last_used_at,username,client_name,remote_id,status)
select owner,phone,coalesce(nullif(info->>'at','')::timestamptz,now()),coalesce(nullif(info->>'at','')::timestamptz,now()),info->>'username',info->>'name',info->>'remoteId','consumed'
from normalized where length(phone)>=10
on conflict (user_id,phone) do nothing;
