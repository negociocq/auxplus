-- Credentials are only accessible to server-side Edge Functions.
create table if not exists public.platform_private_secrets (
  name text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);
alter table public.platform_private_secrets enable row level security;
revoke all on table public.platform_private_secrets from public, anon, authenticated;
grant select, insert, update, delete on table public.platform_private_secrets to service_role;
