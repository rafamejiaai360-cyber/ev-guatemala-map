# ⚡ EV Guatemala — Mapa de Cargadores Eléctricos

Aplicación web para localizar y filtrar estaciones de carga para vehículos eléctricos en Guatemala.

## Stack

- React 19 + Vite + TypeScript
- Tailwind CSS v4
- Leaflet.js + react-leaflet (mapa OpenStreetMap — sin API key)
- Zustand (estado global)

## Instalación

```bash
npm install
npm run dev
```

La app estará disponible en `http://localhost:5173`.

## Funcionalidades

| Feature | Descripción |
|---|---|
| Mapa interactivo | Marcadores ⚡ coloreados por estado (verde / amarillo / rojo) |
| Geolocalización | Botón crosshair → centra el mapa y ordena lista por distancia |
| Sidebar | Lista de estaciones, ordenada por distancia o nombre |
| Filtros | Por estado, tipo de conector (multiselect) y nivel de carga |
| Selector de vehículo | Filtra cargadores compatibles con tu EV; los incompatibles se atenúan |
| Popup con info | Nombre, conectores, potencia, red, acceso y link a Google Maps |
| Panel admin | Cambia el estado de cada estación (persiste en localStorage) |

## Panel de Administración

Para activar el modo admin abre:

```
http://localhost:5173/?admin=true
```

Desde ahí puedes cambiar el estado de cada estación (Activo / Mantenimiento / Fuera de servicio). Los cambios se guardan en `localStorage` del navegador y se reflejan de inmediato en el mapa.

## Agregar nuevas estaciones

Edita `src/data/chargers.ts` y agrega un objeto al array `chargerStations`:

```ts
{
  id: 'zona-nombre-unico',       // ID único kebab-case
  name: 'Nombre del lugar',
  address: 'Dirección completa',
  zone: 'Zona 10',               // o "Antigua Guatemala", "Mixco", etc.
  lat: 14.6020,                  // Latitud decimal (Google Maps → click derecho)
  lng: -90.5125,                 // Longitud decimal
  status: 'active',             // 'active' | 'maintenance' | 'offline'
  connectors: [
    { type: 'CCS2', power_kw: 50, level: 'DC' },
    { type: 'Type2', power_kw: 22, level: 'L2' },
  ],
  network: 'Nombre de la red',  // e.g. "Privado", "EV Network GT"
  access: 'public',             // 'public' | 'semi-public' | 'private'
  notes: 'Nota opcional visible en el popup',
}
```

### Tipos de conector

| Tipo | Uso común |
|---|---|
| `CCS2` | DC rápido — mayoría de EVs modernos en LatAm |
| `CHAdeMO` | DC rápido — Nissan Leaf, marcas japonesas |
| `Type2` | AC estándar Europa / LatAm |
| `J1772` | AC estándar USA / Japón |
| `GBT` | Estándar chino |
| `CCS1` | DC rápido estándar USA |

### Encontrar coordenadas

1. Abre [maps.google.com](https://maps.google.com)
2. Click derecho en la ubicación exacta
3. Las coordenadas aparecen al inicio del menú contextual (click para copiar)

## Agregar vehículos

Edita `src/data/vehicles.ts`:

```ts
{
  id: 'marca-modelo-año',
  brand: 'Marca',
  model: 'Modelo',
  year: '2025',
  battery_kwh: 75,
  range_km: 450,
  compatible_connectors: ['CCS2', 'Type2'],
}
```

## Build para producción

```bash
npm run build
```

Genera archivos estáticos en `dist/`. Desplegable en Vercel, Netlify, Nginx o cualquier servidor web estático.
