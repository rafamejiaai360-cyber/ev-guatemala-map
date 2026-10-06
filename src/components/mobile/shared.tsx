import type { ChargerStation, Connector } from '../../types';
import { haversineKm, formatDistance } from '../../utils/geo';

export const STATUS_LABEL: Record<string, string> = {
  active: 'Activa',
  maintenance: 'Mantenimiento',
  offline: 'Fuera de servicio',
};
export const TYPE_LABEL: Record<string, string> = { public: 'Pública', residential: 'Residencial' };
export const TYPE_COLOR: Record<string, string> = { public: '#22c55e', residential: '#3b82f6' };
export const ACCESS_LABEL: Record<string, string> = {
  public: 'Acceso público',
  'semi-public': 'Acceso semi-público',
  private: 'Acceso privado',
};
const CONNECTOR_NAME: Record<string, string> = {
  Type2: 'Tipo 2',
  J1772: 'J1772',
  CCS2: 'CCS2',
  CCS1: 'CCS1',
  CHAdeMO: 'CHAdeMO',
  GBT: 'GB/T',
};
const LEVEL_NAME: Record<string, string> = { DC: 'Carga rápida DC', L2: 'Corriente alterna AC', L1: 'Corriente alterna AC (lenta)' };

export function stationType(s: ChargerStation) {
  return s.type ?? 'public';
}
export function connectorName(type: string) {
  return CONNECTOR_NAME[type] ?? type;
}
export function levelName(c: Connector) {
  return LEVEL_NAME[c.level] ?? c.level;
}
export function formatKw(kw: number) {
  return `${String(kw).replace('.', ',')} kW`;
}
export function maxKw(s: ChargerStation) {
  return s.connectors.reduce((m, c) => Math.max(m, c.power_kw || 0), 0);
}
export function connectorTypes(s: ChargerStation) {
  return Array.from(new Set(s.connectors.map((c) => connectorName(c.type))));
}
export function distanceKm(s: ChargerStation, loc: { lat: number; lng: number } | null) {
  return loc ? haversineKm(loc.lat, loc.lng, s.lat, s.lng) : null;
}
export function distanceLabel(km: number | null) {
  return km === null ? null : formatDistance(km).replace('.', ',');
}
export function googleMapsUrl(s: ChargerStation, loc: { lat: number; lng: number } | null) {
  const destination = encodeURIComponent(`${s.name}, ${s.address}, ${s.zone || 'Guatemala'}`);
  return loc
    ? `https://www.google.com/maps/dir/?api=1&origin=${loc.lat},${loc.lng}&destination=${destination}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
}
export function wazeUrl(s: ChargerStation) {
  return `https://waze.com/ul?ll=${s.lat},${s.lng}&navigate=yes`;
}

/* ---------- Íconos de línea (mismo trazo en toda la navegación) ---------- */
export const Icon = {
  bolt: <svg viewBox="0 0 24 24"><path d="M13.2 2 5 13.4h6l-1.2 8.6L18 10.6h-6z" /></svg>,
  map: <svg viewBox="0 0 24 24"><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2zM9 4v14M15 6v14" /></svg>,
  list: <svg viewBox="0 0 24 24"><path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" /></svg>,
  activity: <svg viewBox="0 0 24 24"><path d="M3 12h4l3-8 4 16 3-8h4" /></svg>,
  star: <svg viewBox="0 0 24 24"><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8L3.5 9.7l5.9-.9z" /></svg>,
  user: <svg viewBox="0 0 24 24"><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></svg>,
  plus: <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>,
  pin: <svg viewBox="0 0 24 24"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></svg>,
  house: <svg viewBox="0 0 24 24"><path d="M4 11 12 4l8 7v9H4z" /><path d="M10 20v-5h4v5" /></svg>,
  check: <svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>,
  nav: <svg viewBox="0 0 24 24"><path d="M20.5 3.5 3.5 10.8l7 2.7 2.7 7z" /></svg>,
  chevR: <svg viewBox="0 0 24 24"><path d="m9 6 6 6-6 6" /></svg>,
  chevL: <svg viewBox="0 0 24 24"><path d="m15 5-7 7 7 7" /></svg>,
  search: <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>,
  sliders: <svg viewBox="0 0 24 24"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg>,
  clock: <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" /><path d="M12 8v4l3 2" /></svg>,
  mail: <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 6 8.5-6" /></svg>,
};
