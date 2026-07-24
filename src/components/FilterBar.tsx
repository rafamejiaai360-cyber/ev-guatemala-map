import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import type { ChargerStatus, ConnectorType, ChargerLevel, StationType } from '../types';

const STATUS_OPTIONS: { value: ChargerStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'offline', label: 'Fuera de servicio' },
];

const TYPE_OPTIONS: { value: StationType | 'all'; label: string }[] = [
  { value: 'all', label: 'Todas' },
  { value: 'public', label: '🔌 Públicas' },
  { value: 'residential', label: '🏠 Residenciales' },
];

const CONNECTOR_OPTIONS: ConnectorType[] = ['CCS2', 'CHAdeMO', 'Type2', 'J1772', 'GBT', 'CCS1'];

const LEVEL_OPTIONS: { value: ChargerLevel | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'L2', label: 'L2 AC' },
  { value: 'DC', label: 'DC Rápido' },
];

const PANEL_WIDTH = 300;

export default function FilterBar() {
  const { filters, setFilters } = useStore();
  const [panelOpen, setPanelOpen] = useState(false);
  const [panelPos, setPanelPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close on outside click, resize, scroll (but not when scrolling inside the panel)
  useEffect(() => {
    if (!panelOpen) return;
    function close() { setPanelOpen(false); }
    function closeOnScroll(e: Event) {
      const portal = document.getElementById('filters-panel-portal');
      if (portal && portal.contains(e.target as Node)) return;
      setPanelOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [panelOpen]);

  function handleOutside(e: MouseEvent) {
    const portal = document.getElementById('filters-panel-portal');
    if (portal && portal.contains(e.target as Node)) return;
    if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
    setPanelOpen(false);
  }

  function handleToggle() {
    if (!panelOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      const margin = 12;
      const width = Math.min(PANEL_WIDTH, window.innerWidth - margin * 2);
      const left = Math.min(Math.max(margin, rect.right - width), window.innerWidth - width - margin);
      setPanelPos({ top: rect.bottom + 8, left });
    }
    setPanelOpen((o) => !o);
  }

  function toggleConnector(type: ConnectorType) {
    const current = filters.connectorTypes;
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setFilters({ connectorTypes: next });
  }

  const advancedCount =
    (filters.status !== 'all' ? 1 : 0) +
    (filters.level !== 'all' ? 1 : 0) +
    filters.connectorTypes.length;

  function clearAdvanced() {
    setFilters({ status: 'all', level: 'all', connectorTypes: [] });
  }

  const panel = panelOpen ? createPortal(
    <div
      id="filters-panel-portal"
      style={{
        position: 'fixed',
        top: panelPos.top,
        left: panelPos.left,
        width: Math.min(PANEL_WIDTH, window.innerWidth - 24),
        zIndex: 99999,
      }}
      className="bg-white rounded-2xl border border-gray-200 shadow-xl p-3 space-y-3 max-h-[70vh] overflow-y-auto"
    >
      {/* Status */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Estado</p>
        <div className="flex flex-wrap gap-1.5">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilters({ status: opt.value })}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                filters.status === opt.value
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Level */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Nivel de carga</p>
        <div className="flex flex-wrap gap-1.5">
          {LEVEL_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              onClick={() => setFilters({ level: opt.value })}
              className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors whitespace-nowrap ${
                filters.level === opt.value
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Connector */}
      <div>
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Conector</p>
        <div className="grid grid-cols-2 gap-0.5">
          {CONNECTOR_OPTIONS.map((type) => (
            <label
              key={type}
              className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={filters.connectorTypes.includes(type)}
                onChange={() => toggleConnector(type)}
                className="accent-green-500 w-3.5 h-3.5"
              />
              <span className="text-xs text-gray-700">{type}</span>
            </label>
          ))}
        </div>
      </div>

      {advancedCount > 0 && (
        <button
          onClick={clearAdvanced}
          className="w-full text-xs text-gray-400 hover:text-gray-600 py-1.5 border-t border-gray-100 pt-2 transition-colors"
        >
          Limpiar filtros
        </button>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <div className="flex items-center gap-1.5 flex-shrink-0">
      {/* Station type filter (pública / residencial) — siempre visible */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-full p-0.5 flex-shrink-0">
        {TYPE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilters({ stationType: opt.value })}
            className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${
              filters.stationType === opt.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Botón único que agrupa estado, nivel y conector */}
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-all duration-200 flex-shrink-0 whitespace-nowrap ${
          advancedCount > 0
            ? 'border-green-400 bg-green-50 text-green-700'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
        }`}
      >
        <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="flex-shrink-0">
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h18M6.75 12h10.5M10.5 19.5h3" />
        </svg>
        Filtros
        {advancedCount > 0 && (
          <span className="bg-green-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px] flex-shrink-0">
            {advancedCount}
          </span>
        )}
      </button>
      {panel}
    </div>
  );
}
