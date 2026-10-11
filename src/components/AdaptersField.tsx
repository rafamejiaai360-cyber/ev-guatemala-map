import type { ConnectorType } from '../types/index';
import { connectorName } from './mobile/shared';

const CONNECTOR_TYPES: ConnectorType[] = ['CCS2', 'CCS1', 'CHAdeMO', 'Type2', 'J1772', 'GBT'];

/** Valor del campo: null = la estación no presta adaptadores;
 *  [] = marcó que sí, pero aún no eligió para qué conector (inválido). */
export type AdaptersValue = ConnectorType[] | null;

/** Lista final para enviar a la API: sin repetir los conectores que la
 *  estación ya tiene (un adaptador a CCS2 en una estación con CCS2 no suma). */
export function cleanAdapters(value: AdaptersValue, stationConnectors: ConnectorType[]): ConnectorType[] {
  return (value ?? []).filter((t) => !stationConnectors.includes(t));
}

export function adaptersError(value: AdaptersValue): string | null {
  return value && value.length === 0 ? 'Marca para qué conector de auto sirve el adaptador' : null;
}

interface Props {
  value: AdaptersValue;
  onChange: (v: AdaptersValue) => void;
  /** Conectores propios de la estación: no se ofrecen como adaptador. */
  stationConnectors: ConnectorType[];
}

/** "¿La estación presta adaptadores?" — p. ej. Naves z.15 tiene GB/T y CCS1
 *  y presta un adaptador para autos CCS2. */
export default function AdaptersField({ value, onChange, stationConnectors }: Props) {
  const enabled = value !== null;
  const options = CONNECTOR_TYPES.filter((t) => !stationConnectors.includes(t));

  function toggle(t: ConnectorType) {
    const cur = value ?? [];
    onChange(cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]);
  }

  return (
    <div>
      <label className="flex items-start gap-2 text-xs font-medium text-gray-700 cursor-pointer">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => onChange(e.target.checked ? [] : null)}
          className="accent-green-600 w-4 h-4 mt-0.5 flex-shrink-0"
        />
        <span>
          La estación presta adaptadores
          <span className="block font-normal text-gray-400">
            Por ejemplo, tiene GB/T y CCS1, pero te prestan un adaptador para autos CCS2.
          </span>
        </span>
      </label>
      {enabled && (
        <div className="mt-2 ml-6">
          <p className="text-[11px] text-gray-500 mb-1.5">Con el adaptador también pueden cargar autos con:</p>
          <div className="flex flex-wrap gap-1.5">
            {options.map((t) => {
              const on = value!.includes(t);
              return (
                <button
                  key={t}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(t)}
                  className={`text-xs font-medium px-3 py-1.5 rounded-full border transition-colors ${
                    on ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-200'
                  }`}
                >
                  {connectorName(t)}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
