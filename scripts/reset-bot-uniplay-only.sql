-- Deletar APENAS a config do bot de atendimento UniPlay (tarciocq)
-- Mantém os lembretes automáticos intactos

DELETE FROM platform_settings
WHERE key = 'wa_bot_config_user_1';

-- Verificar que foi deletado
SELECT key, value FROM platform_settings
WHERE key LIKE 'wa_%' AND key LIKE '%user_1%'
LIMIT 10;
