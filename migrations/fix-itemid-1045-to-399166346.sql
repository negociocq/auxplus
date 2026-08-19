-- Migration: Corrige itemId de 1045 para 399166346 (Alef Ragah)
-- Data: 2026-08-19
-- Motivo: Reminders estavam vindo com usuário errado (1045 em vez de 399166346)

UPDATE items
SET item_id = '399166346'
WHERE item_id = '1045'
  AND folder_id IN (
    SELECT f.id
    FROM folders f
    JOIN users u ON f.user_id = u.id
    WHERE u.username = 'tarciosocq'
  );

-- Verificação pós-atualização
SELECT
  i.id,
  i.folder_id,
  i.item_id,
  i.name,
  i.phone,
  i.due_date
FROM items i
JOIN folders f ON i.folder_id = f.id
JOIN users u ON f.user_id = u.id
WHERE u.username = 'tarciosocq'
  AND i.item_id = '399166346'
ORDER BY i.due_date DESC;
