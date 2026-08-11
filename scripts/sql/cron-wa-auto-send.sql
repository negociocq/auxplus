-- ⏰ Envio automático de lembretes (WhatsApp) — agendador servidor
--
-- Publica o Edge Function `wa-auto-send` antes e rode este SQL no Supabase:
--   Database → SQL Editor → New query → colar → Run
--
-- Ele agenda o cron que chama a função a cada 5 minutos. A função é idempotente
-- (o send log de cada conta impede reenvio), então rodar com frequência é seguro.
--
-- Para parar:  select cron.unschedule('wa-auto-send');
-- Alternativa sem SQL: Dashboard → Edge Functions → wa-auto-send → Schedules.

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
