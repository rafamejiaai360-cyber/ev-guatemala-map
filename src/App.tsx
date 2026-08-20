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
function getOptionalCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise(resolve => {
    if (!('geolocation' in navigator)) return resolve(null);
    let settled = false;
    const finish = (value: { lat: number; lng: number } | null) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    setTimeout(() => finish(null), 5000);
    navigator.geolocation.getCurrentPosition(
      pos => finish({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => finish(null),
      { enableHighAccuracy: false, timeout: 4000, maximumAge: 300000 }
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
      getOptionalCoords().then(coords => {
        if (coords) setUserLocation(coords);
        fetch('/api/visits', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(coords ?? {}),
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
