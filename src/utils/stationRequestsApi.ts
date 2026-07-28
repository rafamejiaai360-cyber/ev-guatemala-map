const BASE = '/api';

export interface StationUseRequest {
  stationId: string;
  name: string;
  phone: string;
  vehicle?: string;
  preferredDate?: string;
  message?: string;
}

export async function requestStationUse(data: StationUseRequest): Promise<{ ok: boolean; id: string }> {
  const { stationId, ...body } = data;
  const res = await fetch(`${BASE}/stations/${encodeURIComponent(stationId)}/request-use`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Error enviando solicitud' })) as { error?: string };
    throw new Error(err.error || 'Error enviando solicitud');
  }
  return res.json();
}
