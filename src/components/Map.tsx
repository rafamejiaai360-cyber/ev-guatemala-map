import React, { useEffect, useRef, useCallback, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
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

// Relleno = TIPO de estación (quién la ofrece): verde = pública, azul = residencial.
// Borde = ESTADO operativo: blanco = activo, ámbar = mantenimiento, rojo = fuera de servicio.
// Dos señales independientes en un mismo ícono, cada una con su propio significado.
const TYPE_FILL: Record<string, string> = {
  public: '#22c55e',
  residential: '#3b82f6',
};
const STATUS_BORDER: Record<string, string> = {
  active: '#ffffff',
  maintenance: '#f59e0b',
  offline: '#ef4444',
};

function makeStationIcon(type: string, status: string, dimmed: boolean) {
  const key = `${type}-${status}-${dimmed}`;
  if (iconCache.has(key)) return iconCache.get(key)!;
  const fill = TYPE_FILL[type] ?? TYPE_FILL.public;
  const border = STATUS_BORDER[status] ?? '#ffffff';
  const borderWidth = status === 'active' ? 2.5 : 3.5;
  const icon = L.divIcon({
    className: '',
    html: `<div class="ev-marker ${type} ${status}${dimmed ? ' dimmed' : ''}" style="background:${fill};width:30px;height:30px;border-radius:50%;border:${borderWidth}px solid ${border};box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:14px;">⚡</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -18],
  });
  iconCache.set(key, icon);
  return icon;
}

const userIcon = L.divIcon({
  className: '',
  html: `<div style="background:#3b82f6;width:16px;height:16px;border-radius:50%;border:3px solid white;box-shadow:0 0 0 3px rgba(59,130,246,0.3),0 2px 8px rgba(0,0,0,0.25);"></div>`,
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
              {(station.type ?? 'public') === 'residential' ? '🏠' : '🔌'} {station.zone} · {station.network}
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

function MapController() {
  const { selectedStationId, stations, userLocation } = useStore();
  const map = useMap();
  const prevSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedStationId && selectedStationId !== prevSelectedRef.current) {
      const station = stations.find((s) => s.id === selectedStationId);
      if (station) {
        map.setView([station.lat, station.lng], Math.max(map.getZoom(), 15), { animate: true });
      }
    }
    prevSelectedRef.current = selectedStationId;
  }, [selectedStationId, stations, map]);

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

function GeolocationButton() {
  const { setUserLocation } = useStore();

  const locate = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => setUserLocation({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      (err) => console.warn('Geolocation error:', err),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  }, [setUserLocation]);

  return (
    <button
      onClick={locate}
      title="Mi ubicación"
      className="absolute bottom-8 right-4 z-[700] w-10 h-10 bg-white rounded-full shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
    >
      <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#3b82f6" strokeWidth={2}>
        <circle cx="12" cy="12" r="3" />
        <path strokeLinecap="round" d="M12 2v3M12 19v3M2 12h3M19 12h3" />
        <circle cx="12" cy="12" r="9" strokeDasharray="2 2" />
      </svg>
    </button>
  );
}

export default function EVMap() {
  const { stations, filteredStations, selectedVehicle, filters } = useStore();

  const hasActiveFilters =
    selectedVehicle !== null ||
    filters.status !== 'all' ||
    filters.stationType !== 'all' ||
    filters.connectorTypes.length > 0 ||
    filters.level !== 'all';

  const filteredIds = useMemo(
    () => (hasActiveFilters ? new Set(filteredStations.map((s) => s.id)) : null),
    [hasActiveFilters, filteredStations],
  );

  return (
    <div className="relative flex-1 h-full">
      <MapContainer
        center={[14.6349, -90.5069]}
        zoom={11}
        style={{ width: '100%', height: '100%' }}
        zoomControl={false}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          keepBuffer={2}
          updateWhenZooming={false}
          updateWhenIdle={true}
        />

        <MapController />
        {isTouch && <DisableTap />}

        {stations.map((station) => {
          const dimmed = filteredIds !== null && !filteredIds.has(station.id);

          return (
            <Marker
              key={station.id}
              position={[station.lat, station.lng]}
              icon={makeStationIcon(station.type ?? 'public', station.status, dimmed)}
              eventHandlers={{
                click: () => {
                  const { selectedStationId, setSelectedStationId, setSidebarOpen } = useStore.getState();
                  const isAlreadySelected = selectedStationId === station.id;
                  setSelectedStationId(isAlreadySelected ? null : station.id);
                  if (!isAlreadySelected) setSidebarOpen(true);
                },
              }}
              opacity={dimmed ? 0.25 : 1}
            >
              {!isTouch && (
                <Tooltip className="station-tooltip" direction="top" offset={[0, -18]} opacity={1}>
                  <StationTooltipContent station={station} />
                </Tooltip>
              )}
            </Marker>
          );
        })}

        {/* User location marker */}
        <UserMarker />

        {/* Zoom controls */}
        <ZoomControls />
      </MapContainer>

      <GeolocationButton />
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
    <div className="absolute bottom-8 right-[3.75rem] z-[700] flex flex-col gap-1">
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
