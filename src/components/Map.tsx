import React, { useEffect, useRef, useCallback, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { MapContainer, TileLayer, Marker, Popup, Tooltip, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useStore } from '../store/useStore';
import { haversineKm, formatDistance } from '../utils/geo';
import { loadPhotosForStation, savePhoto } from '../utils/photoDb';
import type { StationPhoto } from '../utils/photoDb';
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

function makeStationIcon(status: string, dimmed: boolean) {
  const key = `${status}-${dimmed}`;
  if (iconCache.has(key)) return iconCache.get(key)!;
  const colors: Record<string, string> = {
    active: '#22c55e',
    maintenance: '#f59e0b',
    offline: '#ef4444',
  };
  const color = colors[status] ?? '#6b7280';
  const icon = L.divIcon({
    className: '',
    html: `<div class="ev-marker ${status}${dimmed ? ' dimmed' : ''}" style="background:${color};width:30px;height:30px;border-radius:50%;border:2.5px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.25);display:flex;align-items:center;justify-content:center;font-size:14px;">⚡</div>`,
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

const ACCESS_LABELS: Record<string, string> = {
  public: 'Público',
  'semi-public': 'Semi-público',
  private: 'Privado',
};

const CONNECTOR_COLORS: Record<string, string> = {
  CCS2: 'bg-blue-100 text-blue-700',
  CHAdeMO: 'bg-purple-100 text-purple-700',
  Type2: 'bg-teal-100 text-teal-700',
  J1772: 'bg-orange-100 text-orange-700',
  GBT: 'bg-rose-100 text-rose-700',
  CCS1: 'bg-indigo-100 text-indigo-700',
};

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
              {station.zone} · {station.network}
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

function StationPhotos({ stationId }: { stationId: string }) {
  const [photos, setPhotos] = useState<StationPhoto[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);

  useEffect(() => {
    loadPhotosForStation(stationId).then(setPhotos);
  }, [stationId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const dataUrl = ev.target?.result as string;
      const photo: StationPhoto = {
        id: `${stationId}_${Date.now()}`,
        stationId,
        dataUrl,
        timestamp: Date.now(),
      };
      await savePhoto(photo);
      setPhotos((prev) => [...prev, photo]);
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  return (
    <div className="px-4 py-3 border-b border-gray-100">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Fotos</p>
      <div className="flex items-center gap-2 overflow-x-auto pb-1">
        {photos.map((p) => (
          <img
            key={p.id}
            src={p.dataUrl}
            alt="Foto del cargador"
            onClick={() => setLightbox(p.dataUrl)}
            className="w-16 h-16 object-cover rounded-lg cursor-pointer flex-shrink-0 hover:opacity-85 transition-opacity border border-gray-100"
          />
        ))}
        <label className="flex-shrink-0 w-16 h-16 border-2 border-dashed border-gray-200 rounded-lg flex flex-col items-center justify-center cursor-pointer hover:border-green-400 hover:bg-green-50 transition-colors gap-1">
          <input
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            onChange={handleUpload}
          />
          <svg width="18" height="18" fill="none" viewBox="0 0 24 24" stroke="#9ca3af" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
            <circle cx="12" cy="13" r="3" />
          </svg>
          <span className="text-[9px] text-gray-400">Subir</span>
        </label>
      </div>

      {lightbox && createPortal(
        <div
          className="fixed inset-0 z-[99999] bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <img
            src={lightbox}
            alt="Foto ampliada"
            className="max-w-full max-h-full rounded-xl object-contain"
            onClick={(e) => e.stopPropagation()}
          />
          <button
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 text-white/70 hover:text-white transition-colors"
          >
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function StationPopupContent({ station }: { station: ChargerStation }) {
  const { userLocation } = useStore();
  const dist = userLocation
    ? haversineKm(userLocation.lat, userLocation.lng, station.lat, station.lng)
    : null;

  const destination = encodeURIComponent(`${station.name}, ${station.address}, Guatemala`);
  const mapsUrl = userLocation
    ? `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${destination}&travelmode=driving`
    : `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;

  function copyAddress() {
    navigator.clipboard?.writeText(`${station.name}\n${station.address}\nGuatemala`);
  }

  const statusColor = {
    active: 'text-green-600 bg-green-50',
    maintenance: 'text-amber-600 bg-amber-50',
    offline: 'text-red-600 bg-red-50',
  }[station.status];

  const statusLabel = {
    active: 'Activo',
    maintenance: 'Mantenimiento',
    offline: 'Fuera de servicio',
  }[station.status];

  return (
    <div className="w-72 font-[Inter,system-ui,sans-serif]">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 leading-tight">{station.name}</h3>
            <p className="text-xs text-gray-500 mt-0.5">{station.address}</p>
          </div>
          <span className={`flex-shrink-0 text-[10px] px-2 py-0.5 rounded-full font-medium ${statusColor}`}>
            {statusLabel}
          </span>
        </div>
        <div className="flex items-center gap-3 mt-2">
          <span className="text-xs text-gray-500">{station.zone}</span>
          <span className="text-xs text-gray-400">·</span>
          <span className="text-xs text-gray-500">{ACCESS_LABELS[station.access]}</span>
          {dist !== null && (
            <>
              <span className="text-xs text-gray-400">·</span>
              <span className="text-xs font-medium text-blue-600">{formatDistance(dist)}</span>
            </>
          )}
        </div>
      </div>

      {/* Connectors */}
      <div className="px-4 py-3 border-b border-gray-100">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-2">Conectores</p>
        <div className="flex flex-col gap-1.5">
          {station.connectors.map((c, i) => (
            <div key={i} className="flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${CONNECTOR_COLORS[c.type] ?? 'bg-gray-100 text-gray-600'}`}>
                  {c.type}
                </span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${c.level === 'DC' ? 'bg-amber-50 text-amber-600' : 'bg-gray-100 text-gray-600'}`}>
                  {c.level}
                </span>
              </div>
              <span className="text-xs font-semibold text-gray-700">{c.power_kw} kW</span>
            </div>
          ))}
        </div>
      </div>

      {/* Network & notes */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-500">Red</span>
          <span className="text-xs font-medium text-gray-800">{station.network}</span>
        </div>
        {station.notes && (
          <p className="text-[10px] text-gray-400 mt-2 leading-relaxed">{station.notes}</p>
        )}
      </div>

      {/* Address + copy */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-1">Dirección</p>
            <p className="text-xs text-gray-700 leading-relaxed">{station.address}</p>
            <p className="text-[10px] text-gray-400 mt-0.5">Guatemala</p>
          </div>
          <button
            onClick={copyAddress}
            title="Copiar dirección"
            className="flex-shrink-0 p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
          >
            <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" />
            </svg>
          </button>
        </div>
      </div>

      {/* User photos */}
      <StationPhotos stationId={station.id} />

      {/* Actions */}
      <div className="px-4 py-3">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center justify-center gap-2 w-full bg-green-500 hover:bg-green-600 text-white text-xs font-semibold py-2 rounded-xl transition-colors"
        >
          <svg width="14" height="14" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
          </svg>
          Cómo llegar — Google Maps
        </a>
      </div>
    </div>
  );
}

function MapController({ markerRefs }: { markerRefs: React.MutableRefObject<Record<string, L.Marker | null>> }) {
  const { selectedStationId, stations, userLocation } = useStore();
  const map = useMap();
  const prevSelectedRef = useRef<string | null>(null);

  useEffect(() => {
    if (selectedStationId && selectedStationId !== prevSelectedRef.current) {
      const station = stations.find((s) => s.id === selectedStationId);
      if (station) {
        map.setView([station.lat, station.lng], Math.max(map.getZoom(), 15), { animate: true });
        // Open popup after map pan/zoom finishes
        const timer = setTimeout(() => {
          markerRefs.current[selectedStationId]?.openPopup();
        }, 350);
        return () => clearTimeout(timer);
      }
    } else if (!selectedStationId && prevSelectedRef.current) {
      markerRefs.current[prevSelectedRef.current]?.closePopup();
    }
    prevSelectedRef.current = selectedStationId;
  }, [selectedStationId, stations, map, markerRefs]);

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
      className="absolute bottom-8 right-4 z-[1000] w-10 h-10 bg-white rounded-full shadow-md border border-gray-200 flex items-center justify-center hover:bg-gray-50 transition-colors"
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
  const markerRefs = useRef<Record<string, L.Marker | null>>({});

  const hasActiveFilters =
    selectedVehicle !== null ||
    filters.status !== 'all' ||
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

        <MapController markerRefs={markerRefs} />
        {isTouch && <DisableTap />}

        {stations.map((station) => {
          const dimmed = filteredIds !== null && !filteredIds.has(station.id);

          return (
            <Marker
              key={station.id}
              ref={(r) => { markerRefs.current[station.id] = r; }}
              position={[station.lat, station.lng]}
              icon={makeStationIcon(station.status, dimmed)}
              eventHandlers={{
                click: () => {
                  const { selectedStationId, setSelectedStationId } = useStore.getState();
                  setSelectedStationId(selectedStationId === station.id ? null : station.id);
                },
                popupclose: () => {
                  const { selectedStationId, setSelectedStationId } = useStore.getState();
                  if (selectedStationId === station.id) setSelectedStationId(null);
                },
              }}
              opacity={dimmed ? 0.25 : 1}
            >
              <Popup>
                <StationPopupContent station={station} />
              </Popup>
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
    <div className="absolute bottom-8 right-[3.75rem] z-[1000] flex flex-col gap-1">
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
