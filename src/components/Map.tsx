import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
// Permite girar el mapa (modo ruta: "lo que tienes enfrente, arriba").
// Debe cargarse después de Leaflet y antes de crear el mapa.
import 'leaflet-rotate';
import { useStore } from '../store/useStore';
import { primeRouteSound } from './mobile/routeEngine';
import { requestCompass, useCompassWhenLocated } from './mobile/heading';
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

// Punto azul del usuario con un "haz" que apunta hacia donde va o mira
// (oculto mientras no se conoce la dirección). El haz se gira desde
// UserMarker sin recrear el ícono.
const userIcon = L.divIcon({
  className: 'ev-me-wrap',
  html: '<div class="ev-me"><span class="ev-me-cone"></span><span class="ev-me-dot"></span></div>',
  iconSize: [56, 56],
  iconAnchor: [28, 28],
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
        // para que quede visible por encima de ella. En computadora el mapa
        // ya ocupa solo el área libre a la derecha de la lista: va centrado.
        if (variant === 'mobile' && !window.matchMedia('(min-width: 1024px)').matches) {
          target = map.unproject(map.project(target, zoom).add([0, 110]), zoom);
        }
        map.setView(target, zoom, { animate: true });
      }
    }
    prevSelectedRef.current = selectedStationId;
  }, [selectedStationId, stations, map, variant]);

  // Modo ruta: el mapa sigue al usuario sin cambiarle el zoom, salvo que esté
  // mirando una estación o haya movido el mapa con el dedo hace menos de 15 s.
  const routeMode = useStore((s) => s.routeMode);
  const lastDragRef = useRef(0);
  const followingRef = useRef(false);
  useMapEvents({ dragstart: () => { lastDragRef.current = Date.now(); } });

  useEffect(() => {
    if (!userLocation) return;
    const at: [number, number] = [userLocation.lat, userLocation.lng];
    if (!routeMode) {
      followingRef.current = false;
      map.setView(at, 14, { animate: true });
      return;
    }
    if (!followingRef.current) {
      followingRef.current = true;
      map.setView(at, Math.max(map.getZoom(), 15), { animate: true });
      return;
    }
    if (useStore.getState().selectedStationId || Date.now() - lastDragRef.current < 15000) return;
    map.panTo(at, { animate: true });
  }, [userLocation, routeMode, map]);

  // Modo ruta con "girar con mi dirección": lo que el usuario tiene enfrente
  // queda arriba. Fuera del modo ruta (o con "norte arriba") vuelve a 0.
  const userHeading = useStore((s) => s.userHeading);
  const headingUp = useStore((s) => s.headingUp);
  useEffect(() => {
    const target = routeMode && headingUp && userHeading != null ? (360 - userHeading) % 360 : 0;
    if (Math.round(map.getBearing()) !== Math.round(target)) map.setBearing(target);
  }, [routeMode, headingUp, userHeading, map]);

  return null;
}

// Tocar una zona vacía del mapa cierra la tarjeta / ficha de la estación
// elegida. Leaflet no dispara "click" del mapa al tocar un pin ni al
// arrastrar, así que solo responde a un toque sobre el mapa en sí.
function ClearSelectionOnMapClick() {
  useMapEvents({
    click: () => {
      const { selectedStationId, setSelectedStationId } = useStore.getState();
      if (selectedStationId) setSelectedStationId(null);
    },
  });
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
          <React.Fragment key={station.id}>
          {/* Residencial con ubicación aproximada: círculo de la zona (radio
              mayor al desplazamiento máximo de 600 m que aplica el Worker). */}
          {station.approximate && zoom >= 12 && (
            <Circle
              center={[station.lat, station.lng]}
              radius={700}
              pathOptions={{ color: '#2563eb', weight: 1, opacity: 0.35, fillColor: '#3b82f6', fillOpacity: 0.08, interactive: false }}
            />
          )}
          <Marker
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
          </React.Fragment>
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
        rotate={true}
        bearing={0}
        touchRotate={false}
        rotateControl={false}
        shiftKeyRotate={false}
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
        <ClearSelectionOnMapClick />
        {isTouch && <DisableTap />}

        <StationMarkers stations={filteredStations} />

        {/* User location marker */}
        <UserMarker />
        <CompassStarter />

        {variant === 'mobile' ? <MobileMapTools /> : <ZoomControls />}
      </MapContainer>

      {variant === 'desktop' && <GeolocationButton />}
    </div>
  );
}

/** Grados que el mapa está girado (0 = norte arriba). */
function useMapBearing(): number {
  const map = useMap();
  const [bearing, setBearing] = useState(() => Math.round(map.getBearing()));
  // 'rotate' lo dispara leaflet-rotate (no está en los tipos de Leaflet).
  useEffect(() => {
    const onRotate = () => setBearing(Math.round(map.getBearing()));
    map.on('rotate', onRotate);
    return () => { map.off('rotate', onRotate); };
  }, [map]);
  return bearing;
}

function CompassStarter() {
  useCompassWhenLocated();
  return null;
}

function UserMarker() {
  const { userLocation, userHeading } = useStore();
  const bearing = useMapBearing();
  const ref = useRef<L.Marker | null>(null);
  const angleRef = useRef<number | null>(null);
  // El haz apunta a la dirección real: rumbo + giro del mapa (los íconos no
  // giran con el mapa, así que hay que sumarlo). El ángulo se acumula sin
  // "dar la vuelta" en 360° para que la animación tome siempre el giro corto.
  useEffect(() => {
    const cone = ref.current?.getElement()?.querySelector<HTMLElement>('.ev-me-cone');
    if (!cone) return;
    if (userHeading == null) { cone.style.opacity = '0'; return; }
    const want = (userHeading + bearing) % 360;
    const prev = angleRef.current;
    const next = prev == null ? want : prev + ((((want - prev) % 360) + 540) % 360) - 180;
    angleRef.current = next;
    cone.style.opacity = '1';
    cone.style.transform = `rotate(${next}deg)`;
  }, [userHeading, bearing, userLocation]);
  if (!userLocation) return null;
  return (
    <Marker ref={ref} position={[userLocation.lat, userLocation.lng]} icon={userIcon} zIndexOffset={2000}>
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
  const { routeMode, setRouteMode, headingUp, setHeadingUp } = useStore();
  const bearing = useMapBearing();
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
        <button type="button" className="m-tbtn" aria-label="Mi ubicación" onClick={() => { requestCompass(); locate(); }}>
          <svg viewBox="0 0 24 24"><path d="M20.5 3.5 3.5 10.8l7 2.7 2.7 7z" /></svg>
        </button>
        <button
          type="button"
          className={`m-tbtn${routeMode ? ' on' : ''}`}
          aria-label={routeMode ? 'Apagar modo ruta' : 'Encender modo ruta'}
          aria-pressed={routeMode}
          title="Modo ruta: avisa al pasar cerca de una estación"
          onClick={() => { if (!routeMode) { primeRouteSound(); requestCompass(); } setRouteMode(!routeMode); }}
        >
          <svg viewBox="0 0 24 24"><path d="M5 17h14M6.5 17V11l1.8-4.2A2 2 0 0 1 10.1 5.5h3.8a2 2 0 0 1 1.8 1.3L17.5 11v6" /><path d="M6.5 11h11" /><circle cx="8.5" cy="17.5" r="1.5" /><circle cx="15.5" cy="17.5" r="1.5" /></svg>
        </button>
      </div>
      {/* Brújula: en modo ruta alterna "girar con mi dirección" / "norte
          arriba". La aguja roja siempre señala el norte real. */}
      {(routeMode || bearing !== 0) && (
        <div className="m-tgroup m-glass">
          <button
            type="button"
            className={`m-tbtn m-compass${routeMode && headingUp ? ' on' : ''}`}
            aria-label={headingUp ? 'Poner el norte arriba' : 'Girar el mapa con mi dirección'}
            aria-pressed={routeMode && headingUp}
            title={headingUp ? 'El mapa gira con tu dirección. Toca para poner el norte arriba.' : 'Norte arriba. Toca para que el mapa gire con tu dirección.'}
            onClick={() => { if (!headingUp) requestCompass(); setHeadingUp(!headingUp); }}
          >
            <svg viewBox="0 0 24 24" style={{ transform: `rotate(${bearing}deg)` }}>
              <path className="n" d="M12 3.5 15 12H9z" />
              <path className="s" d="M12 20.5 9 12h6z" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
