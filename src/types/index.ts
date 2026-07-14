export type ConnectorType = 'CCS2' | 'CHAdeMO' | 'Type2' | 'J1772' | 'GBT' | 'CCS1';

export type ChargerStatus = 'active' | 'maintenance' | 'offline';

export type ChargerLevel = 'L1' | 'L2' | 'DC';

export interface Connector {
  type: ConnectorType;
  power_kw: number;
  level: ChargerLevel;
}

export type VerificationStatus = 'pending' | 'verified' | 'error';

// Estado real de frescura que expone la API desde D1:
// verified = confirmada hace <90 dias y sin reportes abiertos
// stale    = la ultima confirmacion ya envejecio
// flagged  = 2+ usuarios distintos reportaron un problema
export type FreshnessStatus = 'pending' | 'verified' | 'stale' | 'flagged';

export interface ChargerStation {
  id: string;
  name: string;
  address: string;
  zone: string;
  lat: number;
  lng: number;
  status: ChargerStatus;
  connectors: Connector[];
  network: string;
  access: 'public' | 'semi-public' | 'private';
  notes?: string;
  image_url?: string;
  verification?: VerificationStatus;
  freshness?: FreshnessStatus;
  lastConfirmedAt?: string;
  confirmCount?: number;
  openReports?: number;
  googleMapsUrl?: string;
}

export interface Review {
  id: string;
  stationId: string;
  stationName: string;
  rating: number;
  text: string;
  author: string;
  date: string;
}

export interface RatingInfo {
  avg: number;
  count: number;
}

export interface Vehicle {
  id: string;
  brand: string;
  model: string;
  year: string;
  battery_kwh: number;
  range_km: number;
  compatible_connectors: ConnectorType[];
}
