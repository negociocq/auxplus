-- Correção: atualiza itemId incorreto (1045) para o valor correto (399166346)
-- Para a conta 'tarciosocq'

-- Primeiro, verifica qual é o item com o problema
SELECT
  i.id,
  i.folder_id,
  i.item_id,
  i.phone,
  i.due_date,
  i.name,
  f.user_id,
  u.username
FROM items i
JOIN folders f ON i.folder_id = f.id
JOIN users u ON f.user_id = u.id
WHERE u.username = 'tarciosocq'
  AND (i.item_id = '1045' OR i.phone LIKE '%399166346%')
ORDER BY i.due_date DESC;

-- Depois, executa a correção:
-- UPDATE items
-- SET item_id = '399166346'
-- WHERE item_id = '1045'
--   AND folder_id IN (
--     SELECT f.id FROM folders f
--     JOIN users u ON f.user_id = u.id
--     WHERE u.username = 'tarciosocq'
--   );
