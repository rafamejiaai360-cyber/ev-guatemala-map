-- Migración: verificación de identidad + aceptación del aviso (oct 2026).
-- Pegar en Cloudflare → D1 → ev-guatemala-db-staging → Console. Luego en ev-guatemala-db al publicar,
-- ANTES de desplegar el código (sin las columnas nuevas fallan el registro y las solicitudes de uso).
-- Los ALTER TABLE NO se pueden re-correr (darían "duplicate column"); los CREATE sí.
ALTER TABLE users ADD COLUMN identity_status TEXT NOT NULL DEFAULT 'none';
ALTER TABLE users ADD COLUMN identity_plate TEXT;
ALTER TABLE users ADD COLUMN identity_verified_at TEXT;
ALTER TABLE users ADD COLUMN identity_note TEXT;
ALTER TABLE station_requests ADD COLUMN requester_email TEXT;
ALTER TABLE station_requests ADD COLUMN plate TEXT;
CREATE TABLE IF NOT EXISTS identity_submissions (
  id TEXT PRIMARY KEY,
  user_email TEXT NOT NULL REFERENCES users(email),
  plate TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  files_status TEXT NOT NULL DEFAULT 'stored',
  expires_at TEXT NOT NULL,
  warned_at TEXT,
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  files_deleted_at TEXT,
  files_deleted_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_identity_user ON identity_submissions(user_email, created_at);
CREATE INDEX IF NOT EXISTS idx_identity_files ON identity_submissions(files_status, expires_at);
CREATE TABLE IF NOT EXISTS terms_acceptances (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_email TEXT NOT NULL,
  context TEXT NOT NULL,
  ref TEXT,
  version TEXT NOT NULL,
  accepted_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_terms_user ON terms_acceptances(user_email, accepted_at);
