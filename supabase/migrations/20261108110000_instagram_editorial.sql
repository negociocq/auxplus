alter table public.buffer_instagram_settings
  add column if not exists editorial_enabled boolean not null default false,
  add column if not exists editorial_times jsonb not null default '["12:00","16:00"]'::jsonb,
  add column if not exists editorial_request_day date,
  add column if not exists editorial_request_slot text;
alter table public.buffer_instagram_posts add column if not exists topic text not null default 'games' check(topic in ('games','editorial'));
alter table public.buffer_instagram_posts add column if not exists edition text not null default 'daily';
do $$ declare constraint_name text; begin
  for constraint_name in select conname from pg_constraint where conrelid='public.buffer_instagram_posts'::regclass and contype='u' loop
    execute format('alter table public.buffer_instagram_posts drop constraint %I',constraint_name);
  end loop;
end $$;
create unique index if not exists buffer_instagram_posts_topic_unique on public.buffer_instagram_posts(user_id,post_day,channel_id,topic,edition,kind,batch);
create table if not exists public.instagram_editorial_plans (
  user_id text not null references public.buffer_instagram_settings(user_id) on delete cascade,
  post_day date not null,
  channel_id text not null,
  slot text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,post_day,channel_id,slot)
);
alter table public.instagram_editorial_plans enable row level security;
revoke all on public.instagram_editorial_plans from public,anon,authenticated;
grant select,insert,update,delete on public.instagram_editorial_plans to service_role;
