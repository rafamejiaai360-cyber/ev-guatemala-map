import { useState } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store/useStore';
import type { ConnectorType, ChargerLevel, StationType } from '../types/index';

const CONNECTOR_TYPES: ConnectorType[] = ['CCS2', 'CCS1', 'CHAdeMO', 'Type2', 'J1772', 'GBT'];
const POWER_OPTIONS = [3.7, 7.4, 11, 22, 50, 100, 150, 350];

// Fix Leaflet default icon URLs broken by bundlers (idempotent, safe if Map.tsx already ran it)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const GUATEMALA_CITY: [number, number] = [14.6349, -90.5069];

function PickerMarker({ lat, lng, onChange }: { lat: number | null; lng: number | null; onChange: (lat: number, lng: number) => void }) {
  useMapEvents({
    click(e) { onChange(e.latlng.lat, e.latlng.lng); },
  });
  if (lat == null || lng == null) return null;
  return (
    <Marker
      position={[lat, lng]}
      draggable
      eventHandlers={{
        dragend: (e) => {
          const marker = e.target as L.Marker;
          const p = marker.getLatLng();
          onChange(p.lat, p.lng);
        },
      }}
    />
  );
}

function LocationPickerMap({ lat, lng, onChange }: { lat: number | null; lng: number | null; onChange: (lat: number, lng: number) => void }) {
  const center: [number, number] = lat != null && lng != null ? [lat, lng] : GUATEMALA_CITY;
  return (
    <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: 200 }}>
      <MapContainer center={center} zoom={lat != null ? 16 : 12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        <PickerMarker lat={lat} lng={lng} onChange={onChange} />
      </MapContainer>
    </div>
  );
}

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
  const [mapsUrl, setMapsUrl] = useState('');
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [geoLocating, setGeoLocating] = useState(false);
  const [locationMethod, setLocationMethod] = useState<'gps' | 'gmaps' | 'browser' | 'manual' | 'pin' | null>(null);
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
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-2">Ubicación *</label>

                {/* 4 option selector */}
                <div className="grid grid-cols-2 gap-1.5 mb-3">
                  {([
                    { key: 'gps', label: 'Ubicación actual', sublabel: 'GPS', icon: (
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                      </svg>
                    )},
                    { key: 'pin', label: 'Elegir en el mapa', sublabel: 'Tocar o arrastrar pin', icon: (
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.25 21h19.5" />
                      </svg>
                    )},
                    { key: 'gmaps', label: 'Link de Maps', sublabel: 'App de teléfono', icon: (
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 1.5H8.25A2.25 2.25 0 0 0 6 3.75v16.5a2.25 2.25 0 0 0 2.25 2.25h7.5A2.25 2.25 0 0 0 18 20.25V3.75a2.25 2.25 0 0 0-2.25-2.25H13.5m-3 0V3h3V1.5m-3 0h3" />
                      </svg>
                    )},
                    { key: 'browser', label: 'Link del navegador', sublabel: 'google.com/maps', icon: (
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 21a9.004 9.004 0 0 0 8.716-6.747M12 21a9.004 9.004 0 0 1-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3m0 0a8.997 8.997 0 0 1 7.843 4.582M12 3a8.997 8.997 0 0 0-7.843 4.582m15.686 0A11.953 11.953 0 0 1 12 10.5c-2.998 0-5.74-1.1-7.843-2.918m15.686 0A8.959 8.959 0 0 1 21 12c0 .778-.099 1.533-.284 2.253M3 12a8.959 8.959 0 0 0 .284 2.253" />
                      </svg>
                    )},
                    { key: 'manual', label: 'Coordenadas', sublabel: 'lat / lng manual', icon: (
                      <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 9h16.5m-16.5 6.75h16.5" />
                      </svg>
                    )},
                  ] as { key: 'gps' | 'pin' | 'gmaps' | 'browser' | 'manual'; label: string; sublabel: string; icon: React.ReactNode }[]).map(opt => (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => {
                        setLocationMethod(opt.key);
                        setLat(null); setLng(null); setResolveError(null); setMapsUrl('');
                        if (opt.key === 'gps') useMyLocation();
                        if (opt.key === 'pin') { setLat(GUATEMALA_CITY[0]); setLng(GUATEMALA_CITY[1]); }
                      }}
                      className={`flex flex-col items-start gap-0.5 px-3 py-2.5 rounded-xl border text-left transition-colors ${
                        locationMethod === opt.key
                          ? 'border-green-400 bg-green-50 text-green-700'
                          : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <span className="flex items-center gap-1.5 font-medium text-xs">{opt.icon}{opt.label}</span>
                      <span className="text-[10px] text-gray-400 pl-[22px]">{opt.sublabel}</span>
                    </button>
                  ))}
                </div>

                {/* GPS: spinner while locating */}
                {locationMethod === 'gps' && geoLocating && (
                  <div className="flex items-center gap-2 text-sm text-blue-600 py-2">
                    <div className="w-4 h-4 border-2 border-blue-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                    Obteniendo ubicación GPS…
                  </div>
                )}

                {/* Elegir en el mapa: tocar o arrastrar el pin, funciona sin depender de Google */}
                {locationMethod === 'pin' && (
                  <div className="space-y-2">
                    <LocationPickerMap lat={lat} lng={lng} onChange={(newLat, newLng) => { setLat(newLat); setLng(newLng); }} />
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-[11px] text-gray-400">Toca el mapa o arrastra el pin para ajustar</p>
                      <button
                        type="button"
                        onClick={useMyLocation}
                        disabled={geoLocating}
                        className="flex-shrink-0 px-2.5 py-1.5 text-[11px] font-medium rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors whitespace-nowrap"
                      >
                        {geoLocating ? 'Ubicando…' : '📍 Usar mi ubicación'}
                      </button>
                    </div>
                  </div>
                )}

                {/* Link de Maps (maps.app.goo.gl) */}
                {locationMethod === 'gmaps' && (
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={mapsUrl}
                      onChange={e => { setMapsUrl(e.target.value); setLat(null); setLng(null); setResolveError(null); }}
                      placeholder="https://maps.app.goo.gl/…"
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-green-400 min-w-0"
                      autoFocus
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
                )}

                {/* Link del navegador (full URL) */}
                {locationMethod === 'browser' && (
                  <div className="flex gap-2">
                    <input
                      type="url"
                      value={mapsUrl}
                      onChange={e => { setMapsUrl(e.target.value); setLat(null); setLng(null); setResolveError(null); }}
                      placeholder="https://www.google.com/maps/place/…"
                      className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-green-400 min-w-0"
                      autoFocus
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
                )}

                {/* Manual coords */}
                {locationMethod === 'manual' && (
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="block text-[10px] text-gray-500 mb-1">Latitud</label>
                      <input
                        type="number" step="0.000001"
                        value={lat ?? ''}
                        onChange={e => setLat(e.target.value ? parseFloat(e.target.value) : null)}
                        placeholder="14.6349"
                        className="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:border-green-400"
                        autoFocus
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
