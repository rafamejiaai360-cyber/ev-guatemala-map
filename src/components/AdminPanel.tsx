import { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import type { ChargerStatus, ConnectorType, ChargerLevel } from '../types';
import type { ChargerStation } from '../types';
import EditStationModal from './EditStationModal';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'stations' | 'add' | 'pending' | 'users';

interface UserInfo {
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: string;
  subscriptionEnd?: string;
}

interface PendingStation {
  notionId: string;
  id: string;
  name: string;
  address: string;
  zone: string;
  lat: number;
  lng: number;
  connectors: Array<{ type: string; power_kw: number; level: string }>;
  network: string;
  access: string;
  submittedBy: string;
  createdAt: string;
  kind: 'new' | 'correction';
  proposedLat?: number | null;
  proposedLng?: number | null;
  proposedVerification?: 'pending' | 'verified' | 'error';
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ChargerStatus; label: string; color: string }[] = [
  { value: 'active', label: 'Activo', color: 'bg-green-500' },
  { value: 'maintenance', label: 'Mantenimiento', color: 'bg-amber-400' },
  { value: 'offline', label: 'Inactivo', color: 'bg-red-500' },
];

const CONNECTOR_TYPES: ConnectorType[] = ['CCS2', 'CCS1', 'CHAdeMO', 'Type2', 'J1772', 'GBT'];
const POWER_OPTIONS = [3.7, 7.4, 11, 22, 50, 100, 150, 350];

interface ConnectorRow { type: ConnectorType; power_kw: number | null; }
function levelFromKw(kw: number | null): ChargerLevel | null { if (kw == null) return null; return kw > 22 ? 'DC' : kw >= 11 ? 'L2' : 'L1'; }

function generateId(name: string, zone: string): string {
  const z = zone.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 4);
  const n = name.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 20);
  return `${z || 'gt'}-${n}`;
}

// ─── Add Station Form ─────────────────────────────────────────────────────────

function AddStationForm({ onSuccess }: { onSuccess: (name: string) => void }) {
  const { loadDynamicStations, authToken } = useStore();

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
  const [connectors, setConnectors] = useState<ConnectorRow[]>([{ type: 'Type2', power_kw: null }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addConnector() { setConnectors(p => [...p, { type: 'Type2', power_kw: null }]); }
  function removeConnector(i: number) { setConnectors(p => p.filter((_, idx) => idx !== i)); }
  function updateConnector(i: number, field: keyof ConnectorRow, value: string) {
    setConnectors(p => p.map((c, idx) => idx === i ? { ...c, [field]: field === 'power_kw' ? (value === '' ? null : Number(value)) : value } : c));
  }

  async function resolveLocation() {
    if (!mapsUrl.trim()) return;
    setResolving(true); setResolveError(null); setLat(null); setLng(null);
    try {
      const res = await fetch(`/api/resolve-location?url=${encodeURIComponent(mapsUrl.trim())}`);
      const data = await res.json() as { lat?: number; lng?: number; error?: string };
      if (!res.ok || data.error) { setResolveError(data.error ?? 'No se pudo resolver'); return; }
      if (data.lat == null || data.lng == null) { setResolveError('Respuesta inesperada'); return; }
      setLat(data.lat); setLng(data.lng);
    } catch { setResolveError('Error de red'); } finally { setResolving(false); }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) { setError('El nombre es obligatorio'); return; }
    if (lat == null || lng == null) { setError('Resuelve la ubicación primero'); return; }
    if (lat < 13 || lat > 18 || lng < -93 || lng > -88) { setError('Coordenadas fuera de Guatemala'); return; }
    if (connectors.length === 0) { setError('Agrega al menos un conector'); return; }

    setSubmitting(true);
    try {
      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}) },
        body: JSON.stringify({
          id: generateId(name, zone), name: name.trim(), address: address.trim(),
          zone: zone.trim() || 'Guatemala', lat, lng,
          network: network.trim() || 'Desconocido', status: 'active',
          connectors: connectors.map(c => ({ type: c.type, ...(c.power_kw != null && { power_kw: c.power_kw, level: levelFromKw(c.power_kw) }) })),
          access, source: 'Manual', ...(notes.trim() && { notes: notes.trim() }),
        }),
      });
      if (!res.ok) { const e = await res.json() as { error?: string }; throw new Error(e.error ?? `Error ${res.status}`); }
      await loadDynamicStations();
      const savedName = name.trim();
      setName(''); setAddress(''); setZone(''); setMapsUrl(''); setLat(null); setLng(null);
      setNetwork(''); setNotes(''); setAccess('public'); setConnectors([{ type: 'Type2', power_kw: null }]);
      onSuccess(savedName);
    } catch (e) { setError(e instanceof Error ? e.message : 'Error al guardar'); }
    finally { setSubmitting(false); }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-lg">
      {/* Name */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
        <input type="text" value={name} onChange={e => setName(e.target.value)}
          placeholder="ej. Pollo Campero Chimaltenango"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
      </div>

      {/* Address + Zone */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Dirección</label>
          <input type="text" value={address} onChange={e => setAddress(e.target.value)}
            placeholder="ej. Km 54 CA-1"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Municipio / Zona</label>
          <input type="text" value={zone} onChange={e => setZone(e.target.value)}
            placeholder="ej. Chimaltenango"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
        </div>
      </div>

      {/* Google Maps URL resolver */}
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Ubicación * <span className="font-normal text-gray-400">— Copia el link de Google Maps y presiona Resolver</span>
        </label>
        <div className="flex gap-2">
          <input type="url" value={mapsUrl} onChange={e => { setMapsUrl(e.target.value); setResolveError(null); setLat(null); setLng(null); }}
            placeholder="https://maps.app.goo.gl/..."
            className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
          <button type="button" onClick={resolveLocation} disabled={resolving || !mapsUrl.trim()}
            className="px-3 py-2 text-xs font-medium bg-gray-100 hover:bg-gray-200 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap">
            {resolving ? 'Buscando…' : 'Resolver'}
          </button>
        </div>
        {resolveError && <p className="text-xs text-red-500 mt-1">{resolveError}</p>}
        {lat != null && lng != null && (
          <p className="text-xs text-green-600 mt-1 font-medium">✓ Coordenadas: {lat.toFixed(5)}, {lng.toFixed(5)}</p>
        )}
      </div>

      {/* Network + Access */}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Red / Operador</label>
          <input type="text" value={network} onChange={e => setNetwork(e.target.value)}
            placeholder="ej. Electron Power"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Acceso</label>
          <select value={access} onChange={e => setAccess(e.target.value as typeof access)}
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400">
            <option value="public">Público</option>
            <option value="semi-public">Semi-público</option>
            <option value="private">Privado</option>
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
              <span className="text-xs text-gray-400 w-7 text-center">{levelFromKw(c.power_kw) ?? '—'}</span>
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
          placeholder="ej. Clientes individuales · Horario 6am–10pm"
          className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400" />
      </div>

      {error && <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

      <button type="submit" disabled={submitting}
        className="w-full py-3 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors">
        {submitting ? 'Guardando en Notion…' : 'Guardar estación en mapa y Notion'}
      </button>
    </form>
  );
}

// ─── Stations Tab ─────────────────────────────────────────────────────────────

function StationsTab() {
  const { stations, setStationStatus, currentUser } = useStore();
  const [search, setSearch] = useState('');
  const [editStation, setEditStation] = useState<ChargerStation | null>(null);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  const filtered = stations.filter(s =>
    !search ||
    s.name.toLowerCase().includes(search.toLowerCase()) ||
    s.zone.toLowerCase().includes(search.toLowerCase())
  );

  function showSaved(msg: string) {
    setSavedMsg(msg); setTimeout(() => setSavedMsg(null), 4000);
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-3 gap-3">
        <p className="text-xs text-gray-500">{stations.length} estaciones en total</p>
        {savedMsg && <span className="text-xs text-green-600 font-medium bg-green-50 px-3 py-1.5 rounded-xl border border-green-100">✓ {savedMsg}</span>}
        <input type="text" value={search} onChange={e => setSearch(e.target.value)}
          placeholder="Buscar estación…"
          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-44 focus:outline-none focus:border-green-400" />
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {filtered.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">Sin resultados para "{search}"</p>
        )}
        {filtered.map((station, idx) => (
          <div key={station.id}
            className={`flex items-center gap-3 px-4 py-3 ${idx < filtered.length - 1 ? 'border-b border-gray-100' : ''}`}>
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
              station.status === 'active' ? 'bg-green-500' :
              station.status === 'maintenance' ? 'bg-amber-400' : 'bg-red-500'}`} />

            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">{station.name}</div>
              <div className="text-xs text-gray-400">{station.zone} · {station.id}</div>
            </div>

            {/* Status buttons */}
            <div className="flex items-center gap-1">
              {STATUS_OPTIONS.map(opt => (
                <button key={opt.value} onClick={() => setStationStatus(station.id, opt.value)} title={opt.label}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                    station.status === opt.value ? `${opt.color} border-transparent scale-110` : 'bg-gray-100 border-gray-200 hover:border-gray-300'}`} />
              ))}
            </div>

            {/* Edit button */}
            {currentUser?.role === 'admin' && (
              <button onClick={() => setEditStation(station)} title="Editar"
                className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0">
                <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Status legend */}
      <div className="flex items-center gap-4 mt-3">
        {STATUS_OPTIONS.map(opt => (
          <div key={opt.value} className="flex items-center gap-1.5 text-xs text-gray-400">
            <span className={`w-2 h-2 rounded-full ${opt.color}`} />
            {opt.label}
          </div>
        ))}
      </div>

      {editStation && (
        <EditStationModal
          station={editStation}
          onClose={() => setEditStation(null)}
          onSaved={() => { setEditStation(null); showSaved(`"${editStation.name}" actualizada`); }}
        />
      )}
    </div>
  );
}

// ─── Pending Stations Tab ─────────────────────────────────────────────────────

function PendingTab() {
  const { authToken, loadDynamicStations } = useStore();
  const [stations, setStations] = useState<PendingStation[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [processing, setProcessing] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/stations/pending', { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setStations(data as PendingStation[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, [authToken]);

  async function handleAction(station: PendingStation, action: 'approve' | 'reject') {
    setProcessing(station.id);
    try {
      const res = await fetch(`/api/stations/${station.id}/${action}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!res.ok) throw new Error('Error en la acción');
      setStations(prev => prev.filter(s => s.id !== station.id));
      await loadDynamicStations();
      if (action === 'approve') {
        setActionMsg(station.kind === 'correction'
          ? `Corrección de "${station.name}" aplicada`
          : `"${station.name}" aprobada y publicada en el mapa`);
      } else {
        setActionMsg(station.kind === 'correction'
          ? `Corrección de "${station.name}" descartada`
          : `"${station.name}" rechazada y eliminada`);
      }
      setTimeout(() => setActionMsg(null), 5000);
    } catch {
      setActionMsg('Error procesando la acción');
      setTimeout(() => setActionMsg(null), 4000);
    } finally {
      setProcessing(null);
    }
  }

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">Cargando propuestas…</p>;

  return (
    <div>
      {actionMsg && (
        <div className="mb-3 text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-2">
          ✓ {actionMsg}
        </div>
      )}

      {stations.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-200 px-4 py-10 text-center">
          <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-3">
            <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-gray-400">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
          </div>
          <p className="text-sm font-medium text-gray-700">Sin propuestas pendientes</p>
          <p className="text-xs text-gray-400 mt-1">Cuando los usuarios propongan estaciones aparecerán aquí</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stations.map(station => (
            <div key={station.id} className="bg-white rounded-xl border border-amber-200 overflow-hidden">
              <div className="px-4 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                  <span className="text-xs font-medium text-amber-700">
                    {station.kind === 'correction' ? 'Corrección de ubicación pendiente' : 'Estación nueva pendiente de revisión'}
                  </span>
                </div>
                <span className="text-[10px] text-gray-400">
                  {new Date(station.createdAt).toLocaleDateString('es-GT')} · por {station.submittedBy}
                </span>
              </div>
              <div className="px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{station.name}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {[station.address, station.zone].filter(Boolean).join(' · ')}
                    </p>
                    {station.kind === 'correction' ? (
                      <div className="mt-2 space-y-1">
                        {station.proposedVerification === 'error' && (
                          <p className="text-[11px] text-red-600 font-medium">⚠ Reportada como ubicación errónea</p>
                        )}
                        <p className="text-[10px] text-gray-400 font-mono">
                          Actual: {station.lat.toFixed(5)}, {station.lng.toFixed(5)}
                        </p>
                        {station.proposedLat != null && station.proposedLng != null && (
                          <p className="text-[10px] text-blue-600 font-mono">
                            Propuesta: {station.proposedLat.toFixed(5)}, {station.proposedLng.toFixed(5)}
                          </p>
                        )}
                      </div>
                    ) : (
                      <>
                        <p className="text-xs text-gray-400 mt-0.5">
                          Red: {station.network} · Acceso: {station.access}
                        </p>
                        <div className="flex flex-wrap gap-1 mt-2">
                          {station.connectors.map((c, i) => (
                            <span key={i} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
                              {c.type}{c.power_kw ? ` ${c.power_kw}kW` : ''}
                            </span>
                          ))}
                        </div>
                        <p className="text-[10px] text-gray-400 mt-1 font-mono">
                          {station.lat.toFixed(5)}, {station.lng.toFixed(5)}
                        </p>
                      </>
                    )}
                  </div>
                  <div className="flex flex-col gap-2 flex-shrink-0">
                    <button
                      onClick={() => handleAction(station, 'approve')}
                      disabled={processing === station.id}
                      className="px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5">
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                      </svg>
                      Aprobar
                    </button>
                    <button
                      onClick={() => handleAction(station, 'reject')}
                      disabled={processing === station.id}
                      className="px-3 py-1.5 bg-red-50 hover:bg-red-100 disabled:opacity-50 text-red-500 text-xs font-medium rounded-lg border border-red-100 transition-colors flex items-center gap-1.5">
                      <svg width="12" height="12" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                      </svg>
                      Rechazar
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      <p className="text-xs text-gray-400 mt-3">
        {stations.length} propuesta{stations.length !== 1 ? 's' : ''} pendiente{stations.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab() {
  const { authToken } = useStore();
  const [users, setUsers] = useState<UserInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [subEnd, setSubEnd] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/auth/users', { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setUsers(data as UserInfo[]); setLoading(false); })
      .catch(() => setLoading(false));
  }, [authToken]);

  async function saveSubscription(email: string) {
    setSaving(true);
    try {
      await fetch('/api/auth/set-subscription', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authToken}` },
        body: JSON.stringify({ email, subscriptionEnd: subEnd || null }),
      });
      setUsers(prev => prev.map(u => u.email === email ? { ...u, subscriptionEnd: subEnd || undefined } : u));
      setEditingEmail(null);
      setSavedMsg(`Suscripción de ${email} actualizada`);
      setTimeout(() => setSavedMsg(null), 4000);
    } finally { setSaving(false); }
  }

  if (loading) return <p className="text-sm text-gray-400 py-8 text-center">Cargando usuarios…</p>;

  return (
    <div>
      {savedMsg && (
        <div className="mb-3 text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-2">
          ✓ {savedMsg}
        </div>
      )}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {users.length === 0 && (
          <p className="px-4 py-8 text-center text-sm text-gray-400">No hay usuarios registrados</p>
        )}
        {users.map((user, idx) => (
          <div key={user.email}
            className={`px-4 py-3 ${idx < users.length - 1 ? 'border-b border-gray-100' : ''}`}>
            <div className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 ${user.role === 'admin' ? 'bg-green-600' : 'bg-blue-500'}`}>
                {user.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900">{user.name}</span>
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
                    user.role === 'admin' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                    {user.role === 'admin' ? 'Admin' : 'Usuario'}
                  </span>
                </div>
                <div className="text-xs text-gray-400">{user.email}</div>
                <div className="text-xs text-gray-400 mt-0.5">
                  Registro: {new Date(user.createdAt).toLocaleDateString('es-GT')}
                  {user.subscriptionEnd && (
                    <span className={`ml-2 font-medium ${new Date(user.subscriptionEnd) > new Date() ? 'text-green-600' : 'text-red-500'}`}>
                      · Suscripción: {new Date(user.subscriptionEnd) > new Date() ? 'activa hasta' : 'venció'} {new Date(user.subscriptionEnd).toLocaleDateString('es-GT')}
                    </span>
                  )}
                  {!user.subscriptionEnd && <span className="ml-2 text-gray-300">· Sin suscripción</span>}
                </div>
              </div>

              <button onClick={() => { setEditingEmail(editingEmail === user.email ? null : user.email); setSubEnd(user.subscriptionEnd ?? ''); }}
                className="text-xs px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors text-gray-600 flex-shrink-0">
                {editingEmail === user.email ? 'Cancelar' : 'Suscripción'}
              </button>
            </div>

            {/* Subscription editor */}
            {editingEmail === user.email && (
              <div className="mt-3 pt-3 border-t border-gray-100 flex items-center gap-3">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-600 mb-1">
                    Fecha de vencimiento de suscripción
                    <span className="font-normal text-gray-400 ml-1">(vacío = sin suscripción)</span>
                  </label>
                  <input type="date" value={subEnd} onChange={e => setSubEnd(e.target.value)}
                    min={new Date().toISOString().split('T')[0]}
                    className="text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:border-green-400 w-48" />
                </div>
                <button onClick={() => saveSubscription(user.email)} disabled={saving}
                  className="px-4 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white text-xs font-medium rounded-lg transition-colors mt-4">
                  {saving ? 'Guardando…' : 'Guardar'}
                </button>
                {subEnd && (
                  <button onClick={() => { setSubEnd(''); saveSubscription(user.email); }} disabled={saving}
                    className="px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-500 text-xs font-medium rounded-lg transition-colors mt-4 border border-red-100">
                    Quitar
                  </button>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
      <p className="text-xs text-gray-400 mt-3">
        {users.length} usuario{users.length !== 1 ? 's' : ''} registrado{users.length !== 1 ? 's' : ''}
      </p>
    </div>
  );
}

// ─── Main Admin Panel ─────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { currentUser, logoutUser, authToken, loadCurrentUser, isAdminAuthenticated } = useStore();
  const [tab, setTab] = useState<Tab>('stations');
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    loadCurrentUser();
  }, []);

  function handleStationAdded(name: string) {
    setSuccessMsg(`"${name}" guardada correctamente`);
    setTimeout(() => setSuccessMsg(null), 5000);
    setTab('stations');
  }

  // Still loading auth from server (token exists but user data not fetched yet)
  if (authToken && !currentUser) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Cargando panel…</span>
        </div>
      </div>
    );
  }

  // Access: admin via JWT role OR via legacy admin flag (set on login)
  const hasAdminAccess = currentUser?.role === 'admin' || isAdminAuthenticated;

  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-8 max-w-sm w-full text-center">
          <div className="w-12 h-12 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg width="22" height="22" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} className="text-red-500">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </div>
          <h2 className="text-base font-semibold text-gray-900 mb-1">Acceso restringido</h2>
          <p className="text-sm text-gray-400 mb-5">Necesitas iniciar sesión con una cuenta de administrador para acceder a este panel.</p>
          <a href="/" className="block w-full py-2.5 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-xl transition-colors">
            Ir al mapa e iniciar sesión
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top nav */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6 py-3 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <a href="/" className="text-gray-400 hover:text-gray-700 transition-colors">
              <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
              </svg>
            </a>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-gray-900">⚡ EV Guatemala</span>
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Admin</span>
              </div>
              <p className="text-[11px] text-gray-400">Panel de administración · {currentUser?.name ?? 'Administrador'}</p>
            </div>
          </div>
          <button onClick={logoutUser}
            className="text-xs text-gray-400 hover:text-red-500 transition-colors flex items-center gap-1.5">
            <svg width="13" height="13" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0 0 13.5 3h-6a2.25 2.25 0 0 0-2.25 2.25v13.5A2.25 2.25 0 0 0 7.5 21h6a2.25 2.25 0 0 0 2.25-2.25V15m3 0 3-3m0 0-3-3m3 3H9" />
            </svg>
            Salir
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b border-gray-200 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex gap-0">
          {([
            { id: 'stations', label: 'Estaciones', icon: 'M17.657 16.657 13.414 20.9a1.998 1.998 0 0 1-2.827 0l-4.244-4.243a8 8 0 1 1 11.314 0z' },
            { id: 'add', label: 'Agregar', icon: 'M12 4v16m8-8H4' },
            { id: 'pending', label: 'Pendientes', icon: 'M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z' },
            { id: 'users', label: 'Usuarios', icon: 'M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z' },
          ] as const).map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium border-b-2 transition-colors ${
                tab === t.id
                  ? 'text-green-700 border-green-500'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}>
              <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d={t.icon} />
              </svg>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6">
        {successMsg && (
          <div className="mb-4 text-xs text-green-700 bg-green-50 border border-green-100 rounded-xl px-4 py-3 flex items-center gap-2">
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            {successMsg}
          </div>
        )}

        {tab === 'stations' && <StationsTab />}

        {tab === 'add' && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Nueva estación de carga</h2>
            <p className="text-xs text-gray-400 mb-5">Se guarda en Notion y aparece en el mapa para todos los usuarios</p>
            <AddStationForm onSuccess={handleStationAdded} />
          </div>
        )}

        {tab === 'pending' && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Propuestas pendientes</h2>
            <p className="text-xs text-gray-400 mb-5">Revisa y aprueba o rechaza las estaciones propuestas por usuarios</p>
            <PendingTab />
          </div>
        )}

        {tab === 'users' && (
          <div>
            <h2 className="text-sm font-semibold text-gray-900 mb-1">Usuarios registrados</h2>
            <p className="text-xs text-gray-400 mb-5">Gestiona las cuentas y suscripciones de los usuarios</p>
            <UsersTab />
          </div>
        )}
      </div>
    </div>
  );
}
