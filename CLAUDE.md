# EV Guatemala Map — Project Memory

Mapa de estaciones de carga para vehículos eléctricos en Guatemala. Frontend React + Worker de Cloudflare, con Notion como panel de curación de datos.

## Cómo trabajar con Rafa (preferencia fija, 18 ago 2026)

Rafa (dueño del proyecto) no tiene formación técnica. Para cualquier cambio de código:

- **Explicar en lenguaje sencillo**, sin jerga sin traducir — el objetivo es que vaya entendiendo los términos poco a poco, sesión tras sesión, no abrumarlo.
- **Siempre probar en una versión de prueba (staging) primero.** Nunca publicar directo a producción sin que él la haya probado y dado el visto bueno explícito.
- **Avisar sin ambigüedad en qué versión estamos** en cada mensaje relevante: "esto es de prueba, no le llega a tus usuarios todavía" vs. "esto ya es la versión final, publicada para todos". No dar por hecho que él lo infiere del contexto técnico.
- Flujo esperado: cambio en una rama → deploy a staging → Rafa prueba → visto bueno → merge a `main` (dispara el deploy automático a producción).
- Si por algún motivo (como pasó el 18 ago 2026) el código termina publicado en producción antes de validarlo en staging, decirlo de inmediato y con claridad — no dejarlo implícito.

## Dominio oficial (26 oct 2026, indicado por Rafa)

La app está publicada en **https://www.movilidadelectricagt.com**. Usar
**siempre** este dominio en todo lo que se le muestre a Rafa o a usuarios:
mensajes, enlaces para compartir, videos, textos de marketing, documentación.
La dirección `ev-guatemala-map.rafamejia-ai360.workers.dev` sigue existiendo
por detrás (es la del Worker de Cloudflare), pero no se presenta como la
dirección de la app. El enlace de "Compartir" y los avisos a Telegram usan la
dirección desde donde se abrió la app (`window.location.origin` / `origin`
del request), así que salen con el dominio cuando se usa desde ahí.
Staging y las vistas previas por rama siguen en `*.workers.dev`.

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
`https://www.movilidadelectricagt.com` (el Worker también responde en
`https://ev-guatemala-map.rafamejia-ai360.workers.dev`).

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
- **Cambio de criterio (20 oct 2026, a pedido de Rafa)**: se agregó un
  **tercer color, naranja = semi-pública** (negocio con acceso restringido:
  solo clientes, huéspedes o socios — hoteles, agencias, bancos, clubes). No
  es un valor nuevo de `type` ni requiere migración: es una categoría
  derivada, `stationKind()` en `src/utils/stationKind.ts` → residencial si
  `type='residential'`; si no, semi-pública si `access` ≠ `public`
  (incluye `private`, p. ej. clubes de socios); si no, pública. Una
  residencial sigue azul aunque su acceso sea semi-público. Se usa en el pin
  (`.ev-pin.semi-public`), la franja de los círculos de grupo (3 colores,
  `--pub`/`--semi`), el chip "Semi-públicas" (filtro `stationType` ahora es
  `StationKind`), las tarjetas, la ficha y el modo ruta. Los formularios
  usan `StationKindPicker.tsx` (Pública / Semi-pública / Residencial), que
  ajusta `type` y `access` a la vez; el desplegable "Acceso" sigue ahí.
  Al hacer el cambio había 21 estaciones activas que pasaron a naranja
  (19 `semi-public` + 2 clubes `private`).

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
vivo y el mapa lo sigue con `panTo` sin cambiar el zoom (`MapController`).
El seguimiento (`routeFollow` en el store) se pausa si el usuario arrastra el
mapa o selecciona una estación, y vuelve solo a los 15 s sin tocar el mapa
(`FOLLOW_RESUME_MS`), o al instante con el botón "Centrar" de la barra del
modo ruta o con "Mi ubicación". **Corregido 22 oct 2026**: antes, con una
estación seleccionada (tocar un pin o "Ver" en el aviso) el mapa dejaba de
seguir al usuario para siempre, sin aviso, hasta tocar una zona vacía. Al quedar a ≤ `routeRadiusKm` (1/2/5 km, por defecto 2, en
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

**Dirección del usuario y mapa que gira (7 oct 2026, publicado en prod)**: a pedido de Rafa ("el usuario se pierde con el mapa fijo al
norte"). (1) El punto azul tiene un haz (`.ev-me-cone`) que apunta a
`userHeading` (store, grados desde el norte). Fuentes en
`mobile/heading.ts`: rumbo del GPS del modo ruta cuando hay velocidad ≥ 1,5 m/s
(`pushGpsHeading`, manda 4 s sobre la brújula) y brújula del teléfono
(`deviceorientationabsolute` en Android sin permiso; en iPhone
`webkitCompassHeading` tras `requestCompass()`, que **debe** llamarse dentro de
un toque: se llama al tocar "Mi ubicación", encender el modo ruta y la
brújula). Suavizado circular, solo actualiza si cambia ≥ 2°. (2) Mapa
giratorio con `leaflet-rotate` (0.2.8, única dependencia nueva; tipos propios
en `src/types/leaflet-rotate*.d.ts`; `rotate` activado con giro a dos dedos,
botón propio y Shift+rueda **desactivados**). Convención: `setBearing(360 -
rumbo)` deja el rumbo arriba; los íconos no giran con el mapa, por eso el haz
se dibuja a `rumbo + bearing`. En modo ruta con `headingUp` (por defecto sí,
`localStorage.ev_heading_up`) `MapController` gira el mapa; fuera del modo
ruta siempre vuelve al norte. Botón brújula (`.m-compass`, aguja roja = norte
real) visible en modo ruta: alterna girar / norte arriba. Todo en el
teléfono, nada se envía al servidor. Sin migración de base de datos.

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

**Verificación de identidad + aviso de responsabilidad (9 oct 2026,
publicado en prod el 10 oct 2026 con visto bueno de Rafa)**:
motivo — a Rafa le señalaron en un evento el riesgo para el dueño de recibir
a desconocidos en su casa. Decisiones acordadas con él:
- **Pedir un cargador en casa exige identidad revisada**
  (`users.identity_status='verified'`; `handlePostStationRequest` responde
  403 `code:'identity_required'`; admins exentos). Se hace **una sola vez**
  por cuenta (`IdentityVerifyModal.tsx`, desde la ficha y desde Perfil): DPI
  frente, DPI reverso, selfie sosteniendo el DPI y carro con placa + placa
  escrita. Renovar (cambio de carro) = enviar de nuevo; sigue verificado
  mientras se revisa.
- **Almacenamiento**: KV bajo `private/` (`isPrivateKvKey` impide servirlo
  por `/api/photo`). Las 3 del DPI con `expirationTtl` de 7 días (se borran
  solas aunque no haya cron, p. ej. en staging); la del carro sin vencimiento
  (la verá el dueño en el futuro "paso 3"). Solo el admin las ve vía
  `/api/identity/:id/file/:kind` con su JWT. **Nunca se respaldan a R2**. En
  D1 (`identity_submissions`) solo el registro: placa, fechas, quién revisó.
  Nunca el número de DPI. El navegador re-codifica a JPEG (quita EXIF/GPS).
- **Pestaña "Identidad" del panel** (`admin/IdentityTab.tsx`): ver fotos,
  aprobar (corrigiendo placa) / rechazar (motivo visible al usuario), y
  **"Descargar y borrar"**: arma un .zip en el navegador (`utils/zip.ts`, sin
  librerías), Rafa lo guarda en su nube privada (iCloud con Protección
  avanzada), confirma, y se borran de KV las del DPI. Si nadie las revisa en
  7 días, `sweepExpiredIdentity` (al listar y en el cron) la marca `expired` y
  el usuario vuelve a `none`. El cron de prod avisa por Telegram el día antes.
- **Aviso de responsabilidad** (`TermsNotice.tsx`, variantes conductor y
  anfitrión) con casilla obligatoria al registrarse, al verificar identidad,
  al solicitar uso y al publicar un cargador en casa (no-admin). Cada
  aceptación en `terms_acceptances` con `TERMS_VERSION` (worker) — subirla si
  cambia el texto. Páginas estáticas `public/terminos.html` y
  `public/privacidad.html` (enlazadas en registro y Perfil → Ayuda). Rafa
  quiere que un abogado guatemalteco revise ambos textos. La política
  promete: copia del DPI en la nube del admin mientras la cuenta esté activa
  + 1 año, y borrarla si el usuario elimina su cuenta (manual, a cargo de Rafa).
- `.gitignore` bloquea `verificacion-identidad-*.zip` y `*DPI*`/`*selfie*`.
- Pestaña **Usuarios** del panel: insignia azul (`VerifiedBadge.tsx`) junto
  al nombre de los verificados + placa y fecha; botón "Ver aceptaciones"
  (`GET /api/auth/terms-acceptances?email=`, solo admin) con fecha/hora de
  Guatemala y la estación cuando aplica. La insignia también sale en el
  Perfil del propio usuario. **No** se muestra en vistas públicas (reseñas,
  etc.) — decisión pendiente con Rafa; recomendación: sumarla después.
- **Fuga cerrada de paso**: `/api/photo/:key` servía CUALQUIER clave de KV,
  incluidos los `user:*` heredados (con hash de contraseña). Confirmado en
  prod el 9 oct 2026 (200 en `/api/photo/user:kv_test2@test.com`). Arreglado
  al publicar (10 oct 2026).
- **Migración manual**: `docs/migracion-identidad.sql` (ALTER no
  re-ejecutables + CREATE). Aplicada a `ev-guatemala-db-staging` el 9 oct
  2026 vía MCP, y a `ev-guatemala-db` antes del merge (comprobado el 10 oct
  2026: columnas, tablas e índices presentes) — no repetir.
- Wrangler: la sesión OAuth había vencido (ago 2026); en una shell no
  interactiva no se renueva. Se renovó con `npx wrangler whoami` en la
  terminal de la app (Rafa autorizó en el navegador).

**Adaptadores que presta la estación (10 oct 2026, publicado en prod con
visto bueno de Rafa)**: idea de Rafa tras cargar en Naves
z.15 (GB/T + CCS1) con su auto CCS2 gracias a un adaptador prestado. Columna
`stations.adapters` (JSON, lista de conectores de AUTO que cargan ahí con el
adaptador; NULL = ninguno). Casilla "La estación presta adaptadores" + chips
(`AdaptersField.tsx`) en AddStationModal, EditStationModal y el alta del
AdminPanel; no ofrece los conectores que la estación ya tiene. Va por el mismo
camino que `connectors` (las correcciones de usuarios pasan por moderación;
etiqueta "Adaptadores" en el diff del panel). El filtro (`computeFiltered`)
cuenta los adaptadores como conector disponible — por tipo de conector y por
"Mi vehículo". La ficha muestra "Adaptador disponible … Pídelo al llegar" y,
si el auto elegido solo carga ahí gracias al adaptador, "Tu X carga aquí con
el adaptador"; la tarjeta de la lista muestra "+ adaptador". **Migración
manual**: `docs/migracion-adaptadores.sql` — aplicada a
`ev-guatemala-db-staging` y `ev-guatemala-db` (10 oct 2026) — no repetir
(sin la columna, `/api/stations` falla y el mapa cae a la semilla). La
estación de prueba `prueba-adaptador-claude` de staging quedó `rejected`.

**Precio por kWh + notas visibles para usuarios (11 oct 2026, publicado en
prod con visto bueno de Rafa)**: Rafa pidió
"precio por kW"; se implementó como **precio por kWh** (lo que de verdad se
cobra: energía, no potencia) en quetzales — `stations.price_per_kwh` (REAL,
NULL = no informado, 0 = gratis), opcional. Campo `PriceField.tsx` (casilla
"Gratis") en AddStationModal, EditStationModal y el alta del AdminPanel;
helpers en `src/utils/price.ts`. Va por el mismo camino que `connectors`
(`pricePerKwh` en EDITABLE_FIELDS; correcciones de usuarios pasan por
moderación; etiqueta "Precio por kWh" en el diff del panel). La ficha muestra
"Precio · Q3.50 por kWh" y la tarjeta de la lista una etiqueta `Q3.50/kWh`.
**Notas**: antes el historial de verificación ("[Verificado en sitio por:
correo, fecha]") se pegaba dentro de `stations.notes`, por eso las notas de
residenciales se ocultaban y las de públicas exponían correos. Ahora ese
historial va a la columna nueva `stations.verification_log` (solo admin, sale
como `verificationLog` en la API) y `notes` es texto para usuarios, visible
para todos (también residenciales; el formulario avisa "no pongas tu dirección
ni tu teléfono"). Filas viejas: `splitNotes()` en el Worker separa los "[...]"
al leer y `buildStationUpdate` los mueve a `verification_log` cuando se editan
las notas (nada se pierde). Los corchetes que escriba un usuario se cambian a
paréntesis. **Migración manual**: `docs/migracion-precio-notas.sql` — aplicada
a `ev-guatemala-db-staging` y `ev-guatemala-db` (11 oct 2026, vía MCP) — no
repetir (sin las columnas, `/api/stations` falla y el mapa cae a la semilla). Datos a limpiar tras publicar (vía panel, con su evento): 3
estaciones tienen el precio escrito en notas (`quet-restaurante-tertulia`,
`guat-navez-zona-15`, `reta-hotel-y-restaurante-`) y 6 de la semilla tienen
notas internas tipo "NO MODIFICAR sin nueva confirmación" que ya veía el
público.

**Revisión de ubicación antes de aprobar + "Mis adaptadores" (22 oct 2026,
publicado en prod el 22 oct 2026 con visto bueno de Rafa)**:
- **Pendientes del panel** (`admin/ProposalReview.tsx`): cada propuesta con
  ubicación (estación nueva o corrección con lat/lng) abre un mapa con vista
  satélite (Esri World Imagery, sin llave) o calles; pin P = propuesta, A =
  actual y la distancia entre ambos; puntos ámbar = estaciones ya publicadas a
  < 300 m (aviso "¿Duplicada?"); lo que OpenStreetMap/Nominatim dice que hay en
  ese punto (consulta desde el navegador del admin); enlaces a Google Maps,
  Street View y Waze. "Mover el pin antes de aprobar" deja arrastrar un pin
  verde: `POST /api/stations/:id/approve` acepta ahora `{lat, lng}` opcional
  (rango Guatemala). Nueva → se publica con esa ubicación (evento
  `proposal_approved` con `adjusted_location`); corrección → reemplaza la
  lat/lng propuesta, o si no traía, se aplica aparte con evento `updated`
  (`via: 'approve_adjust'`). Queda nota en `verification_log`.
- **Mis adaptadores** (conductor): en la hoja Filtros, debajo del auto, chips
  de conectores de ESTACIÓN que su adaptador propio le permite usar (no se
  ofrecen los que su auto ya tiene; "Limpiar" no los borra). Store
  `myAdapters` (`localStorage.ev_gt_my_adapters`; con cuenta en
  `users.my_adapters`, se suman al iniciar sesión). Lógica única en
  `src/utils/compat.ts` (`chargeVia`: native / station-adapter / my-adapter):
  `computeFiltered` muestra la estación si el auto carga nativo, con el
  adaptador que presta la estación, o con el propio. Ficha: "Con tu adaptador
  … Llévalo contigo."; tarjeta: etiqueta "con tu adaptador"; Perfil → Mi auto
  muestra "Con adaptador: …". Sin auto elegido (o ficha sin conectores
  confirmados) no filtra, como antes.
- **Migración manual**: `docs/migracion-mis-adaptadores.sql` — aplicada a
  `ev-guatemala-db-staging` y `ev-guatemala-db` (22 oct 2026, vía MCP) — no
  repetir (sin la columna, guardar adaptadores en la cuenta da 503 y quedan
  solo en el teléfono; nada más se rompe).
- Datos de prueba en staging: estación `prueba-revision-claude` (pendiente,
  a 52 m de `ant-cc-paseo` para ver el aviso de duplicado) y una propuesta de
  ubicación sobre `ant-hotel-casasanto` (106 m), de `prueba@claude.test`.

**Filtrar por mi auto: interruptor + botón de enchufe (24 oct 2026, rama
`filtro-mi-auto`, publicado en prod el 24 oct 2026 con visto bueno de Rafa)**: Rafa notó
que "Tipo de conector" recortaba lo que el auto + "Mis adaptadores" ya
permitían (S07 Tipo 2 + adaptador J1772 = 106; marcar "Tipo 2" bajaba a 59) y
que "Limpiar" borraba el auto también de la cuenta. Ahora el auto y los
adaptadores quedan guardados y un interruptor aparte, `filters.vehicleFilter`
(`localStorage.ev_gt_vehicle_filter`, encendido por defecto y al elegir auto),
decide si se filtra con ellos. `vehicleFilterActive()` (store) = encendido +
auto con conectores confirmados; mientras aplica, `computeFiltered` ignora
`connectorTypes` y la hoja Filtros cambia "Tipo de conector" por un resumen
(conectores del auto + adaptadores propios). Botón de enchufe en
`MobileMapTools` (verde = activo); sin auto abre la hoja Filtros vía
`sheetRequest` del store. "Limpiar" apaga el interruptor sin borrar el auto.
El contador de filtros cuenta el del auto como uno. Sin migración.
De paso se corrigió (afectaba también a prod): al abrir la app el auto
guardado salía de la lista base y `loadVehicles`/`syncAccountPrefs` no lo
reemplazaban por la ficha de D1 si el id era el mismo — un auto corregido por
el admin (S07 GB/T → Tipo 2) seguía filtrando con los conectores viejos.

**Reportes de un toque + estados que decide el admin (25 oct 2026, rama
`reportes-estado`, probado por Rafa en staging y publicado en prod el 25 oct
2026 a su pedido)**: maqueta aprobada por Rafa:
https://claude.ai/artifact/3iGUn1wG5SaMqZd5dQLA7t
- **Usuarios**: en la ficha, arriba, "¿Cómo encontraste el punto de carga?"
  (`StationVerification.tsx`): Cargué bien / Funciona a medias / No funciona /
  No pude usarla / Ya no existe, **sin cuenta** (decisión de Rafa). Tras el
  toque, detalle opcional (máx. 280). `POST /api/stations/:id/report`
  (`handlePostStationReport`): "ok" = evento `confirmed_ok` (actualiza
  `last_confirmed_at`); el resto = `reported_issue` con `{kind, comment,
  anon}`. Visitante sin cuenta = `actor_role='anonymous'`. El detalle va como
  evento `report_detail` (`{reportId, token}`, token = HMAC del id con
  `JWT_SECRET`, así se valida sin cuenta). Límite: 1 reporte por persona y
  estación cada 6 h (con cuenta: historial; sin cuenta: marca en KV
  `private/rl/report/<HMAC(IP|estación)>` que vence sola — la IP nunca se
  guarda).
- **Un reporte NUNCA cambia la estación** (pedido de Rafa: él investiga
  llamando o yendo al lugar). Se quitó el `flagged` automático (2+ reportes →
  "Reportada con problemas" en rojo) del Worker, también en `/verify` y en la
  aprobación de propuestas. Una confirmación ya no borra los reportes.
  "Sin revisar" = `reported_issue` posteriores al último `report_resolved` de
  la estación (`OPEN_REPORTS_SQL`); `stations.open_reports` guarda ese conteo
  y la ficha muestra la nota azul "Hay reportes recientes · Estamos
  verificando…" mientras sea > 0. El pin no cambia.
- **Aviso a Telegram** por cada reporte negativo (y por cada detalle):
  estación, tipo, quién (o "Visitante sin cuenta"), reportes sin revisar,
  última carga confirmada y enlace a `/admin`. Staging no tiene Telegram (queda
  en `ops_log` como `notify_telegram` ok=0); se prueba en prod al publicar.
- **Admin**: pestaña "Reportes" (`admin/ReportsTab.tsx`, `GET /api/reports`)
  con los reportes sin revisar por estación (quién, cuándo, comentario); elige
  estado + nota visible para usuarios (máx. 140) y "Guardar estado y marcar
  como revisado" → `POST /api/stations/:id/reports/resolve`
  (`status_changed` + `report_resolved`, `open_reports=0`,
  `last_confirmed_at=now`). La ficha dice "Actualizado por el administrador
  hace X" (`statusByAdmin`).
- **Estados** (`STATION_STATUSES` en el Worker, `ChargerStatus` en el front,
  opciones en `utils/stationStatus.ts`): `active`, `partial` (funciona
  parcialmente: medio punto ámbar), `maintenance` (punto ámbar), `closed`
  (cerrada temporalmente: punto rojo, conserva el color), `offline` (pin gris
  + punto rojo), `gone` (ya no existe: sale del mapa; la API solo la entrega
  al admin, que la ve en Estaciones y puede cambiarle el estado). El dueño
  puede usar todos menos `gone` (su pantalla sigue mostrando 3). En la lista
  de Estaciones del panel el estado es una etiqueta pequeña de color bajo el
  nombre (`StatusPicker` en AdminPanel; opción "A" que eligió Rafa entre 3,
  https://claude.ai/artifact/3YYzRvSaCu6cDFw7KnqUCh) con la lista real del
  teléfono invisible encima (16 px para que iOS no haga zoom). Esta etiqueta
  se publicó sin pasar por staging, a pedido explícito de Rafa. El modo ruta no avisa
  de `closed`/`offline`/`gone`.
- Sin migración de base de datos (columnas existentes; valores nuevos en
  `status`).

**Aviso a Telegram de reseñas y fotos (25 oct 2026, rama
`avisos-resenas-fotos`, publicado directo en prod el 25 oct 2026 sin pasar
por staging, a pedido explícito de Rafa — staging no tiene Telegram)**: `handlePostReview` y
`handlePostPhoto` llaman a `notifyAdmin` (vía `ctx.waitUntil`) en cada reseña
o foto nueva, de cualquier estación: estrellas + autor/correo + comentario
(máx. 500) en la reseña; quién la subió + enlace `/api/photo/<id>` en la foto.
Staging no tiene Telegram (queda en `ops_log`). Sin migración.

**"Ver en el mapa" (26 oct 2026, rama `ver-en-mapa`, publicado directo en prod
el 26 oct 2026 sin pasar por staging, a pedido explícito de Rafa)**: Rafa no podía ubicar una estación en el mapa desde
la ficha o la lista. Botón "Ver en el mapa" en la ficha (`StationScreen`,
encima de Waze/Google Maps; "Ver zona en el mapa" si es residencial
aproximada) y botón "Mapa" en cada tarjeta de Lista y Guardadas
(`StationCard`, ahora `div role="button"` para no anidar botones). Ambos
llaman `focusStationOnMap(id)` del store (`mapFocus` con `seq`, para que
repetir el mismo vuelva a centrar): `MapController` acerca a zoom ≥ 17. La
estación elegida se dibuja aunque los filtros la oculten. **Bug corregido de
paso**: `StationMarkers` escuchaba `zoomend` con `useMapEvents`, que se
vuelve a registrar en cada render; un salto de zoom sin animación (> 4
niveles) justo cuando la lista se redibuja perdía el evento y los pines
quedaban agrupados. Ahora es una escucha fija con `map.on`, y
`StationMarkers` va antes que `MapController` en el JSX (al cargar con
enlace, el salto ocurría antes de que existiera la escucha).
**Enlace directo** `/?estacion=<id>`: MobileShell espera a que la estación
exista en el store, la enfoca y quita el parámetro de la dirección; `App.tsx`
no centra el mapa en la ubicación del usuario si se abrió con ese enlace. Lo
usa el botón **"Ver en mapa"** junto al estado en la lista de Estaciones del
panel de admin (misma pestaña). Sirve también para compartir una estación
(las residenciales siguen saliendo aproximadas a quien no es admin ni dueño).
Sin migración.

**Botón "Compartir" en la ficha (26 oct 2026, rama `compartir-estacion`, probado
por Rafa en la vista previa de la rama y publicado en prod el 26 oct 2026 con su
visto bueno)**: junto a "Ver en el mapa" en
`StationScreen`. Comparte `<origen>/?estacion=<id>` (el enlace directo de
arriba) con `navigator.share` (menú del teléfono: WhatsApp, etc.); sin él,
copia al portapapeles ("Enlace copiado"). Residenciales: el enlace se
comparte igual y quien lo abre ve la ubicación aproximada. Sin migración.

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
