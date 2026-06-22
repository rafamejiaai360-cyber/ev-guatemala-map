export interface Env {
  ASSETS: Fetcher;
  NOTION_TOKEN: string;
  NOTION_REVIEWS_DB_ID: string;
  NOTION_STATIONS_DB_ID: string;
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
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

function apiError(msg: string, status = 400): Response {
  return json({ error: msg }, status);
}

// ─── Notion page types ───────────────────────────────────────────────────────

interface NotionPage {
  id: string;
  created_time: string;
  properties: Record<string, NotionProp>;
}

interface NotionProp {
  number?: number;
  rich_text?: { text: { content: string } }[];
  created_time?: string;
  files?: NotionFile[];
}

interface NotionFile {
  name?: string;
  type?: string;
  file?: { url: string; expiry_time: string };
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

// ─── Station helpers ─────────────────────────────────────────────────────────

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
  // Recalculate avg rating + count from all reviews for this station
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
  const count = ratings.length;

  const pageId = await findStationPageId(stationId, env);
  if (!pageId) return;

  await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: 'PATCH',
    headers: notionHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({
      properties: {
        'Rating Promedio': { number: avg },
        'Total Reseñas': { number: count },
      },
    }),
  });
}

// ─── Photo upload helpers ─────────────────────────────────────────────────────

function base64ToUint8Array(base64: string): Uint8Array {
  const b64 = base64.includes(',') ? base64.split(',')[1] : base64;
  const binaryStr = atob(b64);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  return bytes;
}

async function uploadPhotoToNotion(
  imageBase64: string,
  mimeType: string,
  filename: string,
  env: Env,
): Promise<string | null> {
  // Step 1: Initialize file upload
  const initRes = await fetch(`${NOTION_API}/file_uploads`, {
    method: 'POST',
    headers: notionHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({ mode: 'single_part', filename, content_type: mimeType }),
  });

  if (!initRes.ok) {
    console.error('File upload init failed:', await initRes.text());
    return null;
  }

  const init = await initRes.json() as { id: string };
  const fileUploadId = init.id;

  // Step 2: Upload binary content as multipart/form-data
  const imageBytes = base64ToUint8Array(imageBase64);
  const boundary = `----CFBoundary${Date.now().toString(36)}`;

  const enc = new TextEncoder();
  const headerPart = enc.encode(
    `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
  );
  const footerPart = enc.encode(`\r\n--${boundary}--\r\n`);

  const body = new Uint8Array(headerPart.length + imageBytes.length + footerPart.length);
  body.set(headerPart, 0);
  body.set(imageBytes, headerPart.length);
  body.set(footerPart, headerPart.length + imageBytes.length);

  const uploadRes = await fetch(`${NOTION_API}/file_uploads/${fileUploadId}/send`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
      'Notion-Version': '2022-06-28',
    },
    body,
  });

  if (!uploadRes.ok) {
    console.error('File upload content failed:', await uploadRes.text());
    return null;
  }

  return fileUploadId;
}

async function appendPhotoToStation(pageId: string, fileUploadId: string, env: Env): Promise<boolean> {
  // Get existing files first
  const pageRes = await fetch(`${NOTION_API}/pages/${pageId}`, {
    headers: notionHeaders(env.NOTION_TOKEN),
  });

  const existingFiles: unknown[] = [];
  if (pageRes.ok) {
    const page = await pageRes.json() as { properties: Record<string, NotionProp> };
    const existing = page.properties['Fotos']?.files ?? [];
    // Re-encode existing files as external refs (internal files have temporary URLs,
    // so we preserve only external ones; new ones will be file_uploads)
    for (const f of existing) {
      if (f.type === 'external' && f.external?.url) {
        existingFiles.push({ type: 'external', name: f.name ?? 'foto', external: { url: f.external.url } });
      } else if (f.file?.url) {
        // Include internal files by their current URL (they may expire but Notion keeps them)
        existingFiles.push({ type: 'external', name: f.name ?? 'foto', external: { url: f.file.url } });
      }
    }
  }

  const allFiles = [
    ...existingFiles,
    { type: 'file_upload', file_upload: { id: fileUploadId } },
  ];

  const patchRes = await fetch(`${NOTION_API}/pages/${pageId}`, {
    method: 'PATCH',
    headers: notionHeaders(env.NOTION_TOKEN),
    body: JSON.stringify({ properties: { Fotos: { files: allFiles } } }),
  });

  if (!patchRes.ok) {
    console.error('Attach photo failed:', await patchRes.text());
  }
  return patchRes.ok;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

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
    stationId: string;
    stationName: string;
    rating: number;
    text?: string;
    author?: string;
  };

  const { stationId, stationName, rating, text = '', author = 'Anónimo' } = body;
  if (!stationId || !rating || rating < 1 || rating > 5) {
    return apiError('stationId y rating (1-5) son requeridos');
  }

  const dateStr = new Date().toLocaleDateString('es-GT', {
    day: '2-digit', month: '2-digit', year: 'numeric',
  });

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

  if (!res.ok) {
    const err = await res.text();
    console.error('Notion error:', err);
    return apiError('Error guardando reseña en Notion', 502);
  }

  const created = await res.json() as { id: string };

  // Fire-and-forget: update station's Rating Promedio + Total Reseñas
  env.ASSETS.fetch.bind(env); // keep env in scope (CF Workers pattern)
  (async () => { try { await updateStationStats(stationId, env); } catch {} })();

  return json({ id: created.id, ok: true }, 201);
}

async function handlePostPhoto(request: Request, env: Env): Promise<Response> {
  const body = await request.json() as {
    stationId: string;
    stationName: string;
    imageBase64: string;
    mimeType?: string;
    filename?: string;
  };

  const {
    stationId,
    stationName,
    imageBase64,
    mimeType = 'image/jpeg',
    filename = `${stationId}_${Date.now()}.jpg`,
  } = body;

  if (!stationId || !imageBase64) {
    return apiError('stationId e imageBase64 son requeridos');
  }

  // Find station page
  const pageId = await findStationPageId(stationId, env);
  if (!pageId) {
    return apiError(`No se encontró página para la estación ${stationId}`, 404);
  }

  // Upload to Notion
  const fileUploadId = await uploadPhotoToNotion(imageBase64, mimeType, filename, env);
  if (!fileUploadId) {
    return apiError('No se pudo subir la foto a Notion', 502);
  }

  // Attach to station page
  const ok = await appendPhotoToStation(pageId, fileUploadId, env);
  if (!ok) {
    return apiError('No se pudo adjuntar la foto a la estación', 502);
  }

  return json({ ok: true, fileUploadId }, 201);
}

// ─── Main fetch handler ───────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        },
      });
    }

    if (url.pathname.startsWith('/api/')) {
      const path = url.pathname.slice(5); // remove '/api/'

      if (path === 'reviews') {
        if (request.method === 'GET') {
          const stationId = url.searchParams.get('stationId');
          if (!stationId) return apiError('stationId requerido');
          return handleGetReviews(stationId, env);
        }
        if (request.method === 'POST') return handlePostReview(request, env);
      }

      if (path === 'ratings' && request.method === 'GET') {
        return handleGetRatings(env);
      }

      if (path === 'photos' && request.method === 'POST') {
        return handlePostPhoto(request, env);
      }

      return apiError('Ruta no encontrada', 404);
    }

    return env.ASSETS.fetch(request);
  },
};
