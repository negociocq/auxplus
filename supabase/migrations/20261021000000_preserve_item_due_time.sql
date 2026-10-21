-- A data continua compatível; o horário real fica separado para não perder precisão.
ALTER TABLE public.items ADD COLUMN IF NOT EXISTS due_time time without time zone;
