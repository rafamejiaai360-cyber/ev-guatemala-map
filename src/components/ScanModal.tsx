import { useState, useEffect } from 'react';
import { useStore, ocmStationToLocal } from '../store/useStore';
import { fetchGTStations, findClosestLocal } from '../utils/ocm';
import type { OCMStation } from '../utils/ocm';
import type { ChargerStation } from '../types';

const SOURCES = [
  { label: 'Electron Power', url: 'https://www.electronpower.com/red-de-carga/' },
  { label: 'BAC Ruta Eléctrica', url: 'https://www.baccredomatic.com/es-gt/personas/landing/ruta-electrica' },
  { label: 'PlugShare Guatemala', url: 'https://www.plugshare.com/location/guatemala' },
  { label: 'AMEGUA', url: 'https://www.amegua.org/cargadores-elctricos' },
];

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  maintenance: 'Mantenimiento',
  offline: 'Fuera de servicio',
};
const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  maintenance: 'bg-amber-100 text-amber-700',
  offline: 'bg-red-100 text-red-700',
};

export default function ScanModal() {
  const { stations, customStations, addCustomStation, setScanModalOpen } = useStore();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newItems, setNewItems] = useState<Array<{ ocm: OCMStation; local: ChargerStation }>>([]);
  const [added, setAdded] = useState<Set<number>>(new Set());

  useEffect(() => {
    (async () => {
      try {
        const ocmData = await fetchGTStations();
        const allStations = [...stations, ...customStations];
        const results: Array<{ ocm: OCMStation; local: ChargerStation }> = [];

        for (const ocm of ocmData) {
          const match = findClosestLocal(
            ocm.AddressInfo.Latitude,
            ocm.AddressInfo.Longitude,
            allStations,
          );
          if (!match) {
            results.push({ ocm, local: ocmStationToLocal(ocm) });
          }
        }

        setNewItems(results);
      } catch (e) {
        const isNoKey = e instanceof Error && e.message === 'NO_API_KEY';
        setError(isNoKey
          ? 'Falta configurar la API key de OpenChargeMap en las variables de entorno.'
          : 'No se pudo conectar con OpenChargeMap. Verifica tu conexión a internet.');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  function handleAdd(idx: number) {
    addCustomStation(newItems[idx].local);
    setAdded((prev) => new Set(prev).add(idx));
  }

  function handleAddAll() {
    newItems.forEach((_, idx) => {
      if (!added.has(idx)) {
        addCustomStation(newItems[idx].local);
      }
    });
    setAdded(new Set(newItems.map((_, i) => i)));
  }

  const pendingCount = newItems.length - added.size;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setScanModalOpen(false); }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Explorar red EV Guatemala</h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {loading
                ? 'Consultando OpenChargeMap…'
                : error
                ? 'Error de conexión'
                : `${newItems.length} cargadores nuevos encontrados en la red pública`}
            </p>
          </div>
          <button
            onClick={() => setScanModalOpen(false)}
            className="flex-shrink-0 text-gray-400 hover:text-gray-600 transition-colors p-1"
          >
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Buscando cargadores en Guatemala…</p>
            </div>
          )}

          {!loading && error && (
            <div className="px-5 py-10 text-center">
              <svg className="mx-auto mb-3 text-red-400" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              <p className="text-sm text-gray-700 font-medium">Error de conexión</p>
              <p className="text-xs text-gray-400 mt-1">{error}</p>
            </div>
          )}

          {!loading && !error && newItems.length === 0 && (
            <div className="px-5 py-12 text-center">
              <svg className="mx-auto mb-3 text-green-400" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <p className="text-sm font-medium text-gray-700">¡Todo actualizado!</p>
              <p className="text-xs text-gray-400 mt-1">Tu mapa ya incluye todos los cargadores conocidos en Guatemala.</p>
            </div>
          )}

          {!loading && !error && newItems.length > 0 && (
            <div>
              {newItems.map(({ local }, idx) => (
                <div key={idx} className="px-5 py-3.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 leading-tight">{local.name}</p>
                      {local.address && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{local.address}</p>
                      )}
                      <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[local.status]}`}>
                          {STATUS_LABEL[local.status]}
                        </span>
                        <span className="text-[10px] text-gray-400">{local.network}</span>
                        <span className="text-[10px] text-gray-300">·</span>
                        {local.connectors.slice(0, 3).map((c, i) => (
                          <span key={i} className="text-[10px] text-gray-500">
                            {c.type} {c.power_kw}kW
                          </span>
                        ))}
                      </div>
                    </div>
                    <button
                      onClick={() => handleAdd(idx)}
                      disabled={added.has(idx)}
                      className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-all ${
                        added.has(idx)
                          ? 'bg-green-50 text-green-600 cursor-default'
                          : 'bg-green-500 hover:bg-green-600 text-white shadow-sm'
                      }`}
                    >
                      {added.has(idx) ? '✓ Agregado' : 'Agregar'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* External sources */}
        <div className="px-5 py-3 border-t border-gray-100">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Verificar fuentes externas</p>
          <div className="flex flex-wrap gap-1.5">
            {SOURCES.map((s) => (
              <a
                key={s.url}
                href={s.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-gray-50 hover:bg-gray-100 text-gray-600 border border-gray-200 transition-colors"
              >
                {s.label}
                <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </a>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between gap-3">
          <p className="text-[10px] text-gray-400 leading-relaxed">
            Datos:{' '}
            <a href="https://openchargemap.org" target="_blank" rel="noopener noreferrer" className="underline">
              OpenChargeMap
            </a>{' '}
            · CC BY-SA 3.0
          </p>
          {!loading && !error && pendingCount > 0 && (
            <button
              onClick={handleAddAll}
              className="text-xs px-3 py-1.5 rounded-lg font-medium bg-gray-100 hover:bg-gray-200 text-gray-700 transition-colors whitespace-nowrap"
            >
              Agregar todos ({pendingCount})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
