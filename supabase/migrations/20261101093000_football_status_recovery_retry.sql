alter table public.wa_football_status_posts
  add column if not exists recovery_attempts integer not null default 0
  check (recovery_attempts between 0 and 1);
