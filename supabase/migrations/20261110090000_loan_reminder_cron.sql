-- The matching Edge secret is provisioned privately; no credential is embedded in cron.
-- One named job; rerunning this migration updates its schedule instead of duplicating it.
select cron.schedule(
  'auxplus-loan-reminders',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://jcuehnzaonhdcjbxhadz.supabase.co/functions/v1/loan-reminders',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-loan-cron', (select decrypted_secret from vault.decrypted_secrets where name = 'auxplus_loan_cron_secret' limit 1)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 120000
    );
  $job$
);
