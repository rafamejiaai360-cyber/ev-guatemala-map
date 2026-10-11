-- Migración: adaptadores que presta la estación (oct 2026).
-- Agrega una columna a stations. Correr UNA vez por base (staging y prod)
-- ANTES de desplegar el código: sin la columna, /api/stations falla y el mapa
-- cae a la semilla. Volver a correrla da error "duplicate column", inofensivo.
ALTER TABLE stations ADD COLUMN adapters TEXT;
