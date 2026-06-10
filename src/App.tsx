import { lazy, Suspense, useEffect } from 'react';
import Header from './components/Header';
import Sidebar from './components/Sidebar';
import AdminPanel from './components/AdminPanel';
import ScanModal from './components/ScanModal';
import { useStore } from './store/useStore';

const EVMap = lazy(() => import('./components/Map'));

const isAdmin =
  window.location.pathname === '/admin' ||
  new URLSearchParams(window.location.search).get('admin') === 'true';

export default function App() {
  const { refreshStatus, scanModalOpen } = useStore();

  // refreshStatus is available for manual use via the header button
  void refreshStatus;

  if (isAdmin) return <AdminPanel />;

  return (
    <div className="flex flex-col h-screen bg-[#FAFAFA]">
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
    </div>
  );
}
