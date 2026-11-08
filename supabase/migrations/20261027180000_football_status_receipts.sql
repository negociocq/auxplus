-- Distinguish a provider's PENDING record from an acknowledgement by WhatsApp.
alter table public.wa_football_status_posts drop constraint if exists wa_football_status_posts_status_check;
alter table public.wa_football_status_posts add constraint wa_football_status_posts_status_check
  check (status in ('queued','sending','provider_recorded','sent','uncertain','failed'));
