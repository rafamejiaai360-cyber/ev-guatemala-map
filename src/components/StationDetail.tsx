import type { ChargerStation } from '../types';
import StationPhotos from './StationPhotos';
import StationReviews from './StationReviews';

interface Props {
  station: ChargerStation;
  onBack: () => void;
}

const CONNECTOR_COLORS: Record<string, string> = {
  CCS2: 'bg-blue-100 text-blue-700',
  CHAdeMO: 'bg-purple-100 text-purple-700',
  Type2: 'bg-teal-100 text-teal-700',
  J1772: 'bg-orange-100 text-orange-700',
  GBT: 'bg-red-100 text-red-700',
  CCS1: 'bg-indigo-100 text-indigo-700',
};

const ACCESS_LABELS: Record<string, string> = {
  public: 'Público',
  'semi-public': 'Semi-público',
  private: 'Privado',
};

const STATUS_COLORS: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  maintenance: 'bg-amber-100 text-amber-700',
  offline: 'bg-red-100 text-red-700',
};

const STATUS_LABELS: Record<string, string> = {
  active: 'Activo',
  maintenance: 'Mantenimiento',
  offline: 'Fuera de servicio',
};

export default function StationDetail({ station, onBack }: Props) {
  return (
    <div className="flex flex-col h-full">
      {/* Back header */}
      <div className="px-4 pt-3 pb-2 border-b border-gray-100 flex-shrink-0">
        <button
          onClick={onBack}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 transition-colors mb-2"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Todas las estaciones
        </button>
        <h2 className="text-sm font-semibold text-gray-900 leading-tight">{station.name}</h2>
        <p className="text-xs text-gray-500 mt-0.5">{station.zone}</p>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto">
        {/* Station info */}
        <div className="px-4 py-3 border-b border-gray-100 space-y-2">
          <p className="text-xs text-gray-600 leading-relaxed">{station.address}</p>

          <div className="flex flex-wrap gap-1">
            {station.connectors.map((c, i) => (
              <span
                key={i}
                className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CONNECTOR_COLORS[c.type] ?? 'bg-gray-100 text-gray-600'}`}
              >
                {c.type} · {c.power_kw}kW
              </span>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[station.status]}`}>
              {STATUS_LABELS[station.status]}
            </span>
            <span className="text-[10px] text-gray-400">{ACCESS_LABELS[station.access] ?? station.access}</span>
            <span className="text-[10px] text-gray-400">·</span>
            <span className="text-[10px] text-gray-400">{station.network}</span>
          </div>

          {station.notes && (
            <p className="text-[10px] text-gray-400 italic leading-relaxed">{station.notes}</p>
          )}
        </div>

        {/* Photos */}
        <StationPhotos stationId={station.id} stationName={station.name} />

        {/* Reviews + ratings */}
        <StationReviews stationId={station.id} stationName={station.name} />
      </div>
    </div>
  );
}
