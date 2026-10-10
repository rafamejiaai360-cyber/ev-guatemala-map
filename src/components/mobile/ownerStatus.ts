import type { MyStation } from '../../types';

// Utilidades del estado publicado por el dueño (Mis estaciones). Separadas de
// MyStations.tsx para que ese archivo solo exporte componentes.

function parseSqlUtc(sqlUtc: string): number {
  return Date.parse(sqlUtc.replace(' ', 'T') + (sqlUtc.endsWith('Z') ? '' : 'Z'));
}

/** Días completos desde una fecha UTC de D1 ("2026-10-06 23:10:00"). */
export function daysSince(sqlUtc: string): number {
  const t = parseSqlUtc(sqlUtc);
  return isNaN(t) ? 0 : Math.floor((Date.now() - t) / 86_400_000);
}

/** "hoy", "hace 1 día", "hace 3 días", "hace 2 meses". */
export function timeAgo(sqlUtc: string): string {
  if (isNaN(parseSqlUtc(sqlUtc))) return '';
  const days = daysSince(sqlUtc);
  if (days <= 0) return 'hoy';
  if (days === 1) return 'hace 1 día';
  if (days < 60) return `hace ${days} días`;
  return `hace ${Math.floor(days / 30)} meses`;
}

/** Días sin actualizar un estado distinto de "Activa" antes de preguntar. */
export const STALE_STATUS_DAYS = 14;

/** Estación propia que lleva demasiado tiempo en mantenimiento/fuera de servicio. */
export function findStaleStation(list: MyStation[] | null): MyStation | null {
  return list?.find((s) => s.approval === 'active' && s.status !== 'active'
    && daysSince(s.statusUpdatedAt) >= STALE_STATUS_DAYS) ?? null;
}
