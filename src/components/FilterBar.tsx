import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useStore } from '../store/useStore';
import type { ChargerStatus, ConnectorType, ChargerLevel } from '../types';

const STATUS_OPTIONS: { value: ChargerStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'active', label: 'Activo' },
  { value: 'maintenance', label: 'Mantenimiento' },
  { value: 'offline', label: 'Fuera de servicio' },
];

const CONNECTOR_OPTIONS: ConnectorType[] = ['CCS2', 'CHAdeMO', 'Type2', 'J1772', 'GBT', 'CCS1'];

const LEVEL_OPTIONS: { value: ChargerLevel | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'L2', label: 'L2 AC' },
  { value: 'DC', label: 'DC Rápido' },
];

export default function FilterBar() {
  const { filters, setFilters } = useStore();
  const [connectorOpen, setConnectorOpen] = useState(false);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0 });
  const btnRef = useRef<HTMLButtonElement>(null);

  // Close on outside click, resize, scroll
  useEffect(() => {
    if (!connectorOpen) return;
    function close() { setConnectorOpen(false); }
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', close, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', close, true);
    };
  }, [connectorOpen]);

  function handleOutside(e: MouseEvent) {
    const portal = document.getElementById('connector-dropdown-portal');
    if (portal && portal.contains(e.target as Node)) return;
    if (btnRef.current && btnRef.current.contains(e.target as Node)) return;
    setConnectorOpen(false);
  }

  function handleToggle() {
    if (!connectorOpen && btnRef.current) {
      const rect = btnRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 8, left: rect.left });
    }
    setConnectorOpen((o) => !o);
  }

  function toggleConnector(type: ConnectorType) {
    const current = filters.connectorTypes;
    const next = current.includes(type)
      ? current.filter((t) => t !== type)
      : [...current, type];
    setFilters({ connectorTypes: next });
  }

  const dropdown = connectorOpen ? createPortal(
    <div
      id="connector-dropdown-portal"
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        left: dropdownPos.left,
        zIndex: 99999,
      }}
      className="bg-white rounded-2xl border border-gray-200 shadow-xl p-2 min-w-[160px]"
    >
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
      {filters.connectorTypes.length > 0 && (
        <button
          onClick={() => { setFilters({ connectorTypes: [] }); setConnectorOpen(false); }}
          className="w-full mt-1 text-xs text-gray-400 hover:text-gray-600 py-1 transition-colors"
        >
          Limpiar selección
        </button>
      )}
    </div>,
    document.body,
  ) : null;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Status filter */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-full p-0.5">
        {STATUS_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilters({ status: opt.value })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${
              filters.status === opt.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Connector type multiselect */}
      <button
        ref={btnRef}
        onClick={handleToggle}
        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-all duration-200 ${
          filters.connectorTypes.length > 0
            ? 'border-green-400 bg-green-50 text-green-700'
            : 'border-gray-200 bg-white text-gray-600 hover:border-gray-300'
        }`}
      >
        Conector
        {filters.connectorTypes.length > 0 && (
          <span className="bg-green-500 text-white rounded-full w-4 h-4 flex items-center justify-center text-[10px]">
            {filters.connectorTypes.length}
          </span>
        )}
        <span className="text-[10px]">▾</span>
      </button>
      {dropdown}

      {/* Level filter */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-full p-0.5">
        {LEVEL_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setFilters({ level: opt.value })}
            className={`px-3 py-1 rounded-full text-xs font-medium transition-all duration-200 whitespace-nowrap ${
              filters.level === opt.value
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
