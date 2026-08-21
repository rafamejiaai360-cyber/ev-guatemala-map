import { lazy, Suspense, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import AdminPanel from './components/AdminPanel';
import ScanModal from './components/ScanModal';
import AddStationModal from './components/AddStationModal';
import AuthModal from './components/AuthModal';
import ProfileModal from './components/ProfileModal';
import ContactAdminModal from './components/ContactAdminModal';
import { useStore } from './store/useStore';

const EVMap = lazy(() => import('./components/Map'));

const isAdminPanel = window.location.pathname === '/admin';

// Pide la ubicación del navegador de forma opcional: si el usuario acepta, se
// usa para (a) centrar el mapa ahí y mostrarle las estaciones cercanas, y
// (b) contar la visita con mayor precisión (departamento/ciudad real en vez
// de la aproximación por IP); si la rechaza, la ignora, o el navegador no la
// soporta, resuelve a null sin bloquear ni afectar el uso del mapa. Nunca se
// guardan las coordenadas en el servidor — solo se envían una vez, para que
// el Worker las resuelva a un nombre de lugar y las descarte.
//
// `reason` diagnostica por qué no hubo coordenadas (visto 21 ago 2026: en
// pruebas reales, con permiso ya concedido, en Safari iPhone Y Chrome, nunca
// se obtuvo una posición ni una sola vez — se manda este código de error al
// servidor, junto al conteo de la visita, para poder ver la causa real en
// vez de seguir adivinando; no identifica a nadie, solo dice qué código de
// error dio el navegador).
function getOptionalCoords(): Promise<{ coords: { lat: number; lng: number } | null; reason: string | null }> {
  return new Promise(resolve => {
    if (!('geolocation' in navigator)) return resolve({ coords: null, reason: 'no-api' });
    let settled = false;
    const finish = (coords: { lat: number; lng: number } | null, reason: string | null) => {
      if (settled) return;
      settled = true;
      resolve({ coords, reason });
    };
    setTimeout(() => finish(null, 'timeout-outer-10s'), 10000);
    navigator.geolocation.getCurrentPosition(
      pos => finish({ lat: pos.coords.latitude, lng: pos.coords.longitude }, null),
      err => finish(null, `code:${err.code} msg:${err.message}`),
      // Mismos parámetros que el botón manual "Mi ubicación" (GeolocationButton
      // en Map.tsx), que sí funciona de forma confiable — enableHighAccuracy:false
      // (WiFi/torre celular) resultó no dar una posición a tiempo en pruebas
      // reales (visto 20 ago 2026: nunca llegó a resolver, ni una vez, con
      // permiso ya concedido), así que se alinea con GPS + más tiempo.
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 300000 }
    );
  });
}

export default function App() {
  const { scanModalOpen, addStationModalOpen, authModalOpen, profileModalOpen, contactAdminModalOpen, loadRatings, loadDynamicStations, loadCurrentUser, setUserLocation } = useStore();

  useEffect(() => {
    loadRatings();
    loadDynamicStations();
    loadCurrentUser();
    if (!isAdminPanel) {
      getOptionalCoords().then(({ coords, reason }) => {
        if (coords) setUserLocation(coords);
        // No contar visitas de sesiones con acceso de administrador (ej. Rafa
        // revisando el mapa público ya logueado) — el contador es para medir
        // impacto real de usuarios, no las propias revisiones del admin.
        const { isAdminAuthenticated, currentUser } = useStore.getState();
        if (isAdminAuthenticated || currentUser?.role === 'admin') return;
        fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...(coords ?? {}), geoError: coords ? undefined : reason }),
        }).catch(() => {});
      });
    }
  }, []);

  if (isAdminPanel) return <AdminPanel />;

  return (
    <div className="flex flex-col h-[var(--app-height)] bg-[#FAFAFA]">
      <Header />
      <div className="flex flex-1 overflow-hidden">
        {/* Desktop sidebar */}
        <div className="hidden lg:flex lg:flex-shrink-0">
          <Sidebar />
        </div>

        {/* Map */}
        <Suspense
          fallback={
            <div className="flex-1 flex items-center justify-center bg-gray-100">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 border-2 border-green-500 border-t-transparent rounded-full animate-spin" />
                <span className="text-sm text-gray-500">Cargando mapa…</span>
              </div>
            </div>
          }
        >
          <EVMap />
        </Suspense>

        {/* Mobile sidebar — bottom sheet */}
        <div className="lg:hidden">
          <Sidebar />
        </div>
      </div>

      {/* Scan modal */}
      {scanModalOpen && <ScanModal />}

      {/* Add station modal */}
      {addStationModalOpen && <AddStationModal />}

      {/* Auth modal */}
      {authModalOpen && <AuthModal />}

      {/* Profile modal */}
      {profileModalOpen && <ProfileModal />}

      {/* Contact admin modal */}
      {contactAdminModalOpen && <ContactAdminModal />}
    </div>
  );
}
