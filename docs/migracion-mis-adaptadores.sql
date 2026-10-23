-- Migración: "Mis adaptadores" del conductor en la cuenta (oct 2026).
-- Lista JSON de conectores de ESTACIÓN que el conductor puede usar gracias a
-- adaptadores propios (ej. ["GBT"] = lleva adaptador GB/T → su auto).
-- Correr UNA vez por base (staging y prod); volver a correrla da error
-- "duplicate column", que es inofensivo. Sin la columna, la app guarda los
-- adaptadores solo en el teléfono y nada se rompe.
ALTER TABLE users ADD COLUMN my_adapters TEXT;
