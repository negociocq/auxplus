-- Foto de perfil do usuário
ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT;
