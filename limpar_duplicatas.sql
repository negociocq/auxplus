-- ============================================================================
-- SCRIPT DE LIMPEZA DE DUPLICATAS NO BANCO SUPABASE
-- Execute este script no painel: Settings → SQL Editor
-- Projeto: gankvvanazlkniciracw (auxplus)
-- ============================================================================

-- 1. Limpar pastas duplicadas (manter 1 de cada id)
DELETE FROM folders
WHERE ctid NOT IN (
  SELECT min(ctid) FROM folders GROUP BY id
);

-- 2. Limpar itens duplicados (manter 1 de cada id)
DELETE FROM items
WHERE ctid NOT IN (
  SELECT min(ctid) FROM items GROUP BY id
);

-- 3. Limpar folder_settings duplicados (manter 1 de cada folder_id)
DELETE FROM folder_settings
WHERE ctid NOT IN (
  SELECT min(ctid) FROM folder_settings GROUP BY folder_id
);

-- 4. Limpar folder_messages duplicados (manter 1 de cada id)
DELETE FROM folder_messages
WHERE ctid NOT IN (
  SELECT min(ctid) FROM folder_messages GROUP BY id
);

-- 5. Limpar whatsapp_messages duplicados (manter 1 de cada id)
DELETE FROM whatsapp_messages
WHERE ctid NOT IN (
  SELECT min(ctid) FROM whatsapp_messages GROUP BY id
);

-- 6. Limpar tickets duplicados (manter 1 de cada id)
DELETE FROM tickets
WHERE ctid NOT IN (
  SELECT min(ctid) FROM tickets GROUP BY id
);

-- 7. Limpar usuários duplicados (manter 1 de cada id)
DELETE FROM users
WHERE ctid NOT IN (
  SELECT min(ctid) FROM users GROUP BY id
);

-- ============================================================================
-- Após executar, recarregue a página do auxplus (Ctrl+F5 ou modo anônimo)
-- para limpar o cache do service worker.
-- ============================================================================
