export interface Env {
  ASSETS: Fetcher;
  NOTION_TOKEN: string;
  NOTION_REVIEWS_DB_ID: string;
  NOTION_STATIONS_DB_ID: string;
  PHOTOS?: KVNamespace;
  OCM_API_KEY?: string;
  ADMIN_PASSWORD?: string;
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

// ─── Station helpers ──────────────────────────────────────────────────────────

async function findStationPageId(stationId: string, env: Env): Promise<string | null> {
  const res = await fetch(`${NOTION_API}/databases/${env.NOTION_STATIONS_DB_ID}/query`, {
    method: 'POST',
    headers: notionHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({
      filter: { property: 'Station ID', rich_text: { equals: stationId } },
      page_size: 1,
    }),
  });
  if (!res.ok) return null;
  const data = await res.json() as { results: { id: string }[] };
  return data.results[0]?.id ?? null;
}

async function updateStationStats(stationId: string, env: Env): Promise<void> {
  const res = await fetch(`${NOTION_API}/databases/${env.NOTION_REVIEWS_DB_ID}/query`, {
    method: 'POST',
    headers: notionHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({
      filter: { property: 'Station ID', rich_text: { equals: stationId } },
      page_size: 100,
    }),
  });
  if (!res.ok) return;

  const data = await res.json() as { results: NotionPage[] };
  const ratings = data.results.map(p => p.properties['Rating']?.number ?? 0).filter(r => r > 0);
  if (!ratings.length) return;

  const avg = Math.round((ratings.reduce((a, b) => a + b, 0) / ratings.length) * 10) / 10;
  const pageId = await findStationPageId(stationId, env);
  if (!pageId) return;

  await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: 'PATCH',
    headers: notionHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({
      properties: {
        'Rating Promedio': { number: avg },
        'Total Reseñas': { number: ratings.length },
      },
    }),
  });
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

async function getAllNotionStationCoords(env: Env): Promise<{ lat: number; lng: number; stationId: string }[]> {
  const results: { lat: number; lng: number; stationId: string }[] = [];
  let cursor: string | undefined;

  do {
    const body: Record<string, unknown> = { page_size: 100 };
    if (cursor) body.start_cursor = cursor;

    const res = await fetch(`${NOTION_API}/databases/${env.NOTION_STATIONS_DB_ID}/query`, {
      method: 'POST',
      headers: notionHeaders(env.NOTION_TOKEN),
      body: JSON.stringify(body),
    });
    if (!res.ok) break;

    const data = await res.json() as { results: NotionPage[]; has_more: boolean; next_cursor?: string };

    for (const page of data.results) {
      const lat = page.properties['Latitud']?.number ?? null;
      const lng = page.properties['Longitud']?.number ?? null;
      const stationId = richText(page.properties['Station ID']);
      if (lat !== null && lng !== null && !isNaN(lat) && !isNaN(lng)) {
        results.push({ lat, lng, stationId });
      }
    }

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return results;
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
  // Load all existing station coords from Notion (source of truth)
  const existing = await getAllNotionStationCoords(env);

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

async function handlePostStation(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    id: string; name: string; address?: string;
    zone?: string; lat: number; lng: number;
    network?: string; status?: string;
    connectors?: Array<{ type: string; power_kw: number; level: string }>;
    access?: string; source?: string;
  };

  if (!body.id || !body.name || body.lat == null || body.lng == null) {
    return apiError('id, name, lat y lng son requeridos');
  }

  // Ensure no duplicate by checking ID
  const existing = await findStationPageId(body.id, env);
  if (existing) return apiError('Esta estación ya existe en la base de datos', 409);

  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: notionHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({
      parent: { database_id: env.NOTION_STATIONS_DB_ID },
      properties: {
        'Nombre': { title: [{ text: { content: body.name } }] },
        'Station ID': { rich_text: [{ text: { content: body.id } }] },
        'Latitud': { number: body.lat },
        'Longitud': { number: body.lng },
        'Zona': { rich_text: [{ text: { content: body.zone ?? 'Guatemala' } }] },
        'Red': { rich_text: [{ text: { content: body.network ?? 'Desconocido' } }] },
        'Dirección': { rich_text: [{ text: { content: body.address ?? '' } }] },
        'Conectores': { rich_text: [{ text: { content: JSON.stringify(body.connectors ?? []) } }] },
        'Acceso': { rich_text: [{ text: { content: body.access ?? 'public' } }] },
        'Fuente': { rich_text: [{ text: { content: body.source ?? 'Manual' } }] },
        'Estado': { select: { name: 'Activo' } },
      },
    }),
  });

  if (!res.ok) {
    console.error('Notion create station error:', await res.text());
    return apiError('Error guardando estación en Notion', 502);
  }

  const page = await res.json() as { id: string };
  return json({ ok: true, notionId: page.id }, 201);
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
      });
    }

    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return json(results);
}

// ─── Review handlers ──────────────────────────────────────────────────────────

async function handleGetReviews(stationId: string, env: Env): Promise<Response> {
  const res = await fetch(`${NOTION_API}/databases/${env.NOTION_REVIEWS_DB_ID}/query`, {
    method: 'POST',
    headers: notionHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({
      filter: { property: 'Station ID', rich_text: { equals: stationId } },
      sorts: [{ timestamp: 'created_time', direction: 'descending' }],
      page_size: 50,
    }),
  });
  if (!res.ok) return apiError('Error consultando Notion', 502);
  const data = await res.json() as { results: NotionPage[] };
  return json(data.results.map(pageToReview));
}

async function handleGetRatings(env: Env): Promise<Response> {
  const res = await fetch(`${NOTION_API}/databases/${env.NOTION_REVIEWS_DB_ID}/query`, {
    method: 'POST',
    headers: notionHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({ page_size: 100 }),
  });
  if (!res.ok) return json({});

  const data = await res.json() as { results: NotionPage[] };
  const agg: Record<string, { sum: number; count: number }> = {};
  for (const page of data.results) {
    const sid = richText(page.properties['Station ID']);
    const rating = page.properties['Rating']?.number;
    if (sid && rating) {
      if (!agg[sid]) agg[sid] = { sum: 0, count: 0 };
      agg[sid].sum += rating;
      agg[sid].count += 1;
    }
  }
  const result: Record<string, { avg: number; count: number }> = {};
  for (const [sid, { sum, count }] of Object.entries(agg)) {
    result[sid] = { avg: Math.round((sum / count) * 10) / 10, count };
  }
  return json(result);
}

async function handlePostReview(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    stationId: string; stationName: string;
    rating: number; text?: string; author?: string;
  };
  const { stationId, stationName, rating, text = '', author = 'Anónimo' } = body;
  if (!stationId || !rating || rating < 1 || rating > 5) {
    return apiError('stationId y rating (1-5) son requeridos');
  }

  const dateStr = new Date().toLocaleDateString('es-GT', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const res = await fetch(`${NOTION_API}/pages`, {
    method: 'POST',
    headers: notionHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({
      parent: { database_id: env.NOTION_REVIEWS_DB_ID },
      properties: {
        'Título': { title: [{ text: { content: `${stationName} — ${dateStr}` } }] },
        'Station ID': { rich_text: [{ text: { content: stationId } }] },
        'Nombre Estación': { rich_text: [{ text: { content: stationName } }] },
        'Rating': { number: rating },
        'Reseña': { rich_text: [{ text: { content: text } }] },
        'Autor': { rich_text: [{ text: { content: author } }] },
      },
    }),
  });

  if (!res.ok) { console.error('Notion error:', await res.text()); return apiError('Error guardando reseña', 502); }

  const created = await res.json() as { id: string };
  (async () => { try { await updateStationStats(stationId, env); } catch {} })();
  return json({ id: created.id, ok: true }, 201);
}

async function handleUpdateReview(id: string, request: Request, env: Env): Promise<Response> {
  const body = await request.json() as { rating?: number; text?: string };
  const properties: Record<string, unknown> = {};
  if (body.rating) {
    if (body.rating < 1 || body.rating > 5) return apiError('Rating debe ser 1-5');
    properties['Rating'] = { number: body.rating };
  }
  if (body.text !== undefined) {
    properties['Reseña'] = { rich_text: [{ text: { content: body.text } }] };
  }

  const res = await fetch(`${NOTION_API}/pages/${id}`, {
    method: 'PATCH',
    headers: notionHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({ properties }),
  });
  if (!res.ok) return apiError('Error actualizando reseña', 502);
  return json({ ok: true });
}

async function handleDeleteReview(id: string, env: Env): Promise<Response> {
  const res = await fetch(`${NOTION_API}/pages/${id}`, {
    method: 'PATCH',
    headers: notionHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({ archived: true }),
  });
  if (!res.ok) return apiError('Error eliminando reseña', 502);
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

function photoUrl(request: Request, photoId: string): string {
  return `${new URL(request.url).origin}/api/photo/${photoId}`;
}

async function getStationFotos(pageId: string, env: Env): Promise<NotionFile[]> {
  const res = await fetch(`${NOTION_API}/pages/${pageId}`, { headers: notionHeaders(env.NOTION_TOKEN) });
  if (!res.ok) return [];
  const page = await res.json() as { properties: Record<string, NotionProp> };
  return page.properties['Fotos']?.files ?? [];
}

async function updateStationFotos(pageId: string, files: unknown[], env: Env): Promise<void> {
  await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: 'PATCH',
    headers: notionHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({ properties: { Fotos: { files } } }),
  });
}

// ─── Photo handlers ───────────────────────────────────────────────────────────

async function handleGetPhotos(stationId: string, env: Env): Promise<Response> {
  const pageId = await findStationPageId(stationId, env);
  if (!pageId) return json([]);

  const files = await getStationFotos(pageId, env);
  const photos = files
    .filter(f => f.type === 'external' && f.external?.url?.includes('/api/photo/'))
    .map(f => {
      const url = f.external!.url;
      const id = url.split('/api/photo/').pop() ?? '';
      return { id, url: `/api/photo/${id}` };
    });
  return json(photos);
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

  const bytes = base64ToUint8Array(imageBase64);
  const photoId = `${stationId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await env.PHOTOS.put(photoId, bytes.buffer, { metadata: { contentType: mimeType } });

  const pUrl = photoUrl(request, photoId);
  const pageId = await findStationPageId(stationId, env);
  if (!pageId) {
    await env.PHOTOS.delete(photoId);
    return apiError(`Estación ${stationId} no encontrada`, 404);
  }

  const existing = await getStationFotos(pageId, env);
  const kept = existing
    .filter(f => f.type === 'external' && f.external?.url)
    .map(f => ({ name: f.name ?? 'foto', type: 'external', external: { url: f.external!.url } }));

  await updateStationFotos(pageId, [...kept, { name: 'foto', type: 'external', external: { url: pUrl } }], env);

  return json({ photoId, url: `/api/photo/${photoId}` }, 201);
}

async function handleDeletePhoto(url: URL, env: Env): Promise<Response> {
  const photoId = url.searchParams.get('photoId');
  const stationId = url.searchParams.get('stationId');
  if (!photoId || !stationId) return apiError('photoId y stationId requeridos');

  if (env.PHOTOS) await env.PHOTOS.delete(photoId);

  const pageId = await findStationPageId(stationId, env);
  if (pageId) {
    const existing = await getStationFotos(pageId, env);
    const filtered = existing
      .filter(f => !(f.type === 'external' && f.external?.url?.includes(photoId)))
      .filter(f => f.type === 'external' && f.external?.url)
      .map(f => ({ name: f.name ?? 'foto', type: 'external', external: { url: f.external!.url } }));
    await updateStationFotos(pageId, filtered, env);
  }

  return json({ ok: true });
}

// ─── Main fetch handler ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice(5); // strip '/api/'

      // Admin login: POST /api/admin/login
      if (path === 'admin/login' && request.method === 'POST') {
        const { password } = await request.json() as { password?: string };
        if (!env.ADMIN_PASSWORD) return apiError('Administración no configurada en el servidor', 503);
        if (!password || password !== env.ADMIN_PASSWORD) return apiError('Contraseña incorrecta', 401);
        return json({ ok: true });
      }

      // Scan: GET /api/scan
      if (path === 'scan' && request.method === 'GET') return handleGetScan(env);

      // Resolve Google Maps URL → coordinates: GET /api/resolve-location?url=...
      if (path === 'resolve-location' && request.method === 'GET') {
        const mapsUrl = url.searchParams.get('url');
        if (!mapsUrl) return apiError('url requerido');
        try {
          const res = await fetch(mapsUrl, {
            redirect: 'follow',
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; EV-Guatemala-Map/1.0)' },
            signal: AbortSignal.timeout(8000),
          });
          const finalUrl = res.url;

          // Pattern 1: !3d{lat}!4d{lng} (place pin)
          const pinMatch = finalUrl.match(/!3d(-?\d+\.?\d+)!4d(-?\d+\.?\d+)/);
          if (pinMatch) return json({ lat: parseFloat(pinMatch[1]), lng: parseFloat(pinMatch[2]) });

          // Pattern 2: /search/{lat},+{lng}
          const searchMatch = finalUrl.match(/\/search\/(-?\d+\.?\d+),\+?(-?\d+\.?\d+)/);
          if (searchMatch) return json({ lat: parseFloat(searchMatch[1]), lng: parseFloat(searchMatch[2]) });

          // Pattern 3: /@{lat},{lng},{zoom}z
          const atMatch = finalUrl.match(/@(-?\d+\.?\d+),(-?\d+\.?\d+),[\d.]+z/);
          if (atMatch) return json({ lat: parseFloat(atMatch[1]), lng: parseFloat(atMatch[2]) });

          return apiError('No se pudieron extraer coordenadas del URL de Google Maps');
        } catch (e) {
          return apiError('Error resolviendo URL: ' + String(e));
        }
      }

      // Dynamic stations: GET /api/stations/dynamic, POST /api/stations
      if (path === 'stations/dynamic' && request.method === 'GET') return handleGetDynamicStations(env);
      if (path === 'stations' && request.method === 'POST') return handlePostStation(request, env);

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
};
