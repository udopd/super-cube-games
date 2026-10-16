ALTER TABLE email_codes ADD COLUMN IF NOT EXISTS pending_password_hash TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  email TEXT PRIMARY KEY,
  token_hash TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);
