import { create } from 'zustand';
import { chargerStations } from '../data/chargers';
import { fetchGTStations, findClosestLocal, ocmToLocalStatus, ocmConnTypeName } from '../utils/ocm';
import type { ChargerStation, ChargerStatus, ConnectorType, ChargerLevel, Vehicle, RatingInfo } from '../types';
import { getAllRatings } from '../utils/reviewsApi';

async function fetchDynamicStations(): Promise<ChargerStation[] | null> {
  try {
    const res = await fetch('/api/stations/dynamic');
    if (!res.ok) return null;
    return await res.json() as ChargerStation[];
  } catch {
    return null;
  }
}

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

  // Custom stations (legacy localStorage-only)
  customStations: ChargerStation[];
  addCustomStation: (station: ChargerStation) => void;

  // Dynamic stations from Notion (source of truth once loaded; shared across all users)
  dynamicStations: ChargerStation[];
  dynamicLoaded: boolean;
  addDynamicStation: (station: ChargerStation) => void;
  loadDynamicStations: () => Promise<void>;

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

  // Add station modal
  addStationModalOpen: boolean;
  setAddStationModalOpen: (open: boolean) => void;

  // Admin auth (legacy)
  isAdminAuthenticated: boolean;
  setAdminAuthenticated: (val: boolean) => void;
  adminLoginOpen: boolean;
  setAdminLoginOpen: (open: boolean) => void;

  // User auth (JWT system)
  currentUser: { email: string; name: string; role: 'admin' | 'user'; subscriptionEnd?: string } | null;
  authToken: string | null;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  loginUser: (email: string, password: string) => Promise<void>;
  registerUser: (email: string, password: string, name: string) => Promise<void>;
  logoutUser: () => void;
  loadCurrentUser: () => Promise<void>;

  // Ratings (loaded from Worker API)
  ratings: Record<string, RatingInfo>;
  loadRatings: () => Promise<void>;
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

function buildAllStations(
  overrides: Record<string, ChargerStatus>,
  custom: ChargerStation[],
  dynamic: ChargerStation[],
  dynamicLoaded: boolean,
): ChargerStation[] {
  // Notion is the source of truth for any station id it knows about: once the
  // dynamic fetch has succeeded, a dynamic station overrides its static seed
  // counterpart, and a static station missing from the dynamic list (deleted/
  // archived in Notion) is dropped instead of falling back to stale seed data.
  // Before the first successful fetch, show the static seed list so the map
  // isn't empty on first paint.
  const dynamicIds = new Set(dynamic.map(d => d.id));
  const staticFallback = dynamicLoaded
    ? chargerStations.filter(s => !dynamicIds.has(s.id))
    : chargerStations;
  return applyOverrides([...staticFallback, ...custom, ...dynamic], overrides);
}
const initialFilters: Filters = { status: 'all', connectorTypes: [], level: 'all' };

export const useStore = create<AppState>((set, get) => ({
  stations: allInitial,
  statusOverrides: initialOverrides,

  setStationStatus: (id, status) => {
    const overrides = { ...get().statusOverrides, [id]: status };
    saveOverrides(overrides);
    const stations = buildAllStations(overrides, get().customStations, get().dynamicStations, get().dynamicLoaded);
    const filteredStations = computeFiltered(stations, get().filters, get().selectedVehicle);
    set({ statusOverrides: overrides, stations, filteredStations });
  },

  customStations: initialCustom,
  addCustomStation: (station) => {
    const custom = [...get().customStations, station];
    saveCustomStations(custom);
    const stations = buildAllStations(get().statusOverrides, custom, get().dynamicStations, get().dynamicLoaded);
    const filteredStations = computeFiltered(stations, get().filters, get().selectedVehicle);
    set({ customStations: custom, stations, filteredStations });
  },

  dynamicStations: [],
  dynamicLoaded: false,
  addDynamicStation: (station) => {
    const dynamic = [...get().dynamicStations.filter(d => d.id !== station.id), station];
    const stations = buildAllStations(get().statusOverrides, get().customStations, dynamic, get().dynamicLoaded);
    const filteredStations = computeFiltered(stations, get().filters, get().selectedVehicle);
    set({ dynamicStations: dynamic, stations, filteredStations });
  },
  loadDynamicStations: async () => {
    const dynamic = await fetchDynamicStations();
    if (dynamic === null) return; // fetch failed — keep showing the static fallback
    const stations = buildAllStations(get().statusOverrides, get().customStations, dynamic, true);
    const filteredStations = computeFiltered(stations, get().filters, get().selectedVehicle);
    set({ dynamicStations: dynamic, dynamicLoaded: true, stations, filteredStations });
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

  sidebarOpen: typeof window !== 'undefined' && window.innerWidth >= 1024,
  setSidebarOpen: (open) => set({ sidebarOpen: open }),

  lastStatusCheck: null,
  statusCheckLoading: false,
  statusCheckError: null,

  refreshStatus: async () => {
    if (get().statusCheckLoading) return;
    set({ statusCheckLoading: true, statusCheckError: null });
    try {
      const ocmData = await fetchGTStations();
      const allStations = buildAllStations(get().statusOverrides, get().customStations, get().dynamicStations, get().dynamicLoaded);
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
      const stations = buildAllStations(newOverrides, get().customStations, get().dynamicStations, get().dynamicLoaded);
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
      const msg = e instanceof Error && e.message === 'NO_API_KEY'
        ? 'Falta API key de OpenChargeMap.'
        : 'Error de conexión con OpenChargeMap.';
      set({ statusCheckLoading: false, statusCheckError: msg });
    }
  },

  scanModalOpen: false,
  setScanModalOpen: (open) => set({ scanModalOpen: open }),

  addStationModalOpen: false,
  setAddStationModalOpen: (open) => set({ addStationModalOpen: open }),

  isAdminAuthenticated: localStorage.getItem('ev_admin_auth') === '1',
  setAdminAuthenticated: (val) => {
    if (val) localStorage.setItem('ev_admin_auth', '1');
    else localStorage.removeItem('ev_admin_auth');
    set({ isAdminAuthenticated: val });
  },
  adminLoginOpen: false,
  setAdminLoginOpen: (open) => set({ adminLoginOpen: open }),

  currentUser: null,
  authToken: localStorage.getItem('ev_auth_token'),
  authModalOpen: false,
  setAuthModalOpen: (open) => set({ authModalOpen: open }),

  loginUser: async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json() as { token?: string; user?: { email: string; name: string; role: 'admin' | 'user'; subscriptionEnd?: string }; error?: string };
    if (!res.ok || !data.token || !data.user) throw new Error(data.error ?? 'Error al iniciar sesión');
    localStorage.setItem('ev_auth_token', data.token);
    if (data.user.role === 'admin') {
      localStorage.setItem('ev_admin_auth', '1');
      set({ isAdminAuthenticated: true });
    }
    set({ authToken: data.token, currentUser: data.user });
  },

  registerUser: async (email, password, name) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    });
    const data = await res.json() as { token?: string; user?: { email: string; name: string; role: 'admin' | 'user'; subscriptionEnd?: string }; error?: string };
    if (!res.ok || !data.token || !data.user) throw new Error(data.error ?? 'Error al registrarse');
    localStorage.setItem('ev_auth_token', data.token);
    if (data.user.role === 'admin') {
      localStorage.setItem('ev_admin_auth', '1');
      set({ isAdminAuthenticated: true });
    }
    set({ authToken: data.token, currentUser: data.user });
  },

  logoutUser: () => {
    localStorage.removeItem('ev_auth_token');
    localStorage.removeItem('ev_admin_auth');
    set({ authToken: null, currentUser: null, isAdminAuthenticated: false });
  },

  loadCurrentUser: async () => {
    const token = localStorage.getItem('ev_auth_token');
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { localStorage.removeItem('ev_auth_token'); set({ authToken: null, currentUser: null }); return; }
      const user = await res.json() as { email: string; name: string; role: 'admin' | 'user'; subscriptionEnd?: string };
      if (user.role === 'admin') {
        localStorage.setItem('ev_admin_auth', '1');
        set({ isAdminAuthenticated: true });
      }
      set({ currentUser: user, authToken: token });
    } catch { /* silently fail */ }
  },

  ratings: {},
  loadRatings: async () => {
    try {
      const data = await getAllRatings();
      set({ ratings: data });
    } catch {
      // silently fail when Worker isn't running (e.g. local dev with vite only)
    }
  },
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
