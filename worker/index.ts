export interface Env {
  ASSETS: Fetcher;
  NOTION_TOKEN: string;
  NOTION_REVIEWS_DB_ID: string;
  NOTION_STATIONS_DB_ID: string;
  PHOTOS?: KVNamespace; // set up with: npx wrangler kv namespace create PHOTOS
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
  number?: number;
  rich_text?: { text: { content: string } }[];
  files?: NotionFile[];
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
  // fire-and-forget stats update
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

  // fire-and-forget: we don't have stationId here but ratings will refresh on next load
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
    return new Response('KV no configurado. Crea el namespace con: npx wrangler kv namespace create PHOTOS', { status: 503 });
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
    return apiError('Almacenamiento de fotos no configurado. Configura KV namespace PHOTOS.', 503);
  }

  const body = await request.json() as {
    stationId: string; stationName: string;
    imageBase64: string; mimeType?: string; filename?: string;
  };
  const { stationId, imageBase64, mimeType = 'image/jpeg' } = body;
  if (!stationId || !imageBase64) return apiError('stationId e imageBase64 son requeridos');

  // Decode and store binary in KV
  const bytes = base64ToUint8Array(imageBase64);
  const photoId = `${stationId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  await env.PHOTOS.put(photoId, bytes.buffer, {
    metadata: { contentType: mimeType },
  });

  // Get station page and append photo URL to Fotos
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

  // Delete from KV
  if (env.PHOTOS) await env.PHOTOS.delete(photoId);

  // Remove from Notion Fotos
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
