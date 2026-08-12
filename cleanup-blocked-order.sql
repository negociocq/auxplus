-- Execute isto no Supabase SQL Editor para BLOQUEAR o pedido permanentemente

UPDATE platform_settings
SET value = jsonb_set(
  value::jsonb,
  '{orders}',
  (
    SELECT jsonb_agg(
      CASE
        WHEN order->>'panelUsername' = '343924041' OR order->>'error' LIKE '%não encontrado%'
        THEN order || jsonb_build_object(
          'blocked', true,
          'blockedAt', NOW()::text,
          'error', 'BLOQUEADO_PERMANENTEMENTE'
        )
        ELSE order
      END
    )
    FROM jsonb_array_elements(value::jsonb->'orders') AS order
  )
)::text
WHERE key LIKE 'mp_orders_user_%'
  AND (
    value::jsonb->'orders' @> '[{"panelUsername":"343924041"}]'::jsonb
    OR value::jsonb->'orders' @> '[{"error":"não encontrado"}]'::jsonb
  );

-- Verificar se bloqueou
SELECT key, value FROM platform_settings
WHERE key LIKE 'mp_orders_user_%'
ORDER BY key DESC
LIMIT 1;
