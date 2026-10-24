import { useState } from 'react';
import { useStore, vehicleFilterActive } from '../../store/useStore';
import VehicleProposalModal from '../VehicleProposalModal';
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
// El auto y los adaptadores quedan guardados; "Filtrar por mi auto" (el mismo
// interruptor que el botón de enchufe del mapa) decide si se usan. Mientras
// está encendido, "Tipo de conector" se reemplaza por un resumen: el auto y
// los adaptadores ya dicen qué conectores sirven.
export default function FiltersPanel({ onDone }: { onDone: () => void }) {
  const { filters, setFilters, selectedVehicle, setSelectedVehicle, filteredStations, vehicleCatalog, myAdapters, setMyAdapters } = useStore();
  const [query, setQuery] = useState('');
  // undefined = cerrado; null = proponer auto nuevo; Vehicle = corregir ese
  const [proposal, setProposal] = useState<Vehicle | null | undefined>(undefined);

  const q = query.trim().toLowerCase();
  const list = vehicleCatalog.filter((v) => !q || `${v.brand} ${v.model} ${v.year}`.toLowerCase().includes(q));

  function toggleConnector(t: ConnectorType) {
    const cur = filters.connectorTypes;
    setFilters({ connectorTypes: cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t] });
  }
  // Los adaptadores son algo que el conductor lleva, no un filtro: "Limpiar"
  // no los borra. No se ofrecen los conectores que su auto ya tiene.
  const carPlugs = selectedVehicle?.compatible_connectors ?? [];
  const adapterOptions = CONNECTORS.filter((t) => !carPlugs.includes(t));
  function toggleMyAdapter(t: ConnectorType) {
    setMyAdapters(myAdapters.includes(t) ? myAdapters.filter((x) => x !== t) : [...myAdapters, t]);
  }
  const byVehicle = vehicleFilterActive(filters, selectedVehicle);
  const usableAdapters = myAdapters.filter((t) => adapterOptions.includes(t));
  // "Limpiar" apaga los filtros pero no borra el auto ni los adaptadores del
  // perfil (antes borraba el auto, también de la cuenta).
  function clearAll() {
    setFilters({ connectorTypes: [], level: 'all', vehicleFilter: false });
    setQuery('');
  }
  const hasAny = byVehicle || filters.connectorTypes.length > 0 || filters.level !== 'all';

  return (
    <div className="m-fp">
      <section>
        <div className="m-fp-h">Mi vehículo</div>
        <p className="m-fp-note">Tu auto queda guardado en tu perfil. Con el filtro encendido, el mapa muestra solo las estaciones donde puede cargar.</p>
        {carPlugs.length > 0 && (
          <label className="m-fp-switch">
            <span>Filtrar por mi {selectedVehicle!.model}</span>
            <input type="checkbox" role="switch" checked={filters.vehicleFilter} onChange={(e) => setFilters({ vehicleFilter: e.target.checked })} />
          </label>
        )}
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
        <div className="m-fp-propose">
          <button type="button" className="m-linkbtn" onClick={() => setProposal(null)}>¿No está tu auto? Propónlo</button>
          {selectedVehicle && (
            <button type="button" className="m-linkbtn" onClick={() => setProposal(selectedVehicle)}>Corregir datos de {selectedVehicle.model}</button>
          )}
        </div>
      </section>
      {proposal !== undefined && <VehicleProposalModal base={proposal} onClose={() => setProposal(undefined)} />}

      <section>
        <div className="m-fp-h">Mis adaptadores</div>
        <p className="m-fp-note">
          ¿Llevas un adaptador en el carro? Marca a qué conectores de estación te permite conectarte y el mapa
          también te mostrará esas estaciones.
          {!carPlugs.length && ' Elige tu auto arriba para que se tomen en cuenta.'}
        </p>
        <div className="m-fp-chips" role="group" aria-label="Mis adaptadores">
          {adapterOptions.map((t) => (
            <button key={t} type="button" className="m-fp-chip" aria-pressed={myAdapters.includes(t)} onClick={() => toggleMyAdapter(t)}>
              {connectorName(t)}
            </button>
          ))}
        </div>
        {carPlugs.length > 0 && usableAdapters.length > 0 && (
          <p className="m-fp-note m-fp-adapt-sum">
            Tu {selectedVehicle!.model} ({carPlugs.map(connectorName).join(', ')}) también podrá usar estaciones{' '}
            {usableAdapters.map(connectorName).join(', ')} con tu adaptador.
          </p>
        )}
      </section>

      <section>
        <div className="m-fp-h">Tipo de conector</div>
        {byVehicle ? (
          <>
            <p className="m-fp-note">Lo decide tu {selectedVehicle!.model}: el mapa muestra las estaciones con estos conectores.</p>
            <div className="m-fp-chips">
              {carPlugs.map((t) => (
                <span key={t} className="m-fp-tag">{connectorName(t)} <small>tu auto</small></span>
              ))}
              {usableAdapters.map((t) => (
                <span key={t} className="m-fp-tag">{connectorName(t)} <small>tu adaptador</small></span>
              ))}
            </div>
            <p className="m-fp-note m-fp-after">
              También las que prestan un adaptador para tu auto. Para elegir otro conector, apaga «Filtrar por mi {selectedVehicle!.model}».
            </p>
          </>
        ) : (
          <div className="m-fp-chips">
            {CONNECTORS.map((t) => (
              <button key={t} type="button" className="m-fp-chip" aria-pressed={filters.connectorTypes.includes(t)} onClick={() => toggleConnector(t)}>
                {connectorName(t)}
              </button>
            ))}
          </div>
        )}
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
        <b>{v.brand} {v.model} <small>{v.year}</small>{v.verified && <em className="m-fp-ok">Ficha verificada</em>}</b>
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
