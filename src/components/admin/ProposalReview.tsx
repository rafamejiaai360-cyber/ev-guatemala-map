import { useEffect, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Polyline, CircleMarker, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../../store/useStore';
import { haversineKm, formatDistance } from '../../utils/geo';

type LatLng = { lat: number; lng: number };

// Radio para avisar de posibles duplicados (otra estación ya publicada cerca).
const DUPLICATE_RADIUS_KM = 0.3;

const pinIcon = (color: string, label: string) => L.divIcon({
  className: '',
  iconSize: [28, 38],
  iconAnchor: [14, 37],
  html: `<div style="position:relative;width:28px;height:38px">
    <svg viewBox="0 0 28 38" width="28" height="38" style="filter:drop-shadow(0 1px 2px rgba(0,0,0,.35))">
      <path d="M14 1C7 1 1.5 6.4 1.5 13.3 1.5 22.5 14 37 14 37s12.5-14.5 12.5-23.7C26.5 6.4 21 1 14 1z" fill="${color}" stroke="#fff" stroke-width="2"/>
    </svg>
    <span style="position:absolute;top:5px;left:0;width:28px;text-align:center;color:#fff;font:700 12px system-ui">${label}</span>
  </div>`,
});
const PROPOSED_ICON = pinIcon('#2563eb', 'P');
const CURRENT_ICON = pinIcon('#9ca3af', 'A');
const ADJUSTED_ICON = pinIcon('#16a34a', '✓');

function FitBounds({ points }: { points: LatLng[] }) {
  const map = useMap();
  const key = points.map(p => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|');
  useEffect(() => {
    if (points.length === 1) map.setView([points[0].lat, points[0].lng], 18);
    else if (points.length > 1) map.fitBounds(L.latLngBounds(points.map(p => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 18 });
    // Solo al abrir / cambiar los puntos de la propuesta, no al mover el pin.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}

interface Props {
  stationId: string;
  name: string;
  /** Dirección escrita por quien propuso. */
  address: string;
  /** Ubicación propuesta (estación nueva, o corrección con lat/lng). */
  proposed: LatLng | null;
  /** Ubicación publicada hoy (solo en correcciones). */
  current: LatLng | null;
  adjusted: LatLng | null;
  onAdjust: (p: LatLng | null) => void;
}

// Revisión de ubicación antes de aprobar (oct 2026, pedido de Rafa): mapa con
// el punto propuesto (y el actual si es corrección), vista satélite, aviso de
// posibles duplicados, lo que OpenStreetMap dice que hay en ese punto, enlaces
// a Google Maps / Street View / Waze, y opción de mover el pin para aprobar
// con la ubicación corregida.
export default function ProposalReview({ stationId, name, address, proposed, current, adjusted, onAdjust }: Props) {
  const { stations, dynamicLoaded, loadDynamicStations } = useStore();
  const [satellite, setSatellite] = useState(true);
  const [moving, setMoving] = useState(false);
  // Respuesta de OpenStreetMap ligada al punto consultado ("lat,lng").
  const [place, setPlace] = useState<{ key: string; text: string | 'error' } | null>(null);

  const target = adjusted ?? proposed ?? current;

  useEffect(() => { if (!dynamicLoaded) loadDynamicStations(); }, [dynamicLoaded, loadDynamicStations]);

  // Qué hay en ese punto según OpenStreetMap (gratis, sin llave). Se pide
  // solo al abrir la revisión o al mover el pin.
  const targetKey = target ? `${target.lat.toFixed(6)},${target.lng.toFixed(6)}` : '';
  useEffect(() => {
    if (!targetKey) return;
    let cancelled = false;
    const [lat, lng] = targetKey.split(',');
    const t = setTimeout(() => {
      fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&accept-language=es&lat=${lat}&lon=${lng}`)
        .then(r => r.ok ? r.json() : Promise.reject())
        .then((d: { display_name?: string }) => { if (!cancelled) setPlace({ key: targetKey, text: d.display_name ?? 'error' }); })
        .catch(() => { if (!cancelled) setPlace({ key: targetKey, text: 'error' }); });
    }, 600);
    return () => { cancelled = true; clearTimeout(t); };
  }, [targetKey]);
  const placeText = place?.key === targetKey ? place.text : null;

  const nearby = useMemo(() => {
    if (!target) return [];
    return stations
      .filter(s => s.id !== stationId)
      .map(s => ({ s, km: haversineKm(target.lat, target.lng, s.lat, s.lng) }))
      .filter(x => x.km <= DUPLICATE_RADIUS_KM)
      .sort((a, b) => a.km - b.km);
  }, [stations, stationId, target]);

  if (!target) return null;

  const moved = proposed && current ? haversineKm(current.lat, current.lng, proposed.lat, proposed.lng) : null;
  const fitPoints = [proposed, current].filter((p): p is LatLng => !!p);
  const ll = targetKey;
  const links = [
    { label: 'Google Maps', href: `https://www.google.com/maps/search/?api=1&query=${ll}` },
    { label: 'Street View', href: `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${ll}` },
    { label: 'Waze', href: `https://waze.com/ul?ll=${ll}` },
  ];

  return (
    <div className="mt-3 rounded-xl border border-gray-200 overflow-hidden bg-white">
      <div className="relative" style={{ height: 300 }}>
        <MapContainer center={[target.lat, target.lng]} zoom={18} maxZoom={19} style={{ height: '100%', width: '100%' }} scrollWheelZoom>
          {satellite ? (
            <TileLayer
              key="sat"
              url="https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}"
              attribution="Imágenes &copy; Esri, Maxar, Earthstar Geographics"
              maxZoom={19}
            />
          ) : (
            <TileLayer key="osm" url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" maxZoom={19} />
          )}
          <FitBounds points={fitPoints} />
          {nearby.map(({ s }) => (
            <CircleMarker key={s.id} center={[s.lat, s.lng]} radius={7} pathOptions={{ color: '#fff', weight: 2, fillColor: '#f59e0b', fillOpacity: 1 }}>
              <Tooltip>{s.name} (ya publicada)</Tooltip>
            </CircleMarker>
          ))}
          {current && proposed && (
            <Polyline positions={[[current.lat, current.lng], [proposed.lat, proposed.lng]]} pathOptions={{ color: '#2563eb', dashArray: '6 6', weight: 2 }} />
          )}
          {current && <Marker position={[current.lat, current.lng]} icon={CURRENT_ICON}><Tooltip>Ubicación actual (publicada)</Tooltip></Marker>}
          {proposed && (
            <Marker position={[proposed.lat, proposed.lng]} icon={PROPOSED_ICON} opacity={adjusted ? 0.5 : 1}>
              <Tooltip>Ubicación propuesta</Tooltip>
            </Marker>
          )}
          {(moving || adjusted) && (
            <Marker
              position={[target.lat, target.lng]}
              icon={ADJUSTED_ICON}
              draggable
              eventHandlers={{ dragend: (e) => { const p = (e.target as L.Marker).getLatLng(); onAdjust({ lat: p.lat, lng: p.lng }); } }}
            >
              <Tooltip>Arrástrame a la ubicación correcta</Tooltip>
            </Marker>
          )}
        </MapContainer>
        <div className="absolute top-2 right-2 z-[500] flex rounded-lg overflow-hidden shadow text-[11px] font-medium">
          <button type="button" onClick={() => setSatellite(true)} className={`px-2.5 py-1 ${satellite ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}>Satélite</button>
          <button type="button" onClick={() => setSatellite(false)} className={`px-2.5 py-1 ${!satellite ? 'bg-gray-900 text-white' : 'bg-white text-gray-700'}`}>Mapa</button>
        </div>
      </div>

      <div className="px-3 py-2.5 space-y-2 text-[11px] text-gray-600">
        <div className="flex flex-wrap gap-x-3 gap-y-1">
          {proposed && <span><b className="text-blue-600">P</b> = propuesta</span>}
          {current && <span><b className="text-gray-400">A</b> = actual</span>}
          {nearby.length > 0 && <span><b className="text-amber-500">●</b> = otras estaciones ya publicadas</span>}
        </div>
        {moved != null && (
          <p>Mueve la estación <b>{formatDistance(moved)}</b> de donde está hoy.</p>
        )}
        {address && <p><span className="text-gray-400">Dirección escrita por el usuario:</span> {address}</p>}
        <p>
          <span className="text-gray-400">Según OpenStreetMap, en ese punto hay:</span>{' '}
          {placeText === null ? 'buscando…' : placeText === 'error' ? 'no se pudo consultar' : placeText}
        </p>
        {nearby.length > 0 && (
          <div className="rounded-lg bg-amber-50 border border-amber-100 px-2.5 py-1.5 text-amber-800">
            ⚠ ¿Duplicada? {nearby.length === 1 ? 'Hay 1 estación publicada' : `Hay ${nearby.length} estaciones publicadas`} a menos de {DUPLICATE_RADIUS_KM * 1000} m:{' '}
            {nearby.slice(0, 4).map(({ s, km }) => `${s.name} (${formatDistance(km)})`).join(' · ')}
          </div>
        )}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {links.map(l => (
            <a key={l.label} href={l.href} target="_blank" rel="noopener noreferrer"
              className="px-2.5 py-1 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium">
              {l.label} ↗
            </a>
          ))}
          <span className="font-mono text-gray-400 ml-1 select-all">{ll}</span>
        </div>
        <div className="pt-1 border-t border-gray-100">
          {adjusted ? (
            <div className="flex flex-wrap items-center gap-2 pt-1.5">
              <span className="text-green-700 font-medium">✓ Se aprobará con la ubicación que marcaste{proposed ? ` (a ${formatDistance(haversineKm(proposed.lat, proposed.lng, adjusted.lat, adjusted.lng))} de la propuesta)` : ''}.</span>
              <button type="button" onClick={() => { onAdjust(null); setMoving(false); }} className="text-gray-500 hover:underline">Deshacer ajuste</button>
            </div>
          ) : moving ? (
            <p className="pt-1.5 text-green-700">Arrastra el pin verde ✓ a la ubicación correcta de “{name}”.{' '}
              <button type="button" onClick={() => setMoving(false)} className="text-gray-500 hover:underline">Cancelar</button>
            </p>
          ) : (
            <button type="button" onClick={() => { setMoving(true); setSatellite(true); }} className="mt-1.5 text-blue-600 font-medium hover:underline">
              ¿La ubicación no es exacta? Mover el pin antes de aprobar
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
