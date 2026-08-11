-- ⏰ Envio automático de lembretes WhatsApp — agendador no servidor.
--
-- Chama o Edge Function `wa-auto-send` a cada 5 minutos via pg_cron + pg_net.
-- A função é idempotente (send log por conta impede reenvio), então rodar
-- com frequência é seguro. Para parar:
--   select cron.unschedule('wa-auto-send');

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Remove agendamento anterior com o mesmo nome (idempotente)
select cron.unschedule(jobid)
  from cron.job
 where jobname = 'wa-auto-send';

-- Agenda a cada 5 minutos
select cron.schedule(
  'wa-auto-send',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://jcuehnzaonhdcjbxhadz.supabase.co/functions/v1/wa-auto-send',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'
  ) as request_id;
  $$
);
