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

**Pendiente**:
- Decidir qué hacer con las cuentas de prueba heredadas de KV en la tabla
  users (2 con rol admin: kv_test2@test.com, verify_admin@test.com) —
  recomendado desactivarlas (`account_status='disabled'`).
- KV conserva los `user:*` viejos como reliquia; ya no se leen. Las fotos
  binarias sí siguen en KV.

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
