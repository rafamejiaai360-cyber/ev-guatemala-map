import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store/useStore';
import type { ChargerStation } from '../types';

const isTouch = typeof window !== 'undefined' && ('ontouchstart' in window || navigator.maxTouchPoints > 0);

// Fix Leaflet default icon URLs broken by bundlers
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const iconCache = new Map<string, L.DivIcon>();

// Pin en forma de gota con un enchufe de línea fina.
// Relleno = TIPO de estación (quién la ofrece): verde = pública, azul = residencial;
// gris si está fuera de servicio.
// Punto en la esquina = ESTADO cuando no está activa: ámbar = mantenimiento, rojo = fuera de servicio.
// Siguen siendo dos señales independientes, como se acordó el 14 jul 2026,
// pero el estado ya no usa un borde grueso: solo aparece cuando hay algo que avisar.
const PLUG_SVG = '<svg class="ev-pin-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M9 2.5v4.5M15 2.5v4.5M6.5 7h11v3.5a5.5 5.5 0 0 1-11 0zM12 16v5.5"/></svg>';

function makeStationIcon(type: string, status: string, selected: boolean) {
  const key = `${type}-${status}-${selected}`;
  if (iconCache.has(key)) return iconCache.get(key)!;
  const dot = status !== 'active' ? `<span class="ev-pin-dot ${status}"></span>` : '';
  const icon = L.divIcon({
    className: 'ev-pin-wrap',
    html: `<div class="ev-pin ${type} ${status}${selected ? ' sel' : ''}"><span class="ev-pin-shape"></span>${PLUG_SVG}${dot}</div>`,
    iconSize: [30, 30],
    // La punta de la gota queda ~21 px debajo del centro (cuadrado de 30 px rotado 45°)
    iconAnchor: [15, 36],
    popupAnchor: [0, -38],
    tooltipAnchor: [0, -34],
  });
  iconCache.set(key, icon);
  return icon;
}

function makeClusterIcon(count: number, hasResidential: boolean) {
  const key = `cluster-${count}-${hasResidential}`;
  if (iconCache.has(key)) return iconCache.get(key)!;
  const size = count >= 10 ? 40 : 34;
  const icon = L.divIcon({
    className: 'ev-pin-wrap',
    html: `<div class="ev-cluster${hasResidential ? ' mix' : ''}" style="min-width:${size}px;height:${size}px">${count}</div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
  iconCache.set(key, icon);
  return icon;
}

const userIcon = L.divIcon({
  className: '',
  html: `<div style="background:#0a84ff;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 6px rgba(10,132,255,0.18),0 2px 6px rgba(0,0,0,0.3);"></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

const CONNECTOR_LEVEL_STYLE: Record<string, React.CSSProperties> = {
  DC: { background: '#fef3c7', color: '#92400e' },
  L2: { background: '#f3f4f6', color: '#374151' },
  L1: { background: '#f3f4f6', color: '#374151' },
};

const STATUS_COLOR: Record<string, string> = {
  active: '#22c55e',
  maintenance: '#f59e0b',
  offline: '#ef4444',
};

function StationTooltipContent({ station }: { station: ChargerStation }) {
  return (
    <div style={{ minWidth: '210px', fontFamily: 'Inter, system-ui, sans-serif' }}>
      {station.image_url && (
        <img
          src={station.image_url}
          alt={station.name}
          style={{ width: '100%', height: '120px', objectFit: 'cover', display: 'block' }}
        />
      )}
      <div style={{ padding: '10px 12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '7px' }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, marginTop: '3px',
            background: STATUS_COLOR[station.status] ?? '#6b7280',
          }} />
          <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: '#111827', lineHeight: 1.3 }}>
              {station.name}
            </div>
            <div style={{ fontSize: '11px', color: '#6b7280', marginTop: '2px' }}>
              {(station.type ?? 'public') === 'residential' ? 'Residencial' : 'Pública'} · {station.zone} · {station.network}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '4px', marginTop: '8px', flexWrap: 'wrap' }}>
          {station.connectors.map((c, i) => (
            <span key={i} style={{
              fontSize: '10px', padding: '2px 6px', borderRadius: '4px', fontWeight: 500,
              ...(CONNECTOR_LEVEL_STYLE[c.level] ?? CONNECTOR_LEVEL_STYLE.L2),
            }}>
              {c.type} {c.power_kw} kW
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

type Variant = 'desktop' | 'mobile';

function MapController({ variant }: { variant: Variant }) {
  const { selectedStationId, stations, userLocation } = useStore();
  const map = useMap();
  const prevSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedStationId && selectedStationId !== prevSelectedRef.current) {
      const station = stations.find((s) => s.id === selectedStationId);
      if (station) {
        const zoom = Math.max(map.getZoom(), 15);
        let target = L.latLng(station.lat, station.lng);
        // En celular la tarjeta flotante tapa la mitad de abajo: subimos el pin
        // para que quede visible por encima de ella. En pantalla ancha la
        // columna de la izquierda (~430 px) tapa ese lado: corremos el pin al
        // centro del área de mapa que queda libre a la derecha.
        if (variant === 'mobile') {
          const wide = window.matchMedia('(min-width: 1024px)').matches;
          target = map.unproject(map.project(target, zoom).add(wide ? [-216, 0] : [0, 110]), zoom);
        }
        map.setView(target, zoom, { animate: true });
      }
    }
    prevSelectedRef.current = selectedStationId;
  }, [selectedStationId, stations, map, variant]);

  useEffect(() => {
    if (userLocation) {
      map.setView([userLocation.lat, userLocation.lng], 14, { animate: true });
    }
  }, [userLocation, map]);

  return null;
}

function DisableTap() {
  const map = useMap();
  useEffect(() => {
    // Leaflet's tap handler causes 300ms delay and freezes on iOS — disable it
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (map as any).tap?.disable();
  }, [map]);
  return null;
}

function useLocate() {
  const { setUserLocation } = useStore();
  return useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn('Geolocation error:', err),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [setUserLocation]);
}

function GeolocationButton() {
  const locate = useLocate();
  return (
    <button
      onClick={locate}
      title="Mi ubicación"
      className="absolute bottom-[calc(2rem+var(--safe-bottom))] right-4 z-[700] w-10 h-10 bg-white rounded-full shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
    >
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" strokeWidth={2}>
        <circle cx="12" cy="12" r="3" />
        <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <circle cx="12" cy="12" r="9" strokeDasharray="2 2" />
      </svg>
    </button>
  );
}

// Agrupa estaciones que en pantalla quedarían a menos de CLUSTER_PX entre sí.
// Se calcula con la proyección del nivel de zoom actual, así que solo cambia al
// acercar o alejar (no al arrastrar el mapa).
const CLUSTER_PX = 44;
const NO_CLUSTER_ZOOM = 17;

type Item =
  | { kind: 'station'; station: ChargerStation }
  | { kind: 'cluster'; key: string; members: ChargerStation[]; lat: number; lng: number };

function StationMarkers({ stations }: { stations: ChargerStation[] }) {
  const map = useMap();
  const selectedStationId = useStore((s) => s.selectedStationId);
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const items = useMemo<Item[]>(() => {
    if (zoom >= NO_CLUSTER_ZOOM) return stations.map((station) => ({ kind: 'station', station }));
    const pts = stations.map((s) => ({ s, p: map.project([s.lat, s.lng], zoom) }));
    const used = new Set<string>();
    const out: Item[] = [];
    for (const a of pts) {
      if (used.has(a.s.id)) continue;
      used.add(a.s.id);
      const members = [a.s];
      for (const b of pts) {
        if (used.has(b.s.id)) continue;
        if (a.p.distanceTo(b.p) < CLUSTER_PX) { used.add(b.s.id); members.push(b.s); }
      }
      if (members.length === 1) { out.push({ kind: 'station', station: a.s }); continue; }
      out.push({
        kind: 'cluster',
        key: members.map((m) => m.id).sort().join('|'),
        members,
        lat: members.reduce((t, m) => t + m.lat, 0) / members.length,
        lng: members.reduce((t, m) => t + m.lng, 0) / members.length,
      });
    }
    return out;
  }, [stations, zoom, map]);

  return (
    <>
      {items.map((it) => {
        if (it.kind === 'cluster') {
          const hasResidential = it.members.some((m) => (m.type ?? 'public') === 'residential');
          return (
            <Marker
              key={`c-${it.key}`}
              position={[it.lat, it.lng]}
              icon={makeClusterIcon(it.members.length, hasResidential)}
              eventHandlers={{
                click: () => {
                  const bounds = L.latLngBounds(it.members.map((m) => [m.lat, m.lng] as [number, number]));
                  map.fitBounds(bounds, { padding: [70, 70], maxZoom: NO_CLUSTER_ZOOM, animate: true });
                },
              }}
            />
          );
        }
        const station = it.station;
        return (
          <Marker
            key={station.id}
            position={[station.lat, station.lng]}
            icon={makeStationIcon(station.type ?? 'public', station.status, station.id === selectedStationId)}
            zIndexOffset={station.id === selectedStationId ? 1000 : 0}
            eventHandlers={{
              click: () => {
                const { selectedStationId: cur, setSelectedStationId, setSidebarOpen } = useStore.getState();
                const isAlreadySelected = cur === station.id;
                setSelectedStationId(isAlreadySelected ? null : station.id);
                if (!isAlreadySelected) setSidebarOpen(true);
              },
            }}
          >
            {!isTouch && (
              <Tooltip className="station-tooltip" direction="top" offset={[0, -4]} opacity={1}>
                <StationTooltipContent station={station} />
              </Tooltip>
            )}
          </Marker>
        );
      })}
    </>
  );
}

export default function EVMap({ variant = 'desktop' }: { variant?: Variant }) {
  const { filteredStations } = useStore();

  return (
    <div className={variant === 'mobile' ? 'absolute inset-0 ev-map-mobile' : 'relative flex-1 h-full'}>
      <MapContainer
        center={[14.6349, -90.5069]}
        zoom={11}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        {/* Mapa base: las mismas imágenes de OpenStreetMap de siempre (gratis,
            sin clave), pasadas a grises suaves con un filtro CSS (.ev-tiles en
            index.css) para que los pines sean lo único que resalte.
            Nota (oct 2026): CARTO "Positron" se descartó porque ahora exige
            API key fuera de localhost y mostraba "API KEY REQUIRED". */}
        <TileLayer
          className="ev-tiles"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          keepBuffer={2}
          updateWhenZooming={false}
          updateWhenIdle={true}
        />

        <MapController variant={variant} />
        {isTouch && <DisableTap />}

        <StationMarkers stations={filteredStations} />

        {/* User location marker */}
        <UserMarker />

        {variant === 'mobile' ? <MobileMapTools /> : <ZoomControls />}
      </MapContainer>

      {variant === 'desktop' && <GeolocationButton />}
    </div>
  );
}

function UserMarker() {
  const { userLocation } = useStore();
  if (!userLocation) return null;
  return (
    <Marker position={[userLocation.lat, userLocation.lng]} icon={userIcon}>
      <Popup>
        <div className="text-xs text-gray-700 px-1 py-0.5 font-medium">Tu ubicación</div>
      </Popup>
    </Marker>
  );
}

function ZoomControls() {
  const map = useMap();
  return (
    <div className="absolute bottom-[calc(2rem+var(--safe-bottom))] right-[3.75rem] z-[700] flex flex-col gap-1">
      <button
        onClick={() => map.zoomIn()}
        className="w-10 h-10 bg-white rounded-full shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-700 text-lg font-light"
      >
        +
      </button>
      <button
        onClick={() => map.zoomOut()}
        className="w-10 h-10 bg-white rounded-full shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors text-gray-700 text-lg font-light"
      >
        −
      </button>
    </div>
  );
}

// Botones del mapa en celular: acercar/alejar y "mi ubicación", agrupados a la
// derecha debajo de los filtros (los estilos viven en mobile.css).
function MobileMapTools() {
  const map = useMap();
  const locate = useLocate();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    // Que tocar los botones no arrastre ni haga zoom en el mapa de fondo
    if (ref.current) {
      L.DomEvent.disableClickPropagation(ref.current);
      L.DomEvent.disableScrollPropagation(ref.current);
    }
  }, []);
  return (
    <div ref={ref} className="m-tools">
      <div className="m-tgroup m-glass">
        <button type="button" className="m-tbtn" aria-label="Acercar" onClick={() => map.zoomIn()}>
          <svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" /></svg>
        </button>
        <button type="button" className="m-tbtn" aria-label="Alejar" onClick={() => map.zoomOut()}>
          <svg viewBox="0 0 24 24"><path d="M5 12h14" /></svg>
        </button>
      </div>
      <div className="m-tgroup m-glass">
        <button type="button" className="m-tbtn" aria-label="Mi ubicación" onClick={locate}>
          <svg viewBox="0 0 24 24"><path d="M20.5 3.5 3.5 10.8l7 2.7 2.7 7z" /></svg>
        </button>
      </div>
    </div>
  );
}
