import { useStore } from '../store/useStore';
import VehicleSelector from './VehicleSelector';
import FilterBar from './FilterBar';

export default function Header() {
  const {
    stations,
    selectedVehicle,
    filteredStations,
    sidebarOpen,
    setSidebarOpen,
    setScanModalOpen,
    setAddStationModalOpen,
    isAdminAuthenticated,
    setAdminAuthenticated,
    setAdminLoginOpen,
  } = useStore();

  const activeCount = stations.filter((s) => s.status === 'active').length;
  const compatibleCount = selectedVehicle ? filteredStations.length : null;

  return (
    <header className="sticky top-0 z-[900] bg-white/80 backdrop-blur-md border-b border-gray-200 shadow-sm">
      <div className="flex items-center gap-3 px-4 py-3 flex-wrap lg:flex-nowrap">
        {/* Logo */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            className="lg:hidden -m-2 p-3 text-gray-500 hover:text-gray-800 active:text-gray-900 transition-colors rounded-xl touch-manipulation"
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

          {/* Add station button — visible only when authenticated */}
          {isAdminAuthenticated && (
            <button
              onClick={() => setAddStationModalOpen(true)}
              title="Agregar nueva estación"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white bg-green-600 hover:bg-green-700 transition-colors font-medium"
            >
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
              </svg>
              <span className="hidden sm:inline">Agregar</span>
            </button>
          )}

          {/* Scan for new chargers button — visible only when authenticated */}
          {isAdminAuthenticated && (
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
          )}

          {/* Admin lock button */}
          <button
            onClick={() => isAdminAuthenticated ? setAdminAuthenticated(false) : setAdminLoginOpen(true)}
            title={isAdminAuthenticated ? 'Cerrar sesión de administrador' : 'Acceso de administrador'}
            className={`p-1.5 rounded-lg transition-colors ${
              isAdminAuthenticated
                ? 'text-green-600 hover:bg-green-50'
                : 'text-gray-300 hover:text-gray-500 hover:bg-gray-100'
            }`}
          >
            {isAdminAuthenticated ? (
              /* Unlocked */
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            ) : (
              /* Locked */
              <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
