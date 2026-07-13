# EV Guatemala Map — Project Memory

Mapa de estaciones de carga para vehículos eléctricos en Guatemala. Frontend React + Worker de Cloudflare, con Notion como panel de curación de datos.

## Stack

- **Frontend**: React 19 + TypeScript + Vite, Zustand (estado), Tailwind CSS, Leaflet/react-leaflet (mapa)
- **Backend**: Cloudflare Workers (`worker/index.ts`, un solo archivo con todas las rutas de la API)
- **Datos hoy**: Notion (estaciones + reseñas) + Cloudflare KV (usuarios, fotos)
- **Deploy**: `npm run deploy` (= `tsc -b && vite build && wrangler deploy`). No hay CI/CD — el push a GitHub NO despliega automáticamente.
- **Repo**: `github.com/rafamejiaai360-cyber/ev-guatemala-map`, rama `main`

## Arquitectura actual (jul 2026)

```
Frontend (React/Zustand)
  ├─ src/data/chargers.ts    → seed estático (respaldo de arranque, ya no fuente de verdad)
  └─ fetch /api/stations/dynamic  → Worker → Notion (fuente de verdad para estaciones)

Worker (Cloudflare)
  ├─ Auth: JWT (HS256) + PBKDF2, usuarios en KV (prefijo "user:")
  ├─ Estaciones: CRUD contra Notion DB "EV Estaciones GT"
  ├─ Reseñas: CRUD contra Notion DB "Reseñas"
  └─ Fotos: KV + backup en Notion (File Uploads API)
```

**IMPORTANTE — bug corregido el 13 jul 2026**: `useStore.ts` deduplicaba estaciones dinámicas de Notion excluyéndolas si su `id` coincidía con una estática (`chargerStations`), lo que significaba que **ninguna edición hecha en Notion se reflejaba nunca en la app** para las estaciones originales. Se corrigió para que Notion tenga precedencia sobre el seed estático una vez que la carga dinámica se completa. Si algo similar vuelve a pasar (ediciones en Notion que no se ven en el mapa), revisar `buildAllStations()` en `src/store/useStore.ts`.

**Notion — gotchas conocidos**:
- El endpoint `/api/stations/dynamic` del Worker exige `Fuente` no vacío **y** `Estado = "Activo"` para que una estación aparezca. Si agregas registros directo en Notion sin llenar esos dos campos, la app nunca los mostrará.
- Notion no tiene "borrar" real vía la API usada aquí — solo `archived: true` (worker) o, si se edita manualmente, cambiar `Estado` a `"Rechazado"` (excluido por el filtro anterior). No confundas "Rechazado" con eliminado.
- La API de Notion tiene rate limits reales (`429`) — se vieron varias veces en una sola sesión de trabajo intensivo. No diseñar features que dependan de ráfagas grandes de escrituras a Notion.

## Recomendación de arquitectura (por qué migrar a D1)

Notion es bueno como **panel editorial** (interfaz sin código para revisar/aprobar estaciones), pero **no debería ser la base de datos de producción** que la app consulta en cada carga, por:

1. Rate limits de la API — no escala con tráfico real de usuarios.
2. Sin integridad relacional/transacciones — fácil llegar a estados inconsistentes (pasó el 13 jul: 67 registros "Rechazado" flotando tras un intento de limpieza).
3. Sin consultas geoespaciales (nearest-neighbor, radio de búsqueda).
4. Los usuarios ya viven en Cloudflare KV, separados de Notion — dos sistemas de datos es la raíz de la fragilidad actual.

**Decisión (13 jul 2026): migrar a Cloudflare D1** (SQLite en el edge, ya integrado con el Worker actual, tier gratuito generoso) como base de datos de producción para estaciones, usuarios y suscripciones. Notion pasa a ser un panel de curación que sincroniza hacia D1 (no la fuente que la app consulta en vivo).

Ver `db/schema.sql` para el esquema propuesto/en progreso.

## Roadmap de crecimiento

Áreas identificadas para la siguiente etapa de la app:

1. **Gestión de usuarios en el panel de admin**: roles más allá de `admin`/`user`, ver/editar/desactivar cuentas, historial de actividad.
2. **Suscripciones**: el campo `subscriptionEnd` en `UserRecord` existe pero **no se aplica** — no hay lógica que bloquee funciones a usuarios vencidos. Falta: enforcement en el Worker, integración de pago, UI de estado de suscripción.
3. **Migración a D1**: ver arriba. Es la base para que 1 y 2 sean sostenibles.
4. **Verificación de ubicaciones**: no hay API de Google Maps/Places integrada — la verificación de coordenadas se hace manualmente o vía OpenStreetMap/Nominatim (gratuito pero con huecos de cobertura en Guatemala). Si el presupuesto lo permite, una API key de Google Geocoding mejoraría mucho la confiabilidad de datos nuevos.
5. **Despliegue automático**: agregar GitHub Actions que corra `wrangler deploy` en cada push a `main`, para no depender de que alguien corra `npm run deploy` manualmente.

## Convenciones

- Commits en español, estilo imperativo corto (`Fix ...`, `Add ...`, `Corregir ...`).
- Coautoría de Claude en commits: `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`.
- Nunca declarar una ubicación como "verificada" sin una fuente real (sitio oficial, OSM con match de nombre + categoría correcta, o confirmación directa del usuario con link de Google Maps). Un match solo por zona/vecindario no es suficiente — así se originaron los errores de "Sarita Majadas" y "CC Spazio" corregidos el 13 jul 2026.
