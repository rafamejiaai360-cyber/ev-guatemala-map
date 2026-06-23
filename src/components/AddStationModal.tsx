import { useState } from 'react';
import { useStore } from '../store/useStore';
import type { ConnectorType, ChargerLevel } from '../types/index';

const CONNECTOR_TYPES: ConnectorType[] = ['CCS2', 'CCS1', 'CHAdeMO', 'Type2', 'J1772', 'GBT'];
const POWER_OPTIONS = [3.7, 7.4, 11, 22, 50, 100, 150, 350];

interface ConnectorRow {
  type: ConnectorType;
  power_kw: number;
}

function levelFromKw(kw: number): ChargerLevel {
  return kw > 22 ? 'DC' : kw >= 11 ? 'L2' : 'L1';
}

function generateId(name: string, zone: string): string {
  const z = zone.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 4);
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
  return `${z || 'gt'}-${n}`;
}

export default function AddStationModal() {
  const { setAddStationModalOpen, loadDynamicStations } = useStore();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [zone, setZone] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [network, setNetwork] = useState('');
  const [access, setAccess] = useState<'public' | 'semi-public' | 'private'>('public');
  const [notes, setNotes] = useState('');
  const [connectors, setConnectors] = useState<ConnectorRow[]>([{ type: 'Type2', power_kw: 22 }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  function addConnector() {
    setConnectors(prev => [...prev, { type: 'Type2', power_kw: 22 }]);
  }

  function removeConnector(i: number) {
    setConnectors(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateConnector(i: number, field: keyof ConnectorRow, value: string) {
    setConnectors(prev => prev.map((c, idx) =>
      idx === i ? { ...c, [field]: field === 'power_kw' ? Number(value) : value } : c
    ));
  }

  async function resolveLocation() {
    if (!mapsUrl.trim()) return;
    setResolving(true);
    setResolveError(null);
    setLat(null);
    setLng(null);
    try {
      const res = await fetch(`/api/resolve-location?url=${encodeURIComponent(mapsUrl.trim())}`);
      const data = await res.json() as { lat?: number; lng?: number; error?: string };
      if (!res.ok || data.error) {
        setResolveError(data.error ?? 'No se pudo resolver la ubicación');
        return;
      }
      if (data.lat == null || data.lng == null) {
        setResolveError('Respuesta inesperada del servidor');
        return;
      }
      setLat(data.lat);
      setLng(data.lng);
    } catch {
      setResolveError('Error de red al resolver la ubicación');
    } finally {
      setResolving(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) { setError('El nombre es obligatorio'); return; }
    if (lat == null || lng == null) { setError('Resuelve la ubicación de Google Maps primero'); return; }
    if (lat < 13 || lat > 18 || lng < -93 || lng > -88) {
      setError('Las coordenadas parecen estar fuera de Guatemala. Verifica el link de Google Maps.');
      return;
    }
    if (connectors.length === 0) { setError('Agrega al menos un conector'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: generateId(name, zone),
          name: name.trim(),
          address: address.trim(),
          zone: zone.trim() || 'Guatemala',
          lat,
          lng,
          network: network.trim() || 'Desconocido',
          status: 'active',
          connectors: connectors.map(c => ({
            type: c.type,
            power_kw: c.power_kw,
            level: levelFromKw(c.power_kw),
          })),
          access,
          source: 'Manual',
          ...(notes.trim() && { notes: notes.trim() }),
        }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `Error ${res.status}`);
      }

      setSuccess(true);
      await loadDynamicStations();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  }

  function handleAddAnother() {
    setName(''); setAddress(''); setZone('');
    setMapsUrl(''); setLat(null); setLng(null); setResolveError(null);
    setNetwork(''); setNotes(''); setAccess('public');
    setConnectors([{ type: 'Type2', power_kw: 22 }]);
    setSuccess(false); setError(null);
  }

  return (
    <div
      className="fixed inset-0 z-[9998] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm"
      onClick={(e) => { if (e.target === e.currentTarget) setAddStationModalOpen(false); }}
    >
      <div className="bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-lg max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between gap-3 flex-shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Agregar estación de carga</h2>
            <p className="text-xs text-gray-500 mt-0.5">Se guarda en Notion y aparece en el mapa para todos</p>
          </div>
          <button onClick={() => setAddStationModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 transition-colors">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Success state */}
        {success ? (
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-green-100 flex items-center justify-center">
              <svg className="text-green-600" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">¡Estación guardada!</p>
              <p className="text-xs text-gray-500 mt-1">Ya aparece en el mapa y en Notion.</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleAddAnother}
                className="text-sm px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors"
              >
                Agregar otra
              </button>
              <button
                onClick={() => setAddStationModalOpen(false)}
                className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors"
              >
                Cerrar
              </button>
            </div>
          </div>
        ) : (
          /* Form */
          <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
            <div className="px-5 py-4 space-y-4">

              {/* Name */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="ej. Pollo Campero Chimaltenango"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-green-400"
                />
              </div>

              {/* Address + Zone */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
                  <input
                    type="text"
                    value={address}
                    onChange={e => setAddress(e.target.value)}
                    placeholder="ej. Km 54 CA-1"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-green-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Municipio / Zona</label>
                  <input
                    type="text"
                    value={zone}
                    onChange={e => setZone(e.target.value)}
                    placeholder="ej. Chimaltenango"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-green-400"
                  />
                </div>
              </div>

              {/* Location from Google Maps URL */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-0.5">Ubicación *</label>
                <p className="text-[10px] text-gray-400 mb-1.5">
                  Copia el link de Google Maps del lugar y presiona "Resolver"
                </p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={mapsUrl}
                    onChange={e => { setMapsUrl(e.target.value); setLat(null); setLng(null); setResolveError(null); }}
                    placeholder="https://maps.app.goo.gl/..."
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-green-400 min-w-0"
                  />
                  <button
                    type="button"
                    onClick={resolveLocation}
                    disabled={resolving || !mapsUrl.trim()}
                    className="flex-shrink-0 px-3 py-2.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {resolving ? 'Buscando…' : 'Resolver'}
                  </button>
                </div>
                {resolveError && (
                  <p className="text-[11px] text-red-500 mt-1">{resolveError}</p>
                )}
                {lat != null && lng != null && (
                  <p className="text-[11px] text-green-600 mt-1 font-mono">
                    ✓ {lat.toFixed(6)}, {lng.toFixed(6)}
                  </p>
                )}
              </div>

              {/* Network + Access */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Red / Operador</label>
                  <input
                    type="text"
                    value={network}
                    onChange={e => setNetwork(e.target.value)}
                    placeholder="ej. Electron Power"
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-green-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Acceso</label>
                  <select
                    value={access}
                    onChange={e => setAccess(e.target.value as typeof access)}
                    className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-green-400 bg-white"
                  >
                    <option value="public">Público</option>
                    <option value="semi-public">Semi-público</option>
                    <option value="private">Privado</option>
                  </select>
                </div>
              </div>

              {/* Connectors */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium text-gray-700">Conectores *</label>
                  <button type="button" onClick={addConnector} className="text-xs text-green-600 hover:text-green-800 font-medium">
                    + Agregar
                  </button>
                </div>
                <div className="space-y-2">
                  {connectors.map((c, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <select
                        value={c.type}
                        onChange={e => updateConnector(i, 'type', e.target.value)}
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 bg-white"
                      >
                        {CONNECTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                      </select>
                      <select
                        value={c.power_kw}
                        onChange={e => updateConnector(i, 'power_kw', e.target.value)}
                        className="w-28 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 bg-white"
                      >
                        {POWER_OPTIONS.map(p => <option key={p} value={p}>{p} kW</option>)}
                      </select>
                      <span className="text-[10px] font-medium text-gray-400 w-7 text-center flex-shrink-0">
                        {levelFromKw(c.power_kw)}
                      </span>
                      {connectors.length > 1 && (
                        <button type="button" onClick={() => removeConnector(i)} className="text-gray-300 hover:text-red-400 transition-colors">
                          <svg width="15" height="15" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notas (opcional)</label>
                <input
                  type="text"
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="ej. Solo clientes · Horario 6am–10pm"
                  className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-green-400"
                />
              </div>

              {error && (
                <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
              )}
            </div>

            {/* Footer */}
            <div className="px-5 py-4 border-t border-gray-100 flex-shrink-0">
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {submitting ? 'Guardando…' : 'Guardar en mapa y Notion'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
