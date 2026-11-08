-- The customer-facing caption no longer carries internal page/date identifiers.
-- Correlate lost HTTP replies using the image's actual SHA-256 instead.
alter table public.wa_football_status_posts add column if not exists media_sha256 text
  check (media_sha256 is null or media_sha256 ~ '^[a-f0-9]{64}$');
