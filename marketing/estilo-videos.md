# Guía de estilo: videos e imágenes de EV Guatemala

Estilo oficial acordado con Rafa (26 oct 2026), tomado de sus videos
"modo ruta" y "¿dónde cargo?". **Todo video o imagen de la marca sigue esta
guía.** La plantilla `marketing/video-kit/` ya la aplica; esta página es la
referencia para revisar que un resultado sale "igual que los demás".

## Formato

- Vertical **1080 × 1920**, 30 cuadros por segundo, MP4 (H.264 + AAC 48 kHz).
- Duración: **30–45 s**. Cada escena de 3,5 a 4,5 s; el cierre unos 5,5 s.
- Pensado para WhatsApp (estados), Instagram/TikTok (reels) y Facebook.

## Colores

| Uso | Color |
|---|---|
| Fondo | `#050906` (casi negro, apenas verde) |
| Acento (palabras clave, contornos, anillos) | `#22c55e` |
| Logo (cuadro del rayo) | `#16a34a` |
| Texto principal | `#ffffff` |
| Texto secundario | blanco al 72 % |
| Brillo de fondo | verde `#22c55e` difuminado al 20 %, detrás del teléfono |

Nada de otros colores de fondo (sin azules, naranjas ni degradados de
colores). El naranja/azul solo aparecen porque están dentro de la app
(pines, chips).

## Letra y títulos

- **Inter**, extra negrita (800), 86 px, interlineado 1,18, centrado.
- **Máximo 2 líneas** por título (el gancho puede tener 3).
- La **palabra clave en verde**: "enciende el *modo ruta*", "Solo quedan
  las que *sí te sirven*".
- Aparecen **palabra por palabra**, de borroso y transparente a nítido
  (≈ 0,09 s entre palabras). Salen con un leve desenfoque.
- Subtítulo opcional (50 px, blanco al 72 %) para una aclaración corta.

## Tono del texto

- Segunda persona, frases cortas, verbos simples: "Tú solo maneja.",
  "Eliges *WhatsApp*".
- Contar una historia: **problema → pasos → confianza → cierre**.
- Nunca prometer algo que la app no hace (revisar en `CLAUDE.md`).

## Estructura de cada video

1. **Gancho** (sin teléfono): una situación real del conductor, con el
   carro dibujado en línea blanca y su batería (verde = cargado, roja =
   le falta carga). Dos frases: la primera se apaga a gris cuando entra la
   segunda. Ej.: "Vas por carretera. / ¿Dónde cargas *en el camino?*"
2. **Pasos** (con teléfono): una idea por escena, con la pantalla real de
   la app.
3. **Confianza**: privacidad o revisión ("Tu ubicación *no sale* de tu
   teléfono", "Un administrador *lo verifica* primero"), con un círculo
   oscuro con ícono y una etiqueta tipo píldora sobre la pantalla.
4. **Cierre** (siempre igual): logo verde, "EV Guatemala", frase de 2 líneas
   en gris claro, invitación en verde y **www.movilidadelectricagt.com** en
   una píldora con borde fino. Puntos verdes muy tenues flotando.

## Teléfono y pantallas

- Pantallas **reales** de la app (capturas a 390 × 844 con densidad 3 →
  1170 × 2532), nunca inventadas.
- Teléfono grande (≈ 66 % del ancho), borde fino gris oscuro, **cortado
  por abajo** del cuadro. Debajo del título, nunca encima.
- La cámara se **acerca suavemente** a la parte que importa; si el
  teléfono sube, un degradado oscuro arriba mantiene el título legible.
- Lo que se toca se marca con un **contorno verde que brilla** y una onda
  verde al tocar. Sin dedo dibujado.
- Etiqueta opcional arriba del teléfono (píldora oscura con ícono verde),
  p. ej. "Viaje acelerado · CA-1 Oriente".
- Ventanas que no son de la app (menú de compartir, chat): imitación
  sobria, sin logos de otras marcas (WhatsApp solo con su color y nombre).

## Movimiento

- Suave, sin rebotes ni confeti, sin destellos. Entradas con desaceleración.
- Transición entre escenas: la cámara se desliza a la nueva posición
  (0,6 s) y la pantalla cambia con un fundido.

## Audio

- Música **electrónica, oscura y pareja** (tipo tecnológico minimalista),
  sin voz. Bombo suave constante en las escenas con teléfono; en el gancho
  y el cierre solo colchón y pulso.
- Efectos discretos: barrido en cada cambio de escena, clic corto en cada
  toque, "swish" cuando entra una ventana, campanita suave al confirmar y
  en el cierre.
- Volumen final **−15 LUFS** (nivel estándar de redes).
- Toda la música y los efectos se sintetizan en `audio.py`: sin pistas de
  terceros, sin problemas de derechos.

## Imágenes fijas (portadas, publicaciones)

Mismos colores, letra y cierre. Para una portada: título del video en 2
líneas con la palabra verde, una pantalla de la app en el teléfono y el
dominio abajo. Se puede sacar un cuadro del mismo video
(`render.cjs --preview` o `ffmpeg -ss <segundo>`).

## Dominio

Siempre **www.movilidadelectricagt.com** (nunca la dirección `workers.dev`).
