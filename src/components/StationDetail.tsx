import { useState, useEffect } from 'react';
import type { ChargerStation, Review } from '../types';
import { getReviews } from '../utils/reviewsApi';
import { useStore } from '../store/useStore';
import StarRating from './StarRating';
import ReviewForm from './ReviewForm';

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
  const { ratings, loadRatings } = useStore();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const ratingInfo = ratings[station.id];

  useEffect(() => {
    setLoading(true);
    setReviews([]);
    setShowForm(false);
    getReviews(station.id)
      .then(setReviews)
      .catch(() => setReviews([]))
      .finally(() => setLoading(false));
  }, [station.id]);

  function handleReviewSubmitted() {
    setShowForm(false);
    getReviews(station.id).then(setReviews).catch(() => {});
    loadRatings();
  }

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

        {/* Rating summary */}
        <div className="px-4 py-3 border-b border-gray-100">
          {ratingInfo ? (
            <div className="flex items-center gap-2">
              <StarRating value={ratingInfo.avg} size="md" />
              <span className="text-sm font-semibold text-gray-900">{ratingInfo.avg.toFixed(1)}</span>
              <span className="text-xs text-gray-400">
                ({ratingInfo.count} {ratingInfo.count === 1 ? 'reseña' : 'reseñas'})
              </span>
            </div>
          ) : (
            <p className="text-xs text-gray-400">Sin calificaciones todavía</p>
          )}
        </div>

        {/* Reviews section */}
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">Reseñas</h3>
            {!showForm && (
              <button
                onClick={() => setShowForm(true)}
                className="text-xs text-green-600 hover:text-green-700 font-medium transition-colors"
              >
                + Dejar reseña
              </button>
            )}
          </div>

          {showForm && (
            <div className="mb-4">
              <ReviewForm
                station={station}
                onSubmitted={handleReviewSubmitted}
                onCancel={() => setShowForm(false)}
              />
            </div>
          )}

          {loading ? (
            <p className="text-xs text-gray-400 text-center py-6">Cargando reseñas...</p>
          ) : reviews.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-6">
              No hay reseñas aún. ¡Sé el primero en opinar!
            </p>
          ) : (
            <ul className="space-y-3">
              {reviews.map((r) => (
                <li key={r.id} className="border-b border-gray-50 pb-3 last:border-0 last:pb-0">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      <StarRating value={r.rating} size="sm" />
                      <span className="text-[10px] font-medium text-gray-700">{r.author}</span>
                    </div>
                    <span className="text-[10px] text-gray-400 flex-shrink-0">
                      {new Date(r.date).toLocaleDateString('es-GT')}
                    </span>
                  </div>
                  {r.text && (
                    <p className="text-xs text-gray-600 leading-relaxed">{r.text}</p>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
