import type { ChargerStation, RatingInfo } from '../../types';
import { useStore } from '../../store/useStore';
import { chargeVia } from '../../utils/compat';
import { Icon, STATUS_LABEL, connectorTypes, distanceLabel, formatKw, maxKw, stationType } from './shared';

export default function StationCard({
  station,
  km,
  rating,
  onOpen,
  onShowOnMap,
  selected = false,
}: {
  station: ChargerStation;
  km: number | null;
  rating?: RatingInfo;
  onOpen: (id: string) => void;
  onShowOnMap?: (id: string) => void;
  selected?: boolean;
}) {
  const t = stationType(station);
  const dist = distanceLabel(km);
  const kw = maxKw(station);
  const selectedVehicle = useStore((s) => s.selectedVehicle);
  const myAdapters = useStore((s) => s.myAdapters);
  const viaMine = chargeVia(station, selectedVehicle, myAdapters) === 'my-adapter';
  return (
    // Tarjeta como div (no <button>) para poder llevar adentro el botón
    // "Ver en el mapa" sin anidar botones.
    <div
      role="button"
      tabIndex={0}
      className={`m-card${selected ? ' sel' : ''}`}
      onClick={() => onOpen(station.id)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onOpen(station.id); } }}
    >
      <span className={`av${t === 'residential' ? ' r' : t === 'semi-public' ? ' s' : ''}`}>{t === 'residential' ? Icon.house : Icon.pin}</span>
      <h4>{station.name}</h4>
      <span className={`m-pill ${station.status}`}>{STATUS_LABEL[station.status]}</span>
      <p className="m-addr">
        {station.zone || station.address}
        {dist && <> · {station.approximate ? "≈ " : ""}{dist}</>}
      </p>
      <span className="row">
        <span className="m-tags">
          {kw > 0 && <span className="m-tag">hasta {formatKw(kw)}</span>}
          {connectorTypes(station).slice(0, 3).map((c) => <span key={c} className="m-tag">{c}</span>)}
          {!!station.adapters?.length && <span className="m-tag adapt">+ adaptador</span>}
          {viaMine && <span className="m-tag adapt">con tu adaptador</span>}
          {station.pricePerKwh != null && (
            <span className="m-tag">{station.pricePerKwh === 0 ? 'Gratis' : `Q${station.pricePerKwh.toFixed(2)}/kWh`}</span>
          )}
        </span>
        <span className="m-cardend">
          {rating && rating.count > 0 && (
            <span className="m-rate"><span>★</span> {rating.avg.toFixed(1).replace('.', ',')}</span>
          )}
          {onShowOnMap && (
            <button
              type="button"
              className="m-cardmap"
              aria-label={`Ver ${station.name} en el mapa`}
              title="Ver en el mapa"
              onClick={(e) => { e.stopPropagation(); onShowOnMap(station.id); }}
            >
              {Icon.map}<span>Mapa</span>
            </button>
          )}
        </span>
      </span>
    </div>
  );
}
