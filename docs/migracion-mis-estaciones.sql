-- Mis estaciones: estado publicado por el dueño (oct 2026).
-- Correr UNA vez por base (staging y prod). No usa IF NOT EXISTS: si ya se
-- aplicó, SQLite responde "duplicate column" y no cambia nada.
ALTER TABLE stations ADD COLUMN status_note TEXT;
ALTER TABLE stations ADD COLUMN status_updated_at TEXT;
ALTER TABLE stations ADD COLUMN status_source TEXT;
