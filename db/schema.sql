-- EV Guatemala Map — Cloudflare D1 schema
-- Base de datos de producción. Fuente de verdad para estaciones, usuarios,
-- reseñas y fotos. Notion es espejo editorial (sincroniza DESDE aquí).
-- Especificación completa y reglas de integridad: docs/plan-migracion-d1.md

-- ============================================================
-- ESTACIONES
-- ============================================================
CREATE TABLE IF NOT EXISTS stations (
  id TEXT PRIMARY KEY,                 -- ej. 'gt-z1-hilton'
  type TEXT NOT NULL DEFAULT 'public', -- public | residential (pin verde | pin azul, futuro)
  name TEXT NOT NULL,
  address TEXT,
  zone TEXT,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',       -- active | maintenance | offline | closed
  network TEXT,
  access TEXT NOT NULL DEFAULT 'public',       -- public | semi-public | private
  connectors TEXT NOT NULL DEFAULT '[]',       -- JSON: [{type, power_kw, level}]
  notes TEXT,
  source TEXT,                                 -- Manual | Semilla verificada | OCM | etc
  google_maps_url TEXT,
  owner_email TEXT REFERENCES users(email),    -- dueño (residenciales, futuro)
  submitted_by TEXT,                           -- email de quien propuso la estación
  approval_status TEXT NOT NULL DEFAULT 'active',  -- active | pending | rejected
  -- ---- Campos DERIVADOS del historial (caché; los recalcula el Worker) ----
  verification_status TEXT NOT NULL DEFAULT 'pending', -- pending | verified | stale | flagged
  last_confirmed_at TEXT,                      -- última confirmación "funciona" de un usuario
  confirm_count INTEGER NOT NULL DEFAULT 0,    -- confirmaciones positivas acumuladas
  open_reports INTEGER NOT NULL DEFAULT 0,     -- reportes de problema sin resolver
  rating_avg REAL,
  rating_count INTEGER NOT NULL DEFAULT 0,
  -- --------------------------------------------------------------------
  notion_page_id TEXT,                         -- referencia al espejo editorial en Notion
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_stations_status ON stations(status, approval_status);
CREATE INDEX IF NOT EXISTS idx_stations_zone ON stations(zone);
CREATE INDEX IF NOT EXISTS idx_stations_type ON stations(type);

-- ============================================================
-- HISTORIAL DE EVENTOS — el "libro de actas". INMUTABLE:
-- solo se insertan filas; jamás UPDATE ni DELETE sobre esta tabla.
-- ============================================================
CREATE TABLE IF NOT EXISTS station_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL,            -- sin FK estricta: el evento sobrevive aunque la estación se archive
  event_type TEXT NOT NULL,
    -- created | updated | confirmed_ok | reported_issue | reported_closed
    -- report_resolved | proposal_submitted | proposal_approved
    -- proposal_rejected | status_changed | archived | restored
  actor_email TEXT,                    -- quién lo hizo (NULL = sistema)
  actor_role TEXT,                     -- user | admin | system (rol AL MOMENTO del evento)
  payload TEXT NOT NULL DEFAULT '{}',  -- JSON con el detalle del evento
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_events_station ON station_events(station_id, created_at);
CREATE INDEX IF NOT EXISTS idx_events_actor ON station_events(actor_email);
CREATE INDEX IF NOT EXISTS idx_events_type ON station_events(event_type, created_at);

-- ============================================================
-- PROPUESTAS DE CORRECCIÓN — cola de moderación.
-- Las ediciones de usuarios NUNCA tocan `stations` directamente.
-- ============================================================
CREATE TABLE IF NOT EXISTS station_proposals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  station_id TEXT NOT NULL REFERENCES stations(id),
  submitted_by TEXT NOT NULL,          -- email del usuario
  changes TEXT NOT NULL,               -- JSON: [{"field":"address","current":"...","proposed":"..."}]
  comment TEXT,                        -- justificación del usuario
  status TEXT NOT NULL DEFAULT 'pending',  -- pending | approved | rejected
  reviewed_by TEXT,                    -- admin que resolvió
  reviewed_at TEXT,
  review_note TEXT,                    -- razón del rechazo / nota interna
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_proposals_status ON station_proposals(status, created_at);
CREATE INDEX IF NOT EXISTS idx_proposals_station ON station_proposals(station_id);

-- ============================================================
-- USUARIOS (migran desde KV, prefijo "user:")
-- ============================================================
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',           -- admin | user (ampliable: moderator, owner)
  account_status TEXT NOT NULL DEFAULT 'active', -- active | disabled
  subscription_status TEXT NOT NULL DEFAULT 'free', -- free | active | expired | cancelled
  subscription_end TEXT,
  contributions_count INTEGER NOT NULL DEFAULT 0, -- derivado del historial
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- ============================================================
-- RESEÑAS (migran desde Notion "EV Reseñas GT")
-- ============================================================
CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES stations(id),
  author TEXT,
  user_email TEXT REFERENCES users(email),
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment TEXT,
  status TEXT NOT NULL DEFAULT 'visible',      -- visible | hidden (moderación, sin borrar)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reviews_station ON reviews(station_id);

-- ============================================================
-- FOTOS (índice; el binario sigue en KV/R2)
-- ============================================================
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  station_id TEXT NOT NULL REFERENCES stations(id),
  kv_key TEXT NOT NULL,
  uploaded_by TEXT,
  status TEXT NOT NULL DEFAULT 'visible',      -- visible | hidden
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_photos_station ON photos(station_id);

-- ============================================================
-- METADATOS DE SINCRONIZACIÓN Y RESPALDO (observabilidad)
-- ============================================================
CREATE TABLE IF NOT EXISTS ops_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  op TEXT NOT NULL,                    -- backup_r2 | sync_notion | recalc_derived
  ok INTEGER NOT NULL,                 -- 1 éxito / 0 falló
  detail TEXT,                         -- JSON: conteos, error, duración
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
