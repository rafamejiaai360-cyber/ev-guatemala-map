import { create } from 'zustand';
import { chargerStations } from '../data/chargers';
import { fetchGTStations, findClosestLocal, ocmToLocalStatus, ocmConnTypeName } from '../utils/ocm';
import type { ChargerStation, ChargerStatus, ConnectorType, ChargerLevel, Vehicle, RatingInfo, StationType, MyStation } from '../types';
import { getAllRatings } from '../utils/reviewsApi';
import { vehicles as baseVehicles } from '../data/vehicles';

async function fetchDynamicStations(): Promise<ChargerStation[] | null> {
  // Fuente principal: D1 (/api/stations). Si falla, degrada al endpoint
  // legado de Notion y, en última instancia, el caller usa la semilla estática.
  // Se manda el token si existe para que el Worker, si quien pregunta es
  // admin, incluya createdByName/createdByEmail (dato oculto al resto).
  const token = localStorage.getItem('ev_auth_token');
  const headers: HeadersInit = token ? { Authorization: `Bearer ${token}` } : {};
  for (const endpoint of ['/api/stations', '/api/stations/dynamic']) {
    try {
      const res = await fetch(endpoint, { headers });
      if (!res.ok) continue;
      return await res.json() as ChargerStation[];
    } catch {
      continue;
    }
  }
  return null;
}

const STORAGE_KEY = 'ev_gt_status_overrides';
const SAVED_KEY = 'ev_gt_saved_stations';

function loadSaved(): string[] {
  try {
    const raw = localStorage.getItem(SAVED_KEY);
    const ids = raw ? JSON.parse(raw) : [];
    return Array.isArray(ids) ? ids.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
// "Mi auto" (oct 2026): el id del vehículo elegido se recuerda en el teléfono
// y, si hay cuenta, también en el servidor (users.vehicle_id).
const VEHICLE_KEY = 'ev_gt_vehicle';
function loadVehicleId(): string | null {
  try { return localStorage.getItem(VEHICLE_KEY); } catch { return null; }
}
function storeVehicleId(id: string | null) {
  try { if (id) localStorage.setItem(VEHICLE_KEY, id); else localStorage.removeItem(VEHICLE_KEY); } catch { /* sin almacenamiento */ }
}
type AccountUser = { email: string; name: string; phone?: string; role: 'admin' | 'user'; subscriptionEnd?: string; vehicleId?: string | null; savedIds?: string[] };

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
  stationType: StationType | 'all';
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

  // Catálogo de vehículos: lista base (src/data/vehicles.ts) + lo que el
  // admin agregó, corrigió u ocultó en D1 (GET /api/vehicles).
  vehicleCatalog: Vehicle[];
  loadVehicles: () => Promise<void>;

  // Vehicle selector
  selectedVehicle: Vehicle | null;
  setSelectedVehicle: (vehicle: Vehicle | null) => void;

  // Map / sidebar interaction
  selectedStationId: string | null;
  setSelectedStationId: (id: string | null) => void;

  // User geolocation
  userLocation: { lat: number; lng: number } | null;
  setUserLocation: (loc: { lat: number; lng: number } | null) => void;
  /** Modo ruta (oct 2026): sigue la ubicación en vivo y avisa al pasar cerca
   *  de una estación. Solo en este dispositivo; la ubicación no se envía. */
  routeMode: boolean;
  setRouteMode: (on: boolean) => void;
  routeRadiusKm: number;
  setRouteRadiusKm: (km: number) => void;

  // Dirección hacia donde va/mira el usuario (grados desde el norte, 0–360).
  // Viene del GPS en movimiento o de la brújula del teléfono. Solo vive en
  // el teléfono: no se manda a ningún lado.
  userHeading: number | null;
  setUserHeading: (deg: number | null) => void;
  // Modo ruta: el mapa gira con la dirección del usuario (true) o queda con
  // el norte arriba (false). Se recuerda en este teléfono.
  headingUp: boolean;
  setHeadingUp: (on: boolean) => void;

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
  /** Tipo con el que abre el formulario (el botón "Aportar" puede pedir
   *  directamente "Mi cargador en casa" = residencial). */
  addStationInitialType: StationType;
  openAddStation: (type?: StationType) => void;

  // Estaciones guardadas (favoritas) — solo en este navegador por ahora
  savedIds: string[];
  toggleSaved: (id: string) => void;

  // Admin flag — mirrors JWT role==='admin', set by login/register/loadCurrentUser
  isAdminAuthenticated: boolean;

  // User auth (JWT system)
  currentUser: AccountUser | null;
  /** Une "Mi auto" y "Guardadas" del teléfono con los de la cuenta al iniciar sesión. */
  syncAccountPrefs: (user: AccountUser) => void;
  authToken: string | null;
  authModalOpen: boolean;
  setAuthModalOpen: (open: boolean) => void;
  /** Pestaña con la que abre la ventana de cuenta (registro o ingreso). */
  authStartTab: 'login' | 'register';
  openAuth: (tab: 'login' | 'register') => void;
  /** Invitación a crear cuenta según el momento (oct 2026, ver JoinSheet). */
  joinPrompt: JoinContext | null;
  setJoinPrompt: (ctx: JoinContext | null) => void;
  /** Lo que el visitante quería aportar antes de registrarse; se retoma solo
   *  apenas inicia sesión (MobileShell). */
  pendingAddType: StationType | null;
  setPendingAddType: (t: StationType | null) => void;
  loginUser: (email: string, password: string) => Promise<void>;
  registerUser: (email: string, password: string, name: string, phone: string) => Promise<void>;
  logoutUser: () => void;
  loadCurrentUser: () => Promise<void>;
  profileModalOpen: boolean;
  setProfileModalOpen: (open: boolean) => void;
  updateProfile: (name: string, phone: string) => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;

  // Contact admin (public, no login required)
  contactAdminModalOpen: boolean;
  setContactAdminModalOpen: (open: boolean) => void;

  // Ratings (loaded from Worker API)
  ratings: Record<string, RatingInfo>;
  loadRatings: () => Promise<void>;

  // Mis estaciones (dueños): lista propia y estado publicado al instante
  myStations: MyStation[] | null;
  loadMyStations: () => Promise<void>;
  publishStationStatus: (id: string, status: ChargerStatus, note?: string) => Promise<void>;
}

function computeFiltered(
  stations: ChargerStation[],
  filters: Filters,
  selectedVehicle: Vehicle | null,
): ChargerStation[] {
  return stations.filter((s) => {
    if (filters.status !== 'all' && s.status !== filters.status) return false;
    if (filters.stationType !== 'all' && (s.type ?? 'public') !== filters.stationType) return false;
    if (filters.connectorTypes.length > 0) {
      const stationTypes = s.connectors.map((c) => c.type);
      if (!filters.connectorTypes.some((t) => stationTypes.includes(t))) return false;
    }
    if (filters.level !== 'all') {
      if (!s.connectors.some((c) => c.level === filters.level)) return false;
    }
    // Sin conector confirmado para el vehículo no filtramos por compatibilidad —
    // mejor no afirmar nada a asumir un conector que todavía no se ha verificado.
    if (selectedVehicle && selectedVehicle.compatible_connectors?.length) {
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
const initialFilters: Filters = { status: 'all', connectorTypes: [], level: 'all', stationType: 'all' };

// Marca este navegador como "del admin" para el contador de visitas. A
// diferencia de ev_admin_auth, NO se borra al cerrar sesión: así las visitas
// de Rafa en sus dispositivos no se cuentan aunque luego entre sin sesión.
// Guarda "Mi auto" / "Guardadas" en la cuenta, sin bloquear la pantalla. Si
// falla (sin conexión o sin la migración), quedan igual en el teléfono.
function pushPrefs(token: string | null, body: { vehicleId?: string | null; savedIds?: string[] }) {
  if (!token) return;
  fetch('/api/auth/me', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  }).catch(() => {});
}

export type JoinContext = 'save' | 'aportar' | 'browse';

// Distancia de aviso del modo ruta elegida por el usuario (1, 2 o 5 km).
export const ROUTE_RADII = [1, 2, 5];
function loadRouteRadius(): number {
  try {
    const v = Number(localStorage.getItem('ev_route_radius'));
    if (ROUTE_RADII.includes(v)) return v;
  } catch { /* sin almacenamiento */ }
  return 2;
}

function loadHeadingUp(): boolean {
  try { return localStorage.getItem('ev_heading_up') !== '0'; } catch { return true; }
}

function markNoCountDevice() {
  try { localStorage.setItem('ev_no_count', '1'); } catch { /* sin almacenamiento: no pasa nada */ }
}

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

  vehicleCatalog: baseVehicles,
  loadVehicles: async () => {
    try {
      const res = await fetch('/api/vehicles');
      if (!res.ok) return;
      const rows = await res.json() as (Vehicle & { status?: string })[];
      if (!Array.isArray(rows)) return;
      const byId = new Map(baseVehicles.map((v) => [v.id, v]));
      for (const r of rows) {
        if (r.status === 'hidden') { byId.delete(r.id); continue; }
        const { status: _status, ...v } = r;
        void _status;
        byId.set(v.id, v);
      }
      const catalog = Array.from(byId.values())
        .sort((a, b) => a.brand.localeCompare(b.brand) || a.model.localeCompare(b.model));
      set({ vehicleCatalog: catalog });
      // El auto guardado puede ser uno agregado desde el panel (solo en D1).
      const wanted = get().currentUser?.vehicleId ?? loadVehicleId();
      if (wanted && get().selectedVehicle?.id !== wanted) {
        const v = catalog.find((x) => x.id === wanted);
        if (v) set({ selectedVehicle: v, filteredStations: computeFiltered(get().stations, get().filters, v) });
      }
    } catch {
      // sin API (desarrollo local con vite) se queda la lista base
    }
  },

  selectedVehicle: baseVehicles.find((v) => v.id === loadVehicleId()) ?? null,
  setSelectedVehicle: (vehicle) => {
    const filteredStations = computeFiltered(get().stations, get().filters, vehicle);
    set({ selectedVehicle: vehicle, filteredStations });
    storeVehicleId(vehicle?.id ?? null);
    if (get().currentUser) pushPrefs(get().authToken, { vehicleId: vehicle?.id ?? null });
  },

  selectedStationId: null,
  setSelectedStationId: (id) => set({ selectedStationId: id }),

  userLocation: null,
  setUserLocation: (loc) => set({ userLocation: loc }),
  routeMode: false,
  setRouteMode: (on) => set({ routeMode: on }),
  userHeading: null,
  setUserHeading: (deg) => set({ userHeading: deg }),
  headingUp: loadHeadingUp(),
  setHeadingUp: (on) => {
    try { localStorage.setItem('ev_heading_up', on ? '1' : '0'); } catch { /* sin almacenamiento */ }
    set({ headingUp: on });
  },
  routeRadiusKm: loadRouteRadius(),
  setRouteRadiusKm: (km) => {
    try { localStorage.setItem('ev_route_radius', String(km)); } catch { /* sin almacenamiento */ }
    set({ routeRadiusKm: km });
  },

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
  addStationInitialType: 'public',
  openAddStation: (type = 'public') => set({ addStationInitialType: type, addStationModalOpen: true }),

  savedIds: loadSaved(),
  toggleSaved: (id) => {
    const cur = get().savedIds;
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(next)); } catch { /* almacenamiento bloqueado */ }
    set({ savedIds: next });
    if (get().currentUser) pushPrefs(get().authToken, { savedIds: next });
  },

  syncAccountPrefs: (user) => {
    const token = get().authToken;
    // Guardadas: se suman las del teléfono y las de la cuenta (no se pierde nada).
    const server = user.savedIds ?? [];
    const merged = Array.from(new Set([...server, ...get().savedIds]));
    try { localStorage.setItem(SAVED_KEY, JSON.stringify(merged)); } catch { /* */ }
    set({ savedIds: merged });
    if (merged.length !== server.length) pushPrefs(token, { savedIds: merged });
    // Mi auto: manda el de la cuenta; si la cuenta no tiene, se sube el del teléfono.
    if (user.vehicleId) {
      const v = get().vehicleCatalog.find((x) => x.id === user.vehicleId);
      storeVehicleId(user.vehicleId);
      if (v && v.id !== get().selectedVehicle?.id) {
        set({ selectedVehicle: v, filteredStations: computeFiltered(get().stations, get().filters, v) });
      }
    } else if (get().selectedVehicle) {
      pushPrefs(token, { vehicleId: get().selectedVehicle!.id });
    }
  },

  isAdminAuthenticated: localStorage.getItem('ev_admin_auth') === '1',

  currentUser: null,
  authToken: localStorage.getItem('ev_auth_token'),
  authModalOpen: false,
  setAuthModalOpen: (open) => set(open ? { authModalOpen: true } : { authModalOpen: false, authStartTab: 'login' }),
  authStartTab: 'login',
  openAuth: (tab) => set({ authModalOpen: true, authStartTab: tab, joinPrompt: null }),
  joinPrompt: null,
  setJoinPrompt: (ctx) => set({ joinPrompt: ctx }),
  pendingAddType: null,
  setPendingAddType: (t) => set({ pendingAddType: t }),

  loginUser: async (email, password) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json() as { token?: string; user?: AccountUser; error?: string };
    if (!res.ok || !data.token || !data.user) throw new Error(data.error ?? 'Error al iniciar sesión');
    localStorage.setItem('ev_auth_token', data.token);
    if (data.user.role === 'admin') {
      localStorage.setItem('ev_admin_auth', '1');
      markNoCountDevice();
      set({ isAdminAuthenticated: true });
    }
    set({ authToken: data.token, currentUser: data.user });
    get().syncAccountPrefs(data.user);
    // Vuelve a pedir las estaciones con el token ya guardado: si es admin,
    // la respuesta ahora trae quién dio de alta cada una.
    if (data.user.role === 'admin') await get().loadDynamicStations();
  },

  registerUser: async (email, password, name, phone) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name, phone }),
    });
    const data = await res.json() as { token?: string; user?: AccountUser; error?: string };
    if (!res.ok || !data.token || !data.user) throw new Error(data.error ?? 'Error al registrarse');
    localStorage.setItem('ev_auth_token', data.token);
    if (data.user.role === 'admin') {
      localStorage.setItem('ev_admin_auth', '1');
      markNoCountDevice();
      set({ isAdminAuthenticated: true });
    }
    set({ authToken: data.token, currentUser: data.user });
    get().syncAccountPrefs(data.user);
  },

  logoutUser: () => {
    localStorage.removeItem('ev_auth_token');
    localStorage.removeItem('ev_admin_auth');
    set({ authToken: null, currentUser: null, isAdminAuthenticated: false, myStations: null });
  },

  loadCurrentUser: async () => {
    const token = localStorage.getItem('ev_auth_token');
    if (!token) return;
    try {
      const res = await fetch('/api/auth/me', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { localStorage.removeItem('ev_auth_token'); set({ authToken: null, currentUser: null }); return; }
      const user = await res.json() as AccountUser;
      if (user.role === 'admin') {
        localStorage.setItem('ev_admin_auth', '1');
        markNoCountDevice();
        set({ isAdminAuthenticated: true });
      }
      set({ currentUser: user, authToken: token });
      get().syncAccountPrefs(user);
    } catch { /* silently fail */ }
  },

  profileModalOpen: false,
  setProfileModalOpen: (open) => set({ profileModalOpen: open }),

  updateProfile: async (name, phone) => {
    const token = get().authToken;
    if (!token) throw new Error('No autenticado');
    const res = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name, phone }),
    });
    const data = await res.json() as AccountUser & { error?: string };
    if (!res.ok) throw new Error(data.error ?? 'Error al actualizar el perfil');
    set({ currentUser: data });
  },

  changePassword: async (currentPassword, newPassword) => {
    const token = get().authToken;
    if (!token) throw new Error('No autenticado');
    const res = await fetch('/api/auth/change-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
    const data = await res.json() as { ok?: boolean; error?: string };
    if (!res.ok) throw new Error(data.error ?? 'Error al cambiar la contraseña');
  },

  contactAdminModalOpen: false,
  setContactAdminModalOpen: (open) => set({ contactAdminModalOpen: open }),


  myStations: null,
  loadMyStations: async () => {
    const token = get().authToken;
    if (!token) { set({ myStations: null }); return; }
    try {
      const res = await fetch('/api/my-stations', { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) return;
      const data = await res.json() as MyStation[];
      if (Array.isArray(data)) set({ myStations: data });
    } catch { /* sin conexión: se intenta de nuevo al volver a Perfil */ }
  },
  publishStationStatus: async (id, status, note = '') => {
    const token = get().authToken;
    if (!token) throw new Error('Debes iniciar sesión');
    const res = await fetch(`/api/stations/${encodeURIComponent(id)}/status`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ status, note }),
    });
    const data = await res.json().catch(() => ({})) as { error?: string; statusNote?: string | null };
    if (!res.ok) throw new Error(data.error ?? 'No se pudo guardar el estado');
    // Se refleja de inmediato en este dispositivo (la lista del servidor puede
    // tardar hasta un minuto por su caché). Un estado viejo guardado solo en
    // este navegador ya no debe taparlo.
    const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const statusNote = data.statusNote ?? undefined;
    const mine = get().myStations?.some((m) => m.id === id) ?? false;
    const overrides = { ...get().statusOverrides };
    delete overrides[id];
    saveOverrides(overrides);
    const patch = { status, statusNote, statusUpdatedAt: now, statusByOwner: mine || undefined };
    const known = get().dynamicStations.some((d) => d.id === id);
    const base = get().stations.find((x) => x.id === id);
    const dynamic = known
      ? get().dynamicStations.map((d) => (d.id === id ? { ...d, ...patch } : d))
      : base ? [...get().dynamicStations, { ...base, ...patch }] : get().dynamicStations;
    const stations = buildAllStations(overrides, get().customStations, dynamic, get().dynamicLoaded);
    set({
      statusOverrides: overrides,
      dynamicStations: dynamic,
      stations,
      filteredStations: computeFiltered(stations, get().filters, get().selectedVehicle),
      myStations: get().myStations?.map((m) => (m.id === id
        ? { ...m, status, statusNote: statusNote ?? null, statusUpdatedAt: now, statusByOwner: true }
        : m)) ?? null,
    });
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
