create table if not exists public.buffer_instagram_settings (
  user_id text primary key,
  api_key text,
  channel_id text,
  channel_name text,
  enabled boolean not null default false,
  stories boolean not null default true,
  feed boolean not null default true,
  send_time text not null default '07:00' check (send_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  manual_request_day date,
  lease_until timestamptz,
  lease_token uuid,
  last_error text,
  updated_at timestamptz not null default now()
);
create table if not exists public.buffer_instagram_posts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null references public.buffer_instagram_settings(user_id) on delete cascade,
  post_day date not null,
  channel_id text not null,
  kind text not null check (kind in ('feed','story')),
  batch integer not null,
  entries jsonb not null,
  assets jsonb,
  status text not null default 'queued' check (status in ('queued','submitting','accepted','uncertain','failed','cancelled')),
  buffer_id text,
  error text,
  created_at timestamptz not null default now(),
  unique(user_id,post_day,channel_id,kind,batch)
);
alter table public.buffer_instagram_settings enable row level security;
alter table public.buffer_instagram_posts enable row level security;
revoke all on public.buffer_instagram_settings, public.buffer_instagram_posts from public,anon,authenticated;
grant select,insert,update,delete on public.buffer_instagram_settings, public.buffer_instagram_posts to service_role;
create or replace function public.claim_buffer_instagram(p_user text, p_token uuid) returns boolean
language sql security definer set search_path=public as $$
  with claimed as (
    update buffer_instagram_settings set lease_until=now()+interval '180 seconds',lease_token=p_token
    where user_id=p_user and (lease_until is null or lease_until<now()) returning user_id
  ) select exists(select 1 from claimed);
$$;
revoke all on function public.claim_buffer_instagram(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_buffer_instagram(text,uuid) to service_role;
insert into storage.buckets(id,name,public,allowed_mime_types,file_size_limit)
values('instagram-banners','instagram-banners',true,array['image/png'],8388608) on conflict(id) do nothing;
insert into public.platform_private_secrets(name,value)
values('buffer_instagram_cron',jsonb_build_object('token',gen_random_uuid()::text||gen_random_uuid()::text)) on conflict(name) do nothing;
select cron.unschedule(jobid) from cron.job where jobname='buffer-instagram';
select cron.schedule('buffer-instagram','* * * * *',$cron$
  select net.http_post(
    url:='https://jcuehnzaonhdcjbxhadz.supabase.co/functions/v1/buffer-instagram',
    headers:=jsonb_build_object('Content-Type','application/json','x-buffer-cron',value->>'token'),
    body:='{"action":"tick"}'::jsonb,timeout_milliseconds:=150000
  ) from public.platform_private_secrets where name='buffer_instagram_cron';
$cron$);
