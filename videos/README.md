# Videos de la app (motion graphics)

Videos cortos verticales (1080×1920, 30 fps) para Reels, TikTok y Stories,
hechos con [Remotion](https://www.remotion.dev/): el video se "dibuja" con
código React, igual que la app. **Nada de esta carpeta se publica con la app**
(la app solo compila `src/`), así que no afecta a los usuarios.

Estilo común: fondo oscuro con brillo verde, frases cortas que entran palabra
por palabra (lo importante en verde), un teléfono con **pantallas reales de la
app**, un dedo que toca, acercamientos de cámara, sin voz, solo efectos de
sonido (y música en el modo ruta) **sintetizados desde cero** en `sfx.py`
(sin samples ni música de terceros, sin problemas de derechos).

## `modo-ruta/` — "Modo ruta" (oct 2026, 34 s)

Viaje simulado por la CA-1 Oriente (Cuilapa → Los Esclavos) con aviso real de
**Sarita La Isla** (verificada, sin otras estaciones cerca). Datos reales de
producción leídos el 24 oct 2026 (121 estaciones; residenciales ya
desplazadas igual que las ve el público, sin correos ni teléfonos).

- `capture.mjs`: abre la app local con Playwright, finge el GPS (posición y
  rumbo) recorriendo `data/route.json` y captura cada pantalla. Las
  estaciones salen de `data/stations.json` (sin tocar la API real).
- `src/ModoRuta.tsx`: la animación (línea de tiempo, textos, cámara, toques).
- `sfx.py`: efectos + música original; el aviso usa el mismo sonido que la app
  (`routeEngine.ts`: 880 Hz y 1320 Hz).

Las capturas (≈32 MB) no se guardan en el repo; se regeneran así:

```bash
# 1. App local (desde la raíz del repo)
npm ci && npx vite --port 5173 --strictPort &
# 2. Capturas (desde videos/modo-ruta; necesita acceso a tile.openstreetmap.org)
cd videos/modo-ruta && npm ci
node capture.mjs shots
mkdir -p public && cp shots/*.png public/ && cp -r shots/drive public/
cp ../../public/icon-512.png public/
# 3. Video
python3 sfx.py
npx remotion render src/index.ts ModoRuta out/mudo.mp4 --codec=h264 --crf=18
ffmpeg -i out/mudo.mp4 -i out/sfx.wav -filter_complex "[1:a]loudnorm=I=-16:TP=-1.5:LRA=11[a]" \
  -map 0:v -map "[a]" -c:v copy -c:a aac -b:a 192k -shortest out/modo-ruta.mp4
```

Si cambian los botones de la app, puede hacer falta ajustar en `capture.mjs`
los selectores y en `ModoRuta.tsx` las coordenadas de `TAPS`/`RINGS` (se
imprimen en `shots/taps.json`).

## `encuentra-cargador/` — "Encuentra tu cargador" (11 oct 2026) — incompleto

El proyecto original no se guardó y se perdió al cerrar su sesión. Aquí queda
lo que se pudo recuperar de esa conversación: el **borrador v1** de la
animación y los efectos de sonido de la v5. La versión final publicada (v7:
Deepal S07 + Naves z.15, carro con batería al inicio,
"Varias estaciones cerca.", sin voz) tenía más cambios que no están aquí; sirve
como referencia de estilo, no para volver a generar exactamente ese video.
