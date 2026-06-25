import { useState } from 'react';
import { useStore } from '../store/useStore';
import type { ChargerStatus, ConnectorType, ChargerLevel } from '../types';
import type { ChargerStation } from '../types';
import EditStationModal from './EditStationModal';

// ─── Status editor ────────────────────────────────────────────────────────────

const STATUS_OPTIONS: { value: ChargerStatus; label: string; color: string }[] = [
  { value: 'active', label: 'Activo', color: 'bg-green-500' },
  { value: 'maintenance', label: 'Mantenimiento', color: 'bg-amber-400' },
  { value: 'offline', label: 'Fuera de servicio', color: 'bg-red-500' },
];

const CONNECTOR_TYPES: ConnectorType[] = ['CCS2', 'CCS1', 'CHAdeMO', 'Type2', 'J1772', 'GBT'];
const POWER_OPTIONS = [3.7, 7.4, 11, 22, 50, 100, 150, 350];

interface ConnectorRow {
  type: ConnectorType;
  power_kw: number;
}

function levelFromKw(kw: number): ChargerLevel {
  return kw > 22 ? 'DC' : kw >= 11 ? 'L2' : 'L1';
}

// ─── Add Station Form ─────────────────────────────────────────────────────────

function AddStationForm({ onSuccess }: { onSuccess: () => void }) {
  const { loadDynamicStations } = useStore();

  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [zone, setZone] = useState('');
  const [lat, setLat] = useState('');
  const [lng, setLng] = useState('');
  const [network, setNetwork] = useState('');
  const [access, setAccess] = useState<'public' | 'semi-public' | 'private'>('public');
  const [notes, setNotes] = useState('');
  const [connectors, setConnectors] = useState<ConnectorRow[]>([
    { type: 'Type2', power_kw: 22 },
  ]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addConnector() {
    setConnectors(prev => [...prev, { type: 'Type2', power_kw: 22 }]);
  }

  function removeConnector(i: number) {
    setConnectors(prev => prev.filter((_, idx) => idx !== i));
  }

  function updateConnector(i: number, field: keyof ConnectorRow, value: string) {
    setConnectors(prev => prev.map((c, idx) =>
      idx === i
        ? { ...c, [field]: field === 'power_kw' ? Number(value) : value }
        : c
    ));
  }

  function generateId(name: string, zone: string): string {
    const zonePart = zone.toLowerCase().slice(0, 3).replace(/\s/g, '');
    const namePart = name.toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 20);
    return `${zonePart}-${namePart}`;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const latNum = parseFloat(lat);
    const lngNum = parseFloat(lng);
    if (!name.trim()) { setError('El nombre es obligatorio'); return; }
    if (isNaN(latNum) || isNaN(lngNum)) { setError('Latitud y longitud deben ser números válidos'); return; }
    if (latNum < 13 || latNum > 18 || lngNum < -93 || lngNum > -88) {
      setError('Las coordenadas parecen estar fuera de Guatemala. Verifica latitud y longitud.');
      return;
    }
    if (connectors.length === 0) { setError('Agrega al menos un conector'); return; }

    setSubmitting(true);
    try {
      const payload = {
        id: generateId(name, zone || 'gt'),
        name: name.trim(),
        address: address.trim(),
        zone: zone.trim() || 'Guatemala',
        lat: latNum,
        lng: lngNum,
        network: network.trim() || 'Desconocido',
        status: 'active',
        connectors: connectors.map(c => ({
          type: c.type,
          power_kw: c.power_kw,
          level: levelFromKw(c.power_kw),
        })),
        access,
        source: 'Manual',
        notes: notes.trim() || undefined,
      };

      const res = await fetch('/api/stations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        throw new Error(err.error ?? `Error ${res.status}`);
      }

      // Reset form
      setName(''); setAddress(''); setZone(''); setLat(''); setLng('');
      setNetwork(''); setNotes(''); setAccess('public');
      setConnectors([{ type: 'Type2', power_kw: 22 }]);

      await loadDynamicStations();
      onSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error al guardar');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden mb-6">
      <div className="px-5 py-4 border-b border-gray-100 bg-green-50">
        <h2 className="text-sm font-semibold text-green-800">Nueva estación de carga</h2>
        <p className="text-xs text-green-600 mt-0.5">Se guarda en Notion y aparece en el mapa para todos los usuarios</p>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Name */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nombre *</label>
          <input
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="ej. Pollo Campero Chimaltenango"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 bg-white"
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
              placeholder="ej. Km 54 Carretera Interamericana"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Zona / Municipio</label>
            <input
              type="text"
              value={zone}
              onChange={e => setZone(e.target.value)}
              placeholder="ej. Chimaltenango"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 bg-white"
            />
          </div>
        </div>

        {/* Coordinates */}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Coordenadas *
            <span className="font-normal text-gray-400 ml-1">— copia desde Google Maps: mantén presionado el punto y copia el par de números</span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <input
              type="text"
              inputMode="decimal"
              value={lat}
              onChange={e => setLat(e.target.value)}
              placeholder="Latitud  ej. 14.6408"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 bg-white font-mono"
            />
            <input
              type="text"
              inputMode="decimal"
              value={lng}
              onChange={e => setLng(e.target.value)}
              placeholder="Longitud  ej. -90.5133"
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 bg-white font-mono"
            />
          </div>
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
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 bg-white"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Acceso</label>
            <select
              value={access}
              onChange={e => setAccess(e.target.value as typeof access)}
              className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 bg-white"
            >
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
            <button
              type="button"
              onClick={addConnector}
              className="text-xs text-green-600 hover:text-green-800 font-medium transition-colors"
            >
              + Agregar conector
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
                  {CONNECTOR_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
                <select
                  value={c.power_kw}
                  onChange={e => updateConnector(i, 'power_kw', e.target.value)}
                  className="w-28 text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 bg-white"
                >
                  {POWER_OPTIONS.map(p => (
                    <option key={p} value={p}>{p} kW</option>
                  ))}
                </select>
                <span className="text-xs text-gray-400 w-8 text-center flex-shrink-0">
                  {levelFromKw(c.power_kw)}
                </span>
                {connectors.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeConnector(i)}
                    className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                  >
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
          <input
            type="text"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="ej. Horario 6am–10pm · solo clientes"
            className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400 bg-white"
          />
        </div>

        {error && (
          <p className="text-xs text-red-500 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors"
        >
          {submitting ? 'Guardando en Notion…' : 'Guardar estación en mapa y Notion'}
        </button>
      </div>
    </form>
  );
}

// ─── Main Admin Panel ─────────────────────────────────────────────────────────

export default function AdminPanel() {
  const { stations, setStationStatus, currentUser } = useStore();
  const [showForm, setShowForm] = useState(false);
  const [lastAdded, setLastAdded] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [editStation, setEditStation] = useState<ChargerStation | null>(null);

  function handleSuccess() {
    setShowForm(false);
    setLastAdded(new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }));
    setTimeout(() => setLastAdded(null), 5000);
  }

  function handleEditSaved() {
    setEditStation(null);
    setLastAdded(new Date().toLocaleTimeString('es-GT', { hour: '2-digit', minute: '2-digit' }));
    setTimeout(() => setLastAdded(null), 5000);
  }

  const filtered = search
    ? stations.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.zone.toLowerCase().includes(search.toLowerCase())
      )
    : stations;

  return (
    <div className="min-h-screen bg-gray-50 p-4 sm:p-6">
      <div className="max-w-2xl mx-auto">

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-lg">⚡</span>
            <span className="text-sm font-medium text-green-600">EV Guatemala</span>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900">Panel de Administración</h1>

          <div className="flex items-center gap-3 mt-3">
            <button
              onClick={() => { setShowForm(f => !f); setLastAdded(null); }}
              className={`flex items-center gap-2 text-sm px-4 py-2 rounded-xl font-medium transition-all ${
                showForm
                  ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  : 'bg-green-600 hover:bg-green-700 text-white shadow-sm'
              }`}
            >
              {showForm ? (
                <>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                  Cancelar
                </>
              ) : (
                <>
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                  </svg>
                  Agregar estación
                </>
              )}
            </button>

            {lastAdded && (
              <span className="text-xs text-green-600 font-medium bg-green-50 px-3 py-1.5 rounded-xl border border-green-100">
                ✓ Guardada a las {lastAdded}
              </span>
            )}
          </div>
        </div>

        {/* Add station form */}
        {showForm && <AddStationForm onSuccess={handleSuccess} />}

        {/* Station list */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
              Estaciones ({stations.length})
            </p>
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar…"
              className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 w-36 focus:outline-none focus:border-green-400"
            />
          </div>

          {filtered.map((station, idx) => (
            <div
              key={station.id}
              className={`flex items-center gap-3 px-4 py-3 ${idx < filtered.length - 1 ? 'border-b border-gray-100' : ''}`}
            >
              <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                station.status === 'active' ? 'bg-green-500' :
                station.status === 'maintenance' ? 'bg-amber-400' : 'bg-red-500'
              }`} />

              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{station.name}</div>
                <div className="text-xs text-gray-400">{station.zone}</div>
              </div>

              <div className="flex items-center gap-1.5">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStationStatus(station.id, opt.value)}
                    title={opt.label}
                    className={`w-6 h-6 rounded-full border-2 transition-all duration-150 ${
                      station.status === opt.value
                        ? `${opt.color} border-transparent scale-110`
                        : 'bg-gray-100 border-gray-200 hover:border-gray-300'
                    }`}
                  />
                ))}
              </div>

              <span className="text-xs text-gray-400 w-20 text-right flex-shrink-0 hidden sm:block">
                {STATUS_OPTIONS.find((o) => o.value === station.status)?.label}
              </span>

              {/* Edit button — only for stations from Notion (dynamic), requires JWT admin */}
              {currentUser?.role === 'admin' && (
                <button
                  onClick={() => setEditStation(station)}
                  title="Editar estación"
                  className="p-1.5 text-gray-300 hover:text-blue-500 hover:bg-blue-50 rounded-lg transition-colors flex-shrink-0"
                >
                  <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Zm0 0L19.5 7.125" />
                  </svg>
                </button>
              )}
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="px-4 py-8 text-center text-sm text-gray-400">
              Sin resultados para "{search}"
            </div>
          )}
        </div>

        {/* Legend + nav */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex items-center gap-4 text-xs text-gray-400">
            {STATUS_OPTIONS.map((opt) => (
              <div key={opt.value} className="flex items-center gap-1.5">
                <span className={`w-2.5 h-2.5 rounded-full ${opt.color}`} />
                {opt.label}
              </div>
            ))}
          </div>
          <a href="/" className="text-xs text-gray-400 hover:text-gray-700 transition-colors">
            ← Volver al mapa
          </a>
        </div>

        {!currentUser && (
          <p className="mt-4 text-xs text-amber-600 bg-amber-50 border border-amber-100 rounded-xl px-4 py-3">
            Inicia sesión con tu cuenta de administrador para poder editar y eliminar estaciones.
          </p>
        )}
      </div>

      {editStation && (
        <EditStationModal
          station={editStation}
          onClose={() => setEditStation(null)}
          onSaved={handleEditSaved}
        />
      )}
    </div>
  );
}
