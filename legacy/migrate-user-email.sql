-- E-mail do usuário (também usado no login)
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;

-- Um e-mail por conta (permite vários NULL)
CREATE UNIQUE INDEX IF NOT EXISTS users_email_unique
  ON users (lower(email))
  WHERE email IS NOT NULL AND length(trim(email)) > 0;
