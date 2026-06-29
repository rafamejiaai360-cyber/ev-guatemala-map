import { useState } from 'react';
import { useStore } from '../store/useStore';
import type { ConnectorType, ChargerLevel } from '../types/index';

const CONNECTOR_TYPES: ConnectorType[] = ['CCS2', 'CCS1', 'CHAdeMO', 'Type2', 'J1772', 'GBT'];
const POWER_OPTIONS = [3.7, 7.4, 11, 22, 50, 100, 150, 350];

interface ConnectorRow {
  type: ConnectorType;
  power_kw: number | null;
}

function levelFromKw(kw: number | null): ChargerLevel | null {
  if (kw == null) return null;
  return kw > 22 ? 'DC' : kw >= 11 ? 'L2' : 'L1';
}

function generateId(name: string, zone: string): string {
  const z = zone.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 4);
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
  return `${z || 'gt'}-${n}`;
}

export default function AddStationModal() {
  const { setAddStationModalOpen, loadDynamicStations, authToken, currentUser } = useStore();
  const isAdmin = currentUser?.role === 'admin';

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [zone, setZone] = useState('');
  const [mapsUrl, setMapsUrl] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [geoLocating, setGeoLocating] = useState(false);
  const [locationMethod, setLocationMethod] = useState<'url' | 'manual' | null>(null);
  const [network, setNetwork] = useState('');
  const [access, setAccess] = useState<'public' | 'semi-public' | 'private'>('public');
  const [notes, setNotes] = useState('');
  const [connectors, setConnectors] = useState<ConnectorRow[]>([{ type: 'Type2', power_kw: null }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);

  function addConnector() {
    setConnectors(prev => [...prev, { type: 'Type2', power_kw: null }]);
  }

  function removeConnector(i: number) {
    setConnectors(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateConnector(i: number, field: keyof ConnectorRow, value: string) {
    setConnectors(prev => prev.map((c, idx) =>
      idx === i ? { ...c, [field]: field === 'power_kw' ? (value === '' ? null : Number(value)) : value } : c
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
      setLocationMethod('url');
    } catch {
      setResolveError('Error de red al resolver la ubicación');
    } finally {
      setResolving(false);
    }
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setResolveError('Tu dispositivo no soporta geolocalización');
      return;
    }
    setGeoLocating(true);
    setResolveError(null);
    setLat(null);
    setLng(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (latitude < 13 || latitude > 18 || longitude < -93 || longitude > -88) {
          setResolveError('Ubicación fuera de Guatemala. Verifica que el GPS esté activo.');
          setGeoLocating(false);
          return;
        }
        setLat(latitude);
        setLng(longitude);
        setLocationMethod('url');
        setGeoLocating(false);
      },
      (err) => {
        const msg = err.code === 1
          ? 'Permiso de ubicación denegado. Actívalo en la configuración del navegador.'
          : 'No se pudo obtener la ubicación. Intenta de nuevo o usa el link de Google Maps.';
        setResolveError(msg);
        setGeoLocating(false);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
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
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
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
            ...(c.power_kw != null && { power_kw: c.power_kw, level: levelFromKw(c.power_kw) }),
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

      const result = await res.json() as { pending?: boolean };
      if (result.pending) {
        setPendingApproval(true);
      } else {
        setSuccess(true);
        await loadDynamicStations();
      }
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
    setConnectors([{ type: 'Type2', power_kw: null }]);
    setSuccess(false); setPendingApproval(false); setError(null);
    setLocationMethod(null);
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
            <h2 className="text-sm font-semibold text-gray-900">
              {isAdmin ? 'Agregar estación de carga' : 'Proponer estación de carga'}
            </h2>
            <p className="text-xs text-gray-500 mt-0.5">
              {isAdmin
                ? 'Se guarda en Notion y aparece en el mapa para todos'
                : 'Tu propuesta será revisada por el administrador antes de publicarse'}
            </p>
          </div>
          <button onClick={() => setAddStationModalOpen(false)} className="text-gray-400 hover:text-gray-600 p-1 transition-colors">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Success state (admin) */}
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
              <button onClick={handleAddAnother} className="text-sm px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-xl font-medium transition-colors">
                Agregar otra
              </button>
              <button onClick={() => setAddStationModalOpen(false)} className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors">
                Cerrar
              </button>
            </div>
          </div>
        ) : pendingApproval ? (
          /* Pending approval state (regular user) */
          <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 text-center gap-4">
            <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center">
              <svg className="text-amber-500" width="28" height="28" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">¡Propuesta enviada!</p>
              <p className="text-xs text-gray-500 mt-1 max-w-xs">Tu estación está pendiente de revisión. El administrador la validará antes de que aparezca en el mapa.</p>
            </div>
            <div className="flex gap-3">
              <button onClick={handleAddAnother} className="text-sm px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-medium transition-colors">
                Proponer otra
              </button>
              <button onClick={() => setAddStationModalOpen(false)} className="text-sm px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-xl font-medium transition-colors">
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

              {/* Location */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Ubicación *</label>

                {/* Option 1: GPS button */}
                <button
                  type="button"
                  onClick={useMyLocation}
                  disabled={geoLocating}
                  className="w-full flex items-center justify-center gap-2 py-2.5 mb-2 bg-blue-50 hover:bg-blue-100 disabled:opacity-50 border border-blue-200 text-blue-700 text-sm font-medium rounded-xl transition-colors"
                >
                  {geoLocating ? (
                    <>
                      <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                      Obteniendo ubicación…
                    </>
                  ) : (
                    <>
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                      </svg>
                      Usar mi ubicación actual (GPS)
                    </>
                  )}
                </button>

                {/* Option 2: Google Maps URL */}
                <div className="relative mb-2">
                  <div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-200" /></div>
                  <div className="relative flex justify-center"><span className="px-2 bg-white text-[10px] text-gray-400">o pega un link de Google Maps</span></div>
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={mapsUrl}
                    onChange={e => { setMapsUrl(e.target.value); setLat(null); setLng(null); setResolveError(null); setLocationMethod(null); }}
                    placeholder="https://maps.app.goo.gl/… o maps.google.com/…"
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

                {/* Option 3: Manual coords */}
                {locationMethod === null && !lat && (
                  <button
                    type="button"
                    onClick={() => setLocationMethod('manual')}
                    className="mt-1.5 text-[11px] text-gray-400 hover:text-gray-600 underline"
                  >
                    Ingresar coordenadas manualmente
                  </button>
                )}
                {locationMethod === 'manual' && (
                  <div className="flex gap-2 mt-2">
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-500 mb-1">Latitud</label>
                      <input
                        type="number" step="0.000001"
                        value={lat ?? ''}
                        onChange={e => setLat(e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="14.6349"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-500 mb-1">Longitud</label>
                      <input
                        type="number" step="0.000001"
                        value={lng ?? ''}
                        onChange={e => setLng(e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="-90.5069"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400"
                      />
                    </div>
                  </div>
                )}

                {resolveError && (
                  <p className="text-[11px] text-red-500 mt-1.5 leading-snug">{resolveError}</p>
                )}
                {lat != null && lng != null && (
                  <p className="text-[11px] text-green-600 mt-1.5 font-mono flex items-center gap-1">
                    <svg width="11" height="11" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5"/></svg>
                    {lat.toFixed(6)}, {lng.toFixed(6)}
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
                        value={c.power_kw ?? ''}
                        onChange={e => updateConnector(i, 'power_kw', e.target.value)}
                        className="w-28 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 bg-white"
                      >
                        <option value="">— kW</option>
                        {POWER_OPTIONS.map(p => <option key={p} value={p}>{p} kW</option>)}
                      </select>
                      <span className="text-[10px] font-medium text-gray-400 w-7 text-center flex-shrink-0">
                        {levelFromKw(c.power_kw) ?? '—'}
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
                {submitting ? 'Enviando…' : isAdmin ? 'Guardar en mapa y Notion' : 'Enviar propuesta para revisión'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
