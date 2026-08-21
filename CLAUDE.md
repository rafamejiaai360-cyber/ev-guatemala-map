# EV Guatemala Map — Project Memory

Mapa de estaciones de carga para vehículos eléctricos en Guatemala. Frontend React + Worker de Cloudflare, con Notion como panel de curación de datos.

## Cómo trabajar con Rafa (preferencia fija, 18 ago 2026)

Rafa (dueño del proyecto) no tiene formación técnica. Para cualquier cambio de código:

- **Explicar en lenguaje sencillo**, sin jerga sin traducir — el objetivo es que vaya entendiendo los términos poco a poco, sesión tras sesión, no abrumarlo.
- **Siempre probar en una versión de prueba (staging) primero.** Nunca publicar directo a producción sin que él la haya probado y dado el visto bueno explícito.
- **Avisar sin ambigüedad en qué versión estamos** en cada mensaje relevante: "esto es de prueba, no le llega a tus usuarios todavía" vs. "esto ya es la versión final, publicada para todos". No dar por hecho que él lo infiere del contexto técnico.
- Flujo esperado: cambio en una rama → deploy a staging → Rafa prueba → visto bueno → merge a `main` (dispara el deploy automático a producción).
- Si por algún motivo (como pasó el 18 ago 2026) el código termina publicado en producción antes de validarlo en staging, decirlo de inmediato y con claridad — no dejarlo implícito.

## Stack

- **Frontend**: React 19 + TypeScript + Vite, Zustand (estado), Tailwind CSS, Leaflet/react-leaflet (mapa)
- **Backend**: Cloudflare Workers (`worker/index.ts`, un solo archivo con todas las rutas de la API)
- **Datos hoy**: Notion (estaciones + reseñas) + Cloudflare KV (usuarios, fotos)
- **Deploy producción**: automático — todo push a `main` dispara
  `.github/workflows/deploy.yml` (GitHub Actions → `wrangler deploy --env=""`).
  Activo y verificado desde el 15 jul 2026 (secreto de repo
  `CLOUDFLARE_API_TOKEN` configurado). También se puede desplegar a mano
  con `npm run deploy` (= `tsc -b && vite build && wrangler deploy`).
  **Importante**: desde ahora todo push a `main` publica de inmediato a
  usuarios reales — ya no hay paso manual de por medio.
- **Deploy staging**: manual, `npm run deploy:staging` →
  `https://ev-guatemala-map-staging.rafamejia-ai360.workers.dev`. Ambiente
  aislado (D1, KV y secretos propios; sin cron ni R2 de respaldos) — ver
  sección "Staging" más abajo antes de tocar `wrangler.toml`.
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
Aplica también al deploy automático (push a `main`).

**Staging (14 jul 2026)**: `wrangler.toml` tiene `[env.staging]` — Worker,
D1 (`ev-guatemala-db-staging`), KV (`PHOTOS_STAGING`) y secretos (JWT_SECRET,
ADMIN_PASSWORD) propios, verificado con prueba real de aislamiento (escribir
en staging no aparece en producción). Deliberadamente **sin** binding
`BACKUPS` y **sin** cron — solo producción respalda y recalcula frescura.
Deliberadamente **sin** secreto `NOTION_TOKEN` — cualquier sync a Notion
falla en silencio (`ops_log` op=`sync_notion` ok=0) en vez de escribir en
el panel editorial real. Admin en staging: usar `ADMIN_PASSWORD` (login
legado `/api/admin/login`), no login JWT con el correo real — no se
configuró `ADMIN_EMAIL` en staging.
**Gotcha de Wrangler (visto 14 jul 2026, contradice la documentación de
Cloudflare)**: `[triggers]` del nivel superior SÍ se hereda a los entornos
con nombre si no se sobreescribe (la doc dice que no). Por eso
`[env.staging.triggers]` está explícitamente vacío — quitarlo revive el
cron en staging.

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

**Privacidad del historial de verificación en residenciales (31 jul 2026)**:
el campo `stations.notes` acumula automáticamente el historial de
confirmaciones/reportes/correcciones con el correo de quien los hizo (ej.
`[Verificado en sitio por: correo@ejemplo.com, fecha]`, agregado en
`handleVerifyStation` y `handleStationApprove` en `worker/index.ts`). Para
`type='residential'` ese correo podía identificar indirectamente al dueño de
la vivienda, así que `handleGetStationsFromD1` ahora omite `notes` de la
respuesta salvo que quien pida sea admin (`isAdmin || r.type !== 'residential'`)
— igual que ya pasaba con `createdByEmail`/`createdByName`. Las públicas
siguen mostrando ese historial a cualquiera, sin cambio. En la UI,
`StationDetail.tsx` marca ese bloque con "🔒 Solo admin" cuando es
residencial (para admins; el resto de usuarios ya no lo recibe de la API).

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

**Contador de visitas (31 jul 2026)**: tabla D1 `page_views` — cada fila es
solo un `created_at`, sin IP/user-agent/identificador, para no capturar
datos personales. `POST /api/visits` (público, sin auth) inserta una fila;
el frontend lo llama una vez al montar `App.tsx`, únicamente cuando
`!isAdminPanel` (abrir `/admin` no cuenta como visita). `GET /api/visits`
(solo admin, mismo patrón 403 que `handleListUsers`) agrega totales
(hoy/7d/30d/histórico) y una serie diaria de 30 días. Pestaña "Visitas" en
`AdminPanel.tsx` (`VisitsTab`) la muestra con tarjetas + una barra simple en
CSS (sin librería de charts nueva). **Requiere migración manual**: la tabla
no se crea sola — hay que correr
`npx wrangler d1 execute ev-guatemala-db --remote --file=db/schema.sql`
una vez (todo el archivo usa `IF NOT EXISTS`, así que es seguro re-correrlo
contra prod). Sin la tabla, `POST /api/visits` falla en silencio (no rompe
la carga del mapa) y `GET /api/visits` da 500 hasta que se aplique.

**Corrección de zona horaria + ubicación aproximada (19 ago 2026)**: los
cortes "por día" (hoy/7d/30d/serie diaria) usaban `datetime('now')` de
SQLite, que es UTC — como Guatemala es UTC-6 todo el año (sin horario de
verano), una visita después de las 6pm hora Guatemala se contaba en el día
siguiente. `handleGetVisitStats` ahora resta 6 horas (`GT_OFFSET`) antes de
cortar la fecha, tanto al comparar como al agrupar. Además `page_views` ganó
columnas `country`/`city`: `handleTrackVisit` las llena desde
`request.cf.country`/`request.cf.city` (metadatos que Cloudflare ya adjunta
a cada request en su borde) — **no se guarda la IP de nadie**, sigue el
mismo principio de privacidad que el resto del contador. `GET /api/visits`
agrega top 15 país y top 15 ciudad; `VisitsTab` los muestra en dos tarjetas
nuevas y además lista los 30 días con su número exacto (antes solo se veía
al pasar el mouse sobre la barra). **Requiere migración manual** en bases
YA existentes (prod y staging): `page_views` no se recrea sola, hay que
agregar las columnas a mano —
`ALTER TABLE page_views ADD COLUMN country TEXT;` y
`ALTER TABLE page_views ADD COLUMN city TEXT;` — antes de desplegar este
cambio, o `handleTrackVisit` fallará en silencio al intentar insertar en
columnas que no existen (no rompe la carga del mapa, pero deja de contar
visitas hasta aplicar la migración). Visitas de antes de esta fecha quedan
con país/ciudad en blanco. Estas dos migraciones ya se aplicaron a mano
contra `ev-guatemala-db` y `ev-guatemala-db-staging` (vía el conector MCP de
Cloudflare, sin wrangler CLI) — no hace falta repetirlas.

**Departamento (region), mismo día, poco después**: a pedido de Rafa (el
mapa opera principalmente en Guatemala) se agregó `page_views.region` —
`handleTrackVisit` la llena desde `request.cf.region` (mismo mecanismo que
country/city, sin IP). Para Guatemala esto normalmente da el nombre del
departamento (subdivisión ISO 3166-2:GT); para visitas de otros países da
su estado/provincia. **Ojo con la precisión**: en zonas rurales o con datos
móviles, la geolocalización por IP a veces refleja la ubicación de la
torre/proveedor del operador telefónico, no la del usuario exacto — se le
avisó a Rafa de esta limitación. `GET /api/visits` agrega top 15
departamento (`byRegion`); `VisitsTab` lo muestra en una tercera tarjeta
"Por departamento" junto a país y ciudad (grid pasó de 2 a 3 columnas).
Migración manual `ALTER TABLE page_views ADD COLUMN region TEXT;` — igual
que arriba, ya aplicada a mano contra ambas bases.

**Ubicación real opcional vía permiso del navegador (19 ago 2026, mismo día,
más tarde)**: Rafa notó en persona que el departamento por IP falla en
móvil — probó desde Jutiapa y le salió Ciudad de Guatemala (el tráfico de su
operador sale centralizado por la capital). A su pedido, se agregó una
segunda fuente de ubicación, siempre opcional: `App.tsx` (`getOptionalCoords`)
pide el permiso de geolocalización del navegador al cargar el mapa público
(no en `/admin`), con timeout de ~4-5s; si el usuario lo rechaza, lo ignora,
o el navegador no lo soporta, resuelve a `null` **sin bloquear ni retrasar**
la carga del mapa (el mapa se renderiza aparte, de inmediato, sin esperar
esta promesa). Si acepta, `App.tsx` manda `{lat, lng}` en el body de
`POST /api/visits`. En el Worker, `reverseGeocode()` resuelve esas
coordenadas a país/departamento/ciudad vía Nominatim (OpenStreetMap,
gratuito, sin API key) — **las coordenadas nunca se guardan**, ni siquiera
temporalmente más allá de esa única llamada; solo se guarda el nombre del
lugar ya resuelto, igual que la ubicación por IP. Nueva columna
`page_views.geo_source` (`'gps'` | `'ip'`) registra cuál de las dos fuentes
se usó en cada fila — cuando hay GPS disponible, sus valores de
país/departamento/ciudad reemplazan a los de Cloudflare para esa visita.
`GET /api/visits` agrega `geoSource: {gps, ip}`; `VisitsTab` muestra ese
desglose en un aviso arriba del texto de privacidad, para que Rafa sepa
cuánto de lo que ve es preciso vs. aproximado. Migración manual
`ALTER TABLE page_views ADD COLUMN geo_source TEXT;` — ya aplicada a mano
contra ambas bases. Nominatim tiene límite de uso (≈1 req/seg, requiere
User-Agent identificando la app) — con el tráfico de este mapa no debería
ser problema, pero si `reverseGeocode()` empieza a fallar seguido conviene
revisar la política de uso de Nominatim antes de cambiar de proveedor.

**Ese mismo permiso también centra el mapa (19 ago 2026, poco después)**: a
pedido de Rafa, si el visitante acepta el permiso de ubicación (el mismo que
ya se pedía para el contador de visitas, no uno nuevo — no se le pregunta
dos veces), `App.tsx` reutiliza esas coordenadas para llamar a
`setUserLocation()` del store. Ya existía toda la mecánica para esto desde
antes (el botón manual "Mi ubicación" en `Map.tsx`, `GeolocationButton`, usa
el mismo `setUserLocation`; `MapController` centra el mapa a zoom 14 cuando
`userLocation` cambia) — este cambio solo dispara ese mismo flujo
automáticamente al cargar, en vez de requerir que el usuario toque el botón.
Sigue siendo enteramente opcional y no bloqueante: si rechaza/ignora el
permiso, el mapa se queda centrado en Guatemala (el valor por defecto) como
siempre. Las coordenadas para esto viven solo en el estado del navegador
(Zustand) — nunca se mandan al servidor más que en la llamada aparte,
descartable, de `POST /api/visits` descrita arriba.

**No contar visitas de sesiones admin (20 ago 2026)**: Rafa notó que sus
propias revisiones del mapa público (logueado como admin, no en `/admin`)
se estaban contando como visitas, y además con su ubicación real (que él no
consideraba representativa del "impacto de usuarios reales"). `App.tsx`
ahora revisa, justo antes de mandar `POST /api/visits`,
`useStore.getState().isAdminAuthenticated || currentUser?.role === 'admin'`
— si es una sesión de admin, no manda la llamada (el centrado del mapa en
`setUserLocation` sí se sigue disparando, porque esa parte es solo
conveniencia visual para quien esté viendo el mapa, no estadística). Se lee
con `getState()` dentro del `.then()` de la geolocalización —no como
dependencia del efecto— porque `isAdminAuthenticated` ya está disponible al
instante desde `localStorage` (`ev_admin_auth`), pero además puede haberse
resuelto `currentUser` durante los ~5s que tarda la geolocalización, así que
conviene leer el estado más fresco en ese momento, no el capturado al
montar. **Limitación reconocida**: las visitas de antes de este cambio que
vinieron de sesiones admin ya están mezcladas en `page_views` y no se
pueden separar retroactivamente — por diseño, cada fila solo tiene
timestamp + ubicación aproximada, sin ningún identificador de quién la
generó (ni siquiera de si era admin), así que no hay manera de filtrarlas
después del hecho. El impacto en los números totales debería ser mínimo
frente al tráfico real, y de aquí en adelante quedan limpios.

**Hallazgo sobre el despliegue automático de Cloudflare (19 ago 2026)**: al
revisar por qué la pestaña "Visitas" fallaba justo después de este cambio,
se descubrió que Cloudflare tiene su propia integración de Git (aparte del
GitHub Action `deploy.yml`) que construye y publica **automáticamente**
cada push a cualquier rama, incluidas las de prueba — y esa build usa la
configuración de nivel superior de `wrangler.toml`, es decir, **la base de
datos D1 de producción** (`ev-guatemala-db`), no una copia aislada. La URL
que genera (tipo `<hash-o-rama>-ev-guatemala-map.<subdominio>.workers.dev`)
no es la URL pública real ni el ambiente `staging` documentado arriba, pero
sí lee/escribe contra los datos reales. No cambia el flujo de trabajo (el
merge a `main` sigue siendo el único paso que afecta a usuarios reales en la
URL pública), pero si alguien prueba una rama desde ese link automático,
debe saber que no es una copia de prueba aislada — es la base real.

**Bug real de la ubicación GPS en el contador de visitas (21 ago 2026)**:
tras la función del 19 ago 2026 (permiso del navegador → ubicación
precisa), Rafa probó muchas veces desde Villa Nueva y nunca se registró —
siempre quedaba "Guatemala City" (la aproximación por IP). Varias hipótesis
se descartaron con evidencia real contra la base de datos (permisos de
Safari/Chrome, caché del navegador/CDN, Service Workers,
Permissions-Policy) antes de encontrar la causa real: en
`handleTrackVisit`, las coordenadas se leían del cuerpo de la petición
(`request.json()`) **dentro** de la tarea en segundo plano pasada a
`ctx.waitUntil()`, es decir, después de que el Worker ya le había
contestado `HTTP 200` al navegador. Cloudflare corta el flujo del cuerpo de
la petición apenas se envía la respuesta ("Can't read from request stream
after response has been sent") — así que ese texto nunca llegaba a leerse,
sin importar que el navegador sí lo hubiera mandado bien (confirmado con un
banner de diagnóstico en pantalla, temporal, ya quitado). La solución fue
mover la lectura del cuerpo (`request.text()`) al manejador principal de
rutas, **antes** de `ctx.waitUntil()` y del `return`, y pasarle el texto ya
leído a `handleTrackVisit` como parámetro. **Lección para cualquier ruta
futura que use `ctx.waitUntil()` para procesar algo en segundo plano**: si
la tarea en segundo plano necesita el cuerpo de la petición, hay que leerlo
antes de devolver la respuesta al cliente — nunca dentro de la tarea
diferida.

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
