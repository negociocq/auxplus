-- Adiciona coluna plan_history na tabela items
-- Permite persistir histórico de planos/preços sem depender de marcadores em notes
alter table items add column if not exists plan_history jsonb;
