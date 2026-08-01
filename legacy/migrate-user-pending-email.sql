-- E-mail aguardando clique no link de confirmação (só vira `email` após confirmar)
ALTER TABLE users ADD COLUMN IF NOT EXISTS pending_email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS users_pending_email_unique
  ON users (lower(pending_email))
  WHERE pending_email IS NOT NULL AND length(trim(pending_email)) > 0;
