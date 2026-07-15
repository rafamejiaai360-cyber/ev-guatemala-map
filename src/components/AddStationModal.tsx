import { useState } from 'react';
import { useStore } from '../store/useStore';
import LocationPicker from './LocationPicker';
import type { ConnectorType, ChargerLevel, StationType } from '../types/index';

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
  const { setAddStationModalOpen, loadDynamicStations, authToken, currentUser, setAuthModalOpen } = useStore();
  const isAdmin = currentUser?.role === 'admin';

  const [type, setType] = useState<StationType>('public');
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [zone, setZone] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [network, setNetwork] = useState('');
  const [access, setAccess] = useState<'public' | 'semi-public' | 'private'>('public');
  const [notes, setNotes] = useState('');
  const [connectors, setConnectors] = useState<ConnectorRow[]>([{ type: 'Type2', power_kw: null }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [pendingApproval, setPendingApproval] = useState(false);
  const [locationResetKey, setLocationResetKey] = useState(0);

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (type === 'residential' && !currentUser) {
      setError('Debes iniciar sesión para agregar una estación residencial');
      return;
    }
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
          type,
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
    setType('public');
    setName(''); setAddress(''); setZone('');
    setLat(null); setLng(null);
    setNetwork(''); setNotes(''); setAccess('public');
    setConnectors([{ type: 'Type2', power_kw: null }]);
    setSuccess(false); setPendingApproval(false); setError(null);
    setLocationResetKey(k => k + 1);
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

              {/* Type */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Tipo de estación</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setType('public')}
                    className={`flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-lg border font-medium transition-colors ${
                      type === 'public'
                        ? 'border-green-400 bg-green-50 text-green-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    🔌 Pública
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('residential')}
                    className={`flex items-center justify-center gap-1.5 text-sm py-2.5 rounded-lg border font-medium transition-colors ${
                      type === 'residential'
                        ? 'border-blue-400 bg-blue-50 text-blue-700'
                        : 'border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    🏠 Residencial
                  </button>
                </div>
                <p className="text-[11px] text-gray-400 mt-1">
                  {type === 'public'
                    ? 'Centro comercial, hotel, gasolinera u otro negocio.'
                    : 'Un cargador en una casa particular que su dueño comparte con la comunidad.'}
                </p>
              </div>

              {/* Login gate: las residenciales exigen cuenta (owner_email en el backend) */}
              {type === 'residential' && !currentUser && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-3 space-y-2">
                  <p className="text-xs text-blue-800 font-medium">
                    🔒 Necesitas una cuenta para agregar tu cargador residencial
                  </p>
                  <p className="text-[11px] text-blue-700 leading-relaxed">
                    Así podemos vincular la estación contigo y contactarte cuando alguien quiera usarla.
                  </p>
                  <button
                    type="button"
                    onClick={() => { setAddStationModalOpen(false); setAuthModalOpen(true); }}
                    className="text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg px-3 py-1.5 transition-colors"
                  >
                    Crear cuenta
                  </button>
                </div>
              )}

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
              <LocationPicker
                key={locationResetKey}
                lat={lat}
                lng={lng}
                onChange={(newLat, newLng) => { setLat(newLat); setLng(newLng); }}
                getSeedQuery={() => [name, address, zone].map(s => s.trim()).filter(Boolean).join(', ')}
              />

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
                disabled={submitting || (type === 'residential' && !currentUser)}
                className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition-colors"
              >
                {type === 'residential' && !currentUser
                  ? 'Inicia sesión para continuar'
                  : submitting ? 'Enviando…' : isAdmin ? 'Guardar en mapa y Notion' : 'Enviar propuesta para revisión'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
