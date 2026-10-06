import { useState } from 'react';
import { vehicles } from '../../data/vehicles';
import { useStore } from '../../store/useStore';
import type { ChargerLevel, ConnectorType, Vehicle } from '../../types';
import { Icon, connectorName } from './shared';

const CONNECTORS: ConnectorType[] = ['CCS2', 'Type2', 'J1772', 'CHAdeMO', 'GBT', 'CCS1'];
const LEVELS: { value: ChargerLevel | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'L2', label: 'Normal (AC)' },
  { value: 'DC', label: 'Rápida (DC)' },
];

// Contenido de la hoja "Filtros": vehículo, tipo de conector y velocidad de
// carga, todo visible sin menús anidados. Pública/Residencial no
// se repiten aquí porque ya están en los botones rápidos de afuera.
export default function FiltersPanel({ onDone }: { onDone: () => void }) {
  const { filters, setFilters, selectedVehicle, setSelectedVehicle, filteredStations } = useStore();
  const [query, setQuery] = useState('');

  const q = query.trim().toLowerCase();
  const list = vehicles.filter((v) => !q || `${v.brand} ${v.model} ${v.year}`.toLowerCase().includes(q));

  function toggleConnector(t: ConnectorType) {
    const cur = filters.connectorTypes;
    setFilters({ connectorTypes: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] });
  }
  function clearAll() {
    setFilters({ connectorTypes: [], level: 'all' });
    setSelectedVehicle(null);
    setQuery('');
  }
  const hasAny = filters.connectorTypes.length > 0 || filters.level !== 'all' || !!selectedVehicle;

  return (
    <div className="m-fp">
      <section>
        <div className="m-fp-h">Mi vehículo</div>
        <p className="m-fp-note">Muestra solo las estaciones con un conector compatible con tu auto.</p>
        <label className="m-search m-fp-search">
          {Icon.search}
          <input id="m-vehicle-search" type="search" placeholder="Buscar marca o modelo" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="m-fp-vlist m-scroll">
          {list.map((v) => (
            <VehicleRow
              key={v.id}
              v={v}
              selected={selectedVehicle?.id === v.id}
              onPick={() => setSelectedVehicle(selectedVehicle?.id === v.id ? null : v)}
            />
          ))}
          {list.length === 0 && <div className="m-empty-line">Sin resultados para “{query}”.</div>}
        </div>
      </section>

      <section>
        <div className="m-fp-h">Tipo de conector</div>
        <div className="m-fp-chips">
          {CONNECTORS.map((t) => (
            <button key={t} type="button" className="m-fp-chip" aria-pressed={filters.connectorTypes.includes(t)} onClick={() => toggleConnector(t)}>
              {connectorName(t)}
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="m-fp-h">Velocidad de carga</div>
        <div className="m-fp-seg" role="group" aria-label="Velocidad de carga">
          {LEVELS.map((l) => (
            <button key={l.value} type="button" aria-pressed={filters.level === l.value} onClick={() => setFilters({ level: l.value })}>
              {l.label}
            </button>
          ))}
        </div>
      </section>

      <div className="m-fp-foot">
        <button type="button" className="m-btn ghost" onClick={clearAll} disabled={!hasAny}>Limpiar</button>
        <button type="button" className="m-btn primary" onClick={onDone}>
          Ver {filteredStations.length} {filteredStations.length === 1 ? 'estación' : 'estaciones'}
        </button>
      </div>
    </div>
  );
}

function VehicleRow({ v, selected, onPick }: { v: Vehicle; selected: boolean; onPick: () => void }) {
  const confirmed = !!v.compatible_connectors?.length;
  return (
    <button type="button" className={`m-fp-vrow${selected ? ' sel' : ''}`} onClick={onPick} aria-pressed={selected}>
      <span className="thumb">
        {v.image_url ? <img src={v.image_url} alt="" loading="lazy" /> : CAR_ICON}
      </span>
      <span className="txt">
        <b>{v.brand} {v.model} <small>{v.year}</small></b>
        <small>
          {v.range_km} km de autonomía
          {v.battery_kwh != null && ` · ${String(v.battery_kwh).replace('.', ',')} kWh`}
          {confirmed ? ` · ${v.compatible_connectors!.map(connectorName).join(', ')}` : ' · ficha por confirmar'}
        </small>
      </span>
      <span className="chk">{selected && Icon.check}</span>
    </button>
  );
}

const CAR_ICON = (
  <svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M4 16v-3.5l2-5A2 2 0 0 1 7.9 6h8.2a2 2 0 0 1 1.9 1.5l2 5V16" />
    <path d="M3 16h18v2.5a1 1 0 0 1-1 1h-1.5a1 1 0 0 1-1-1V18h-11v.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z" />
    <circle cx="7.5" cy="14" r="1" /><circle cx="16.5" cy="14" r="1" />
  </svg>
);
