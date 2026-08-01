-- tarciocq vira admin; remove a conta "admin"
UPDATE users SET is_admin = TRUE WHERE lower(username) = 'tarciocq';

-- Limpa dados ligados ao usuário admin (id típico 9; também por username)
DELETE FROM tickets
WHERE user_id IN (SELECT id FROM users WHERE lower(username) = 'admin');

DELETE FROM whatsapp_messages
WHERE user_id IN (SELECT id FROM users WHERE lower(username) = 'admin');

DELETE FROM items
WHERE folder_id IN (
  SELECT id FROM folders
  WHERE user_id IN (SELECT id FROM users WHERE lower(username) = 'admin')
);

DELETE FROM folder_settings
WHERE folder_id IN (
  SELECT id FROM folders
  WHERE user_id IN (SELECT id FROM users WHERE lower(username) = 'admin')
);

DELETE FROM folder_messages
WHERE folder_id IN (
  SELECT id FROM folders
  WHERE user_id IN (SELECT id FROM users WHERE lower(username) = 'admin')
);

DELETE FROM folders
WHERE user_id IN (SELECT id FROM users WHERE lower(username) = 'admin');

DELETE FROM users WHERE lower(username) = 'admin';
