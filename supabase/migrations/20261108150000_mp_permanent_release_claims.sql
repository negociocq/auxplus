-- A payment claim is a durable financial execution record, never a short lease.
-- Also protects browsers still running the old two-minute-lease implementation.
create or replace function public.protect_mp_release_claim()
returns trigger language plpgsql set search_path = public as $$
begin
  if old.key like 'mp_claim_%' or old.key like 'mp_payment_claim_%' then
    if tg_op = 'DELETE' then return null; end if;
    return old;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists protect_mp_release_claim on public.platform_settings;
create trigger protect_mp_release_claim before update or delete on public.platform_settings
for each row execute function public.protect_mp_release_claim();

-- Preserve evidence of every previously fulfilled order, including the incident.
with bags as (
  select key, case when jsonb_typeof(value) = 'string' then (value #>> '{}')::jsonb else value end bag
  from public.platform_settings where key like 'mp_orders_user_%'
), fulfilled as (
  select key, o from bags cross join lateral jsonb_array_elements(coalesce(bag->'orders','[]'::jsonb)) o
  where o->>'status' = 'released' or nullif(o->>'releasedAt','') is not null
)
insert into public.platform_settings(key,value,updated_at)
select 'mp_claim_' || (o->>'id'), jsonb_build_object('at',extract(epoch from now())*1000,'claimer','historical_fulfilled','paymentId',o->>'mpPaymentId'), now()
from fulfilled where nullif(o->>'id','') is not null
on conflict(key) do nothing;

with bags as (
  select key, case when jsonb_typeof(value) = 'string' then (value #>> '{}')::jsonb else value end bag
  from public.platform_settings where key like 'mp_orders_user_%'
)
insert into public.platform_settings(key,value,updated_at)
select distinct on (key,o->>'mpPaymentId')
  'mp_payment_claim_' || substring(key from length('mp_orders_user_')+1) || '_' || (o->>'mpPaymentId'),
  jsonb_build_object('at',extract(epoch from now())*1000,'claimer','historical_fulfilled','paymentId',o->>'mpPaymentId'), now()
from bags cross join lateral jsonb_array_elements(coalesce(bag->'orders','[]'::jsonb)) o
where (o->>'status'='released' or nullif(o->>'releasedAt','') is not null)
  and nullif(o->>'mpPaymentId','') is not null
on conflict(key) do nothing;

-- A stale browser may overwrite an order list, but cannot erase completion.
create or replace function public.preserve_mp_order_completion()
returns trigger language plpgsql set search_path = public as $$
declare old_bag jsonb; new_bag jsonb; completed jsonb; merged jsonb;
begin
  if new.key not like 'mp_orders_user_%' then return new; end if;
  old_bag := case when jsonb_typeof(old.value)='string' then (old.value#>>'{}')::jsonb else old.value end;
  new_bag := case when jsonb_typeof(new.value)='string' then (new.value#>>'{}')::jsonb else new.value end;
  for completed in select o from jsonb_array_elements(coalesce(old_bag->'orders','[]'::jsonb)) o
    where o->>'status'='released' or nullif(o->>'releasedAt','') is not null
  loop
    select coalesce(jsonb_agg(o),'[]'::jsonb) into merged
    from jsonb_array_elements(coalesce(new_bag->'orders','[]'::jsonb)) o
    where o->>'id' is distinct from completed->>'id'
      and (nullif(completed->>'mpPaymentId','') is null or o->>'mpPaymentId' is distinct from completed->>'mpPaymentId');
    new_bag := jsonb_set(new_bag,'{orders}',merged || jsonb_build_array(completed));
  end loop;
  new.value := new_bag;
  return new;
end $$;
drop trigger if exists preserve_mp_order_completion on public.platform_settings;
create trigger preserve_mp_order_completion before update on public.platform_settings
for each row execute function public.preserve_mp_order_completion();
