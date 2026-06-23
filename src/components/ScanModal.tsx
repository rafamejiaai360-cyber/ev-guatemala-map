import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { ChargerStation } from '../types/index';

interface Connector {
  type: string;
  power_kw: number;
  level: string;
}

interface StationCandidate {
  id: string;
  name: string;
  address: string;
  zone: string;
  lat: number;
  lng: number;
  network: string;
  status: string;
  connectors: Connector[];
  source: string;
  sourceId: string;
}

interface ScanSource {
  id: string;
  name: string;
  url: string;
  description: string;
  status?: 'ok' | 'error';
  error?: string;
  candidates: StationCandidate[];
  scraped?: boolean;
}

interface ManualSource {
  name: string;
  url: string;
  description: string;
}

interface ScanResponse {
  sources: ScanSource[];
  manualSources: ManualSource[];
  existingCount: number;
  scannedAt: string;
}

const STATUS_COLOR: Record<string, string> = {
  active: 'bg-green-100 text-green-700',
  maintenance: 'bg-amber-100 text-amber-700',
  offline: 'bg-red-100 text-red-700',
};
const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  maintenance: 'Mantenimiento',
  offline: 'Fuera de servicio',
};

function candidateToStation(c: StationCandidate): ChargerStation {
  return {
    id: c.id,
    name: c.name,
    address: c.address,
    zone: c.zone,
    lat: c.lat,
    lng: c.lng,
    status: c.status as ChargerStation['status'],
    connectors: c.connectors.map(conn => ({
      type: conn.type as ChargerStation['connectors'][number]['type'],
      power_kw: conn.power_kw,
      level: conn.level as ChargerStation['connectors'][number]['level'],
    })),
    network: c.network,
    access: 'public',
  };
}

export default function ScanModal() {
  const { setScanModalOpen, addDynamicStation } = useStore();
  const [loading, setLoading] = useState(true);
  const [scanData, setScanData] = useState<ScanResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [addErrors, setAddErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/scan');
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const data = await res.json() as ScanResponse;
        setScanData(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'No se pudo conectar con el servidor');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  async function handleAdd(candidate: StationCandidate) {
    if (adding.has(candidate.id) || added.has(candidate.id)) return;
    setAdding(prev => new Set([...prev, candidate.id]));
    setAddErrors(prev => { const n = { ...prev }; delete n[candidate.id]; return n; });

    try {
      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(candidate),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `Error ${res.status}`);
      }
      addDynamicStation(candidateToStation(candidate));
      setAdded(prev => new Set([...prev, candidate.id]));
    } catch (e) {
      setAddErrors(prev => ({
        ...prev,
        [candidate.id]: e instanceof Error ? e.message : 'Error al agregar',
      }));
    } finally {
      setAdding(prev => { const n = new Set(prev); n.delete(candidate.id); return n; });
    }
  }

  const totalCandidates = scanData?.sources.reduce((sum, s) => sum + s.candidates.length, 0) ?? 0;
  const totalAdded = added.size;

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setScanModalOpen(false); }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[90vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-red-500 font-bold text-xs bg-red-50 px-2 py-0.5 rounded-full">ADMIN</span>
              <h2 className="text-sm font-semibold text-gray-900">Explorar red EV Guatemala</h2>
            </div>
            <p className="text-xs text-gray-500 mt-0.5">
              {loading
                ? 'Escaneando fuentes registradas…'
                : error
                ? 'Error de conexión'
                : totalCandidates === 0
                ? `Todo al día — ${scanData?.existingCount ?? 0} estaciones en base de datos`
                : `${totalCandidates} nueva${totalCandidates !== 1 ? 's' : ''} • ${totalAdded} agregada${totalAdded !== 1 ? 's' : ''}`}
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

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="w-8 h-8 border-2 border-red-500 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-gray-500">Buscando nuevos cargadores…</p>
            </div>
          )}

          {/* Error */}
          {!loading && error && (
            <div className="px-5 py-10 text-center">
              <svg className="mx-auto mb-3 text-red-400" width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              <p className="text-sm text-gray-700 font-medium">Error al escanear</p>
              <p className="text-xs text-gray-400 mt-1">{error}</p>
            </div>
          )}

          {/* Results */}
          {!loading && !error && scanData && (
            <div>
              {scanData.sources.map((source) => (
                <div key={source.id} className="border-b border-gray-100 last:border-0">
                  {/* Source header */}
                  <div className="px-5 py-3 flex items-center justify-between gap-2 bg-gray-50/60">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        source.status === 'ok' ? 'bg-green-400' : 'bg-red-400'
                      }`} />
                      <span className="text-xs font-semibold text-gray-700 truncate">{source.name}</span>
                      <span className="text-[10px] text-gray-400 hidden sm:block truncate">{source.description}</span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {source.candidates.length > 0 && (
                        <span className="text-[10px] font-medium bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full">
                          {source.candidates.length} nueva{source.candidates.length !== 1 ? 's' : ''}
                        </span>
                      )}
                      <a
                        href={source.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 transition-colors"
                      >
                        Ver sitio
                        <svg width="9" height="9" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  </div>

                  {/* No scrape */}
                  {source.scraped === false && (
                    <div className="px-5 py-3">
                      <p className="text-xs text-gray-400 italic">
                        {source.error ?? 'Página con renderizado dinámico — verifica manualmente en el sitio.'}
                      </p>
                    </div>
                  )}

                  {/* Candidates list */}
                  {source.candidates.map((candidate) => {
                    const isAdding = adding.has(candidate.id);
                    const isAdded = added.has(candidate.id);
                    const addError = addErrors[candidate.id];

                    return (
                      <div key={candidate.id} className="px-5 py-3 border-t border-gray-50 hover:bg-gray-50/40 transition-colors">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-semibold text-gray-900 leading-tight">{candidate.name}</p>
                            {candidate.address && (
                              <p className="text-[10px] text-gray-400 mt-0.5 truncate">{candidate.address}</p>
                            )}
                            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[candidate.status] ?? STATUS_COLOR.active}`}>
                                {STATUS_LABEL[candidate.status] ?? 'Desconocido'}
                              </span>
                              {candidate.network && candidate.network !== 'Desconocido' && (
                                <span className="text-[10px] text-gray-400">{candidate.network}</span>
                              )}
                              {candidate.connectors.slice(0, 3).map((c, i) => (
                                <span key={i} className="text-[10px] text-gray-500">
                                  {c.type} {c.power_kw}kW
                                </span>
                              ))}
                            </div>
                            {addError && (
                              <p className="text-[10px] text-red-500 mt-1">{addError}</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleAdd(candidate)}
                            disabled={isAdding || isAdded}
                            className={`flex-shrink-0 text-xs px-3 py-1.5 rounded-lg font-medium transition-all whitespace-nowrap ${
                              isAdded
                                ? 'bg-green-50 text-green-600 cursor-default'
                                : isAdding
                                ? 'bg-gray-100 text-gray-400 cursor-wait'
                                : 'bg-red-500 hover:bg-red-600 text-white shadow-sm'
                            }`}
                          >
                            {isAdded ? '✓ En mapa' : isAdding ? '…' : 'Agregar'}
                          </button>
                        </div>
                      </div>
                    );
                  })}

                  {/* No new stations for this source */}
                  {source.candidates.length === 0 && source.scraped !== false && (
                    <div className="px-5 py-3">
                      <p className="text-[10px] text-gray-400">Sin estaciones nuevas detectadas</p>
                    </div>
                  )}
                </div>
              ))}

              {/* Manual verification sources */}
              {scanData.manualSources.length > 0 && (
                <div className="px-5 py-4 border-t border-gray-100">
                  <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Verificar manualmente
                  </p>
                  <div className="space-y-2">
                    {scanData.manualSources.map((s) => (
                      <a
                        key={s.url}
                        href={s.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between gap-2 text-xs p-2.5 rounded-lg bg-gray-50 hover:bg-gray-100 border border-gray-200 transition-colors group"
                      >
                        <div>
                          <span className="font-medium text-gray-700 group-hover:text-gray-900">{s.name}</span>
                          <p className="text-[10px] text-gray-400 mt-0.5">{s.description}</p>
                        </div>
                        <svg className="flex-shrink-0 text-gray-400 group-hover:text-gray-600" width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-gray-100 flex items-center justify-between">
          <p className="text-[10px] text-gray-400">
            {scanData
              ? `Escaneado ${new Date(scanData.scannedAt).toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' })} · OCM CC BY-SA 3.0`
              : 'Escaneando…'
            }
          </p>
          <button
            onClick={() => setScanModalOpen(false)}
            className="text-xs text-gray-500 hover:text-gray-700 font-medium transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
