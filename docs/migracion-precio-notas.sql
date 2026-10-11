-- Migración: precio por kWh + notas visibles para usuarios (oct 2026).
-- Agrega dos columnas a stations. Correr UNA vez por base (staging y prod)
-- ANTES de desplegar el código: sin las columnas, /api/stations falla y el
-- mapa cae a la semilla. Volver a correrla da error "duplicate column",
-- inofensivo.
--
-- No mueve datos: el historial viejo ("[Verificado en sitio por: ...]") que
-- ya está dentro de `notes` lo separa el Worker al leer (splitNotes) y lo pasa
-- a verification_log la próxima vez que alguien edite las notas.
ALTER TABLE stations ADD COLUMN price_per_kwh REAL;
ALTER TABLE stations ADD COLUMN verification_log TEXT;
