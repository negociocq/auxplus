-- Deletar configuração do bot de atendimento UniPlay para tarciocq
DELETE FROM platform_settings 
WHERE key = 'wa_bot_config_user_1';

-- Confirmar deleção
SELECT 'Bot config deletado com sucesso!' as status;
