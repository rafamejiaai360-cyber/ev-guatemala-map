import { useEffect } from 'react';
import { useStore } from '../../store/useStore';

// Dirección del usuario (oct 2026): hacia dónde va o mira, en grados desde el
// norte. Dos fuentes:
//  - GPS en movimiento (modo ruta): exacto en el auto, pero solo existe si se
//    está moviendo; parado no dice nada útil.
//  - Brújula del teléfono: sirve parado o caminando. En iPhone pide permiso
//    (requestCompass, dentro de un toque); en Android funciona sin preguntar.
// El GPS manda cuando hay velocidad; la brújula llena los huecos. Todo queda
// en el teléfono.

const GPS_MIN_SPEED = 1.5; // m/s (~5 km/h): por debajo, el rumbo del GPS no sirve
const GPS_PRIORITY_MS = 4000; // tras un rumbo de GPS, la brújula espera
let lastGpsAt = 0;
let smoothed: number | null = null;

/** Diferencia más corta entre dos ángulos (-180..180). */
function angleDiff(to: number, from: number): number {
  return ((to - from + 540) % 360) - 180;
}

function push(raw: number, weight: number) {
  const h = ((raw % 360) + 360) % 360;
  if (smoothed == null) smoothed = h;
  else smoothed = (smoothed + angleDiff(h, smoothed) * weight + 360) % 360;
  const cur = useStore.getState().userHeading;
  // Solo se avisa a la pantalla si cambió de verdad (evita que el mapa "tiemble").
  if (cur == null || Math.abs(angleDiff(smoothed, cur)) >= 2) {
    useStore.getState().setUserHeading(Math.round(smoothed));
  }
}

/** Rumbo del GPS (watchPosition del modo ruta). */
export function pushGpsHeading(coords: GeolocationCoordinates) {
  const { heading, speed } = coords;
  if (heading == null || isNaN(heading) || speed == null || speed < GPS_MIN_SPEED) return;
  lastGpsAt = Date.now();
  push(heading, 0.6);
}

type IOSOrientationEvent = DeviceOrientationEvent & { webkitCompassHeading?: number };
type OrientationCtor = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<'granted' | 'denied'> };

function screenAngle(): number {
  const a = window.screen?.orientation?.angle;
  if (typeof a === 'number') return a;
  const legacy = (window as unknown as { orientation?: number }).orientation;
  return typeof legacy === 'number' ? legacy : 0;
}

function onOrientation(e: Event) {
  if (Date.now() - lastGpsAt < GPS_PRIORITY_MS) return;
  const ev = e as IOSOrientationEvent;
  let h: number | null = null;
  if (typeof ev.webkitCompassHeading === 'number') h = ev.webkitCompassHeading; // iPhone: ya es rumbo
  else if (ev.absolute && typeof ev.alpha === 'number') h = 360 - ev.alpha; // Android (absoluto)
  if (h == null) return;
  push(h + screenAngle(), 0.25);
}

let listening = false;
function startCompass() {
  if (listening || typeof window === 'undefined') return;
  listening = true;
  const w: Window = window;
  w.addEventListener('ondeviceorientationabsolute' in w ? 'deviceorientationabsolute' : 'deviceorientation', onOrientation);
}

/** Pide permiso de brújula en iPhone. Debe llamarse dentro de un toque. */
export function requestCompass() {
  const Ctor = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as OrientationCtor | undefined;
  if (!Ctor) return;
  if (typeof Ctor.requestPermission === 'function') {
    Ctor.requestPermission()
      .then((r) => { if (r === 'granted') startCompass(); })
      .catch(() => { /* sin brújula: queda el rumbo del GPS */ });
    return;
  }
  startCompass();
}

/** Enciende la brújula donde no hace falta permiso (Android) apenas se
 *  conoce la ubicación del usuario. En iPhone espera a requestCompass(). */
export function useCompassWhenLocated() {
  const located = useStore((s) => s.userLocation != null);
  useEffect(() => {
    if (!located) return;
    const Ctor = (typeof DeviceOrientationEvent !== 'undefined' ? DeviceOrientationEvent : undefined) as OrientationCtor | undefined;
    if (Ctor && typeof Ctor.requestPermission !== 'function') startCompass();
  }, [located]);
}
