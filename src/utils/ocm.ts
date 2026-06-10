import { haversineKm } from './geo';

const OCM_BASE = 'https://api.openchargemap.io/v3/poi/';
const OCM_API_KEY = import.meta.env.VITE_OCM_API_KEY as string | undefined;

export interface OCMStation {
  ID: number;
  AddressInfo: {
    Title: string;
    AddressLine1?: string | null;
    Town?: string | null;
    Latitude: number;
    Longitude: number;
  };
  StatusType?: {
    ID: number;
    IsOperational: boolean | null;
    Title: string;
  } | null;
  Connections?: Array<{
    ConnectionType?: { ID?: number; FormalName?: string } | null;
    PowerKW?: number | null;
    CurrentType?: { Description?: string } | null;
  }> | null;
  OperatorInfo?: { Title?: string } | null;
}

export async function fetchGTStations(): Promise<OCMStation[]> {
  if (!OCM_API_KEY) throw new Error('NO_API_KEY');
  const params = new URLSearchParams({
    output: 'json',
    countrycode: 'GT',
    maxresults: '500',
    compact: 'false',
    verbose: 'false',
    includecomments: 'false',
  });
  const res = await fetch(`${OCM_BASE}?${params}`, {
    cache: 'no-store',
    headers: { 'X-API-Key': OCM_API_KEY },
  });
  if (!res.ok) throw new Error(`OCM ${res.status}`);
  return res.json();
}

export type LocalStatus = 'active' | 'maintenance' | 'offline';

export function ocmToLocalStatus(station: OCMStation): LocalStatus {
  const op = station.StatusType?.IsOperational;
  const id = station.StatusType?.ID ?? 0;
  if (op === true || id === 10 || id === 50) return 'active';
  if (op === false || id === 100 || id === 200) return 'offline';
  if (id === 75 || id === 20 || id === 30) return 'maintenance';
  return 'active';
}

const CONN_MAP: Record<number, string> = {
  1: 'J1772', 2: 'CHAdeMO', 3: 'GBT',
  25: 'Type2', 30: 'Type2',
  32: 'CCS1', 33: 'CCS2',
};

export function ocmConnTypeName(conn: NonNullable<OCMStation['Connections']>[number]): string {
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

export function findClosestLocal<T extends { lat: number; lng: number }>(
  ocmLat: number,
  ocmLng: number,
  locals: T[],
  thresholdKm = 0.6,
): T | null {
  let closest: T | null = null;
  let minDist = thresholdKm;
  for (const local of locals) {
    const d = haversineKm(ocmLat, ocmLng, local.lat, local.lng);
    if (d < minDist) { minDist = d; closest = local; }
  }
  return closest;
}
