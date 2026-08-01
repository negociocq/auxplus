-- Conta UniPlay por usuário (usa platform_settings já existente).
-- Chave: automations_user_<userId>
-- Se a tabela já existe (migrate-platform-settings.sql), não precisa rodar nada.
-- Este arquivo só garante a tabela/policy caso ainda não tenha sido criada.

CREATE TABLE IF NOT EXISTS platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE platform_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS auxplus_platform_settings_all ON platform_settings;
CREATE POLICY auxplus_platform_settings_all
  ON platform_settings
  FOR ALL
  TO anon, authenticated
  USING (true)
  WITH CHECK (true);
