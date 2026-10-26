# Plantilla de videos (video-kit)

Hace los videos de EV Guatemala siempre con el mismo estilo
(`marketing/estilo-videos.md`). Un video = una carpeta en `marketing/videos/`
con un `video.json` y sus capturas en `img/`. El diseño, la música y el cierre
salen solos.

## Pasos para un video nuevo

1. **Historia**: escribir las escenas (gancho → pasos → confianza → cierre),
   una idea por escena, títulos de máximo 2 líneas con la palabra clave entre
   `*asteriscos*` (va en verde).
2. **Capturas** de la app real: `npm run build && npx vite preview --port
   4173`, y con Playwright a 390 × 844, `deviceScaleFactor: 3`, `isMobile:
   true` (salen de 1170 × 2532). Ej.: `/?estacion=<id>` abre el mapa en una
   estación. Guardarlas en `marketing/videos/<nombre>/img/`.
3. **video.json** (copiar el de `compartir-y-reportar` como base).
4. **Vista previa** (un cuadro por escena, en segundos):
   `node marketing/video-kit/render.cjs marketing/videos/<nombre> --preview`
   → `preview.jpg`. Revisar que ningún título pase de 2 líneas.
5. **Video final** (≈ 2 min):
   `node marketing/video-kit/render.cjs marketing/videos/<nombre>`
   → `<nombre>.mp4` (no se sube al repositorio; se le manda a Rafa).

## video.json

```jsonc
{
  "name": "mi-video",            // nombre del MP4
  "css": "...",                  // estilos de las ventanas inventadas (menú, chat…)
  "scenes": [
    { "type": "hook", "dur": 4.4, "car": { "battery": 0.9 },   // 0–1; < 0.3 sale roja
      "title": "Vas por carretera.\n¿Dónde cargas\n*en el camino?*",
      "lineDelay": 1.3, "dimLines": 1 },                         // 2.ª frase después; la 1.ª se apaga

    { "type": "phone", "dur": 4.0, "shot": "img/ficha.png",
      "title": "Ahora compartes\n*cualquier estación.*",         // "||" agrega subtítulo
      "badge": { "icon": "↗", "text": "Enlace directo", "t0": 0.5 },
      // cámara: el punto (fx, fy) de la captura (0–1) queda en at=[x, y] del cuadro, con escala s
      "cam": [ { "t": 0, "s": 0.62, "fx": 0.5, "fy": 0, "at": [540, 470] },
               { "t": 2.2, "s": 0.82, "fx": 0.6, "fy": 0.2, "at": [560, 760] } ],
      // coordenadas en píxeles de la captura (1170 × 2532)
      "highlights": [ { "t0": 1.7, "t1": 3.0, "x": 598, "y": 567, "w": 516, "h": 126, "r": 40 } ],
      "taps": [ { "t": 2.9, "x": 856, "y": 630 } ],
      "pulses": [ { "t0": 1.8, "x": 585, "y": 874, "color": "#f97316" } ],
      "overlays": [ { "t0": 0.3, "anim": "up", "sound": "success",   // up | left | pop | rise | fade
                      "x": 0, "y": 0, "w": 1170, "html": "<div class='sheet'>…</div>" } ] },

    { "type": "outro", "dur": 5.6,
      "tagline": "Comparte estaciones.\nCuenta cómo las encontraste.",
      "cta": "Así nos ayudamos entre todos." }
  ]
}
```

- Tiempos (`t`, `t0`, `t1`) en segundos desde el inicio de la escena.
- Sonidos de `overlays.sound`: `success`, `notify`, `pop`, `swish`. Los
  cambios de escena, toques y pulsos ya tienen su sonido automático.
- Medir coordenadas: abrir la captura y multiplicar lo que se ve por el
  factor (las capturas son de 1170 px de ancho).

## Archivos

- `engine.html`: motor de animación (no se toca para cada video).
- `audio.py`: música y efectos sintetizados a partir de lo que pasa en pantalla.
- `render.cjs`: arma cuadros + audio y entrega el MP4 a −15 LUFS.

Requiere Chromium + Playwright, ffmpeg y python3 con numpy (presentes en el
entorno de Claude Code).
