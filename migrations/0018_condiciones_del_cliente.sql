-- Clientes en un solo lugar (D104): la ficha guarda lo que antes solo estaba en la hoja CLIENTES, para que el bot la mire
-- primero y se pueda cambiar desde el panel. La hoja queda de respaldo para un teléfono sin ficha.
-- Sin estas columnas todo funciona como antes: el bot lee la hoja.

ALTER TABLE clientes ADD COLUMN precio_especial_20l INTEGER;            -- pesos por bidón de 20 L; null = sin precio especial
ALTER TABLE clientes ADD COLUMN vacios_pendientes INTEGER NOT NULL DEFAULT 0; -- vacíos que debe de antes (regla 5)
ALTER TABLE clientes ADD COLUMN bloqueado INTEGER NOT NULL DEFAULT 0;   -- 1 = lo atiende una persona y no se anota el pedido (regla 14)
