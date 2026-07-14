# Plan de migración a D1 — Especificación completa

**Estado: PLANIFICACIÓN — nada de esto se ha ejecutado aún.**
Fecha del plan: 13 jul 2026. Este documento es la especificación acordada para
la Fase 1 del roadmap de robustez: migrar la fuente de verdad de Notion a
Cloudflare D1, con historial de eventos (auditoría), cola de propuestas y
respaldos automáticos.

## Objetivo

- **D1 pasa a ser la única fuente de verdad** para estaciones, usuarios,
  reseñas y fotos (índice). La app nunca vuelve a consultar Notion en vivo.
- **Notion queda como panel editorial + espejo legible**: sincroniza desde D1.
- **Todo cambio queda registrado** en un historial inmutable (`station_events`).
- **Respaldo automático diario** a R2 (regla 3-2-1).
- **Cero pérdida de datos y cero downtime** durante la migración: cada fase
  tiene verificación y marcha atrás.

---

## 1. Esquema de base de datos propuesto

Reemplaza/amplía el borrador actual de `db/schema.sql`. Cambios principales
respecto al borrador: se agrega `type` a estaciones (para las futuras
residenciales/pin azul), se agregan las tablas `station_events` y
`station_proposals`, y los campos `verified_*` de estaciones pasan a ser
**caché derivada** del historial (se recalculan, nunca se editan a mano).

```sql
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
    -- created            : estación creada
    -- updated            : campo(s) editados (admin o propuesta aprobada)
    -- confirmed_ok       : usuario confirmó en sitio que funciona
    -- reported_issue     : usuario reportó un problema
    -- reported_closed    : usuario reportó que ya no existe
    -- report_resolved    : admin resolvió/descartó reportes abiertos
    -- proposal_submitted : usuario propuso una corrección
    -- proposal_approved  : admin aprobó la propuesta
    -- proposal_rejected  : admin rechazó la propuesta
    -- status_changed     : cambio de status/approval_status
    -- archived / restored
  actor_email TEXT,                    -- quién lo hizo (NULL = sistema)
  actor_role TEXT,                     -- user | admin | system (rol AL MOMENTO del evento)
  payload TEXT NOT NULL DEFAULT '{}',  -- JSON con el detalle, ej:
    -- updated:  {"changes":[{"field":"address","old":"...","new":"..."}]}
    -- reported_issue: {"comment":"el conector CCS no carga"}
    -- proposal_*: {"proposal_id": 123}
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
  -- Contadores derivados del historial (para reputación futura):
  contributions_count INTEGER NOT NULL DEFAULT 0,
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
```

### Reglas de integridad (se aplican en el Worker, no solo en SQL)

1. **`station_events` es inmutable.** Ningún endpoint hace UPDATE/DELETE ahí.
2. **Los usuarios no editan `stations` directamente.** Usuario → `station_proposals`
   → admin aprueba → el Worker aplica el cambio a `stations` + inserta evento
   `updated` + evento `proposal_approved`. Todo en **una transacción** (o todo
   se guarda, o nada — así no quedan estados a medias).
3. **Confirmaciones y reportes** insertan su evento y actualizan los campos
   derivados (`confirm_count`, `last_confirmed_at`, `open_reports`) en la misma
   transacción.
4. **`verification_status` se calcula, no se asigna a mano:**
   - `verified`  → tiene confirmación en los últimos 90 días y 0 reportes abiertos
   - `stale`     → última confirmación hace más de 90 días
   - `flagged`   → 2+ reportes abiertos de usuarios distintos
   - `pending`   → nunca confirmada
   El Worker la recalcula al insertar eventos; un cron nocturno recalcula las
   que envejecen (`verified` → `stale`) aunque nadie las toque.
5. **Nada se borra físicamente.** "Eliminar" una estación = `approval_status:
   rejected` o `status: closed` + evento. Las reseñas/fotos se ocultan
   (`status: hidden`), no se borran. El único DELETE real permitido es sobre
   binarios de fotos en KV cuando ya se ocultó su índice.

---

## 2. Respaldos automáticos (regla 3-2-1)

| # | Copia | Dónde | Cómo | Frecuencia |
|---|-------|-------|------|------------|
| 1 | Viva | D1 | + Time Travel de Cloudflare (restauración a cualquier punto de los últimos 30 días, incluido de fábrica) | continua |
| 2 | Export | R2, bucket `ev-gt-backups` | Cron del Worker exporta todas las tablas a JSON (`backups/YYYY-MM-DD/*.json`). Retención: 30 diarios + 12 mensuales | diaria (madrugada) |
| 3 | Espejo humano | Notion | Sync D1 → Notion (solo estaciones y propuestas; ver §3) | tras cada cambio aprobado, con reintentos |
| 4 | Semilla | GitHub (`src/data/chargers.ts`) | Regenerar desde D1 al hacer releases; git guarda cada versión | manual/por release |

Cada corrida de backup inserta una fila en `ops_log`. Si el backup falla
2 días seguidos, es visible en el panel de admin (y a futuro, alerta por correo).

**Prueba de restauración:** una vez armado, se hace un simulacro — restaurar el
export JSON a una base D1 de staging y comparar conteos. Un backup que nunca se
ha probado restaurar no es un backup.

---

## 3. Nuevo rol de Notion (después de la migración)

- **Deja de ser fuente.** El endpoint `/api/stations/dynamic` deja de consultar
  Notion; lee D1 (con caché, ver §4).
- **Sync unidireccional D1 → Notion** para que siga sirviendo como panel
  cómodo de lectura/revisión: cuando una estación cambia en D1, el Worker
  actualiza su página en Notion (`notion_page_id`) en segundo plano
  (`ctx.waitUntil`, con reintentos ante 429). Si Notion falla, la app no se
  entera: el dato ya está seguro en D1.
- **Ediciones manuales en Notion ya NO llegan a la app.** Toda edición
  editorial se hace por el panel de admin de la app. (Esto elimina de raíz la
  clase de bug del 13 jul 2026.) Si más adelante se quiere editar desde Notion,
  se diseña un sync inverso explícito con botón "importar" — nunca automático.

---

## 4. Caché y degradación (alto tráfico)

- El Worker cachea la respuesta de `/api/stations` en el edge
  (Cache API / caché en memoria) con TTL de 60–300 s. Al aprobar cambios, el
  propio Worker invalida la caché → los cambios se ven de inmediato.
- Cadena de respaldo de lectura: **caché → D1 → última copia buena en KV →
  semilla estática del frontend**. El usuario siempre ve un mapa; si se está
  sirviendo copia, la app muestra aviso discreto "mostrando datos guardados".

---

## 5. Plan de migración paso a paso

Cada fase termina con una verificación; si falla, se revierte y no se avanza.
**En ningún punto la app deja de funcionar** — el usuario no percibe la migración.

### Fase 0 — Preparación (sin tocar producción)
1. Crear la base: `wrangler d1 create ev-guatemala-db` y activar el binding
   `DB` en `wrangler.toml` (ya está preparado, comentado).
2. Crear también `ev-guatemala-db-staging` (base de ensayo).
3. Aplicar el esquema de este documento a ambas.
4. Crear bucket R2 `ev-gt-backups` y su binding.
- ✅ *Verificación:* las tablas existen; la app sigue igual (no usa nada de esto aún).
- ↩️ *Marcha atrás:* borrar la base; ningún impacto.

### Fase 1 — Importación de datos (una sola vez)
1. Script de importación (endpoint admin protegido o script local con wrangler):
   - Notion "EV Estaciones GT" → `stations` (misma lógica de mapeo que ya usa
     `handleGetDynamicStations`, respetando el filtro Fuente + Estado).
   - Notion "Reseñas" → `reviews`.
   - KV `user:*` → `users`.
   - Índice de fotos KV → `photos`.
   - Por cada estación importada: evento `created` con `actor_role: system` y
     payload `{"migrated_from":"notion"}` — el historial nace completo.
2. **Verificación de conteos** (obligatoria antes de seguir): número de
   estaciones activas, reseñas, usuarios y fotos en D1 == lo que devuelve la
   API actual de Notion/KV. Muestreo manual de 5–10 estaciones campo por campo.
- ✅ *Verificación:* conteos idénticos, muestreo sin diferencias.
- ↩️ *Marcha atrás:* vaciar tablas y reimportar; producción sigue leyendo Notion.

### Fase 2 — Lectura en sombra (D1 y Notion en paralelo)
1. Nuevo endpoint `/api/stations` que lee D1 (+caché). El viejo
   `/api/stations/dynamic` (Notion) sigue vivo y es el que usa la app.
2. Durante unos días, comparar respuestas de ambos endpoints (mismos datos).
   Congelar ediciones en Notion durante la ventana de comparación final.
- ✅ *Verificación:* ambos endpoints devuelven lo mismo de forma estable.
- ↩️ *Marcha atrás:* nada que revertir; la app aún no usa el endpoint nuevo.

### Fase 3 — Corte de lecturas
1. El frontend (`useStore.ts`) pasa a consumir `/api/stations` (D1).
2. `/api/stations/dynamic` se mantiene como alias del nuevo (por si hay
   clientes con caché vieja del frontend).
3. Desplegar y monitorear consola/errores 24–48 h.
- ✅ *Verificación:* mapa idéntico al de antes; sin errores nuevos; sin llamadas
  a Notion en el camino de lectura.
- ↩️ *Marcha atrás:* revertir el frontend al endpoint viejo (un deploy).

### Fase 4 — Corte de escrituras
1. Reescribir los handlers de escritura contra D1 con transacciones + eventos:
   - `POST /stations` (alta) → `stations` (pending) + evento `created`
   - `PATCH/DELETE /stations/:id` (admin) → cambio + evento (sin DELETE físico)
   - verificación de estación (endpoint existente) → evento `confirmed_ok` /
     `reported_issue` + recálculo de derivados
   - propuestas de corrección (flujo existente) → `station_proposals` + eventos
   - reseñas y fotos → D1 (foto binaria sigue en KV)
   - auth/usuarios → D1 (login, registro, cambio de contraseña)
2. Activar sync D1 → Notion en segundo plano (§3).
3. Notion pasa a solo-lectura para humanos (acordado, no forzado).
- ✅ *Verificación:* crear estación de prueba, proponer corrección, aprobarla,
  confirmarla, reportarla — y revisar que cada paso dejó su evento y que Notion
  se actualizó en espejo. Login/registro funcionando desde D1.
- ↩️ *Marcha atrás:* por handler (cada uno se puede revertir a su versión
  Notion/KV de forma independiente).

### Fase 5 — Respaldos y limpieza
1. Cron diario de backup a R2 + cron nocturno de recálculo de frescura
   (`verified` → `stale`).
2. Simulacro de restauración a staging (obligatorio, una vez).
3. Retirar el código muerto de Notion-como-fuente; regenerar la semilla
   estática desde D1; actualizar `CLAUDE.md` con la arquitectura final.
- ✅ *Verificación:* primer backup en R2 restaurado con éxito en staging;
  `ops_log` registrando corridas.

### Trabajo posterior (fuera de esta migración, ya con base sólida)
- UI de confirmar/reportar con un toque + insignias de frescura en el mapa.
- Cola de moderación unificada en el panel de admin.
- Staging + despliegue automático (GitHub Actions) + monitoreo externo.
- Estaciones residenciales (`type: residential`, pin azul) — el esquema ya las contempla.

---

## Estimación de esfuerzo (sesiones de trabajo con Claude)

| Fase | Esfuerzo aproximado |
|------|---------------------|
| 0 – Preparación | 1 sesión corta |
| 1 – Importación + verificación | 1 sesión |
| 2 – Lectura en sombra | 1 sesión + días de observación |
| 3 – Corte de lecturas | 1 sesión corta + 48 h de monitoreo |
| 4 – Corte de escrituras | 2–3 sesiones (es la fase grande) |
| 5 – Respaldos y limpieza | 1 sesión |

Costo de infraestructura: **Q0** — D1, R2 y los crons entran en el tier
gratuito de Cloudflare al volumen actual y al de un lanzamiento público inicial.
