import type { ChargerStation, ConnectorType, Vehicle } from '../types';

/** Cómo puede cargar el auto elegido en una estación:
 *  - 'native': la estación tiene un conector del auto.
 *  - 'station-adapter': solo con el adaptador que presta la estación
 *    (`station.adapters` = conectores de AUTO que cargan ahí con él).
 *  - 'my-adapter': solo con un adaptador propio del conductor
 *    (`myAdapters` = conectores de ESTACIÓN que su adaptador le permite usar).
 *  - null: no puede cargar ahí.
 *  - 'unknown': no hay auto elegido o su ficha no tiene conectores
 *    confirmados; mejor no afirmar nada (no se filtra). */
export type ChargeVia = 'native' | 'station-adapter' | 'my-adapter' | 'unknown' | null;

export function chargeVia(station: ChargerStation, vehicle: Vehicle | null, myAdapters: ConnectorType[]): ChargeVia {
  const car = vehicle?.compatible_connectors ?? [];
  if (!car.length) return 'unknown';
  const plugs = station.connectors.map((c) => c.type);
  if (plugs.some((t) => car.includes(t))) return 'native';
  if ((station.adapters ?? []).some((t) => car.includes(t))) return 'station-adapter';
  if (plugs.some((t) => myAdapters.includes(t))) return 'my-adapter';
  return null;
}

/** Conectores de la estación que el conductor usaría con su adaptador. */
export function myAdapterPlugs(station: ChargerStation, myAdapters: ConnectorType[]): ConnectorType[] {
  return Array.from(new Set(station.connectors.map((c) => c.type).filter((t) => myAdapters.includes(t))));
}
