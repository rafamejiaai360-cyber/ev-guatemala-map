import type { ChargerStation, StationType } from '../types';
import { stationKind } from '../utils/stationKind';

type Access = ChargerStation['access'];

const OPTIONS = [
  { kind: 'public', label: '🔌 Pública', on: 'border-green-400 bg-green-50 text-green-700' },
  { kind: 'semi-public', label: '🏨 Semi-pública', on: 'border-orange-400 bg-orange-50 text-orange-700' },
  { kind: 'residential', label: '🏠 Residencial', on: 'border-blue-400 bg-blue-50 text-blue-700' },
] as const;

// Selector de tipo con los 3 colores del mapa. "Semi-pública" no es un tipo
// guardado: es una estación pública con acceso semi-público (ver
// utils/stationKind.ts), así que este selector ajusta `type` y `access`.
export default function StationKindPicker({ type, access, setType, setAccess }: {
  type: StationType;
  access: Access;
  setType: (t: StationType) => void;
  setAccess: (a: Access) => void;
}) {
  const current = stationKind({ type, access });
  function pick(kind: (typeof OPTIONS)[number]['kind']) {
    if (kind === 'residential') { setType('residential'); return; }
    setType('public');
    if (kind === 'public') setAccess('public');
    else if (access === 'public') setAccess('semi-public');
  }
  return (
    <div className="grid grid-cols-3 gap-2">
      {OPTIONS.map((o) => (
        <button key={o.kind} type="button" onClick={() => pick(o.kind)}
          className={`flex items-center justify-center gap-1 text-sm py-2.5 rounded-lg border font-medium transition-colors ${
            current === o.kind ? o.on : 'border-gray-200 text-gray-500 hover:border-gray-300'}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
