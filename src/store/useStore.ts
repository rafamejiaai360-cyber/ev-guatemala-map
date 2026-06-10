import { create } from 'zustand';
import { chargerStations } from '../data/chargers';
import { fetchGTStations, findClosestLocal, ocmToLocalStatus, ocmConnTypeName } from '../utils/ocm';
import type { ChargerStation, ChargerStatus, ConnectorType, ChargerLevel, Vehicle } from '../types';

const STORAGE_KEY = 'ev_gt_status_overrides';
const CUSTOM_KEY = 'ev_gt_custom_stations';

function loadOverrides(): Record<string, ChargerStatus> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOverrides(overrides: Record<string, ChargerStatus>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(overrides));
}

function loadCustomStations(): ChargerStation[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCustomStations(stations: ChargerStation[]) {
  localStorage.setItem(CUSTOM_KEY, JSON.stringify(stations));
}

function applyOverrides(
  stations: ChargerStation[],
  overrides: Record<string, ChargerStatus>,
): ChargerStation[] {
  return stations.map((s) =>
    overrides[s.id] ? { ...s, status: overrides[s.id] } : s,
  );
}

export interface Filters {
  status: ChargerStatus | 'all';
  connectorTypes: ConnectorType[];
  level: ChargerLevel | 'all';
}

interface AppState {
  // Stations
  stations: ChargerStation[];
  statusOverrides: Record<string, ChargerStatus>;
  setStationStatus: (id: string, status: ChargerStatus) => void;

  // Custom stations (added via scan)
  customStations: ChargerStation[];
  addCustomStation: (station: ChargerStation) => void;

  // Filters
  filters: Filters;
  setFilters: (filters: Partial<Filters>) => void;

  // Computed filtered stations
  filteredStations: ChargerStation[];

  // Vehicle selector
  selectedVehicle: Vehicle | null;
  setSelectedVehicle: (vehicle: Vehicle | null) => void;

  // Map / sidebar interaction
  selectedStationId: string | null;
  setSelectedStationId: (id: string | null) => void;

  // User geolocation
  userLocation: { lat: number; lng: number } | null;
  setUserLocation: (loc: { lat: number; lng: number } | null) => void;

  // Sidebar visibility (mobile)
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;

  // Live status monitoring
  lastStatusCheck: Date | null;
  statusCheckLoading: boolean;
  statusCheckError: string | null;
  refreshStatus: () => Promise<void>;

  // Scan modal
  scanModalOpen: boolean;
  setScanModalOpen: (open: boolean) => void;
}

function computeFiltered(
  stations: ChargerStation[],
  filters: Filters,
  selectedVehicle: Vehicle | null,
): ChargerStation[] {
  return stations.filter((s) => {
    if (filters.status !== 'all' && s.status !== filters.status) return false;
    if (filters.connectorTypes.length > 0) {
      const stationTypes = s.connectors.map((c) => c.type);
      if (!filters.connectorTypes.some((t) => stationTypes.includes(t))) return false;
    }
    if (filters.level !== 'all') {
      if (!s.connectors.some((c) => c.level === filters.level)) return false;
    }
    if (selectedVehicle) {
      const stationTypes = s.connectors.map((c) => c.type);
      if (!selectedVehicle.compatible_connectors.some((t) => stationTypes.includes(t))) return false;
    }
    return true;
  });
}

const initialOverrides = loadOverrides();
const initialCustom = loadCustomStations();
const allInitial = applyOverrides([...chargerStations, ...initialCustom], initialOverrides);
const initialFilters: Filters = { status: 'all', connectorTypes: [], level: 'all' };

export const useStore = create<AppState>((set, get) => ({
  stations: allInitial,
  statusOverrides: initialOverrides,

  setStationStatus: (id, status) => {
    const overrides = { ...get().statusOverrides, [id]: status };
    saveOverrides(overrides);
    const stations = applyOverrides([...chargerStations, ...get().customStations], overrides);
    const filteredStations = computeFiltered(stations, get().filters, get().selectedVehicle);
    set({ statusOverrides: overrides, stations, filteredStations });
  },

  customStations: initialCustom,
  addCustomStation: (station) => {
    const custom = [...get().customStations, station];
    saveCustomStations(custom);
    const stations = applyOverrides([...chargerStations, ...custom], get().statusOverrides);
    const filteredStations = computeFiltered(stations, get().filters, get().selectedVehicle);
    set({ customStations: custom, stations, filteredStations });
  },

  filters: initialFilters,
  setFilters: (partial) => {
    const filters = { ...get().filters, ...partial };
    const filteredStations = computeFiltered(get().stations, filters, get().selectedVehicle);
    set({ filters, filteredStations });
  },

  filteredStations: computeFiltered(allInitial, initialFilters, null),

  selectedVehicle: null,
  setSelectedVehicle: (vehicle) => {
    const filteredStations = computeFiltered(get().stations, get().filters, vehicle);
    set({ selectedVehicle: vehicle, filteredStations });
  },

  selectedStationId: null,
  setSelectedStationId: (id) => set({ selectedStationId: id }),

  userLocation: null,
  setUserLocation: (loc) => set({ userLocation: loc }),

  sidebarOpen: true,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  lastStatusCheck: null,
  statusCheckLoading: false,
  statusCheckError: null,

  refreshStatus: async () => {
    if (get().statusCheckLoading) return;
    set({ statusCheckLoading: true, statusCheckError: null });
    try {
      const ocmData = await fetchGTStations();
      const allStations = [...chargerStations, ...get().customStations];
      const newOverrides = { ...get().statusOverrides };

      let matched = 0;
      for (const ocm of ocmData) {
        const local = findClosestLocal(
          ocm.AddressInfo.Latitude,
          ocm.AddressInfo.Longitude,
          allStations,
        );
        if (local) {
          newOverrides[local.id] = ocmToLocalStatus(ocm);
          matched++;
        }
      }

      saveOverrides(newOverrides);
      const stations = applyOverrides(allStations, newOverrides);
      const filteredStations = computeFiltered(stations, get().filters, get().selectedVehicle);
      set({
        statusOverrides: newOverrides,
        stations,
        filteredStations,
        lastStatusCheck: new Date(),
        statusCheckLoading: false,
        statusCheckError: matched === 0 ? 'Sin datos en tiempo real para este momento.' : null,
      });
    } catch (e) {
      set({
        statusCheckLoading: false,
        statusCheckError: 'Error de conexión con OpenChargeMap.',
      });
    }
  },

  scanModalOpen: false,
  setScanModalOpen: (open) => set({ scanModalOpen: open }),
}));

// Helper to build a ChargerStation from an OCM station (used in ScanModal)
export function ocmStationToLocal(ocm: import('../utils/ocm').OCMStation): ChargerStation {
  const connections = (ocm.Connections ?? []).filter((c) => c.ConnectionType);
  const connectors = connections.slice(0, 4).map((c) => ({
    type: ocmConnTypeName(c) as ConnectorType,
    power_kw: c.PowerKW ?? 7.4,
    level: ((c.PowerKW ?? 0) > 22 ? 'DC' : 'L2') as ChargerLevel,
  }));

  return {
    id: `ocm-${ocm.ID}`,
    name: ocm.AddressInfo.Title,
    address: [ocm.AddressInfo.AddressLine1, ocm.AddressInfo.Town]
      .filter(Boolean)
      .join(', '),
    zone: ocm.AddressInfo.Town ?? 'Guatemala',
    lat: ocm.AddressInfo.Latitude,
    lng: ocm.AddressInfo.Longitude,
    status: ocmToLocalStatus(ocm),
    connectors: connectors.length > 0
      ? connectors
      : [{ type: 'Type2', power_kw: 7.4, level: 'L2' }],
    network: ocm.OperatorInfo?.Title ?? 'Desconocido',
    access: 'public',
  };
}
