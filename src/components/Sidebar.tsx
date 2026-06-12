import { useState } from 'react';
import { useStore } from '../store/useStore';
import { haversineKm, formatDistance } from '../utils/geo';
import type { ChargerStation } from '../types';

const STATUS_DOT: Record<string, string> = {
  active: 'bg-green-500',
  maintenance: 'bg-amber-400',
  offline: 'bg-red-500',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  maintenance: 'Mantenimiento',
  offline: 'Fuera de servicio',
};

function distanceTo(station: ChargerStation, userLocation: { lat: number; lng: number } | null) {
  if (!userLocation) return null;
  return haversineKm(userLocation.lat, userLocation.lng, station.lat, station.lng);
}

export default function Sidebar() {
  const {
    stations,
    filteredStations,
    selectedVehicle,
    selectedStationId,
    setSelectedStationId,
    userLocation,
    sidebarOpen,
    setSidebarOpen,
  } = useStore();

  const [query, setQuery] = useState('');

  // Sort by distance if we have location, otherwise by name
  const sorted = [...filteredStations].sort((a, b) => {
    const da = distanceTo(a, userLocation);
    const db = distanceTo(b, userLocation);
    if (da !== null && db !== null) return da - db;
    return a.name.localeCompare(b.name);
  });

  // Local search filter (applies on top of global filters)
  const displayed = query.trim()
    ? sorted.filter((s) => {
        const q = query.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          s.zone.toLowerCase().includes(q) ||
          s.address.toLowerCase().includes(q) ||
          s.network.toLowerCase().includes(q)
        );
      })
    : sorted;

  const compatibleIds = selectedVehicle
    ? new Set(filteredStations.map((s) => s.id))
    : null;

  return (
    <>
      {/* Mobile backdrop — above Leaflet panes (max z-index 700) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/20 z-[750] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar panel — above backdrop and all Leaflet layers */}
      <aside
        className={`
          fixed bottom-0 left-0 right-0 z-[800] lg:z-auto
          lg:static lg:w-80 lg:flex-shrink-0
          bg-white border-t border-gray-200
          lg:border-t-0 lg:border-r lg:border-gray-200
          flex flex-col
          transition-transform duration-300
          ${sidebarOpen
            ? 'translate-y-0 h-[70vh] lg:h-full'
            : 'translate-y-full lg:translate-y-0 lg:h-full'}
        `}
      >
        {/* Handle (mobile) */}
        <div className="flex justify-center pt-2 pb-1 lg:hidden">
          <div className="w-10 h-1 bg-gray-300 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-4 pt-3 pb-2 border-b border-gray-100">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Estaciones</h2>
              <p className="text-xs text-gray-500 mt-0.5">
                {displayed.length}{query ? ` de ${sorted.length}` : ` de ${stations.length}`}
                {userLocation ? ' · por distancia' : ' · por nombre'}
              </p>
            </div>
            <button
              className="lg:hidden text-gray-400 hover:text-gray-600 transition-colors"
              onClick={() => setSidebarOpen(false)}
            >
              <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Search input */}
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none"
              width="13" height="13" fill="none" viewBox="0 0 24 24"
              stroke="#9ca3af" strokeWidth={2.5}
            >
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nombre, zona o red…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full pl-8 pr-7 py-1.5 text-xs border border-gray-200 rounded-lg bg-gray-50 focus:outline-none focus:border-green-400 focus:bg-white transition-colors"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
        </div>

        {/* Station list */}
        <ul className="flex-1 overflow-y-auto py-1">
          {displayed.length === 0 && (
            <li className="px-4 py-8 text-sm text-gray-400 text-center">
              {query ? `Sin resultados para "${query}"` : 'No hay estaciones con estos filtros'}
            </li>
          )}
          {displayed.map((station) => {
            const dist = distanceTo(station, userLocation);
            const isSelected = station.id === selectedStationId;
            const isCompatible = compatibleIds === null || compatibleIds.has(station.id);

            return (
              <li key={station.id}>
                <button
                  onClick={() => {
                    setSelectedStationId(isSelected ? null : station.id);
                    setSidebarOpen(false);
                  }}
                  className={`w-full text-left px-4 py-3 flex items-start gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 ${
                    isSelected ? 'bg-green-50 border-l-2 border-l-green-500' : ''
                  } ${!isCompatible ? 'opacity-40' : ''}`}
                >
                  {/* Status dot */}
                  <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${STATUS_DOT[station.status]}`} />

                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{station.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5 truncate">
                      {station.zone}
                      <span className="text-gray-300 mx-1">·</span>
                      <span className="text-gray-400">{station.network}</span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                        station.status === 'active' ? 'bg-green-100 text-green-700' :
                        station.status === 'maintenance' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {STATUS_LABEL[station.status]}
                      </span>
                      <span className="text-[10px] text-gray-400">
                        {station.connectors.map((c) => c.type).join(', ')}
                      </span>
                    </div>
                  </div>

                  {dist !== null && (
                    <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
                      {formatDistance(dist)}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </aside>
    </>
  );
}
