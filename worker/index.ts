export interface Env {
  ASSETS: Fetcher;
  NOTION_TOKEN: string;
  NOTION_REVIEWS_DB_ID: string;
  NOTION_STATIONS_DB_ID: string;
  PHOTOS?: KVNamespace;
  DB?: D1Database;
  BACKUPS?: R2Bucket;
  OCM_API_KEY?: string;
  ADMIN_PASSWORD?: string;
  JWT_SECRET?: string;
  ADMIN_EMAIL?: string;
}

const NOTION_API = 'https://api.notion.com/v1';

function notionHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
    'Notion-Version': '2022-06-28',
  };
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
  });
}

function apiError(msg: string, status = 400): Response {
  return json({ error: msg }, status);
}

// ─── Notion types ─────────────────────────────────────────────────────────────

interface NotionPage {
  id: string;
  created_time: string;
  properties: Record<string, NotionProp>;
}

interface NotionProp {
  number?: number | null;
  rich_text?: { text: { content: string } }[];
  title?: { text: { content: string } }[];
  files?: NotionFile[];
  select?: { name: string } | null;
  url?: string | null;
}

interface NotionFile {
  name?: string;
  type?: string;
  file?: { url: string };
  external?: { url: string };
}

function richText(prop: NotionProp | undefined): string {
  return prop?.rich_text?.[0]?.text?.content ?? '';
}

function verificationFromSelect(name: string | undefined): 'pending' | 'verified' | 'error' {
  if (name === 'Verificado') return 'verified';
  if (name === 'Erróneo') return 'error';
  return 'pending';
}

function pageToReview(page: NotionPage) {
  return {
    id: page.id,
    stationId: richText(page.properties['Station ID']),
    stationName: richText(page.properties['Nombre Estación']),
    rating: page.properties['Rating']?.number ?? 0,
    text: richText(page.properties['Reseña']),
    author: richText(page.properties['Autor']) || 'Anónimo',
    date: page.created_time,
  };
}

// ─── Capa de datos D1 ─────────────────────────────────────────────────────────
// D1 es la fuente de verdad (docs/plan-migracion-d1.md). Reglas:
// 1. station_events es inmutable: solo INSERT, nunca UPDATE/DELETE.
// 2. Los usuarios no editan `stations` directamente: proponen → admin aprueba.
// 3. Nada se borra físicamente: rejected/closed/hidden + evento.
// 4. Toda escritura multi-tabla va en env.DB.batch() (atómico).
// 5. Notion es espejo: syncStationToNotion() en segundo plano vía ctx.waitUntil.

type EventType =
  | 'created' | 'updated' | 'confirmed_ok' | 'reported_issue' | 'reported_closed'
  | 'report_resolved' | 'proposal_submitted' | 'proposal_approved'
  | 'proposal_rejected' | 'status_changed' | 'archived' | 'restored';

function eventStmt(
  db: D1Database,
  stationId: string,
  type: EventType,
  actor: UserRecord | null,
  payload: Record<string, unknown> = {},
): D1PreparedStatement {
  return db.prepare(
    'INSERT INTO station_events (station_id, event_type, actor_email, actor_role, payload) VALUES (?, ?, ?, ?, ?)'
  ).bind(stationId, type, actor?.email ?? null, actor ? actor.role : 'system', JSON.stringify(payload));
}

interface FullStationRow {
  id: string;
  type: string;
  name: string;
  address: string | null;
  zone: string | null;
  lat: number;
  lng: number;
  status: string;
  network: string | null;
  access: string;
  connectors: string;
  notes: string | null;
  source: string | null;
  google_maps_url: string | null;
  submitted_by: string | null;
  owner_email: string | null;
  approval_status: string;
  verification_status: string;
  notion_page_id: string | null;
}

async function getStation(db: D1Database, stationId: string): Promise<FullStationRow | null> {
  return db.prepare('SELECT * FROM stations WHERE id = ?').bind(stationId).first<FullStationRow>();
}

// ─── Espejo D1 → Notion (solo lectura para humanos) ──────────────────────────

function stationToNotionProperties(s: FullStationRow): Record<string, unknown> {
  const estado = s.approval_status === 'pending' ? 'Pendiente'
    : s.approval_status === 'rejected' ? 'Rechazado' : 'Activo';
  const verificacion = s.verification_status === 'verified' ? 'Verificado'
    : s.verification_status === 'flagged' ? 'Erróneo' : 'Pendiente';
  return {
    'Nombre': { title: [{ text: { content: s.name } }] },
    'Station ID': { rich_text: [{ text: { content: s.id } }] },
    'Latitud': { number: s.lat },
    'Longitud': { number: s.lng },
    'Zona': { rich_text: [{ text: { content: s.zone ?? 'Guatemala' } }] },
    'Red': { rich_text: [{ text: { content: s.network ?? 'Desconocido' } }] },
    'Dirección': { rich_text: [{ text: { content: s.address ?? '' } }] },
    'Conectores': { rich_text: [{ text: { content: s.connectors } }] },
    'Acceso': { rich_text: [{ text: { content: s.access } }] },
    'Fuente': { rich_text: [{ text: { content: s.source || 'Manual' } }] },
    'Notas': { rich_text: s.notes ? [{ text: { content: s.notes.slice(0, 1900) } }] : [] },
    'Google Maps': { url: s.google_maps_url || `https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}` },
    'Estado': { select: { name: estado } },
    'Verificacion': { select: { name: verificacion } },
  };
}

// Sincroniza una estación de D1 hacia su página espejo en Notion, con
// reintentos (rate limits 429). Corre en segundo plano: si Notion falla, la
// app no se entera — el dato ya está seguro en D1. Deja rastro en ops_log.
async function syncStationToNotion(env: Env, stationId: string): Promise<void> {
  if (!env.DB || !env.NOTION_TOKEN) return;
  let ok = false;
  let detail = '';
  try {
    const s = await getStation(env.DB, stationId);
    if (!s) return;
    const properties = stationToNotionProperties(s);

    for (let attempt = 0; attempt < 3 && !ok; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 1200 * attempt));
      try {
        if (s.notion_page_id) {
          const res = await fetch(`${NOTION_API}/pages/${s.notion_page_id}`, {
            method: 'PATCH',
            headers: notionHeaders(env.NOTION_TOKEN),
            body: JSON.stringify({ properties }),
          });
          ok = res.ok;
          if (!ok) detail = `PATCH HTTP ${res.status}`;
        } else {
          const res = await fetch(`${NOTION_API}/pages`, {
            method: 'POST',
            headers: notionHeaders(env.NOTION_TOKEN),
            body: JSON.stringify({ parent: { database_id: env.NOTION_STATIONS_DB_ID }, properties }),
          });
          if (res.ok) {
            const page = await res.json() as { id: string };
            await env.DB.prepare('UPDATE stations SET notion_page_id = ? WHERE id = ?').bind(page.id, stationId).run();
            ok = true;
          } else {
            detail = `POST HTTP ${res.status}`;
          }
        }
      } catch (e) {
        detail = String(e);
      }
    }
  } catch (e) {
    detail = String(e);
  }
  try {
    await env.DB.prepare('INSERT INTO ops_log (op, ok, detail) VALUES (?, ?, ?)')
      .bind('sync_notion', ok ? 1 : 0, JSON.stringify({ stationId, ...(detail ? { detail } : {}) })).run();
  } catch {}
}

// ─── Mantenimiento nocturno (cron): frescura + respaldo a R2 ─────────────────

async function logOp(db: D1Database, op: string, ok: boolean, detail: unknown): Promise<void> {
  try {
    await db.prepare('INSERT INTO ops_log (op, ok, detail) VALUES (?, ?, ?)')
      .bind(op, ok ? 1 : 0, JSON.stringify(detail)).run();
  } catch {}
}

// Una estación "verificada" envejece a "stale" si nadie la confirma en 90 días.
// Honestidad automática: el mapa nunca presume verificaciones viejas.
async function recalcFreshness(env: Env): Promise<void> {
  if (!env.DB) return;
  try {
    const res = await env.DB.prepare(
      `UPDATE stations SET verification_status = 'stale', updated_at = datetime('now')
        WHERE verification_status = 'verified'
          AND (last_confirmed_at IS NULL OR last_confirmed_at < datetime('now', '-90 days'))`
    ).run();
    const marked = res.meta.changes ?? 0;
    if (marked > 0) invalidateStationsCache();
    await logOp(env.DB, 'recalc_derived', true, { stale_marked: marked });
  } catch (e) {
    await logOp(env.DB, 'recalc_derived', false, { error: String(e) });
  }
}

const BACKUP_TABLES = ['stations', 'station_events', 'station_proposals', 'users', 'reviews', 'photos', 'ops_log'];

// Retención: 30 respaldos diarios + los del día 1 de cada mes por 12 meses.
async function applyBackupRetention(bucket: R2Bucket): Promise<number> {
  const keysByDay = new Map<string, string[]>();
  let cursor: string | undefined;
  do {
    const listed = await bucket.list({ prefix: 'backups/', cursor });
    for (const obj of listed.objects) {
      const day = obj.key.split('/')[1];
      if (!day) continue;
      if (!keysByDay.has(day)) keysByDay.set(day, []);
      keysByDay.get(day)!.push(obj.key);
    }
    cursor = listed.truncated ? listed.cursor : undefined;
  } while (cursor);

  let deleted = 0;
  const now = Date.now();
  for (const [day, keys] of keysByDay) {
    const ageDays = (now - Date.parse(day)) / 86_400_000;
    if (isNaN(ageDays)) continue;
    const isMonthly = day.endsWith('-01');
    if (ageDays <= 30 || (isMonthly && ageDays <= 366)) continue;
    for (const key of keys) {
      await bucket.delete(key);
      deleted++;
    }
  }
  return deleted;
}

async function runBackup(env: Env): Promise<void> {
  if (!env.DB) return;
  if (!env.BACKUPS) {
    await logOp(env.DB, 'backup_r2', false, { error: 'binding BACKUPS ausente (¿R2 habilitado?)' });
    return;
  }
  const day = new Date().toISOString().slice(0, 10);
  const counts: Record<string, number> = {};
  try {
    for (const table of BACKUP_TABLES) {
      const { results } = await env.DB.prepare(`SELECT * FROM ${table}`).all();
      counts[table] = results.length;
      await env.BACKUPS.put(`backups/${day}/${table}.json`, JSON.stringify(results), {
        httpMetadata: { contentType: 'application/json' },
      });
    }
    const purged = await applyBackupRetention(env.BACKUPS);
    await logOp(env.DB, 'backup_r2', true, { day, counts, purged });
  } catch (e) {
    await logOp(env.DB, 'backup_r2', false, { day, counts, error: String(e) });
  }
}

async function runNightlyMaintenance(env: Env): Promise<void> {
  await recalcFreshness(env);
  await runBackup(env);
}

// ─── Geo helpers ──────────────────────────────────────────────────────────────

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function isNearExisting(lat: number, lng: number, existing: { lat: number; lng: number }[], thresholdKm = 0.4): boolean {
  return existing.some(e => haversineKm(lat, lng, e.lat, e.lng) < thresholdKm);
}

async function getAllStationCoords(env: Env): Promise<{ lat: number; lng: number; stationId: string }[]> {
  // Coordenadas de todas las estaciones no rechazadas en D1 (para deduplicar
  // candidatos del scan contra lo ya registrado, incluidas las pendientes).
  if (!env.DB) return [];
  const { results } = await env.DB.prepare(
    "SELECT id, lat, lng FROM stations WHERE approval_status != 'rejected'"
  ).all<{ id: string; lat: number; lng: number }>();
  return results.map(r => ({ lat: r.lat, lng: r.lng, stationId: r.id }));
}

// ─── Scan types ───────────────────────────────────────────────────────────────

interface OCMConnection {
  ConnectionType?: { ID?: number; FormalName?: string } | null;
  PowerKW?: number | null;
}

interface OCMStationRaw {
  ID: number;
  AddressInfo: {
    Title: string;
    AddressLine1?: string | null;
    Town?: string | null;
    Latitude: number;
    Longitude: number;
  };
  StatusType?: { ID: number; IsOperational: boolean | null } | null;
  Connections?: OCMConnection[] | null;
  OperatorInfo?: { Title?: string } | null;
}

export interface StationCandidate {
  id: string;
  name: string;
  address: string;
  zone: string;
  lat: number;
  lng: number;
  network: string;
  status: string;
  connectors: Array<{ type: string; power_kw: number; level: string }>;
  source: string;
  sourceId: string;
}

// ─── OCM helpers ──────────────────────────────────────────────────────────────

const CONN_MAP: Record<number, string> = {
  1: 'J1772', 2: 'CHAdeMO', 3: 'GBT',
  25: 'Type2', 30: 'Type2',
  32: 'CCS1', 33: 'CCS2',
};

function ocmConnType(conn: OCMConnection): string {
  const id = conn.ConnectionType?.ID;
  if (id && CONN_MAP[id]) return CONN_MAP[id];
  const name = conn.ConnectionType?.FormalName ?? '';
  if (name.includes('CHAdeMO')) return 'CHAdeMO';
  if (name.includes('CCS') && name.includes('2')) return 'CCS2';
  if (name.includes('CCS') && name.includes('1')) return 'CCS1';
  if (name.includes('J1772')) return 'J1772';
  if (name.includes('GB/T')) return 'GBT';
  return 'Type2';
}

function ocmStatusToLocal(s: OCMStationRaw): string {
  const op = s.StatusType?.IsOperational;
  const id = s.StatusType?.ID ?? 0;
  if (op === true || id === 10 || id === 50) return 'active';
  if (op === false || id === 100 || id === 200) return 'offline';
  if (id === 75 || id === 20 || id === 30) return 'maintenance';
  return 'active';
}

function mapOCMConnectors(conns: OCMConnection[]): Array<{ type: string; power_kw: number; level: string }> {
  const result = conns
    .filter(c => c.ConnectionType)
    .slice(0, 4)
    .map(c => ({
      type: ocmConnType(c),
      power_kw: c.PowerKW ?? 7.4,
      level: (c.PowerKW ?? 0) > 22 ? 'DC' : 'L2',
    }));
  return result.length > 0 ? result : [{ type: 'Type2', power_kw: 7.4, level: 'L2' }];
}

// ─── Scan handlers ────────────────────────────────────────────────────────────

async function scanOCM(
  existing: { lat: number; lng: number }[],
  apiKey?: string,
): Promise<{ candidates: StationCandidate[]; scraped: boolean; error?: string }> {
  try {
    const url = new URL('https://api.openchargemap.io/v3/poi/');
    url.searchParams.set('output', 'json');
    url.searchParams.set('countrycode', 'GT');
    url.searchParams.set('maxresults', '500');
    url.searchParams.set('compact', 'false');
    url.searchParams.set('verbose', 'false');
    url.searchParams.set('includecomments', 'false');

    const headers: Record<string, string> = {
      'User-Agent': 'EV-Guatemala-Map/1.0 (community charger map; contact: admin@evgt.app)',
    };
    if (apiKey) headers['X-API-Key'] = apiKey;

    const res = await fetch(url.toString(), { headers });
    if (!res.ok) {
      return { candidates: [], scraped: false, error: `OCM respondió con error ${res.status}` };
    }

    const stations = await res.json() as OCMStationRaw[];
    const candidates: StationCandidate[] = stations
      .filter(s => !isNearExisting(s.AddressInfo.Latitude, s.AddressInfo.Longitude, existing))
      .map(s => ({
        id: `ocm-${s.ID}`,
        name: s.AddressInfo.Title,
        address: [s.AddressInfo.AddressLine1, s.AddressInfo.Town].filter(Boolean).join(', '),
        zone: s.AddressInfo.Town ?? 'Guatemala',
        lat: s.AddressInfo.Latitude,
        lng: s.AddressInfo.Longitude,
        network: s.OperatorInfo?.Title ?? 'Desconocido',
        status: ocmStatusToLocal(s),
        connectors: mapOCMConnectors(s.Connections ?? []),
        source: 'OCM',
        sourceId: String(s.ID),
      }));

    return { candidates, scraped: true };
  } catch (e) {
    return { candidates: [], scraped: false, error: String(e) };
  }
}

async function scanElectronPower(
  existing: { lat: number; lng: number }[],
): Promise<{ candidates: StationCandidate[]; scraped: boolean; error?: string }> {
  try {
    const res = await fetch('https://electronpower.com/red-de-carga/', {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; EV-Guatemala-Map/1.0)',
        'Accept': 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return { candidates: [], scraped: false, error: `HTTP ${res.status}` };

    const html = await res.text();

    // Look for coordinate patterns in embedded JSON/JS (lat/lng)
    const candidates: StationCandidate[] = [];
    const seen = new Set<string>();

    // Pattern: {"lat": 14.xxx, ... "lng": -90.xxx ...} or similar variations
    const patterns = [
      /["']?lat(?:itude)?["']?\s*[=:]\s*(-?\d{1,2}\.\d{3,8})[^;,\n]*?["']?l(?:ng|on|ongitude)["']?\s*[=:]\s*(-?\d{2,3}\.\d{3,8})/gi,
      /["']?l(?:ng|on|ongitude)["']?\s*[=:]\s*(-?\d{2,3}\.\d{3,8})[^;,\n]*?["']?lat(?:itude)?["']?\s*[=:]\s*(-?\d{1,2}\.\d{3,8})/gi,
    ];

    for (const pattern of patterns) {
      const isLatFirst = pattern.source.startsWith('["\'');
      for (const match of html.matchAll(pattern)) {
        let lat: number, lng: number;
        if (isLatFirst) {
          lat = parseFloat(match[1]);
          lng = parseFloat(match[2]);
        } else {
          lng = parseFloat(match[1]);
          lat = parseFloat(match[2]);
        }
        // Guatemala bounding box
        if (lat < 13.7 || lat > 17.9 || lng < -92.3 || lng > -88.2) continue;
        const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
        if (seen.has(key)) continue;
        seen.add(key);
        if (isNearExisting(lat, lng, existing)) continue;
        candidates.push({
          id: `ep-${lat.toFixed(4)}x${lng.toFixed(4)}`.replace('-', 'n'),
          name: 'Cargador Electron Power',
          address: '',
          zone: 'Guatemala',
          lat, lng,
          network: 'Electron Power',
          status: 'active',
          connectors: [{ type: 'CCS2', power_kw: 50, level: 'DC' }],
          source: 'Electron Power',
          sourceId: key,
        });
      }
    }

    return { candidates, scraped: true };
  } catch (e) {
    return { candidates: [], scraped: false, error: 'Página usa renderizado dinámico (JavaScript). Verifica manualmente.' };
  }
}

async function handleGetScan(env: Env): Promise<Response> {
  // Load all existing station coords from D1 (source of truth)
  const existing = await getAllStationCoords(env);

  // Scan sources in parallel
  const [ocmResult, epResult] = await Promise.all([
    scanOCM(existing, env.OCM_API_KEY),
    scanElectronPower(existing),
  ]);

  return json({
    sources: [
      {
        id: 'ocm',
        name: 'OpenChargeMap',
        url: 'https://openchargemap.org/site/poi/list#!?country=GT',
        description: 'Base de datos global de cargadores, colaborativa y de código abierto',
        ...ocmResult,
      },
      {
        id: 'electron-power',
        name: 'Electron Power',
        url: 'https://electronpower.com/red-de-carga/',
        description: 'Red de carga eléctrica de Guatemala',
        ...epResult,
      },
    ],
    existingCount: existing.length,
    scannedAt: new Date().toISOString(),
    manualSources: [
      { name: 'BAC Ruta Eléctrica', url: 'https://www.baccredomatic.com/es-gt/personas/landing/ruta-electrica', description: 'Red de BAC en Guatemala' },
      { name: 'PlugShare', url: 'https://www.plugshare.com/?latitude=14.64&longitude=-90.51&zoomLevel=10', description: 'Mapa global colaborativo' },
      { name: 'AMEGUA', url: 'https://www.amegua.org/cargadores-elctricos', description: 'Asociación Movilidad Eléctrica Guatemala' },
    ],
  });
}

async function handlePostStation(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const body = await request.json() as {
    id: string; name: string; address?: string;
    zone?: string; lat: number; lng: number;
    network?: string; status?: string; type?: string;
    connectors?: Array<{ type: string; power_kw: number; level: string }>;
    access?: string; source?: string; notes?: string;
  };

  if (!body.id || !body.name || body.lat == null || body.lng == null) {
    return apiError('id, name, lat y lng son requeridos');
  }

  if (!env.DB) return apiError('Base de datos no configurada', 503);

  // Check who is submitting
  const requester = await getUserFromToken(request, env);
  const isAdmin = requester?.role === 'admin';
  const submittedBy = requester?.email ?? '';
  const type = body.type === 'residential' ? 'residential' : 'public';

  // Las estaciones residenciales exigen cuenta: sin dueño identificado no hay
  // a quién enlazar la propiedad (owner_email) ni a quién contactar/pagar
  // más adelante. Las públicas mantienen el flujo anónimo existente.
  if (type === 'residential' && !requester) {
    return apiError('Debes iniciar sesión para agregar una estación residencial', 401);
  }

  // Ensure no duplicate by checking ID
  const existing = await getStation(env.DB, body.id);
  if (existing) return apiError('Esta estación ya existe en la base de datos', 409);

  if (typeof body.lat !== 'number' || body.lat < 13 || body.lat > 18) return apiError('lat fuera de rango para Guatemala');
  if (typeof body.lng !== 'number' || body.lng < -93 || body.lng > -88) return apiError('lng fuera de rango para Guatemala');

  // Admins publish directly; logged-in users create a pending proposal;
  // anonymous users also publish directly (no account to validate against) —
  // solo aplica a públicas, ya que residenciales exige cuenta arriba.
  const isPending = !isAdmin && !!submittedBy;
  const access = ['public', 'semi-public', 'private'].includes(body.access ?? '') ? body.access! : 'public';
  const ownerEmail = type === 'residential' ? requester!.email : null;

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO stations (id, type, name, address, zone, lat, lng, status, network, access,
         connectors, notes, source, google_maps_url, submitted_by, owner_email, approval_status, verification_status)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')`
    ).bind(
      body.id, type, body.name, body.address ?? '', body.zone ?? 'Guatemala', body.lat, body.lng,
      body.network ?? 'Desconocido', access, JSON.stringify(body.connectors ?? []),
      body.notes ?? null, body.source ?? 'Manual',
      `https://www.google.com/maps/search/?api=1&query=${body.lat},${body.lng}`,
      submittedBy || null, ownerEmail, isPending ? 'pending' : 'active',
    ),
    eventStmt(env.DB, body.id, 'created', requester, {
      source: body.source ?? 'Manual', type,
      approval_status: isPending ? 'pending' : 'active',
    }),
  ]);

  invalidateStationsCache();
  ctx.waitUntil(syncStationToNotion(env, body.id));
  return json({ ok: true, pending: isPending }, 201);
}

function parseConnectors(raw: string | null): unknown[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed) && parsed.length > 0) return parsed;
  } catch {}
  return [{ type: 'Type2', power_kw: 7.4, level: 'L2' }];
}

async function handleGetPendingStations(request: Request, env: Env): Promise<Response> {
  const requester = await getUserFromToken(request, env);
  if (!requester || requester.role !== 'admin') return apiError('Solo administradores', 403);
  if (!env.DB) return apiError('Base de datos no configurada', 503);

  // Estaciones nuevas esperando aprobación
  const pendingNew = await env.DB.prepare(
    "SELECT * FROM stations WHERE approval_status = 'pending' ORDER BY created_at"
  ).all<FullStationRow & { created_at: string }>();

  // Propuestas de corrección sobre estaciones activas
  const proposals = await env.DB.prepare(
    `SELECT p.id AS proposal_id, p.station_id, p.submitted_by, p.changes, p.comment,
            p.created_at AS proposal_created_at, s.*
       FROM station_proposals p JOIN stations s ON s.id = p.station_id
      WHERE p.status = 'pending'
      ORDER BY p.created_at`
  ).all<FullStationRow & { proposal_id: number; station_id: string; submitted_by: string; changes: string; comment: string | null; proposal_created_at: string }>();

  const results: unknown[] = [];

  for (const s of pendingNew.results) {
    results.push({
      notionId: s.notion_page_id,
      id: s.id,
      type: s.type === 'residential' ? 'residential' : 'public',
      name: s.name,
      address: s.address ?? '',
      zone: s.zone || 'Guatemala',
      lat: s.lat,
      lng: s.lng,
      connectors: parseConnectors(s.connectors),
      network: s.network || 'Desconocido',
      access: s.access || 'public',
      submittedBy: s.submitted_by || 'anónimo',
      createdAt: s.created_at,
      kind: 'new',
      notes: s.notes ?? '',
    });
  }

  for (const p of proposals.results) {
    let changes: Record<string, unknown> = {};
    try { changes = JSON.parse(p.changes) as Record<string, unknown>; } catch {}
    const { verification, lat: propLat, lng: propLng, ...fieldChanges } = changes as {
      verification?: string; lat?: number; lng?: number; [k: string]: unknown;
    };
    results.push({
      notionId: p.notion_page_id,
      proposalId: p.proposal_id,
      id: p.station_id,
      type: p.type === 'residential' ? 'residential' : 'public',
      name: p.name,
      address: p.address ?? '',
      zone: p.zone || 'Guatemala',
      lat: p.lat,
      lng: p.lng,
      connectors: parseConnectors(p.connectors),
      network: p.network || 'Desconocido',
      access: p.access || 'public',
      submittedBy: p.submitted_by || 'anónimo',
      createdAt: p.proposal_created_at,
      kind: 'correction',
      notes: p.notes ?? '',
      proposedLat: propLat ?? null,
      proposedLng: propLng ?? null,
      proposedVerification: verification === 'verified' ? 'verified' : verification === 'error' ? 'error' : 'pending',
      proposedChanges: Object.keys(fieldChanges).length > 0 ? fieldChanges : null,
    });
  }

  return json(results);
}

// Campos editables de una estación que una propuesta puede tocar.
const EDITABLE_FIELDS = ['name', 'address', 'zone', 'network', 'access', 'status', 'type', 'connectors', 'lat', 'lng', 'notes'] as const;

// Construye los UPDATE de estación a partir de cambios normalizados,
// registrando old→new para el evento. Devuelve fragmentos SET y valores.
function buildStationUpdate(
  current: FullStationRow,
  changes: Record<string, unknown>,
): { sets: string[]; values: unknown[]; diff: { field: string; old: unknown; new: unknown }[] } {
  const sets: string[] = [];
  const values: unknown[] = [];
  const diff: { field: string; old: unknown; new: unknown }[] = [];
  const columnFor: Record<string, string> = {
    name: 'name', address: 'address', zone: 'zone', network: 'network', type: 'type',
    access: 'access', status: 'status', lat: 'lat', lng: 'lng', notes: 'notes',
  };
  for (const field of EDITABLE_FIELDS) {
    if (!(field in changes)) continue;
    let newVal: unknown = changes[field];
    let oldVal: unknown = (current as unknown as Record<string, unknown>)[field];
    if (field === 'connectors') {
      newVal = JSON.stringify(changes.connectors);
      oldVal = current.connectors;
      if (newVal === oldVal) continue;
      sets.push('connectors = ?');
      values.push(newVal);
      diff.push({ field, old: oldVal, new: newVal });
      continue;
    }
    if (newVal === oldVal) continue;
    sets.push(`${columnFor[field]} = ?`);
    values.push(newVal as string | number | null);
    diff.push({ field, old: oldVal, new: newVal });
  }
  if (typeof changes.lat === 'number' && typeof changes.lng === 'number') {
    sets.push('google_maps_url = ?');
    values.push(`https://www.google.com/maps/search/?api=1&query=${changes.lat},${changes.lng}`);
  }
  return { sets, values, diff };
}

async function handleStationApprove(stationId: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const requester = await getUserFromToken(request, env);
  if (!requester || requester.role !== 'admin') return apiError('Solo administradores', 403);
  if (!env.DB) return apiError('Base de datos no configurada', 503);

  const station = await getStation(env.DB, stationId);
  if (!station) return apiError('Estación no encontrada', 404);

  // Caso 1: estación nueva pendiente → publicarla
  if (station.approval_status === 'pending') {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE stations SET approval_status = 'active', updated_at = datetime('now') WHERE id = ?"
      ).bind(stationId),
      eventStmt(env.DB, stationId, 'proposal_approved', requester, { kind: 'new_station' }),
    ]);
    invalidateStationsCache();
    ctx.waitUntil(syncStationToNotion(env, stationId));
    return json({ ok: true });
  }

  // Caso 2: propuestas de corrección pendientes → aplicarlas todas
  const pending = await env.DB.prepare(
    "SELECT * FROM station_proposals WHERE station_id = ? AND status = 'pending' ORDER BY created_at"
  ).bind(stationId).all<{ id: number; submitted_by: string; changes: string }>();

  if (pending.results.length === 0) {
    return apiError('No hay ninguna propuesta pendiente para esta estación');
  }

  const today = new Date().toISOString().slice(0, 10);
  const stmts: D1PreparedStatement[] = [];
  let current = station;

  for (const p of pending.results) {
    let changes: Record<string, unknown> = {};
    try { changes = JSON.parse(p.changes) as Record<string, unknown>; } catch {}
    const { verification, ...fieldChanges } = changes as { verification?: string; [k: string]: unknown };

    const action = Object.keys(fieldChanges).filter(k => k !== 'lat' && k !== 'lng').length > 0
      ? 'Datos corregidos (aprobado por admin)'
      : typeof fieldChanges.lat === 'number' ? 'Ubicación corregida y verificada (aprobado por admin)' : 'Verificado en sitio (aprobado por admin)';
    const attribution = verification === 'error'
      ? `[Ubicación reportada errónea por: ${p.submitted_by}, aprobado ${today}]`
      : `[${action} — propuesto por: ${p.submitted_by}]`;
    const baseNotes = typeof fieldChanges.notes === 'string' ? fieldChanges.notes : (current.notes ?? '');
    fieldChanges.notes = [baseNotes, attribution].filter(Boolean).join(' · ');

    const { sets, values, diff } = buildStationUpdate(current, fieldChanges);
    if (verification === 'verified') {
      sets.push("verification_status = 'verified'", "last_confirmed_at = datetime('now')", 'confirm_count = confirm_count + 1', 'open_reports = 0');
    } else if (verification === 'error') {
      sets.push("verification_status = 'flagged'", 'open_reports = open_reports + 1');
    }
    if (sets.length > 0) {
      sets.push("updated_at = datetime('now')");
      stmts.push(env.DB.prepare(`UPDATE stations SET ${sets.join(', ')} WHERE id = ?`).bind(...values, stationId));
    }
    stmts.push(env.DB.prepare(
      "UPDATE station_proposals SET status = 'approved', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
    ).bind(requester.email, p.id));
    stmts.push(eventStmt(env.DB, stationId, 'proposal_approved', requester, {
      proposal_id: p.id, submitted_by: p.submitted_by, verification: verification ?? null, changes: diff,
    }));
    if (verification === 'verified') stmts.push(eventStmt(env.DB, stationId, 'confirmed_ok', requester, { via_proposal: p.id, on_behalf_of: p.submitted_by }));
    if (verification === 'error') stmts.push(eventStmt(env.DB, stationId, 'reported_issue', requester, { via_proposal: p.id, on_behalf_of: p.submitted_by }));

    // Refrescar la vista local de la estación para la siguiente propuesta
    current = { ...current, ...Object.fromEntries(diff.map(d => [d.field, d.new])) } as FullStationRow;
  }

  await env.DB.batch(stmts);
  invalidateStationsCache();
  ctx.waitUntil(syncStationToNotion(env, stationId));
  return json({ ok: true });
}

async function handleStationReject(stationId: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const requester = await getUserFromToken(request, env);
  if (!requester || requester.role !== 'admin') return apiError('Solo administradores', 403);
  if (!env.DB) return apiError('Base de datos no configurada', 503);

  const station = await getStation(env.DB, stationId);
  if (!station) return apiError('Estación no encontrada', 404);

  // Estación nueva pendiente: se marca rechazada (nunca se borra físicamente)
  if (station.approval_status === 'pending') {
    await env.DB.batch([
      env.DB.prepare(
        "UPDATE stations SET approval_status = 'rejected', updated_at = datetime('now') WHERE id = ?"
      ).bind(stationId),
      eventStmt(env.DB, stationId, 'proposal_rejected', requester, { kind: 'new_station' }),
    ]);
    invalidateStationsCache();
    ctx.waitUntil(syncStationToNotion(env, stationId));
    return json({ ok: true });
  }

  // Propuestas de corrección: se descartan, la estación viva queda intacta
  const pending = await env.DB.prepare(
    "SELECT id, submitted_by FROM station_proposals WHERE station_id = ? AND status = 'pending'"
  ).bind(stationId).all<{ id: number; submitted_by: string }>();

  const stmts: D1PreparedStatement[] = [];
  for (const p of pending.results) {
    stmts.push(env.DB.prepare(
      "UPDATE station_proposals SET status = 'rejected', reviewed_by = ?, reviewed_at = datetime('now') WHERE id = ?"
    ).bind(requester.email, p.id));
    stmts.push(eventStmt(env.DB, stationId, 'proposal_rejected', requester, { proposal_id: p.id, submitted_by: p.submitted_by }));
  }
  if (stmts.length > 0) await env.DB.batch(stmts);
  return json({ ok: true });
}

async function handleGetDynamicStations(env: Env): Promise<Response> {
  // Query Notion for stations added via scan (Fuente is not empty)
  const results: unknown[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = {
      page_size: 100,
      filter: {
        and: [
          { property: 'Fuente', rich_text: { is_not_empty: true } },
          { property: 'Estado', select: { equals: 'Activo' } },
        ],
      },
    };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API}/databases/${env.NOTION_STATIONS_DB_ID}/query`, {
      method: 'POST',
      headers: notionHeaders(env.NOTION_TOKEN),
      body: JSON.stringify(body),
    });
    if (!res.ok) return apiError('Error consultando Notion', 502);

    const data = await res.json() as { results: NotionPage[]; has_more: boolean; next_cursor?: string };

    for (const page of data.results) {
      const lat = page.properties['Latitud']?.number;
      const lng = page.properties['Longitud']?.number;
      if (lat == null || lng == null) continue;

      let connectors: unknown[] = [];
      try {
        const raw = richText(page.properties['Conectores']);
        if (raw) connectors = JSON.parse(raw);
      } catch {}

      const access = richText(page.properties['Acceso']) || 'public';

      results.push({
        id: richText(page.properties['Station ID']),
        name: page.properties['Nombre']?.title?.[0]?.text?.content ?? 'Estación',
        address: richText(page.properties['Dirección']),
        zone: richText(page.properties['Zona']) || 'Guatemala',
        lat,
        lng,
        status: page.properties['Estado']?.select?.name === 'Activo' ? 'active' : 'maintenance',
        connectors: connectors.length > 0 ? connectors : [{ type: 'Type2', power_kw: 7.4, level: 'L2' }],
        network: richText(page.properties['Red']) || 'Desconocido',
        access: ['public', 'semi-public', 'private'].includes(access) ? access : 'public',
        notes: richText(page.properties['Notas']) || undefined,
        verification: verificationFromSelect(page.properties['Verificacion']?.select?.name),
        googleMapsUrl: page.properties['Google Maps']?.url ?? undefined,
      });
    }

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return json(results);
}

// ─── Estaciones desde D1 (fuente de verdad; ver docs/plan-migracion-d1.md) ────

interface StationRow {
  id: string;
  type: string;
  name: string;
  address: string | null;
  zone: string | null;
  lat: number;
  lng: number;
  status: string;
  connectors: string;
  network: string | null;
  access: string;
  notes: string | null;
  verification_status: string;
  google_maps_url: string | null;
}

// Caché en memoria del isolate: a esta escala evita ir a D1 en cada carga del
// mapa. Los writes (Fase 4) deben llamar invalidateStationsCache().
let stationsCache: { body: string; expires: number } | null = null;
const STATIONS_CACHE_TTL_MS = 60_000;

export function invalidateStationsCache(): void {
  stationsCache = null;
}

async function handleGetStationsFromD1(env: Env): Promise<Response> {
  if (!env.DB) return apiError('Base de datos no configurada', 503);

  if (stationsCache && Date.now() < stationsCache.expires) {
    return new Response(stationsCache.body, {
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'X-Cache': 'hit' },
    });
  }

  const { results } = await env.DB.prepare(
    `SELECT id, type, name, address, zone, lat, lng, status, connectors, network, access,
            notes, verification_status, google_maps_url, last_confirmed_at,
            confirm_count, open_reports
       FROM stations
      WHERE approval_status = 'active' AND status IN ('active', 'maintenance')
      ORDER BY id`
  ).all<StationRow & { last_confirmed_at: string | null; confirm_count: number; open_reports: number }>();

  const stations = results.map((r) => {
    let connectors: unknown[] = [];
    try {
      const parsed = JSON.parse(r.connectors || '[]');
      if (Array.isArray(parsed)) connectors = parsed;
    } catch {}
    // `verification` es el campo legado (pending|verified|error) que clientes
    // viejos entienden; `freshness` expone el estado real (incluye stale).
    const verification =
      r.verification_status === 'verified' ? 'verified'
      : r.verification_status === 'flagged' ? 'error'
      : 'pending';
    return {
      id: r.id,
      type: r.type === 'residential' ? 'residential' : 'public',
      name: r.name,
      address: r.address ?? '',
      zone: r.zone || 'Guatemala',
      lat: r.lat,
      lng: r.lng,
      status: r.status,
      connectors: connectors.length > 0 ? connectors : [{ type: 'Type2', power_kw: 7.4, level: 'L2' }],
      network: r.network || 'Desconocido',
      access: ['public', 'semi-public', 'private'].includes(r.access) ? r.access : 'public',
      notes: r.notes || undefined,
      verification,
      freshness: r.verification_status,
      lastConfirmedAt: r.last_confirmed_at || undefined,
      confirmCount: r.confirm_count,
      openReports: r.open_reports,
      googleMapsUrl: r.google_maps_url || undefined,
    };
  });

  const body = JSON.stringify(stations);
  stationsCache = { body, expires: Date.now() + STATIONS_CACHE_TTL_MS };
  return new Response(body, {
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'X-Cache': 'miss' },
  });
}

// ─── Review handlers (D1) ─────────────────────────────────────────────────────

// Recalcula el rating agregado de la estación desde sus reseñas visibles.
function recalcRatingStmt(db: D1Database, stationId: string): D1PreparedStatement {
  return db.prepare(
    `UPDATE stations SET
       rating_avg = (SELECT ROUND(AVG(rating), 1) FROM reviews WHERE station_id = ?1 AND status = 'visible'),
       rating_count = (SELECT COUNT(*) FROM reviews WHERE station_id = ?1 AND status = 'visible')
     WHERE id = ?1`
  ).bind(stationId);
}

async function handleGetReviews(stationId: string, env: Env): Promise<Response> {
  if (!env.DB) return apiError('Base de datos no configurada', 503);
  const { results } = await env.DB.prepare(
    `SELECT r.id, r.station_id, r.rating, r.comment, r.author, r.created_at, s.name AS station_name
       FROM reviews r LEFT JOIN stations s ON s.id = r.station_id
      WHERE r.station_id = ? AND r.status = 'visible'
      ORDER BY r.created_at DESC LIMIT 50`
  ).bind(stationId).all<{ id: string; station_id: string; rating: number; comment: string | null; author: string | null; created_at: string; station_name: string | null }>();

  return json(results.map(r => ({
    id: r.id,
    stationId: r.station_id,
    stationName: r.station_name ?? '',
    rating: r.rating,
    text: r.comment ?? '',
    author: r.author || 'Anónimo',
    date: r.created_at,
  })));
}

async function handleGetRatings(env: Env): Promise<Response> {
  if (!env.DB) return json({});
  const { results } = await env.DB.prepare(
    `SELECT station_id, ROUND(AVG(rating), 1) AS avg, COUNT(*) AS count
       FROM reviews WHERE status = 'visible' GROUP BY station_id`
  ).all<{ station_id: string; avg: number; count: number }>();

  const result: Record<string, { avg: number; count: number }> = {};
  for (const r of results) result[r.station_id] = { avg: r.avg, count: r.count };
  return json(result);
}

async function handlePostReview(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    stationId: string; stationName: string;
    rating: number; text?: string; author?: string;
  };
  const { stationId, rating, text = '', author = 'Anónimo' } = body;
  if (!stationId || !rating || rating < 1 || rating > 5) {
    return apiError('stationId y rating (1-5) son requeridos');
  }
  if (!env.DB) return apiError('Base de datos no configurada', 503);

  const station = await getStation(env.DB, stationId);
  if (!station) return apiError(`Estación ${stationId} no encontrada`, 404);

  const requester = await getUserFromToken(request, env);
  const id = crypto.randomUUID();
  await env.DB.batch([
    env.DB.prepare(
      'INSERT INTO reviews (id, station_id, author, user_email, rating, comment) VALUES (?, ?, ?, ?, ?, ?)'
    ).bind(id, stationId, author, requester?.email ?? null, rating, text),
    recalcRatingStmt(env.DB, stationId),
  ]);

  return json({ id, ok: true }, 201);
}

async function handleUpdateReview(id: string, request: Request, env: Env): Promise<Response> {
  if (!env.DB) return apiError('Base de datos no configurada', 503);
  const body = await request.json() as { rating?: number; text?: string };

  const review = await env.DB.prepare('SELECT id, station_id FROM reviews WHERE id = ?').bind(id)
    .first<{ id: string; station_id: string }>();
  if (!review) return apiError('Reseña no encontrada', 404);

  const sets: string[] = [];
  const values: unknown[] = [];
  if (body.rating) {
    if (body.rating < 1 || body.rating > 5) return apiError('Rating debe ser 1-5');
    sets.push('rating = ?');
    values.push(body.rating);
  }
  if (body.text !== undefined) {
    sets.push('comment = ?');
    values.push(body.text);
  }
  if (sets.length === 0) return apiError('Nada que actualizar');

  await env.DB.batch([
    env.DB.prepare(`UPDATE reviews SET ${sets.join(', ')} WHERE id = ?`).bind(...values, id),
    recalcRatingStmt(env.DB, review.station_id),
  ]);
  return json({ ok: true });
}

async function handleDeleteReview(id: string, env: Env): Promise<Response> {
  if (!env.DB) return apiError('Base de datos no configurada', 503);
  const review = await env.DB.prepare('SELECT id, station_id FROM reviews WHERE id = ?').bind(id)
    .first<{ id: string; station_id: string }>();
  if (!review) return apiError('Reseña no encontrada', 404);

  // Moderación sin borrado físico: la reseña se oculta, no se elimina.
  await env.DB.batch([
    env.DB.prepare("UPDATE reviews SET status = 'hidden' WHERE id = ?").bind(id),
    recalcRatingStmt(env.DB, review.station_id),
  ]);
  return json({ ok: true });
}

// ─── Photo helpers ────────────────────────────────────────────────────────────

function base64ToUint8Array(base64: string): Uint8Array {
  const b64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

// ─── Photo handlers (índice en D1; binario en KV) ─────────────────────────────

async function handleGetPhotos(stationId: string, env: Env): Promise<Response> {
  if (!env.DB) return json([]);
  const { results } = await env.DB.prepare(
    "SELECT id FROM photos WHERE station_id = ? AND status = 'visible' ORDER BY created_at"
  ).bind(stationId).all<{ id: string }>();
  return json(results.map(r => ({ id: r.id, url: `/api/photo/${r.id}` })));
}

async function handleGetPhoto(photoId: string, env: Env): Promise<Response> {
  if (!env.PHOTOS) {
    return new Response('KV no configurado', { status: 503 });
  }
  const result = await env.PHOTOS.getWithMetadata<{ contentType: string }>(photoId, { type: 'arrayBuffer' });
  if (!result.value) return new Response('Foto no encontrada', { status: 404 });

  return new Response(result.value, {
    headers: {
      'Content-Type': result.metadata?.contentType ?? 'image/jpeg',
      'Cache-Control': 'public, max-age=86400',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

async function handlePostPhoto(request: Request, env: Env): Promise<Response> {
  if (!env.PHOTOS) {
    return apiError('Almacenamiento de fotos no configurado.', 503);
  }

  const body = await request.json() as {
    stationId: string; stationName: string;
    imageBase64: string; mimeType?: string; filename?: string;
  };
  const { stationId, imageBase64, mimeType = 'image/jpeg' } = body;
  if (!stationId || !imageBase64) return apiError('stationId e imageBase64 son requeridos');

  if (!env.DB) return apiError('Base de datos no configurada', 503);

  const station = await getStation(env.DB, stationId);
  if (!station) return apiError(`Estación ${stationId} no encontrada`, 404);

  const requester = await getUserFromToken(request, env);
  const bytes = base64ToUint8Array(imageBase64);
  const photoId = `${stationId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await env.PHOTOS.put(photoId, bytes.buffer, { metadata: { contentType: mimeType } });
  await env.DB.prepare(
    'INSERT INTO photos (id, station_id, kv_key, uploaded_by) VALUES (?, ?, ?, ?)'
  ).bind(photoId, stationId, photoId, requester?.email ?? null).run();

  return json({ photoId, url: `/api/photo/${photoId}` }, 201);
}

async function handleDeletePhoto(url: URL, env: Env): Promise<Response> {
  const photoId = url.searchParams.get('photoId');
  const stationId = url.searchParams.get('stationId');
  if (!photoId || !stationId) return apiError('photoId y stationId requeridos');

  // El índice se oculta (sin borrado físico del registro); el binario en KV
  // sí se elimina para no acumular almacenamiento de fotos retiradas.
  if (env.PHOTOS) await env.PHOTOS.delete(photoId);
  if (env.DB) {
    await env.DB.prepare("UPDATE photos SET status = 'hidden' WHERE id = ?").bind(photoId).run();
  }

  return json({ ok: true });
}

// ─── Crypto / JWT / Auth utilities ───────────────────────────────────────────

function b64url(data: ArrayBuffer | Uint8Array): string {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

function parseB64url(str: string): Uint8Array {
  const base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
  return Uint8Array.from(atob(padded), c => c.charCodeAt(0));
}

async function signJWT(payload: Record<string, unknown>, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const header = b64url(enc.encode(JSON.stringify({ alg: 'HS256', typ: 'JWT' })));
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const data = `${header}.${body}`;
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(data));
  return `${data}.${b64url(sig)}`;
}

async function verifyJWT(token: string, secret: string): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, sig] = parts;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['verify']);
    const valid = await crypto.subtle.verify('HMAC', key, parseB64url(sig), enc.encode(`${header}.${body}`));
    if (!valid) return null;
    const payload = JSON.parse(new TextDecoder().decode(parseB64url(body))) as Record<string, unknown>;
    if (typeof payload.exp === 'number' && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch { return null; }
}

async function hashPassword(password: string): Promise<{ hash: string; salt: string }> {
  const saltBytes = crypto.getRandomValues(new Uint8Array(16));
  const salt = b64url(saltBytes);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100_000, hash: 'SHA-256' }, key, 256);
  return { hash: b64url(bits), salt };
}

async function verifyPassword(password: string, hash: string, salt: string): Promise<boolean> {
  const saltBytes = parseB64url(salt);
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', salt: saltBytes, iterations: 100_000, hash: 'SHA-256' }, key, 256);
  return b64url(bits) === hash;
}

// ─── User model (D1, tabla users) ─────────────────────────────────────────────

interface UserRecord {
  email: string;
  name: string;
  phone?: string;
  passwordHash: string;
  salt: string;
  role: 'admin' | 'user';
  createdAt: string;
  subscriptionEnd?: string;
}

interface UserRow {
  email: string;
  name: string;
  phone: string | null;
  password_hash: string;
  salt: string;
  role: string;
  account_status: string;
  subscription_end: string | null;
  created_at: string;
}

function rowToUser(r: UserRow): UserRecord {
  return {
    email: r.email,
    name: r.name,
    phone: r.phone ?? undefined,
    passwordHash: r.password_hash,
    salt: r.salt,
    role: r.role === 'admin' ? 'admin' : 'user',
    createdAt: r.created_at,
    subscriptionEnd: r.subscription_end ?? undefined,
  };
}

// Punto único para consultar si una cuenta tiene suscripción activa. Hoy
// ninguna función lo llama (no hay funciones premium todavía) — queda listo
// para cuando se active algo que dependa de ello.
function isSubscriptionActive(user: UserRecord): boolean {
  if (!user.subscriptionEnd) return false;
  return new Date(user.subscriptionEnd).getTime() > Date.now();
}

// Formato de teléfono guatemalteco: 8 dígitos, con o sin +502. Declarado por
// el usuario, no verificado (ver docs/plan-migracion-d1.md — sin proveedor
// de SMS/email transaccional integrado todavía).
function normalizePhone(raw: string): string | null {
  const digits = raw.replace(/[^\d]/g, '').replace(/^502/, '');
  return /^\d{8}$/.test(digits) ? digits : null;
}

async function getUser(email: string, env: Env): Promise<UserRecord | null> {
  if (!env.DB) return null;
  const row = await env.DB.prepare(
    "SELECT * FROM users WHERE email = ? AND account_status = 'active'"
  ).bind(email.toLowerCase().trim()).first<UserRow>();
  return row ? rowToUser(row) : null;
}

async function saveUser(user: UserRecord, env: Env): Promise<void> {
  if (!env.DB) return;
  await env.DB.prepare(
    'UPDATE users SET name = ?, phone = ?, password_hash = ?, salt = ?, role = ?, subscription_end = ? WHERE email = ?'
  ).bind(
    user.name, user.phone ?? null, user.passwordHash, user.salt, user.role,
    user.subscriptionEnd ?? null, user.email.toLowerCase().trim(),
  ).run();
}

function getAuthToken(request: Request): string | null {
  const header = request.headers.get('Authorization');
  return header?.startsWith('Bearer ') ? header.slice(7) : null;
}

async function getUserFromToken(request: Request, env: Env): Promise<UserRecord | null> {
  const token = getAuthToken(request);
  if (!token || !env.JWT_SECRET) return null;
  const payload = await verifyJWT(token, env.JWT_SECRET);
  if (!payload || typeof payload.sub !== 'string') return null;
  return getUser(payload.sub, env);
}

// ─── Auth handlers ────────────────────────────────────────────────────────────

async function handleRegister(request: Request, env: Env): Promise<Response> {
  if (!env.JWT_SECRET) return apiError('Autenticación no configurada en el servidor', 503);
  const body = await request.json() as { email?: string; password?: string; name?: string; phone?: string };
  const email = body.email?.toLowerCase().trim() ?? '';
  const password = body.password ?? '';
  const name = body.name?.trim() ?? '';
  if (!email || !email.includes('@')) return apiError('Email inválido');
  if (password.length < 6) return apiError('La contraseña debe tener al menos 6 caracteres');
  if (!name) return apiError('El nombre es requerido');
  const phone = normalizePhone(body.phone ?? '');
  if (!phone) return apiError('Teléfono inválido — usa 8 dígitos (ej. 5512-3456)');

  if (!env.DB) return apiError('Base de datos no configurada', 503);
  const existing = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(email).first();
  if (existing) return apiError('Este email ya está registrado', 409);

  const { hash: passwordHash, salt } = await hashPassword(password);
  const role: 'admin' | 'user' = env.ADMIN_EMAIL && email === env.ADMIN_EMAIL.toLowerCase().trim() ? 'admin' : 'user';

  await env.DB.prepare(
    'INSERT INTO users (email, name, phone, password_hash, salt, role, last_login_at) VALUES (?, ?, ?, ?, ?, ?, datetime(\'now\'))'
  ).bind(email, name, phone, passwordHash, salt, role).run();

  const token = await signJWT({ sub: email, name, role, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 30 }, env.JWT_SECRET);
  return json({ token, user: { email, name, phone, role, subscriptionEnd: undefined } }, 201);
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  if (!env.JWT_SECRET) return apiError('Autenticación no configurada en el servidor', 503);
  const body = await request.json() as { email?: string; password?: string };
  const email = body.email?.toLowerCase().trim() ?? '';
  const password = body.password ?? '';
  if (!email || !password) return apiError('Email y contraseña son requeridos');

  const user = await getUser(email, env);
  if (!user) return apiError('Email o contraseña incorrectos', 401);

  const ok = await verifyPassword(password, user.passwordHash, user.salt);
  if (!ok) return apiError('Email o contraseña incorrectos', 401);

  // Always grant admin role if email matches ADMIN_EMAIL, even if the record says 'user'
  const role: 'admin' | 'user' = (env.ADMIN_EMAIL && email === env.ADMIN_EMAIL.toLowerCase().trim()) ? 'admin' : user.role;
  if (env.DB) {
    await env.DB.prepare("UPDATE users SET role = ?, last_login_at = datetime('now') WHERE email = ?")
      .bind(role, email).run();
  }

  const token = await signJWT({ sub: email, name: user.name, role, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 86400 * 30 }, env.JWT_SECRET);
  return json({ token, user: { email: user.email, name: user.name, phone: user.phone, role, subscriptionEnd: user.subscriptionEnd } });
}

async function handleGetMe(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromToken(request, env);
  if (!user) return apiError('No autenticado', 401);
  return json({ email: user.email, name: user.name, phone: user.phone, role: user.role, subscriptionEnd: user.subscriptionEnd });
}

async function handleUpdateProfile(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromToken(request, env);
  if (!user) return apiError('No autenticado', 401);
  const body = await request.json() as { name?: string; phone?: string };

  const name = body.name !== undefined ? body.name.trim() : user.name;
  if (!name) return apiError('El nombre es requerido');
  const phone = body.phone !== undefined ? normalizePhone(body.phone) : user.phone;
  if (body.phone !== undefined && !phone) return apiError('Teléfono inválido — usa 8 dígitos (ej. 5512-3456)');

  await saveUser({ ...user, name, phone: phone ?? undefined }, env);
  return json({ email: user.email, name, phone, role: user.role, subscriptionEnd: user.subscriptionEnd });
}

async function handleChangePassword(request: Request, env: Env): Promise<Response> {
  const user = await getUserFromToken(request, env);
  if (!user) return apiError('No autenticado', 401);
  const body = await request.json() as { currentPassword?: string; newPassword?: string };
  if (!body.currentPassword || !body.newPassword) return apiError('currentPassword y newPassword son requeridos');
  if (body.newPassword.length < 6) return apiError('La nueva contraseña debe tener al menos 6 caracteres');
  const ok = await verifyPassword(body.currentPassword, user.passwordHash, user.salt);
  if (!ok) return apiError('Contraseña actual incorrecta', 401);
  const { hash, salt } = await hashPassword(body.newPassword);
  await saveUser({ ...user, passwordHash: hash, salt }, env);
  return json({ ok: true });
}

async function handleSetSubscription(request: Request, env: Env): Promise<Response> {
  const requester = await getUserFromToken(request, env);
  if (!requester || requester.role !== 'admin') return apiError('Solo administradores pueden gestionar suscripciones', 403);
  const body = await request.json() as { email?: string; subscriptionEnd?: string | null };
  if (!body.email) return apiError('email requerido');
  const target = await getUser(body.email, env);
  if (!target) return apiError('Usuario no encontrado', 404);
  await saveUser({ ...target, subscriptionEnd: body.subscriptionEnd ?? undefined }, env);
  return json({ ok: true });
}

async function handleListUsers(request: Request, env: Env): Promise<Response> {
  const requester = await getUserFromToken(request, env);
  if (!requester || requester.role !== 'admin') return apiError('Solo administradores', 403);
  if (!env.DB) return json([]);

  const { results } = await env.DB.prepare(
    "SELECT email, name, role, created_at, subscription_end FROM users WHERE account_status = 'active' ORDER BY created_at"
  ).all<{ email: string; name: string; role: string; created_at: string; subscription_end: string | null }>();

  return json(results.map(u => ({
    email: u.email,
    name: u.name,
    role: u.role,
    createdAt: u.created_at,
    subscriptionEnd: u.subscription_end ?? undefined,
  })));
}

// ─── Station PATCH handler ────────────────────────────────────────────────────

// Normalize an incoming edit payload to the subset of fields users are
// allowed to change. Shared by the direct admin edit and by user proposals,
// so both paths accept exactly the same shape.
function normalizeStationChanges(body: Record<string, unknown>): { changes: Record<string, unknown>; error?: string } {
  const changes: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) changes.name = body.name.trim();
  if (typeof body.address === 'string') changes.address = body.address.trim();
  if (typeof body.zone === 'string' && body.zone.trim()) changes.zone = body.zone.trim();
  if (typeof body.network === 'string') changes.network = body.network.trim();
  if (typeof body.access === 'string' && ['public', 'semi-public', 'private'].includes(body.access)) changes.access = body.access;
  if (typeof body.status === 'string' && ['active', 'maintenance', 'offline'].includes(body.status)) changes.status = body.status;
  if (typeof body.type === 'string' && ['public', 'residential'].includes(body.type)) changes.type = body.type;
  if (Array.isArray(body.connectors)) changes.connectors = body.connectors;
  if (typeof body.lat === 'number') {
    if (body.lat < 13 || body.lat > 18) return { changes, error: 'lat fuera de rango para Guatemala' };
    changes.lat = body.lat;
  }
  if (typeof body.lng === 'number') {
    if (body.lng < -93 || body.lng > -88) return { changes, error: 'lng fuera de rango para Guatemala' };
    changes.lng = body.lng;
  }
  if (typeof body.notes === 'string') changes.notes = body.notes.trim();
  return { changes };
}

// Admins edit the live listing directly. Any other logged-in user gets the
// same form, but their edit is stored as a proposal in station_proposals —
// it never touches the live data until an admin approves it via
// handleStationApprove.
async function handlePatchStation(stationId: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const user = await getUserFromToken(request, env);
  if (!user) return apiError('Debes iniciar sesión para editar estaciones', 401);
  if (!env.DB) return apiError('Base de datos no configurada', 503);

  const station = await getStation(env.DB, stationId);
  if (!station) return apiError('Estación no encontrada', 404);

  const body = await request.json() as Record<string, unknown>;
  const { changes, error } = normalizeStationChanges(body);
  if (error) return apiError(error);
  if (Object.keys(changes).length === 0) return apiError('Nada que actualizar');

  if (user.role !== 'admin') {
    const result = await env.DB.prepare(
      'INSERT INTO station_proposals (station_id, submitted_by, changes) VALUES (?, ?, ?)'
    ).bind(stationId, user.email, JSON.stringify(changes)).run();
    const proposalId = result.meta.last_row_id;
    await eventStmt(env.DB, stationId, 'proposal_submitted', user, { proposal_id: proposalId, changes }).run();
    return json({ ok: true, applied: false, pending: true });
  }

  const { sets, values, diff } = buildStationUpdate(station, changes);
  if (sets.length === 0) return json({ ok: true, applied: true });
  sets.push("updated_at = datetime('now')");

  await env.DB.batch([
    env.DB.prepare(`UPDATE stations SET ${sets.join(', ')} WHERE id = ?`).bind(...values, stationId),
    eventStmt(env.DB, stationId, 'updated', user, { changes: diff }),
  ]);
  invalidateStationsCache();
  ctx.waitUntil(syncStationToNotion(env, stationId));
  return json({ ok: true, applied: true });
}

// Any logged-in user can confirm a station's real-world location or flag it
// as wrong once they're physically there. Admins apply the change
// immediately. Everyone else's submission is stored as a "Propuesta *" on
// the same page — it never touches the live Verificacion/Latitud/Longitud
// until an admin approves it via handleStationApprove. In both cases only
// location/verification fields are ever touched, never name/connectors/
// network, so this can't be used to vandalize listing data.
async function handleVerifyStation(stationId: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const user = await getUserFromToken(request, env);
  if (!user) return apiError('Debes iniciar sesión para verificar una estación', 401);
  if (!env.DB) return apiError('Base de datos no configurada', 503);

  const body = await request.json() as { status?: string; lat?: number; lng?: number };
  if (body.status !== 'verified' && body.status !== 'error') {
    return apiError('status debe ser "verified" o "error"');
  }
  if (body.lat != null && (typeof body.lat !== 'number' || body.lat < 13 || body.lat > 18)) {
    return apiError('lat fuera de rango para Guatemala');
  }
  if (body.lng != null && (typeof body.lng !== 'number' || body.lng < -93 || body.lng > -88)) {
    return apiError('lng fuera de rango para Guatemala');
  }

  const station = await getStation(env.DB, stationId);
  if (!station) return apiError('Estación no encontrada', 404);

  const today = new Date().toISOString().slice(0, 10);

  if (user.role === 'admin') {
    const action = body.status === 'verified'
      ? (body.lat != null ? 'Ubicación corregida y verificada' : 'Verificado en sitio')
      : 'Reportado con ubicación errónea';
    const attribution = `[${action} por: ${user.email}, ${today}]`;
    const notes = [station.notes ?? '', attribution].filter(Boolean).join(' · ');

    const sets: string[] = ['notes = ?', "updated_at = datetime('now')"];
    const values: unknown[] = [notes];
    if (body.status === 'verified') {
      sets.push("verification_status = 'verified'", "last_confirmed_at = datetime('now')", 'confirm_count = confirm_count + 1', 'open_reports = 0');
      if (body.lat != null && body.lng != null) {
        sets.push('lat = ?', 'lng = ?', 'google_maps_url = ?');
        values.push(body.lat, body.lng, `https://www.google.com/maps/search/?api=1&query=${body.lat},${body.lng}`);
      }
    } else {
      sets.push("verification_status = 'flagged'", 'open_reports = open_reports + 1');
    }

    await env.DB.batch([
      env.DB.prepare(`UPDATE stations SET ${sets.join(', ')} WHERE id = ?`).bind(...values, stationId),
      eventStmt(env.DB, stationId, body.status === 'verified' ? 'confirmed_ok' : 'reported_issue', user,
        body.lat != null ? { lat: body.lat, lng: body.lng } : {}),
    ]);
    invalidateStationsCache();
    ctx.waitUntil(syncStationToNotion(env, stationId));
    return json({ ok: true, applied: true });
  }

  // Non-admin con corrección de UBICACIÓN: eso sí es una edición de datos y
  // pasa por moderación (cola de propuestas) antes de tocar el mapa.
  if (body.status === 'verified' && body.lat != null && body.lng != null) {
    const changes = { verification: 'verified', lat: body.lat, lng: body.lng };
    const result = await env.DB.prepare(
      'INSERT INTO station_proposals (station_id, submitted_by, changes) VALUES (?, ?, ?)'
    ).bind(stationId, user.email, JSON.stringify(changes)).run();
    await eventStmt(env.DB, stationId, 'proposal_submitted', user, {
      proposal_id: result.meta.last_row_id, changes,
    }).run();
    return json({ ok: true, applied: false, pending: true });
  }

  // Non-admin confirmación/reporte simple: es una opinión, se aplica de
  // inmediato — así el mapa refleja la realidad sin esperar moderación.
  if (body.status === 'verified') {
    await env.DB.batch([
      env.DB.prepare(
        `UPDATE stations SET verification_status = 'verified',
           last_confirmed_at = datetime('now'), confirm_count = confirm_count + 1,
           open_reports = 0, updated_at = datetime('now') WHERE id = ?`
      ).bind(stationId),
      eventStmt(env.DB, stationId, 'confirmed_ok', user, {}),
    ]);
    invalidateStationsCache();
    ctx.waitUntil(syncStationToNotion(env, stationId));
    return json({ ok: true, applied: true });
  }

  // Reporte de problema: cuenta reportantes DISTINTOS desde la última
  // confirmación/resolución (derivado del historial). Con 2+ usuarios
  // distintos la estación se marca 'flagged'; un reporte aislado solo queda
  // registrado — así un solo usuario no puede degradar una estación.
  await eventStmt(env.DB, stationId, 'reported_issue', user, {}).run();
  const distinct = await env.DB.prepare(
    `SELECT COUNT(DISTINCT actor_email) AS n FROM station_events
      WHERE station_id = ?1 AND event_type = 'reported_issue'
        AND id > COALESCE(
          (SELECT MAX(id) FROM station_events
            WHERE station_id = ?1 AND event_type IN ('confirmed_ok', 'report_resolved')),
          0)`
  ).bind(stationId).first<{ n: number }>();
  const openReporters = distinct?.n ?? 1;
  await env.DB.prepare(
    `UPDATE stations SET open_reports = ?,
       verification_status = CASE WHEN ? >= 2 THEN 'flagged' ELSE verification_status END,
       updated_at = datetime('now') WHERE id = ?`
  ).bind(openReporters, openReporters, stationId).run();
  invalidateStationsCache();
  ctx.waitUntil(syncStationToNotion(env, stationId));
  return json({ ok: true, applied: true, openReports: openReporters });
}

async function handleDeleteStation(stationId: string, request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  const user = await getUserFromToken(request, env);
  if (!user || user.role !== 'admin') return apiError('Solo administradores pueden eliminar estaciones', 403);
  if (!env.DB) return apiError('Base de datos no configurada', 503);

  const station = await getStation(env.DB, stationId);
  if (!station) return apiError('Estación no encontrada', 404);

  // Sin borrado físico: la estación queda archivada (rejected) con su historial.
  await env.DB.batch([
    env.DB.prepare(
      "UPDATE stations SET approval_status = 'rejected', updated_at = datetime('now') WHERE id = ?"
    ).bind(stationId),
    eventStmt(env.DB, stationId, 'archived', user, { previous_status: station.approval_status }),
  ]);
  invalidateStationsCache();
  ctx.waitUntil(syncStationToNotion(env, stationId));
  return json({ ok: true });
}

// ─── Main fetch handler ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice(5); // strip '/api/'

      // Admin login (legacy): POST /api/admin/login
      if (path === 'admin/login' && request.method === 'POST') {
        const { password } = await request.json() as { password?: string };
        if (!env.ADMIN_PASSWORD) return apiError('Administración no configurada en el servidor', 503);
        if (!password || password !== env.ADMIN_PASSWORD) return apiError('Contraseña incorrecta', 401);
        return json({ ok: true });
      }

      // Auth endpoints
      if (path === 'auth/register' && request.method === 'POST') return handleRegister(request, env);
      if (path === 'auth/login' && request.method === 'POST') return handleLogin(request, env);
      if (path === 'auth/me' && request.method === 'GET') return handleGetMe(request, env);
      if (path === 'auth/me' && request.method === 'PATCH') return handleUpdateProfile(request, env);
      if (path === 'auth/change-password' && request.method === 'POST') return handleChangePassword(request, env);
      if (path === 'auth/set-subscription' && request.method === 'POST') return handleSetSubscription(request, env);
      if (path === 'auth/users' && request.method === 'GET') return handleListUsers(request, env);

      // Scan: GET /api/scan
      if (path === 'scan' && request.method === 'GET') return handleGetScan(env);

      // Resolve Google Maps URL → coordinates: GET /api/resolve-location?url=...
      if (path === 'resolve-location' && request.method === 'GET') {
        const mapsUrl = url.searchParams.get('url');
        if (!mapsUrl) return apiError('url requerido');

        // Helper: extract Guatemala-bounded coords from a URL string
        function extractCoordsFromUrl(u: string): { lat: number; lng: number } | null {
          const pin = u.match(/!3d(-?\d+\.?\d+)!4d(-?\d+\.?\d+)/);
          if (pin) return { lat: parseFloat(pin[1]), lng: parseFloat(pin[2]) };
          const at = u.match(/@(-?\d+\.?\d+),(-?\d+\.?\d+)[,z/]/);
          if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };
          const search = u.match(/\/search\/(-?\d+\.?\d+),\+?(-?\d+\.?\d+)/);
          if (search) return { lat: parseFloat(search[1]), lng: parseFloat(search[2]) };
          const q = u.match(/[?&]q=(-?\d+\.?\d+),(-?\d+\.?\d+)/);
          if (q) return { lat: parseFloat(q[1]), lng: parseFloat(q[2]) };
          return null;
        }

        // Helper: extract Guatemala-bounded coords from HTML body
        function extractCoordsFromBody(body: string): { lat: number; lng: number } | null {
          // !3d / !4d encoded coords
          const pin = body.match(/!3d(-?\d+\.?\d+)!4d(-?\d+\.?\d+)/);
          if (pin) return { lat: parseFloat(pin[1]), lng: parseFloat(pin[2]) };

          // @lat,lng,Xz pattern
          const at = body.match(/@(-?\d+\.?\d+),(-?\d+\.?\d+),[\d.]+z/);
          if (at) return { lat: parseFloat(at[1]), lng: parseFloat(at[2]) };

          // canonical URL
          const canon = body.match(/rel=["']canonical["'][^>]+href=["'][^"']*\/@(-?\d+\.?\d+),(-?\d+\.?\d+)/);
          if (canon) return { lat: parseFloat(canon[1]), lng: parseFloat(canon[2]) };

          // coords inside any google maps href/url/location in JS
          const jsUrl = body.match(/["'](https?:\/\/(?:www\.)?(?:maps\.app\.goo\.gl|google\.com\/maps|maps\.google\.com)[^"']{10,})["']/g);
          if (jsUrl) {
            for (const raw of jsUrl) {
              const u = raw.replace(/^["']|["']$/g, '');
              const c = extractCoordsFromUrl(u);
              if (c) return c;
            }
          }

          // "ll=lat,lng" or "center=lat,lng"
          const ll = body.match(/(?:ll|center)=(-?\d{1,2}\.\d{4,}),(-?\d{2,3}\.\d{4,})/);
          if (ll) return { lat: parseFloat(ll[1]), lng: parseFloat(ll[2]) };

          // Bare coordinate pair in Guatemala bounding box
          const bare = body.match(/\b(1[3-7]\.\d{5,})\b[^\d-]{1,10}\b(-9[0-3]\.\d{5,})\b/);
          if (bare) return { lat: parseFloat(bare[1]), lng: parseFloat(bare[2]) };

          return null;
        }

        // Google muestra una interstitial de "consentimiento" (consent.google.com) a
        // requests que no traen la cookie CONSENT — muy común desde IPs de datacenter
        // (como las de Cloudflare Workers), aunque el usuario esté en Guatemala. Sin
        // esta cookie, el fetch nunca llega a la URL real con las coordenadas.
        const consentCookie = 'CONSENT=YES+cb.20240101-17-p0.en+FX+435';
        const mobileUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4.1 Mobile/15E148 Safari/604.1';
        const desktopUA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

        // If a hop lands on Google's consent interstitial, the real destination is
        // already in its `continue` query param (URL-encoded) — no extra fetch needed.
        function extractContinueUrl(u: string): string | null {
          try {
            const parsed = new URL(u);
            if (!parsed.hostname.includes('consent.google.com')) return null;
            return parsed.searchParams.get('continue');
          } catch {
            return null;
          }
        }

        // Try every extraction strategy against one (url, body) pair, including
        // unwrapping a consent-page redirect if present.
        function extractCoords(finalUrl: string, body: string): { lat: number; lng: number } | null {
          const fromUrl = extractCoordsFromUrl(finalUrl);
          if (fromUrl) return fromUrl;
          const fromBody = extractCoordsFromBody(body);
          if (fromBody) return fromBody;
          const continueUrl = extractContinueUrl(finalUrl);
          if (continueUrl) {
            const fromContinue = extractCoordsFromUrl(continueUrl);
            if (fromContinue) return fromContinue;
          }
          return null;
        }

        async function fetchAttempt(target: string, ua: string, timeoutMs: number) {
          const res = await fetch(target, {
            redirect: 'follow',
            headers: {
              'User-Agent': ua,
              'Accept': 'text/html,application/xhtml+xml,*/*;q=0.9',
              'Accept-Language': 'es-GT,es;q=0.9,en-US;q=0.8',
              'Cookie': consentCookie,
            },
            signal: AbortSignal.timeout(timeoutMs),
          });
          const body = await res.text();
          return { finalUrl: res.url, body };
        }

        try {
          // — First attempt: follow HTTP redirects with mobile UA —
          const { finalUrl, body } = await fetchAttempt(mapsUrl, mobileUA, 10000);
          const found = extractCoords(finalUrl, body);
          if (found) return json(found);

          // — Second attempt: follow JS redirect via meta refresh, window.location,
          //   or an unresolved consent-page continue param —
          const metaRefresh = body.match(/content=["']0;\s*url=([^"']+)["']/i);
          const windowLoc = body.match(/(?:window\.location(?:\.replace)?|location\.href)\s*[=(]\s*["']([^"']+maps[^"']+)["']/i);
          const continueUrl = extractContinueUrl(finalUrl);
          const fallbackUrl = metaRefresh?.[1] || windowLoc?.[1] || continueUrl;

          if (fallbackUrl) {
            const attempt2 = await fetchAttempt(fallbackUrl, desktopUA, 8000);
            const found2 = extractCoords(attempt2.finalUrl, attempt2.body);
            if (found2) return json(found2);
          }

          // — Third attempt: retry with desktop UA (some short links expand differently) —
          if (mapsUrl.includes('goo.gl') || mapsUrl.includes('maps.app')) {
            const attempt3 = await fetchAttempt(mapsUrl, desktopUA, 8000);
            const found3 = extractCoords(attempt3.finalUrl, attempt3.body);
            if (found3) return json(found3);
          }

          return apiError('No se pudieron extraer coordenadas. Intenta abrir el link en el navegador, presionar "Compartir" → "Copiar enlace" y pegar ese link aquí, o usa "Elegir en el mapa".');
        } catch (e) {
          return apiError('Error resolviendo URL: ' + String(e));
        }
      }

      // Geocode a free-text address (Guatemala only) → approximate coordinates, to
      // pre-center the "Elegir en el mapa" picker before the user fine-tunes the pin.
      // Proxied server-side because Nominatim's usage policy requires an identifying
      // User-Agent, which browsers won't let client-side fetch() set.
      if (path === 'geocode' && request.method === 'GET') {
        const q = url.searchParams.get('q');
        if (!q || !q.trim()) return apiError('q requerido');
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=gt&q=${encodeURIComponent(q.trim())}`,
            { headers: { 'User-Agent': 'EVGuatemalaMap/1.0 (https://ev-guatemala-map.rafamejia-ai360.workers.dev)' }, signal: AbortSignal.timeout(8000) }
          );
          if (!res.ok) return apiError('Error del servicio de geocodificación');
          const results = await res.json() as { lat: string; lon: string }[];
          if (!results.length) return apiError('No se encontró esa dirección. Ajusta el pin manualmente.');
          return json({ lat: parseFloat(results[0].lat), lng: parseFloat(results[0].lon) });
        } catch (e) {
          return apiError('Error geocodificando: ' + String(e));
        }
      }

      // Dynamic stations: GET /api/stations/dynamic, POST /api/stations
      // Fase 2 (lectura en sombra): /api/stations lee D1; /api/stations/dynamic
      // sigue leyendo Notion hasta completar el corte de lecturas (Fase 3).
      if (path === 'stations' && request.method === 'GET') return handleGetStationsFromD1(env);
      if (path === 'stations/dynamic' && request.method === 'GET') return handleGetDynamicStations(env);
      if (path === 'stations/pending' && request.method === 'GET') return handleGetPendingStations(request, env);
      if (path === 'stations' && request.method === 'POST') return handlePostStation(request, env, ctx);

      // Station approve/reject: POST /api/stations/:id/approve|reject
      const stationActionMatch = path.match(/^stations\/([^/]+)\/(approve|reject)$/);
      if (stationActionMatch && request.method === 'POST') {
        const [, sid, action] = stationActionMatch;
        if (action === 'approve') return handleStationApprove(sid, request, env, ctx);
        if (action === 'reject') return handleStationReject(sid, request, env, ctx);
      }

      // Field verification: POST /api/stations/:id/verify (any logged-in user)
      const stationVerifyMatch = path.match(/^stations\/([^/]+)\/verify$/);
      if (stationVerifyMatch && request.method === 'POST') {
        return handleVerifyStation(stationVerifyMatch[1], request, env, ctx);
      }

      // Station edit / delete: PATCH|DELETE /api/stations/:id
      const stationMatch = path.match(/^stations\/([^/]+)$/);
      if (stationMatch) {
        const sid = stationMatch[1];
        if (request.method === 'PATCH') return handlePatchStation(sid, request, env, ctx);
        if (request.method === 'DELETE') return handleDeleteStation(sid, request, env, ctx);
      }

      // Reviews CRUD
      if (path === 'reviews') {
        if (request.method === 'GET') {
          const sid = url.searchParams.get('stationId');
          return sid ? handleGetReviews(sid, env) : apiError('stationId requerido');
        }
        if (request.method === 'POST') return handlePostReview(request, env);
      }

      // Individual review edit/delete: /api/reviews/:id
      const reviewMatch = path.match(/^reviews\/([a-zA-Z0-9-]+)$/);
      if (reviewMatch) {
        const id = reviewMatch[1];
        if (request.method === 'PATCH') return handleUpdateReview(id, request, env);
        if (request.method === 'DELETE') return handleDeleteReview(id, env);
      }

      if (path === 'ratings' && request.method === 'GET') return handleGetRatings(env);

      // Photos list + upload
      if (path === 'photos') {
        if (request.method === 'GET') {
          const sid = url.searchParams.get('stationId');
          return sid ? handleGetPhotos(sid, env) : apiError('stationId requerido');
        }
        if (request.method === 'POST') return handlePostPhoto(request, env);
        if (request.method === 'DELETE') return handleDeletePhoto(url, env);
      }

      // Serve individual photo binary: /api/photo/:id
      const photoMatch = path.match(/^photo\/(.+)$/);
      if (photoMatch) {
        if (request.method === 'GET') return handleGetPhoto(photoMatch[1], env);
      }

      return apiError('Ruta no encontrada', 404);
    }

    return env.ASSETS.fetch(request);
  },

  // Cron diario (wrangler.toml [triggers]): respaldo a R2 + frescura.
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runNightlyMaintenance(env));
  },
};
