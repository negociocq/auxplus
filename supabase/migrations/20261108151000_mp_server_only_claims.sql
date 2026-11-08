create or replace function public.protect_mp_release_claim()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    if (new.key like 'mp_claim_%' or new.key like 'mp_payment_claim_%')
      and current_user not in ('postgres','service_role','supabase_admin') then
      raise exception 'Financial fulfillment is server-only' using errcode='42501';
    end if;
    return new;
  end if;
  if old.key like 'mp_claim_%' or old.key like 'mp_payment_claim_%' then
    if tg_op = 'DELETE' then return null; end if;
    return old;
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end $$;
drop trigger if exists protect_mp_release_claim on public.platform_settings;
create trigger protect_mp_release_claim before insert or update or delete on public.platform_settings
for each row execute function public.protect_mp_release_claim();

