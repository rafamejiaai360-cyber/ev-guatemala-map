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

// GET /api/reviews?stationId=xxx
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
  const reviews = data.results.map(pageToReview);
  return json(reviews);
}

// GET /api/ratings — devuelve {[stationId]: {avg, count}} para toda la sidebar
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

// POST /api/reviews
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
  return json({ id: created.id, ok: true }, 201);
}

// Notion page helpers
interface NotionPage {
  id: string;
  created_time: string;
  properties: Record<string, NotionProp>;
}
interface NotionProp {
  number?: number;
  rich_text?: { text: { content: string } }[];
  created_time?: string;
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

      return apiError('Ruta no encontrada', 404);
    }

    return env.ASSETS.fetch(request);
  },
};
