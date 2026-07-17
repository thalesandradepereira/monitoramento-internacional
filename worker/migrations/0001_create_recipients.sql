-- Migration: create private recipients table for Cloudflare D1.
-- Do not store passwords, tokens, secrets, or seed recipient emails here.

CREATE TABLE IF NOT EXISTS recipients (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'unsubscribed')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  consent_source TEXT,
  unsubscribed_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_recipients_status_email
  ON recipients (status, email);

CREATE TRIGGER IF NOT EXISTS trg_recipients_updated_at
AFTER UPDATE ON recipients
FOR EACH ROW
BEGIN
  UPDATE recipients
  SET updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = OLD.id;
END;
