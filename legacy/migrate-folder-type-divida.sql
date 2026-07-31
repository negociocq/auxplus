-- Adiciona tipo Dívida (rode em 2 passos se o ADD e o UPDATE forem na mesma tx)
-- 1) ALTER TYPE ... ADD VALUE
-- 2) UPDATE folders (nova transação)

ALTER TYPE folder_type ADD VALUE IF NOT EXISTS 'Dívida';

-- Em seguida (commit separado se necessário):
-- UPDATE folders SET type = 'Dívida'
-- WHERE name ~* '^d[ií]vidas?$' AND type::text IS DISTINCT FROM 'Dívida';
