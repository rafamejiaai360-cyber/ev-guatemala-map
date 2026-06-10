import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import VehicleSelector from './VehicleSelector';
import FilterBar from './FilterBar';

function formatLastCheck(date: Date | null): string {
  if (!date) return '';
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'actualizado ahora';
  if (diffMin === 1) return 'hace 1 min';
  return `hace ${diffMin} min`;
}

export default function Header() {
  const {
    stations,
    selectedVehicle,
    filteredStations,
    sidebarOpen,
    setSidebarOpen,
    lastStatusCheck,
    statusCheckLoading,
    statusCheckError,
    refreshStatus,
    setScanModalOpen,
  } = useStore();

  const [visibleError, setVisibleError] = useState<string | null>(null);

  useEffect(() => {
    if (!statusCheckError) { setVisibleError(null); return; }
    setVisibleError(statusCheckError);
    const t = setTimeout(() => setVisibleError(null), 5000);
    return () => clearTimeout(t);
  }, [statusCheckError]);

  const activeCount = stations.filter((s) => s.status === 'active').length;
  const compatibleCount = selectedVehicle ? filteredStations.length : null;

  return (
    <header className="sticky top-0 z-[60] bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap lg:flex-nowrap">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="lg:hidden p-1 text-gray-500 hover:text-gray-800 transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle sidebar"
          >
            <svg width="20" height="20" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-lg font-semibold text-gray-900 tracking-tight select-none">
            ⚡ <span className="text-green-500">EV</span> Guatemala
          </span>
        </div>

        {/* Vehicle selector — center */}
        <div className="flex-1 flex justify-center">
          <VehicleSelector />
        </div>

        {/* Right side */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <FilterBar />

          {/* Status badge */}
          {selectedVehicle ? (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-green-50 border border-green-200 rounded-full text-xs font-medium text-green-700 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {compatibleCount} compatibles
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-xs font-medium text-gray-600 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-green-500" />
              {activeCount} activas
            </span>
          )}

          {/* Divider */}
          <div className="w-px h-5 bg-gray-200" />

          {/* Refresh status button */}
          <div className="flex flex-col items-center">
            <button
              onClick={() => refreshStatus()}
              disabled={statusCheckLoading}
              title="Actualizar estado de cargadores"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors disabled:opacity-50"
            >
              {statusCheckLoading ? (
                <svg className="animate-spin" width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" d="M12 2a10 10 0 0 1 10 10" />
                </svg>
              ) : (
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
              )}
              <span className="hidden sm:inline">
                {statusCheckLoading ? 'Actualizando…' : lastStatusCheck ? formatLastCheck(lastStatusCheck) : 'Estado en vivo'}
              </span>
            </button>
            {visibleError && (
              <span className="flex items-center gap-1 text-[10px] text-red-500 leading-tight bg-red-50 border border-red-200 rounded px-1.5 py-0.5 max-w-[140px]">
                <span className="truncate">Sin conexión</span>
                <button onClick={() => setVisibleError(null)} className="flex-shrink-0 hover:text-red-700 transition-colors">
                  <svg width="10" height="10" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </span>
            )}
          </div>

          {/* Scan for new chargers button */}
          <button
            onClick={() => setScanModalOpen(true)}
            title="Buscar cargadores nuevos"
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-gray-600 hover:bg-gray-100 hover:text-gray-800 transition-colors"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <circle cx="11" cy="11" r="8" />
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-4.35-4.35" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M11 8v6M8 11h6" />
            </svg>
            <span className="hidden sm:inline">Explorar red</span>
          </button>
        </div>
      </div>
    </header>
  );
}
