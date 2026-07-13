-- EV Guatemala Map — Cloudflare D1 schema
-- Base de datos de producción. Notion sincroniza hacia aquí (panel editorial),
-- la app lee y escribe directamente en estas tablas.

CREATE TABLE IF NOT EXISTS stations (
  id TEXT PRIMARY KEY,                 -- ej. 'gt-z1-hilton'
  name TEXT NOT NULL,
  address TEXT,
  zone TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',      -- active | maintenance | offline
  network TEXT,
  access TEXT NOT NULL DEFAULT 'public',      -- public | semi-public | private
  connectors TEXT NOT NULL DEFAULT '[]',      -- JSON: [{type, power_kw, level}]
  notes TEXT,
  source TEXT,                                -- Manual | Semilla verificada | OCM | etc
  google_maps_url TEXT,
  submitted_by TEXT,                          -- email de quien propuso la estación
  approval_status TEXT NOT NULL DEFAULT 'active', -- active | pending | rejected
  rating_avg REAL,
  rating_count INTEGER NOT NULL DEFAULT 0,
  notion_page_id TEXT,                        -- referencia al registro editorial en Notion
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stations_status ON stations(status, approval_status);
CREATE INDEX IF NOT EXISTS idx_stations_zone ON stations(zone);

CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',          -- admin | user  (ampliar aquí cuando se agreguen más roles)
  subscription_status TEXT NOT NULL DEFAULT 'free', -- free | active | expired | cancelled
  subscription_end TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES stations(id),
  author TEXT,
  user_email TEXT REFERENCES users(email),
  rating INTEGER NOT NULL,
  comment TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_station ON reviews(station_id);

CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES stations(id),
  kv_key TEXT NOT NULL,                       -- el binario sigue en KV/R2; esto es solo el índice
  uploaded_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_photos_station ON photos(station_id);
