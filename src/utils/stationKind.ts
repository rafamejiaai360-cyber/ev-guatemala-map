import type { ChargerStation, StationKind } from '../types';

// Semi-pública = estación de un negocio (no residencial) con acceso
// restringido: solo clientes, huéspedes o socios. Se deriva de `access` para
// no duplicar el dato: una residencial sigue siendo residencial (azul) aunque
// su acceso sea semi-público.
export function stationKind(s: { type?: ChargerStation['type']; access?: string }): StationKind {
  if ((s.type ?? 'public') === 'residential') return 'residential';
  return s.access && s.access !== 'public' ? 'semi-public' : 'public';
}

// Ayuda bajo el selector de tipo (StationKindPicker).
export const KIND_HINT: Record<string, string> = {
  public: 'Abierta a cualquiera: centro comercial, gasolinera, parqueo u otro negocio.',
  'semi-public': 'De un negocio, pero solo para clientes, huéspedes o socios (hotel, agencia de autos, banco, club).',
  residential: 'Un cargador en una casa particular que su dueño comparte con la comunidad.',
};
