begin;
alter table public.wa_football_status_settings add column if not exists manual_request_day date;

create table if not exists public.wa_status_delivery_locks(user_id text primary key,token uuid not null,expires_at timestamptz not null);
alter table public.wa_status_delivery_locks enable row level security;
revoke all on public.wa_status_delivery_locks from public,anon,authenticated;
grant select,insert,update,delete on public.wa_status_delivery_locks to service_role;
create or replace function public.claim_status_delivery(p_user text,p_token uuid) returns boolean
language sql security definer set search_path=public as $fn$
  with acquired as (
    insert into wa_status_delivery_locks(user_id,token,expires_at) values(p_user,p_token,now()+interval '6 minutes')
    on conflict(user_id) do update set token=excluded.token,expires_at=excluded.expires_at
    where wa_status_delivery_locks.expires_at<now() returning 1
  ) select exists(select 1 from acquired);
$fn$;
revoke all on function public.claim_status_delivery(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_status_delivery(text,uuid) to service_role;

create table if not exists public.wa_content_status_settings (
  user_id text primary key,
  enabled boolean not null default false,
  send_time text not null default '09:00' check (send_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  pages_per_kind integer not null default 1 check (pages_per_kind between 1 and 3),
  manual_request_day date,
  lease_until timestamptz,
  last_run_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
create table if not exists public.wa_content_status_posts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.wa_content_status_settings(user_id) on delete cascade,
  post_day date not null,
  kind text not null check (kind in ('movie','series')),
  page integer not null check (page between 0 and 2),
  total integer not null check (total between 1 and 3),
  payload jsonb not null,
  status text not null default 'queued' check (status in ('queued','sending','sent','provider_recorded','uncertain','failed')),
  message_id text,
  media_sha256 text,
  error text,
  attempted_at timestamptz,
  sent_at timestamptz,
  unique(user_id,post_day,kind,page)
);
create index if not exists wa_content_status_queue on public.wa_content_status_posts(user_id,post_day,status);
alter table public.wa_content_status_settings enable row level security;
alter table public.wa_content_status_posts enable row level security;
revoke all on public.wa_content_status_settings,public.wa_content_status_posts from public,anon,authenticated;
grant select,insert,update,delete on public.wa_content_status_settings,public.wa_content_status_posts to service_role;

-- Separate worker. New content automation is off for every account until explicitly enabled.
insert into public.platform_private_secrets(name,value)
values('content_status_cron',jsonb_build_object('token',gen_random_uuid()::text||gen_random_uuid()::text))
on conflict(name) do nothing;
select cron.unschedule(jobid) from cron.job where jobname='wa-content-status';
select cron.schedule('wa-content-status','* * * * *',$cron$
  select net.http_post(
    url := 'https://jcuehnzaonhdcjbxhadz.supabase.co/functions/v1/wa-content-status',
    headers := jsonb_build_object('Content-Type','application/json','x-content-cron',value->>'token'),
    body := '{"action":"tick"}'::jsonb,timeout_milliseconds := 180000
  ) from public.platform_private_secrets where name='content_status_cron';
$cron$);
commit;
