create table if not exists public.wa_recovery_campaigns (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  message text not null,
  status text not null default 'paused' check (status in ('paused','running','completed','cancelled')),
  interval_seconds integer not null default 120 check (interval_seconds between 60 and 3600),
  next_at timestamptz not null default now(),
  lease_until timestamptz,
  last_error text,
  created_at timestamptz not null default now()
);
create unique index if not exists wa_recovery_one_open on public.wa_recovery_campaigns(user_id) where status in ('paused','running');
create table if not exists public.wa_recovery_contacts (
  id uuid primary key default gen_random_uuid(),
  user_id text not null,
  campaign_id uuid references public.wa_recovery_campaigns(id),
  phone text not null,
  destination text not null,
  item_ref text not null,
  username text not null,
  client_name text not null default '',
  status text not null default 'queued' check (status in ('queued','sending','invited','accepted','creating','trial','activated','opted_out','skipped','failed','uncertain')),
  reason text,
  sent_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(user_id,phone)
);
alter table public.wa_recovery_campaigns enable row level security;
alter table public.wa_recovery_contacts enable row level security;
revoke all on public.wa_recovery_campaigns, public.wa_recovery_contacts from anon, authenticated;
grant all on public.wa_recovery_campaigns, public.wa_recovery_contacts to service_role;
create index if not exists wa_recovery_queue on public.wa_recovery_contacts(campaign_id,status,updated_at);
