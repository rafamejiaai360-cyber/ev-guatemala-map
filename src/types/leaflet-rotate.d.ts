// Tipos mínimos de leaflet-rotate (el paquete no trae los suyos): agrega a
// L.Map la rotación (bearing) y sus opciones.
import 'leaflet';

declare module 'leaflet' {
  interface MapOptions {
    rotate?: boolean;
    bearing?: number;
    touchRotate?: boolean;
    rotateControl?: boolean | Record<string, unknown>;
    shiftKeyRotate?: boolean;
  }
  interface Map {
    setBearing(deg: number): void;
    getBearing(): number;
  }
}
