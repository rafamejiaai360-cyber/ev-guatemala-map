import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { vehicles } from '../data/vehicles';
import { useStore } from '../store/useStore';

export default function VehicleSelector() {
  const { selectedVehicle, setSelectedVehicle } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 288 });
  const ref = useRef<HTMLDivElement>(null);

  const filtered = vehicles.filter((v) =>
    `${v.brand} ${v.model}`.toLowerCase().includes(query.toLowerCase()),
  );

  // Close on outside click, resize, or scroll (but not when scrolling inside the dropdown)
  useEffect(() => {
    if (!open) return;
    function close() { setOpen(false); }
    function closeOnScroll(e: Event) {
      const portal = document.getElementById('vehicle-dropdown-portal');
      if (portal && portal.contains(e.target as Node)) return;
      setOpen(false);
    }
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('resize', close);
    window.addEventListener('scroll', closeOnScroll, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('resize', close);
      window.removeEventListener('scroll', closeOnScroll, true);
    };
  }, [open]);

  function handleOutside(e: MouseEvent) {
    if (ref.current && !ref.current.contains(e.target as Node)) {
      // also allow clicks inside the portal dropdown
      const portal = document.getElementById('vehicle-dropdown-portal');
      if (portal && portal.contains(e.target as Node)) return;
      setOpen(false);
    }
  }

  function handleToggle() {
    if (!open && ref.current) {
      const rect = ref.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + 8, left: rect.left, width: Math.max(288, rect.width) });
    }
    setOpen((o) => !o);
  }

  function select(vehicle: typeof vehicles[0]) {
    setSelectedVehicle(vehicle);
    setOpen(false);
    setQuery('');
  }

  function clear(e: React.MouseEvent) {
    e.stopPropagation();
    setSelectedVehicle(null);
    setQuery('');
  }

  const dropdown = open ? createPortal(
    <div
      id="vehicle-dropdown-portal"
      style={{
        position: 'fixed',
        top: dropdownPos.top,
        left: dropdownPos.left,
        width: dropdownPos.width,
        zIndex: 99999,
      }}
      className="bg-white rounded-2xl border border-gray-200 shadow-xl overflow-hidden"
    >
      <div className="p-2 border-b border-gray-100">
        <input
          autoFocus
          type="text"
          placeholder="Buscar vehículo..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-3 py-1.5 text-sm rounded-lg border border-gray-200 focus:outline-none focus:border-green-400 transition-colors"
        />
      </div>
      <ul className="max-h-72 overflow-y-auto py-1">
        {filtered.length === 0 && (
          <li className="px-4 py-3 text-sm text-gray-400">Sin resultados</li>
        )}
        {filtered.map((v) => (
          <li
            key={v.id}
            onClick={() => select(v)}
            className={`px-4 py-2.5 cursor-pointer hover:bg-gray-50 transition-colors ${selectedVehicle?.id === v.id ? 'bg-green-50' : ''}`}
          >
            <div className="text-sm font-medium text-gray-800">
              {v.brand} <span className="text-gray-600">{v.model}</span>
              <span className="text-gray-400 text-xs ml-1">{v.year}</span>
            </div>
            <div className="text-xs text-gray-400 mt-0.5">
              {v.battery_kwh} kWh · {v.range_km} km · {v.compatible_connectors.join(', ')}
            </div>
          </li>
        ))}
      </ul>
    </div>,
    document.body,
  ) : null;

  return (
    <div ref={ref} className="relative">
      <button
        onClick={handleToggle}
        className="flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 bg-white text-sm text-gray-700 hover:border-gray-300 transition-all duration-200 min-w-[180px] max-w-[260px]"
      >
        <span className="text-green-500 text-base">🔌</span>
        <span className="truncate flex-1 text-left">
          {selectedVehicle ? `${selectedVehicle.brand} ${selectedVehicle.model}` : 'Mi vehículo'}
        </span>
        {selectedVehicle ? (
          <span
            onClick={clear}
            className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg leading-none"
          >
            ×
          </span>
        ) : (
          <span className="text-gray-400 text-xs">▾</span>
        )}
      </button>

      {dropdown}
    </div>
  );
}
