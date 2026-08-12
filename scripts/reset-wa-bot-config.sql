-- Script para resetar configuração do WhatsApp bot para o usuário tarciocq
-- Isso vai forçar o bot a usar as novas mensagens padrão (com problema + hora no vencimento)

-- 1. Encontrar o user_id do tarciocq
SELECT id, username FROM auth.users WHERE username = 'tarciocq' LIMIT 1;

-- 2. Se encontrou, delete a config salva (substitua {USER_ID} pelo id encontrado acima)
-- DELETE FROM platform_settings
-- WHERE key = 'wa_bot_config_user_{USER_ID}';

-- 3. Verificar que foi deletado
-- SELECT key, value FROM platform_settings
-- WHERE key LIKE 'wa_bot_config_user_%' AND key = 'wa_bot_config_user_{USER_ID}';
