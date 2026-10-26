---
name: videos-marca
description: Hacer videos o imágenes de EV Guatemala (novedades, tutoriales, promos, portadas, reels) siempre con el estilo oficial de la marca. Usar cuando Rafa pida un video, motion graphics, reel, animación, portada o imagen para redes sobre la app.
---

# Videos e imágenes de EV Guatemala

Rafa quiere que **todos** los videos e imágenes tengan el mismo estilo que
sus videos de referencia ("modo ruta" y "¿dónde cargo?"). No improvisar otro.

1. Leer `marketing/estilo-videos.md` (colores, letra, estructura, audio,
   dominio). Es obligatorio seguirla.
2. Usar la plantilla `marketing/video-kit/` (ver su `README.md`): una
   carpeta nueva en `marketing/videos/<nombre>/` con `video.json` y capturas
   reales de la app en `img/`. Tomar `marketing/videos/compartir-y-reportar/`
   como ejemplo. No escribir un motor nuevo ni cambiar el estilo del kit sin
   que Rafa lo pida.
3. Historia: gancho → pasos → confianza → cierre. Solo afirmar lo que la app
   hace de verdad (revisar `CLAUDE.md`).
4. Revisar `render.cjs --preview` (títulos de máximo 2 líneas, nada tapado)
   antes del render final.
5. Mandarle el MP4 a Rafa con SendUserFile. **No publicarlo en ningún
   lado**: él lo sube. El MP4 no se guarda en el repositorio (.gitignore).
6. Dominio siempre **www.movilidadelectricagt.com**.

Si Rafa pide cambiar el estilo de forma permanente, actualizar la guía y el
kit (no solo un video) y anotarlo en la guía con la fecha.
