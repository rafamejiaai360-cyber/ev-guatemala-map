import { parsePriceInput } from '../utils/price';

interface Props {
  value: string;
  onChange: (v: string) => void;
}

export default function PriceField({ value, onChange }: Props) {
  const free = value.trim() !== '' && parsePriceInput(value) === 0;
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">Precio por kWh (opcional)</label>
      <div className="flex items-center gap-2">
        <div className="flex items-center flex-1 border border-gray-200 rounded-lg px-3 focus-within:border-green-400">
          <span className="text-sm text-gray-400 mr-1">Q</span>
          <input
            type="text"
            inputMode="decimal"
            value={free ? '' : value}
            disabled={free}
            onChange={(e) => onChange(e.target.value)}
            placeholder={free ? 'Gratis' : 'ej. 3.50'}
            className="w-full text-sm py-2.5 bg-transparent focus:outline-none"
          />
          <span className="text-xs text-gray-400 ml-1 whitespace-nowrap">por kWh</span>
        </div>
        <label className="flex items-center gap-1.5 text-xs text-gray-700 cursor-pointer whitespace-nowrap">
          <input
            type="checkbox"
            checked={free}
            onChange={(e) => onChange(e.target.checked ? '0' : '')}
            className="accent-green-600 w-4 h-4"
          />
          Gratis
        </label>
      </div>
      <p className="text-[11px] text-gray-400 mt-1">
        Lo que cobra la estación por cada kWh (la unidad de energía que marca el cargador). Déjalo vacío si no lo sabes.
      </p>
    </div>
  );
}
