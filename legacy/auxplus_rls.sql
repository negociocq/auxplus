-- AuxPlus — RLS para Supabase Free (anon key)
-- Rode DEPOIS de auxplus_postgres.sql no SQL Editor.
-- Auth da app é pela tabela users (não Supabase Auth), então liberamos
-- leitura/escrita via anon/authenticated. Ajuste depois se quiser travar mais.

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE folder_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE whatsapp_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auxplus_users_all ON users;
DROP POLICY IF EXISTS auxplus_folders_all ON folders;
DROP POLICY IF EXISTS auxplus_folder_settings_all ON folder_settings;
DROP POLICY IF EXISTS auxplus_folder_messages_all ON folder_messages;
DROP POLICY IF EXISTS auxplus_items_all ON items;
DROP POLICY IF EXISTS auxplus_tickets_all ON tickets;
DROP POLICY IF EXISTS auxplus_whatsapp_messages_all ON whatsapp_messages;
DROP POLICY IF EXISTS auxplus_settings_all ON settings;

CREATE POLICY auxplus_users_all ON users FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY auxplus_folders_all ON folders FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY auxplus_folder_settings_all ON folder_settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY auxplus_folder_messages_all ON folder_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY auxplus_items_all ON items FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY auxplus_tickets_all ON tickets FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY auxplus_whatsapp_messages_all ON whatsapp_messages FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
CREATE POLICY auxplus_settings_all ON settings FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;
