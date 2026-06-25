import { useState } from 'react';
import { useStore } from '../store/useStore';
import type { ChargerStation, ConnectorType, ChargerLevel } from '../types/index';

const CONNECTOR_TYPES: ConnectorType[] = ['CCS2', 'CCS1', 'CHAdeMO', 'Type2', 'J1772', 'GBT'];
const POWER_OPTIONS = [3.7, 7.4, 11, 22, 50, 100, 150, 350];

interface ConnectorRow { type: ConnectorType; power_kw: number | null; }
function levelFromKw(kw: number | null): ChargerLevel | null { if (kw == null) return null; return kw > 22 ? 'DC' : kw >= 11 ? 'L2' : 'L1'; }

interface Props {
  station: ChargerStation;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditStationModal({ station, onClose, onSaved }: Props) {
  const { authToken, loadDynamicStations } = useStore();

  const [name, setName] = useState(station.name);
  const [address, setAddress] = useState(station.address ?? '');
  const [zone, setZone] = useState(station.zone ?? '');
  const [network, setNetwork] = useState(station.network ?? '');
  const [access, setAccess] = useState<'public' | 'semi-public' | 'private'>(
    (station.access as 'public' | 'semi-public' | 'private') ?? 'public'
  );
  const [status, setStatus] = useState<'active' | 'maintenance' | 'offline'>(
    (station.status as 'active' | 'maintenance' | 'offline') ?? 'active'
  );
  const [lat, setLat] = useState(String(station.lat));
  const [lng, setLng] = useState(String(station.lng));
  const [connectors, setConnectors] = useState<ConnectorRow[]>(
    station.connectors.map(c => ({ type: c.type as ConnectorType, power_kw: c.power_kw ?? null }))
  );
  const [notes, setNotes] = useState((station as unknown as Record<string, unknown>).notes as string ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  function addConnector() { setConnectors(p => [...p, { type: 'Type2', power_kw: 22 }]); }
  function removeConnector(i: number) { setConnectors(p => p.filter((_, idx) => idx !== i)); }
  function updateConnector(i: number, field: keyof ConnectorRow, value: string) {
    setConnectors(p => p.map((c, idx) => idx === i ? { ...c, [field]: field === 'power_kw' ? (value === '' ? null : Number(value)) : value } : c));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const latNum = parseFloat(lat), lngNum = parseFloat(lng);
    if (!name.trim()) { setError('El nombre es obligatorio'); return; }
    if (isNaN(latNum) || isNaN(lngNum)) { setError('Coordenadas inválidas'); return; }
    if (connectors.length === 0) { setError('Agrega al menos un conector'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/stations/${station.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({
          name: name.trim(), address: address.trim(), zone: zone.trim(),
          network: network.trim(), access, status, lat: latNum, lng: lngNum,
          connectors: connectors.map(c => ({ type: c.type, ...(c.power_kw != null && { power_kw: c.power_kw, level: levelFromKw(c.power_kw) }) })),
          notes: notes.trim() || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `Error ${res.status}`);
      }
      await loadDynamicStations();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleDelete() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch(`/api/stations/${station.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `Error ${res.status}`);
      }
      await loadDynamicStations();
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al eliminar');
      setConfirmDelete(false);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-4">
        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-gray-900">Editar estación</h2>
            <p className="text-xs text-gray-400 mt-0.5">{station.id}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-600 transition-colors p-1">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="px-5 py-4 space-y-4">
          {/* Name */}
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
          </div>

          {/* Address + Zone */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
              <input type="text" value={address} onChange={e => setAddress(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Municipio / Zona</label>
              <input type="text" value={zone} onChange={e => setZone(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
            </div>
          </div>

          {/* Coordinates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Latitud *</label>
              <input type="text" inputMode="decimal" value={lat} onChange={e => setLat(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 font-mono" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Longitud *</label>
              <input type="text" inputMode="decimal" value={lng} onChange={e => setLng(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 font-mono" />
            </div>
          </div>

          {/* Network + Access + Status */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Operador</label>
              <input type="text" value={network} onChange={e => setNetwork(e.target.value)}
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Acceso</label>
              <select value={access} onChange={e => setAccess(e.target.value as typeof access)}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:border-green-400">
                <option value="public">Público</option>
                <option value="semi-public">Semi-público</option>
                <option value="private">Privado</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Estado</label>
              <select value={status} onChange={e => setStatus(e.target.value as typeof status)}
                className="w-full text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:border-green-400">
                <option value="active">Activo</option>
                <option value="maintenance">Mantenimiento</option>
                <option value="offline">Inactivo</option>
              </select>
            </div>
          </div>

          {/* Connectors */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-gray-700">Conectores *</label>
              <button type="button" onClick={addConnector} className="text-xs text-green-600 hover:text-green-800 font-medium">+ Agregar</button>
            </div>
            <div className="space-y-2">
              {connectors.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  <select value={c.type} onChange={e => updateConnector(i, 'type', e.target.value)}
                    className="flex-1 text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:border-green-400">
                    {CONNECTOR_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                  </select>
                  <select value={c.power_kw ?? ''} onChange={e => updateConnector(i, 'power_kw', e.target.value)}
                    className="w-24 text-sm border border-gray-200 rounded-lg px-2 py-2 focus:outline-none focus:border-green-400">
                    <option value="">— kW</option>
                    {POWER_OPTIONS.map(p => <option key={p} value={p}>{p} kW</option>)}
                  </select>
                  <span className="text-xs text-gray-400 w-7 text-center flex-shrink-0">{levelFromKw(c.power_kw) ?? '—'}</span>
                  {connectors.length > 1 && (
                    <button type="button" onClick={() => removeConnector(i)} className="text-gray-300 hover:text-red-400 transition-colors">
                      <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
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
            <input type="text" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="ej. Horario 6am–10pm · solo clientes"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
          </div>

          {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={submitting}
              className="flex-1 py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
              {submitting ? 'Guardando…' : 'Guardar cambios'}
            </button>

            {!confirmDelete ? (
              <button type="button" onClick={() => setConfirmDelete(true)}
                className="px-4 py-2.5 bg-red-50 hover:bg-red-100 text-red-600 text-sm font-medium rounded-xl transition-colors border border-red-100">
                Eliminar
              </button>
            ) : (
              <button type="button" onClick={handleDelete} disabled={submitting}
                className="px-4 py-2.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-medium rounded-xl transition-colors">
                ¿Confirmar?
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
