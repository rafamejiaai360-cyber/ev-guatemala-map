-- Migración: catálogo y propuestas de vehículos (oct 2026). Seguro de re-correr (IF NOT EXISTS).
-- Pegar en Cloudflare → D1 → ev-guatemala-db-staging → Console. Luego en ev-guatemala-db al publicar.
CREATE TABLE IF NOT EXISTS vehicles (
  id TEXT PRIMARY KEY,
  brand TEXT NOT NULL,
  model TEXT NOT NULL,
  year TEXT NOT NULL,
  range_km INTEGER NOT NULL,
  battery_kwh REAL,
  connectors TEXT,
  adapter_note TEXT,
  photo_key TEXT,
  verified INTEGER NOT NULL DEFAULT 0,
  source TEXT,
  status TEXT NOT NULL DEFAULT 'visible',
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS vehicle_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id TEXT,
  data TEXT NOT NULL,
  source TEXT,
  submitted_by TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  reviewed_by TEXT,
  reviewed_at TEXT,
  review_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_vehicle_proposals_status ON vehicle_proposals(status, created_at);
CREATE INDEX IF NOT EXISTS idx_vehicle_proposals_user ON vehicle_proposals(submitted_by, created_at);
