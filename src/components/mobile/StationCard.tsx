import type { ChargerStation, RatingInfo } from '../../types';
import { Icon, STATUS_LABEL, connectorTypes, distanceLabel, formatKw, maxKw, stationType } from './shared';

export default function StationCard({
  station,
  km,
  rating,
  onOpen,
  selected = false,
}: {
  station: ChargerStation;
  km: number | null;
  rating?: RatingInfo;
  onOpen: (id: string) => void;
  selected?: boolean;
}) {
  const t = stationType(station);
  const dist = distanceLabel(km);
  const kw = maxKw(station);
  return (
    <button type="button" className={`m-card${selected ? ' sel' : ''}`} onClick={() => onOpen(station.id)}>
      <span className={`av${t === 'residential' ? ' r' : ''}`}>{t === 'residential' ? Icon.house : Icon.pin}</span>
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
        </span>
        {rating && rating.count > 0 && (
          <span className="m-rate"><span>★</span> {rating.avg.toFixed(1).replace('.', ',')}</span>
        )}
      </span>
    </button>
  );
}
