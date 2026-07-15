import { useState, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix Leaflet default icon URLs broken by bundlers (idempotent — safe if mounted more than once)
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const GUATEMALA_CITY: [number, number] = [14.6349, -90.5069];

type LocationMethod = 'gps' | 'pin' | 'gmaps' | 'browser' | 'manual';
type Coords = (lat: number | null, lng: number | null) => void;

function PickerMarker({ lat, lng, onChange }: { lat: number | null; lng: number | null; onChange: Coords }) {
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

// Recentra el mapa solo cuando `flyToken` cambia (búsqueda por dirección o GPS),
// nunca al arrastrar el pin — así no le pelea al usuario mientras ajusta a mano.
function MapFlyTo({ lat, lng, flyToken }: { lat: number | null; lng: number | null; flyToken: number }) {
  const map = useMap();
  useEffect(() => {
    if (lat != null && lng != null) map.flyTo([lat, lng], 17);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flyToken]);
  return null;
}

function LocationPickerMap({ lat, lng, flyToken, onChange }: { lat: number | null; lng: number | null; flyToken: number; onChange: Coords }) {
  const center: [number, number] = lat != null && lng != null ? [lat, lng] : GUATEMALA_CITY;
  return (
    <div className="rounded-lg overflow-hidden border border-gray-200" style={{ height: 280 }}>
      <MapContainer center={center} zoom={lat != null ? 16 : 12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
        <PickerMarker lat={lat} lng={lng} onChange={onChange} />
        <MapFlyTo lat={lat} lng={lng} flyToken={flyToken} />
      </MapContainer>
    </div>
  );
}

const OPTIONS: { key: LocationMethod; label: string; sublabel: string; icon: React.ReactNode }[] = [
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
];

interface LocationPickerProps {
  lat: number | null;
  lng: number | null;
  onChange: Coords;
  /** Lee nombre+dirección+zona al vuelo para precargar la búsqueda del método "Elegir en el mapa". */
  getSeedQuery: () => string;
  label?: string;
}

// Selector de ubicación compartido entre "Agregar estación" y "Editar estación" —
// deben ofrecer exactamente las mismas 5 formas de fijar coordenadas.
export default function LocationPicker({ lat, lng, onChange, getSeedQuery, label = 'Ubicación *' }: LocationPickerProps) {
  const [locationMethod, setLocationMethod] = useState<LocationMethod | null>(null);
  const [mapsUrl, setMapsUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [geoLocating, setGeoLocating] = useState(false);
  const [addressQuery, setAddressQuery] = useState('');
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [flyToken, setFlyToken] = useState(0);

  async function resolveLocation() {
    if (!mapsUrl.trim()) return;
    setResolving(true);
    setResolveError(null);
    try {
      const res = await fetch(`/api/resolve-location?url=${encodeURIComponent(mapsUrl.trim())}`);
      const data = await res.json() as { lat?: number; lng?: number; error?: string };
      if (!res.ok || data.error || data.lat == null || data.lng == null) {
        setResolveError(data.error ?? 'No se pudo resolver la ubicación');
        return;
      }
      onChange(data.lat, data.lng);
      setFlyToken(t => t + 1);
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
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        if (latitude < 13 || latitude > 18 || longitude < -93 || longitude > -88) {
          setResolveError('Ubicación fuera de Guatemala. Verifica que el GPS esté activo.');
          setGeoLocating(false);
          return;
        }
        onChange(latitude, longitude);
        setGeoLocating(false);
        setFlyToken(t => t + 1);
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

  async function searchAddress(query: string) {
    if (!query.trim()) return;
    setSearchingAddress(true);
    setResolveError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const data = await res.json() as { lat?: number; lng?: number; error?: string };
      if (!res.ok || data.error || data.lat == null || data.lng == null) {
        setResolveError(data.error ?? 'No se encontró esa dirección. Ajusta el pin manualmente.');
        return;
      }
      onChange(data.lat, data.lng);
      setFlyToken(t => t + 1);
    } catch {
      setResolveError('Error de red al buscar la dirección');
    } finally {
      setSearchingAddress(false);
    }
  }

  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-2">{label}</label>

      <div className="grid grid-cols-2 gap-1.5 mb-3">
        {OPTIONS.map(opt => (
          <button
            key={opt.key}
            type="button"
            onClick={() => {
              setLocationMethod(opt.key);
              setResolveError(null); setMapsUrl('');
              if (opt.key === 'gps') useMyLocation();
              if (opt.key === 'pin' && lat == null) {
                const guess = getSeedQuery();
                setAddressQuery(guess);
                if (guess) searchAddress(guess);
              }
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

      {/* Elegir en el mapa: buscar dirección para centrar, luego tocar/arrastrar el pin. No depende de Google. */}
      {locationMethod === 'pin' && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input
              type="text"
              value={addressQuery}
              onChange={e => setAddressQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); searchAddress(addressQuery); } }}
              placeholder="Buscar dirección para centrar el mapa…"
              className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-2.5 focus:outline-none focus:border-green-400 min-w-0"
            />
            <button
              type="button"
              onClick={() => searchAddress(addressQuery)}
              disabled={searchingAddress || !addressQuery.trim()}
              className="flex-shrink-0 px-3 py-2.5 text-xs font-medium rounded-lg bg-gray-100 hover:bg-gray-200 disabled:opacity-50 transition-colors whitespace-nowrap"
            >
              {searchingAddress ? 'Buscando…' : 'Buscar'}
            </button>
          </div>
          <LocationPickerMap lat={lat} lng={lng} flyToken={flyToken} onChange={onChange} />
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
            onChange={e => { setMapsUrl(e.target.value); setResolveError(null); }}
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
            onChange={e => { setMapsUrl(e.target.value); setResolveError(null); }}
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
              onChange={e => onChange(e.target.value ? parseFloat(e.target.value) : null, lng)}
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
              onChange={e => onChange(lat, e.target.value ? parseFloat(e.target.value) : null)}
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
  );
}
