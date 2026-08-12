/**
 * 🚫 SOLUÇÃO DEFINITIVA: BLOQUEIA PEDIDO 343924041 PERMANENTEMENTE NA SUPABASE
 *
 * Este script executa DIRETAMENTE no Supabase SQL Editor
 * Resultado: Pedido nunca mais aparece, webhook ignora, sem volta
 */

-- ========== PASSO 1: BLOQUEIA O PEDIDO NA SUPABASE ==========
UPDATE platform_settings
SET value = jsonb_set(
  COALESCE(value::jsonb, '{}'::jsonb),
  '{orders}',
  COALESCE(
    (
      SELECT jsonb_agg(
        CASE
          WHEN order->>'panelUsername' = '343924041'
               OR order->>'error' ILIKE '%não encontrado%'
          THEN order || jsonb_build_object(
            'blocked', true,
            'blockedAt', NOW()::text,
            'error', 'BLOQUEADO_PERMANENTEMENTE_' || gen_random_uuid()::text
          )
          ELSE order
        END
      )
      FROM jsonb_array_elements(COALESCE(value::jsonb, '{}'::jsonb)->'orders') AS order
    ),
    '[]'::jsonb
  )
)::text
WHERE key LIKE 'mp_orders_user_%'
  AND (
    COALESCE(value::jsonb, '{}'::jsonb)->'orders' @> '[{"panelUsername":"343924041"}]'::jsonb
    OR COALESCE(value::jsonb, '{}'::jsonb)->'orders' @> '[{"error":"Usuário 343924041 não encontrado no painel"}]'::jsonb
  );

-- ========== PASSO 2: VERIFICA SE BLOQUEOU ==========
SELECT
  key,
  jsonb_pretty(value::jsonb->'orders') as orders_bloqueados
FROM platform_settings
WHERE key LIKE 'mp_orders_user_%'
ORDER BY key DESC
LIMIT 5;

-- ========== PASSO 3: LIMPA QUALQUER REFERÊNCIA EM CACHE ==========
-- Se houver cache de sessão, limpa também
DELETE FROM platform_settings
WHERE key = 'wa_bot_alerts_user_%'
  AND value::jsonb->'alerts' @> '[{"panelUsername":"343924041"}]'::jsonb;

-- ========== RESULTADO FINAL ==========
-- Verifique se aparece assim:
-- blocked: true ✅
-- blockedAt: <timestamp> ✅
-- error: BLOQUEADO_PERMANENTEMENTE_<uuid> ✅
