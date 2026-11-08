-- Private per-account settings and durable, unique publication attempts.
create table if not exists public.wa_football_status_settings (
  user_id text primary key,
  enabled boolean not null default false,
  send_time text not null default '09:00' check (send_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  lease_until timestamptz,
  last_run_at timestamptz,
  last_error text,
  updated_at timestamptz not null default now()
);
create table if not exists public.wa_football_status_posts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.wa_football_status_settings(user_id) on delete cascade,
  post_day date not null,
  banner_day date not null,
  region text not null check (region in ('national','international')),
  page integer not null check (page between 0 and 9),
  total integer not null check (total between 1 and 10),
  status text not null default 'queued' check (status in ('queued','sending','sent','uncertain','failed')),
  message_id text,
  error text,
  attempted_at timestamptz,
  sent_at timestamptz,
  unique (user_id, post_day, banner_day, region, page)
);
create index if not exists wa_football_status_queue on public.wa_football_status_posts(user_id, post_day, status);
alter table public.wa_football_status_settings enable row level security;
alter table public.wa_football_status_posts enable row level security;
revoke all on public.wa_football_status_settings, public.wa_football_status_posts from public, anon, authenticated;
grant select, insert, update, delete on public.wa_football_status_settings, public.wa_football_status_posts to service_role;
-- Dedicated cron, authenticated by a private random token; no account is enabled here.
insert into public.platform_private_secrets(name,value)
values ('football_status_cron',jsonb_build_object('token',gen_random_uuid()::text||gen_random_uuid()::text))
on conflict (name) do nothing;
create extension if not exists pg_cron;
create extension if not exists pg_net;
select cron.unschedule(jobid) from cron.job where jobname='wa-football-status';
select cron.schedule('wa-football-status','*/5 * * * *', $cron$
  select net.http_post(
    url := 'https://jcuehnzaonhdcjbxhadz.supabase.co/functions/v1/wa-football-status',
    headers := jsonb_build_object('Content-Type','application/json','x-football-cron',value->>'token'),
    body := '{"action":"tick"}'::jsonb,
    timeout_milliseconds := 180000
  ) from public.platform_private_secrets where name='football_status_cron';
$cron$);
