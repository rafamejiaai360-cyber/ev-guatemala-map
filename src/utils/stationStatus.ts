import type { ChargerStatus } from '../types';

// Estados que el admin puede poner a una estación (oct 2026). "Ya no existe"
// la saca del mapa sin borrarla (solo el admin la sigue viendo).
export const ADMIN_STATUS_OPTIONS: { value: ChargerStatus; label: string }[] = [
  { value: 'active', label: 'Activa' },
  { value: 'partial', label: 'Funciona parcialmente' },
  { value: 'maintenance', label: 'En mantenimiento' },
  { value: 'closed', label: 'Cerrada temporalmente' },
  { value: 'offline', label: 'Fuera de servicio' },
  { value: 'gone', label: 'Ya no existe (quitar del mapa)' },
];
