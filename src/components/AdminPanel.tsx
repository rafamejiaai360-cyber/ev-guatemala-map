import { useStore } from '../store/useStore';
import type { ChargerStatus } from '../types';

const STATUS_OPTIONS: { value: ChargerStatus; label: string; color: string }[] = [
  { value: 'active', label: 'Activo', color: 'bg-green-500' },
  { value: 'maintenance', label: 'Mantenimiento', color: 'bg-amber-400' },
  { value: 'offline', label: 'Fuera de servicio', color: 'bg-red-500' },
];

export default function AdminPanel() {
  const { stations, setStationStatus } = useStore();

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">⚡</span>
            <span className="text-sm font-medium text-green-600">EV Guatemala</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Panel de Administración</h1>
          <p className="text-sm text-gray-500 mt-1">
            Actualiza el estado de las estaciones. Los cambios se guardan en el navegador.
          </p>
          <div className="mt-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            Modo admin activo · Los cambios son locales y no afectan otros usuarios
          </div>
        </div>

        {/* Station list */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          {stations.map((station, idx) => (
            <div
              key={station.id}
              className={`flex items-center gap-3 px-4 py-3.5 ${idx < stations.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              {/* Status indicator */}
              <span
                className={`w-2 h-2 rounded-full flex-shrink-0 ${
                  station.status === 'active' ? 'bg-green-500' :
                  station.status === 'maintenance' ? 'bg-amber-400' : 'bg-red-500'
                }`}
              />

              {/* Name & zone */}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{station.name}</div>
                <div className="text-xs text-gray-500">{station.zone}</div>
              </div>

              {/* Status selector */}
              <div className="flex items-center gap-1">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStationStatus(station.id, opt.value)}
                    title={opt.label}
                    className={`w-6 h-6 rounded-full border-2 transition-all duration-150 ${
                      station.status === opt.value
                        ? `${opt.color} border-transparent scale-110`
                        : 'bg-gray-100 border-gray-200 hover:border-gray-300'
                    }`}
                  />
                ))}
              </div>

              {/* Current status label */}
              <span className="text-xs text-gray-400 w-28 text-right flex-shrink-0">
                {STATUS_OPTIONS.find((o) => o.value === station.status)?.label}
              </span>
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center gap-4 text-xs text-gray-400">
          {STATUS_OPTIONS.map((opt) => (
            <div key={opt.value} className="flex items-center gap-1.5">
              <span className={`w-3 h-3 rounded-full ${opt.color}`} />
              {opt.label}
            </div>
          ))}
        </div>

        <div className="mt-6">
          <a
            href="/"
            className="inline-flex items-center gap-2 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            ← Volver al mapa
          </a>
        </div>
      </div>
    </div>
  );
}
