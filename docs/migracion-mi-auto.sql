-- Migración: "Mi auto" y "Guardadas" en la cuenta (oct 2026).
-- Agrega dos columnas a users. Correr UNA vez por base (staging y prod);
-- volver a correrla da error "duplicate column", que es inofensivo.
ALTER TABLE users ADD COLUMN vehicle_id TEXT;
ALTER TABLE users ADD COLUMN saved_station_ids TEXT;
