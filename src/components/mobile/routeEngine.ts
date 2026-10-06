import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store/useStore';
import type { ChargerStation } from '../../types';
import { distanceKm } from './shared';

// Modo ruta (oct 2026). El usuario lo enciende con el botón del mapa: la app
// sigue su ubicación en vivo (watchPosition) y, al pasar a menos de la
// distancia elegida de una estación de las que ve en el mapa (respeta sus
// filtros; nunca las fuera de servicio), muestra un aviso con sonido.
// Todo ocurre en el teléfono: la ubicación NO se envía al servidor.
// Limitación de cualquier página web: solo funciona con la app abierta y la
// pantalla encendida (se pide al navegador que no apague la pantalla).

type WakeLockSentinelLike = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & { wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinelLike> } };

let audioCtx: AudioContext | null = null;

/** Prepara el sonido. Debe llamarse dentro del toque del usuario (iOS solo
 *  deja reproducir audio si se "desbloqueó" con un gesto). */
export function primeRouteSound() {
  try {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    audioCtx ??= new Ctx();
    void audioCtx.resume();
  } catch { /* sin audio: el aviso sigue siendo visual */ }
}

function playChime() {
  if (!audioCtx) return;
  try {
    const t0 = audioCtx.currentTime;
    [880, 1320].forEach((freq, i) => {
      const osc = audioCtx!.createOscillator();
      const gain = audioCtx!.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = t0 + i * 0.18;
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.exponentialRampToValueAtTime(0.35, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, start + 0.25);
      osc.connect(gain).connect(audioCtx!.destination);
      osc.start(start);
      osc.stop(start + 0.3);
    });
  } catch { /* sin audio */ }
  try { navigator.vibrate?.([120, 80, 120]); } catch { /* iPhone no vibra desde la web */ }
}

export interface RouteAlert { station: ChargerStation; km: number }

/** Motor del modo ruta: seguimiento de ubicación, pantalla encendida y
 *  detección de estaciones cercanas. Devuelve el aviso activo (o null). */
export function useRouteMode(): [RouteAlert | null, () => void] {
  const { routeMode, routeRadiusKm, filteredStations, setUserLocation, setRouteMode } = useStore();
  const [alert, setAlert] = useState<RouteAlert | null>(null);
  const alerted = useRef<Set<string>>(new Set());
  const stationsRef = useRef(filteredStations);
  const radiusRef = useRef(routeRadiusKm);
  useEffect(() => { stationsRef.current = filteredStations; radiusRef.current = routeRadiusKm; }, [filteredStations, routeRadiusKm]);

  useEffect(() => {
    if (!routeMode) return;
    if (!navigator.geolocation) { setRouteMode(false); return; }
    alerted.current = new Set();
    let lock: WakeLockSentinelLike | null = null;
    const wantLock = () => {
      (navigator as NavigatorWithWakeLock).wakeLock?.request('screen')
        .then((l) => { lock = l; })
        .catch(() => { /* el navegador no lo permite: la pantalla puede apagarse */ });
    };
    wantLock();
    // El bloqueo de pantalla se pierde al cambiar de app; se pide de nuevo al volver.
    const onVisible = () => { if (document.visibilityState === 'visible') wantLock(); };
    document.addEventListener('visibilitychange', onVisible);

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const loc = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(loc);
        let best: RouteAlert | null = null;
        for (const s of stationsRef.current) {
          if (s.status === 'offline' || alerted.current.has(s.id)) continue;
          const km = distanceKm(s, loc);
          if (km != null && km <= radiusRef.current && (!best || km < best.km)) best = { station: s, km };
        }
        if (best) {
          alerted.current.add(best.station.id);
          setAlert(best);
          playChime();
        }
      },
      (err) => {
        // Permiso denegado: no tiene sentido seguir encendido.
        if (err.code === err.PERMISSION_DENIED) setRouteMode(false);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => {
      navigator.geolocation.clearWatch(watchId);
      document.removeEventListener('visibilitychange', onVisible);
      void lock?.release().catch(() => {});
      setAlert(null);
    };
  }, [routeMode, setUserLocation, setRouteMode]);

  // El aviso se cierra solo a los 25 s.
  useEffect(() => {
    if (!alert) return;
    const t = setTimeout(() => setAlert(null), 25000);
    return () => clearTimeout(t);
  }, [alert]);

  return [alert, () => setAlert(null)];
}

