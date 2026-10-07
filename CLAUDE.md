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
**Más huecos del filtro de admin cerrados (6 oct 2026)**: (1) el chequeo de
arriba depende de tener sesión de admin EN ESE navegador — el acceso directo
del iPhone (pantalla de inicio) no comparte almacenamiento con Safari, así
que ahí las visitas de Rafa sí contaban. Ahora, al iniciar sesión como admin,
el store marca el navegador con `localStorage.ev_no_count='1'`
(`markNoCountDevice()`), que **no se borra al cerrar sesión**; `App.tsx` no
manda la visita si existe. Basta con iniciar sesión como admin una vez en
cada dispositivo/app. (2) Las vistas previas automáticas de Cloudflare
(`<rama|hash>-ev-guatemala-map.<subdominio>.workers.dev`, que usan la base
real) ya no cuentan: el Worker ignora `POST /api/visits` si el hostname
coincide con `/^[^.]+-ev-guatemala-map\./` (no afecta prod ni staging).
Nota: en `npm run dev` se ven varias visitas por carga por `StrictMode`; en
la build real es una sola (verificado con `vite preview`).

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

**Rediseño de navegación (oct 2026, en staging, pendiente de visto bueno de
Rafa)**: basado en la estructura de la app Electron Power, adaptada al
estilo minimalista que pidió Rafa. `App.tsx` monta siempre
`src/components/mobile/MobileShell.tsx` (Header.tsx y Sidebar.tsx quedaron sin
uso); a pedido de Rafa la computadora usa la MISMA lógica y pantallas que el
celular, con la distribución "A · Barra superior" que él eligió entre 3
maquetas (https://claude.ai/artifact/SYEnAVA4cnLPwt2ZBVGPyW): en >= 1024 px
hay una barra superior (`.m-dtop`: logo, Mapa/Actividad/Guardadas al centro,
Contáctanos + Aportar + avatar→Perfil a la derecha), lista fija de 400 px a la
izquierda donde también se abren la ficha y las otras pestañas, y el mapa a la
derecha; tocar un pin abre la ficha directo (sin tarjeta flotante, ver
`shownDetailId` en MobileShell). Hojas como ventanas centradas. En celular: barra
inferior flotante (Mapa · Actividad · botón central "Aportar" · Guardadas ·
Perfil), interruptor Mapa/Lista, filtros rápidos en chips (Todas · Públicas
(punto verde) · Residenciales (punto azul) + botón de ícono "Filtros") — a
pedido de Rafa NO hay chip "Activas" ni contador de "activas" (el de arriba
dice "N estaciones"), porque la app no conoce el estado real en tiempo real; la hoja "Filtros"
(`FiltersPanel.tsx`, ya no usa FilterBar/VehicleSelector) muestra todo a la
vista: lista de vehículos con buscador y miniatura (`Vehicle.image_url`
opcional, ícono genérico si falta — Rafa juntará fichas técnicas oficiales en
las agencias para completar `src/data/vehicles.ts`), tipo de conector y
velocidad de carga (AC/DC); no repite Pública/Residencial, tarjeta flotante al
tocar un pin y ficha completa (`StationScreen.tsx`) con Waze/Google Maps. La
ficha conserva las mismas reglas de privacidad que `StationDetail.tsx`.
Cambios del mapa (`Map.tsx`): mapa base de OpenStreetMap pasado a grises suaves con un filtro
CSS (`.ev-tiles` en `index.css`) — se probó CARTO "Positron" pero ahora exige
API key fuera de localhost (mostraba "API KEY REQUIRED" en cada cuadro),
pin en forma de gota con enchufe (relleno = tipo, gris si fuera de servicio;
puntito ámbar/rojo = estado, en lugar del borde grueso), agrupación propia de
estaciones cercanas (sin librería nueva) y las estaciones filtradas ahora se
ocultan en vez de atenuarse. "Guardadas" (`savedIds` en el store) vive solo en
`localStorage` del navegador, sin cuenta ni servidor por ahora. Prototipo
navegable de referencia: https://claude.ai/artifact/MecCx1MFcjX339tVkjGPZN

**Catálogo de vehículos y propuestas de usuarios (oct 2026, rama
`vehiculos-propuestas`, en prueba)**: la lista base sigue en
`src/data/vehicles.ts`; la tabla D1 `vehicles` la sobreescribe o amplía por
`id` (`status='hidden'` la oculta) y el frontend las combina en
`vehicleCatalog` (`loadVehicles()` en el store, `GET /api/vehicles`). Los
usuarios con cuenta proponen autos nuevos o correcciones desde la hoja
"Filtros" (`VehicleProposalModal.tsx` → `POST /api/vehicle-proposals`, cola
`vehicle_proposals`, máx. 10 pendientes por usuario) y ven el estado en
Actividad (`?mine=1`). El admin revisa en la pestaña "Vehículos" del panel
(`src/components/admin/VehiclesTab.tsx`): aprobar / aprobar como verificada /
rechazar, y editar el catálogo (`PUT /api/vehicles/:id|new`). Cada auto del catálogo
tiene botón **Eliminar** (= `status='hidden'`, no borra la fila; regla de
integridad "nada se borra físicamente") y la sección **Eliminados** permite
restaurarlo (6 oct 2026, a pedido de Rafa: antes solo existía "Ocultar"
escondido dentro de Editar). `verified=1`
("Ficha verificada") **solo** con fuente oficial (agencia/ficha técnica).
**Fotos: solo las sube el admin** (a KV, servidas por `/api/photo/:key`) y
solo propias o con permiso de la marca/agencia — decisión explícita de Rafa:
nada de fotos con derechos de autor bajadas de internet. Los usuarios no
suben fotos de vehículos. Los datos agregados a `vehicles.ts` desde la web
tienen comentario de fuente; lo no confirmado queda marcado `PENDIENTE` y
sin conectores (el filtro solo usa conectores confirmados).
**Requiere migración manual** (las tablas no se crean solas) en staging y
luego en prod: `npx wrangler d1 execute ev-guatemala-db-staging --remote
--file=db/schema.sql` (y `ev-guatemala-db` al publicar) — seguro de re-correr
por `IF NOT EXISTS`. Sin las tablas, `GET /api/vehicles` falla y la app usa
la lista base sin romperse. **Estado**: aplicada a `ev-guatemala-db-staging`
(6 oct 2026, vía conector MCP de Cloudflare); falta `ev-guatemala-db` (prod)
al publicar. SQL listo para pegar: `docs/migracion-vehiculos.sql`.

**Rastro de avisos a Telegram (6 oct 2026)**: `notifyAdmin()` antes fallaba
en silencio (fetch no lanza error ante 401/400 de Telegram). Ahora cada
intento deja fila en `ops_log` con `op='notify_telegram'`, `ok=1/0` y en
`detail` el título + motivo del fallo (`sin TELEGRAM_BOT_TOKEN/...`,
`status`/`error` de Telegram). Nunca se guarda el texto del aviso (lleva
nombres de usuarios). Para comprobar: `SELECT * FROM ops_log WHERE
op='notify_telegram' ORDER BY id DESC LIMIT 5`.
Staging **no tiene** `TELEGRAM_BOT_TOKEN`/`TELEGRAM_CHAT_ID` (confirmado 6 oct
2026 con ese registro: "sin TELEGRAM_BOT_TOKEN/TELEGRAM_CHAT_ID"); a pedido de
Rafa no se agregan — el aviso de propuestas de vehículos se comprueba en prod
al publicar (proponer uno de prueba y revisar `ops_log` en `ev-guatemala-db`).

**Acceso directo como app en el celular (6 oct 2026)**: Rafa vio en su
iPhone (acceso directo en el dock) la parte de arriba difuminada: el sitio no
tenía configuración de "app de pantalla de inicio", así que iOS lo abría como
página web y ponía su propia franja borrosa detrás de la hora (el mapa se
dibuja hasta el borde por `viewport-fit=cover`). Se agregó `public/manifest.json`
(`display: standalone`), íconos propios (`apple-touch-icon.png`, `icon-192/512`,
generados con el rayo verde de la marca; `favicon.svg` era el logo morado por
defecto de Vite) y en `index.html` las meta `apple-mobile-web-app-capable` +
`apple-mobile-web-app-status-bar-style=default` (barra de la hora blanca
sólida, el contenido empieza debajo). **iOS lee esta configuración solo al
agregar el acceso directo**: quien ya lo tenía debe borrarlo y volver a
agregarlo (Safari → Compartir → Agregar a pantalla de inicio).
Eso **no bastó**: tras publicarlo y volver a agregar el acceso directo,
Rafa siguió viendo el difuminado. Se agregó `.m-statusbar` en MobileShell —
franja sólida color `--page` del alto exacto de `env(safe-area-inset-top)`
(0 en computadora), z-index 45 (debajo del oscurecido de hojas) — para que
el mapa nunca quede detrás de la hora.

**Modo ruta (oct 2026)**: botón con ícono de auto en los controles del mapa
(`MobileMapTools` en `Map.tsx`), que el usuario enciende y apaga cuando quiere.
Encendido: `navigator.geolocation.watchPosition` actualiza `userLocation` en
vivo y el mapa lo sigue con `panTo` sin cambiar el zoom (`MapController`;
pausa 15 s si el usuario arrastró el mapa o mientras hay una estación
seleccionada). Al quedar a ≤ `routeRadiusKm` (1/2/5 km, por defecto 2, en
`localStorage.ev_route_radius`) de una estación de `filteredStations`
(respeta filtros; excluye `offline`) muestra `RouteAlertCard` (Ver / Ir en
Waze) + sonido WebAudio (desbloqueado con el toque que enciende el modo,
requisito de iOS) + vibración donde exista; cada estación avisa una sola vez
por encendido. Pide Screen Wake Lock para que no se apague la pantalla.
Lógica en `mobile/routeEngine.ts`, interfaz en `mobile/RouteMode.tsx`.
**Privacidad**: todo en el teléfono, la ubicación no se envía a ningún lado.
**Limitación de cualquier página web**: solo avisa con la app abierta y la
pantalla encendida (con la app cerrada haría falta app nativa de tienda).
Sin el modo ruta, la ubicación sigue siendo una foto (al abrir el mapa o al
tocar "mi ubicación"), no se actualiza sola.

**Tema único en paneles y ventanas (oct 2026)**: el mapa ya tenía el estilo
nuevo (clases `m-*`); el panel de admin, el login, el perfil y las ventanas de
alta/edición seguían con el estilo viejo de Tailwind. `src/theme.css`
(importado en `index.css`) "traduce" esas clases de Tailwind al estilo nuevo:
fondo `#f2f2f7`, tarjetas sin borde con radio 16/22 px y sombra suave, campos
con relleno gris y borde verde al escribir, botones principales en píldora
verde/negra, secundarios en píldora gris, y el verde unificado `#16a34a`.
Tailwind 4 pone sus utilidades en `@layer`, por eso estas reglas sin capa
ganan; van en `:where()` (especificidad 0) para no tocar las `m-*` del mapa.
Además el panel de admin tiene barra superior propia (`.adm-top`: logo,
"Admin", avatar, Salir) y pestañas en píldoras (`.adm-tab`), y el login usa
el logo de la marca y un selector segmentado (`.ev-seg`). Pantallas nuevas:
seguir usando las mismas clases de Tailwind y el tema se aplica solo.

**Crecimiento: registro y anfitriones (oct 2026)**: objetivo de Rafa — que
más visitantes se registren y, sobre todo, publiquen su cargador en casa
(la fuerza del proyecto). `mobile/Growth.tsx`:
- **Invitación a crear cuenta en el momento útil** (`JoinSheetContent`, store
  `joinPrompt`: `'save' | 'aportar' | 'browse'`): al guardar la 1.ª estación
  sin cuenta (una vez por visita, `sessionStorage.ev_join_save`), al intentar
  aportar sin cuenta, y al abrir la 3.ª ficha de la visita (máx. 1 vez cada
  7 días, `localStorage.ev_join_browse_at`). Nunca a quien tiene sesión.
  "Crear cuenta gratis" abre `AuthModal` directo en registro (`openAuth`).
- **Se retoma lo que quería hacer**: `pendingAddType` guarda el tipo de
  estación que intentó aportar; al iniciar sesión, MobileShell abre el alta
  automáticamente.
- **"Comparte tu cargador en casa"** (`HostSheetContent`): explica beneficios,
  control de acceso ("Solicitar uso"), privacidad y revisión por admin (todo
  ya cierto hoy; no promete cobros). Se abre desde Aportar → "Mi cargador en
  casa", y desde la tarjeta `HostPromo` en Perfil y Actividad.
- **Teléfono opcional al registrarse** (Worker `handleRegister` acepta vacío
  → `NULL`; `AuthModal` lo marca "(opcional)"). Se pide en `AddStationModal`
  solo para residenciales si la cuenta no lo tiene, y se guarda con
  `updateProfile` antes de enviar.

**Mi auto + Guardadas en la cuenta (6 oct 2026, publicado en prod)**: con sesión, el auto elegido y las estaciones guardadas viajan con la
cuenta (columnas `users.vehicle_id` y `users.saved_station_ids`, JSON, máx.
300). `GET /api/auth/me` y el login devuelven `vehicleId`/`savedIds`
(`meResponse()`); `PATCH /api/auth/me` los acepta (503 si faltan las columnas,
sin romper nada). En el store, `syncAccountPrefs()` al iniciar sesión:
Guardadas = unión de lo local y lo de la cuenta (nunca se pierde nada); auto =
el de la cuenta si tiene, si no se sube el local. Sin cuenta todo sigue en
`localStorage` (`ev_gt_saved_stations`, `ev_gt_vehicle`). Perfil muestra la
sección "Mi auto" (abre la hoja Filtros). **Migración manual**:
`docs/migracion-mi-auto.sql` — aplicada a `ev-guatemala-db-staging` y
`ev-guatemala-db` (6 oct 2026) — no repetir.

**Mis estaciones + estado publicado por el dueño (7 oct 2026, publicado en prod)**: dueño = `owner_email`, o quien registró una
residencial (`submitted_by`); quien propuso una pública NO es dueño.
`GET /api/my-stations` (`handleGetMyStations`) lista las suyas con estado de
aprobación y **solo el número** de "Solicitar uso" (30 días / total) — los
datos de quién pidió siguen siendo solo del admin. `POST
/api/stations/:id/status` (`handleSetStationStatus`, dueño o admin): estado
`active|maintenance|offline` + nota opcional (máx. 140) **al instante, sin
moderación** (decisión de Rafa: un "fuera de servicio" que espera aprobación
llega tarde); deja evento `status_changed` y aviso a Telegram. Columnas nuevas
`stations.status_note`, `status_updated_at`, `status_source` (`owner|admin`);
la API pública expone `statusNote/statusUpdatedAt/statusByOwner` y **ahora
incluye las `offline`** (antes se ocultaban; pin gris + punto rojo). Una
edición/aprobación del admin que cambia `status` marca `status_source='admin'`
y borra la nota. Admin: `GET|POST /api/stations/:id/owner` asigna/quita dueño
(debe tener cuenta; evento `owner_assigned`), botón de persona en la lista de
Estaciones del panel. **Se corrigió** que los puntos de estado de esa lista
solo cambiaban `localStorage` del navegador del admin (`statusOverrides`):
ahora guardan en D1 vía el mismo endpoint. UI: `mobile/MyStations.tsx`
(sección en Perfil con 3 luces, nota, "Sugerir cambios" → EditStationModal
como propuesta) y recordatorio "¿Tu cargador ya está activo?" si lleva ≥ 14
días en mantenimiento/fuera de servicio (una vez por visita,
`sessionStorage.ev_stale_prompt`); la ficha muestra la luz grande con
"Actualizado por el dueño hace X" y la nota. **Migración manual**:
`docs/migracion-mis-estaciones.sql` — aplicada a `ev-guatemala-db-staging`
y `ev-guatemala-db` (6–7 oct 2026) — no repetir (sin las columnas,
`/api/stations` falla y el mapa cae a la semilla). En staging, la
estación `guat-prueba` quedó asignada a la cuenta de Rafa para que pruebe.
Ojo: staging **no tenía** la tabla `station_requests` (prod sí) — se creó a
mano el 6 oct 2026; antes eso escondía toda la sección (ahora, si falla el
conteo, la lista se muestra igual con 0 solicitudes).

**Ubicación aproximada de residenciales (oct 2026)**: para quitarle al dueño
el miedo a "publicar dónde vivo". `handleGetStationsFromD1`, para quien no es
admin, entrega las residenciales con `lat/lng` desplazados entre 250 y 600 m
(`approximateLocation()`: HMAC-SHA256 con `JWT_SECRET` sobre el id → distancia
y dirección fijas por estación; estable entre visitas, no se puede promediar
ni revertir sin el secreto), sin `address` ni `googleMapsUrl`, y con
`approximate: true`. La caché pública guarda esa versión; el **dueño** (quien
la registró: `owner_email` o `submitted_by`) recibe su ubicación exacta vía
`withOwnExactLocations()` (consulta chica sobre la respuesta en caché). El
admin siempre ve la exacta. **Se cerró una fuga**: `/api/stations/dynamic`
(respaldo heredado de Notion) no sabía qué era residencial y devolvía la
ubicación exacta; ahora quita las residenciales según D1. UI: círculo azul de
700 m alrededor del pin (`Circle` en `Map.tsx`, desde zoom 12); en la ficha
un aviso "Ubicación aproximada…" en lugar de Waze/Google Maps; la tarjeta
flotante dice "Ver y solicitar uso" en lugar de "Cómo llegar"; distancias con
"≈"; el aviso del modo ruta no muestra "Ir". La ubicación exacta se comparte
por el flujo existente "Solicitar uso" (el admin media el contacto).
`EditStationModal` solo envía campos cambiados, así que sugerir una corrección
sin tocar el mapa no "mueve" la casa a la ubicación aproximada.

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
