# EV Guatemala Map — Project Memory

Mapa de estaciones de carga para vehículos eléctricos en Guatemala. Frontend React + Worker de Cloudflare, con Notion como panel de curación de datos.

## Stack

- **Frontend**: React 19 + TypeScript + Vite, Zustand (estado), Tailwind CSS, Leaflet/react-leaflet (mapa)
- **Backend**: Cloudflare Workers (`worker/index.ts`, un solo archivo con todas las rutas de la API)
- **Datos hoy**: Notion (estaciones + reseñas) + Cloudflare KV (usuarios, fotos)
- **Deploy**: `npm run deploy` (= `tsc -b && vite build && wrangler deploy`). No hay CI/CD — el push a GitHub NO despliega automáticamente.
- **Repo**: `github.com/rafamejiaai360-cyber/ev-guatemala-map`, rama `main`

## Arquitectura actual (14 jul 2026 — migración D1 Fases 0–4 completadas)

**D1 es la única fuente de verdad.** Notion es espejo editorial de solo
lectura (sincroniza DESDE D1, en segundo plano). Plan y detalle:
`docs/plan-migracion-d1.md`. URL prod:
`https://ev-guatemala-map.rafamejia-ai360.workers.dev`.

```
Frontend (React/Zustand)
  ├─ src/data/chargers.ts   → seed estático (paracaídas si la API falla)
  └─ fetch /api/stations    → Worker → D1 (caché en memoria 60s)
                               (fallback: /api/stations/dynamic → Notion, legado)

Worker (Cloudflare) — todo contra D1 (binding DB, base ev-guatemala-db)
  ├─ Auth: JWT (HS256) + PBKDF2, tabla users
  ├─ Estaciones: tabla stations + station_events (historial inmutable)
  │    escrituras en batch() atómico + evento; caché invalidada al escribir
  ├─ Propuestas de usuarios: tabla station_proposals (cola de moderación)
  ├─ Reseñas: tabla reviews (ocultar, no borrar) + rating recalculado
  ├─ Fotos: índice en tabla photos; binario en KV
  └─ Espejo: syncStationToNotion() vía ctx.waitUntil, reintentos ante 429,
       rastro en ops_log (op='sync_notion')
```

**Reglas de integridad (no romperlas)**:
- `station_events` es inmutable: solo INSERT. Es la auditoría y la base de
  reputación/frescura futura.
- Nada se borra físicamente: estaciones → `approval_status='rejected'`;
  reseñas/fotos → `status='hidden'`. Siempre con su evento.
- Los usuarios nunca editan `stations` directo: proponen (station_proposals)
  → admin aprueba/rechaza vía `/api/stations/:id/approve|reject`.
- Verificación (14 jul 2026): confirmaciones y reportes simples de usuarios
  se aplican AL INSTANTE (opiniones, evento confirmed_ok/reported_issue);
  solo correcciones de ubicación (con lat/lng) van a moderación. `flagged`
  requiere 2+ reportantes distintos desde la última confirmación (contados
  por id de evento); una confirmación resetea reportes. La API expone
  freshness/lastConfirmedAt/confirmCount/openReports y la UI los muestra
  como insignia en StationVerification.tsx.
- **Las ediciones manuales en Notion ya NO llegan a la app.** Toda edición se
  hace por el panel de admin de la app. Notion es solo para leer/revisar.

**Bases de datos**: prod `ev-guatemala-db` (6b0f10a8-59f8-4218-b7c5-6d9f46d722b7),
staging `ev-guatemala-db-staging` (933f7752-0065-4fc9-a0c5-e90844ebb69d).
D1 Time Travel permite restaurar a cualquier punto de los últimos 30 días.

**Gotcha de despliegue (visto 14 jul 2026)**: tras `wrangler deploy` hay una
ventana breve donde versiones vieja y nueva atienden tráfico a la vez. No
correr pruebas de humo inmediatamente tras el deploy sin considerar esa carrera.

**Respaldos y mantenimiento (Fase 5, activa desde 14 jul 2026)**:
- Cron diario 08:00 UTC (02:00 GT): exporta las 7 tablas a R2
  (`ev-gt-backups`, `backups/YYYY-MM-DD/*.json`), retención 30 diarios +
  12 mensuales, y recalcula frescura (`verified`→`stale` si no hay
  confirmación en 90 días). Cada corrida deja fila en `ops_log`
  (op `backup_r2` / `recalc_derived`) — si `ok=0` en días seguidos, investigar.
- Simulacro de restauración validado el 14 jul 2026: backup de R2 → staging,
  checksums idénticos a prod. Procedimiento: descargar JSON con
  `wrangler r2 object get ... --remote --pipe` (¡sin `--remote` lee el
  simulador local!), generar INSERTs, aplicar a staging.
- La semilla `src/data/chargers.ts` se regenera desde D1 (no editar a mano).

**Estaciones residenciales (14 jul 2026)**: campo `stations.type` (`public` |
`residential`, ya previsto desde la Fase 0) expuesto en la API, editable por
admin/propuesta igual que cualquier otro campo, y visible en toda la UI.
Codificación de color acordada — **dos señales independientes, no una sola**:
- **Relleno del pin = tipo** (quién ofrece la estación): verde = pública,
  azul = residencial. Es la categoría permanente de la estación.
- **Borde del pin = estado operativo**: blanco = activo, ámbar = mantenimiento,
  rojo = fuera de servicio. No se fusionó con el relleno para no perder
  ninguna de las dos señales.
- El nivel de **acceso** (`access`: public/semi-public/private) sigue siendo
  un campo aparte, sin color propio en el pin — decisión deliberada: no se
  agregó un tercer color "celeste" para semi-privado porque `access` es un
  eje distinto de `type` (una estación pública puede ser semi-pública; una
  residencial puede ser privada o compartida) y cruzar ambos ejes en el color
  del pin (2×3 = 6 combinaciones) rompería la legibilidad del mapa.
- Filtro "🔌 Públicas / 🏠 Residenciales" en `FilterBar.tsx`; selector en
  `AddStationModal.tsx`, `EditStationModal.tsx` y `AdminPanel.tsx`.

**Plataforma de usuarios (14 jul 2026)**: registro pide nombre completo,
correo y **teléfono** (`users.phone`, 8 dígitos GT, con/sin `+502` — solo
declarado, sin verificar por correo/SMS todavía). **Las estaciones
residenciales exigen cuenta**: `handlePostStation` responde 401 si
`type='residential'` sin usuario autenticado; las públicas siguen aceptando
alta anónima igual que antes (decisión explícita, no un descuido). Al crear
una residencial con sesión, `stations.owner_email` (existía desde la Fase 0,
nunca usado) queda enlazado automáticamente al creador — es la pieza que
falta para poder contactar/pagarle al dueño más adelante. Teléfono y correo
del propietario **nunca se exponen** en la ficha pública de la estación.
Gancho para suscripciones: `isSubscriptionActive(user)` en el Worker, sobre
los campos `subscription_status`/`subscription_end` que ya existían — hoy
ninguna función lo llama todavía. Vista "Mi perfil" (`ProfileModal.tsx`,
accesible desde el menú de usuario en `Header.tsx`): editar nombre y
teléfono vía `PATCH /api/auth/me` (`handleUpdateProfile`); email de solo
lectura (es el identificador de la cuenta/JWT, cambiarlo queda fuera de
alcance por ahora).

**Hallazgo (no introducido por este cambio, documentado tal cual se encontró
14 jul 2026)**: `Header.tsx` solo muestra el botón "Agregar/Proponer estación"
a usuarios con sesión (admin o normal) — un visitante anónimo no tiene forma
de llegar al formulario en la UI hoy, aunque el Worker sigue aceptando altas
públicas anónimas si se llama a la API directamente. La compuerta de login
para residenciales en `AddStationModal.tsx` es correcta pero, por este mismo
motivo, hoy es inalcanzable desde la UI — queda como defensa en profundidad
para el día que se agregue algún punto de entrada anónimo.

**Pendiente**:
- KV conserva los `user:*` viejos como reliquia; ya no se leen. Las fotos
  binarias sí siguen en KV.

(Resuelto 14 jul 2026: las 5 cuentas de prueba heredadas de KV —incluidas
las 2 con rol admin, kv_test2@test.com y verify_admin@test.com— quedaron en
`account_status='disabled'` en D1.)

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
