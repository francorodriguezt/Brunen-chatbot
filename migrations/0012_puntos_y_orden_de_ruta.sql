-- Puntos del mapa y orden de la ruta (fase C, D63).
-- Un punto por dirección. Las coordenadas no vienen de ningún servicio externo (D32, D62): las pone una persona con un
-- pin en el mapa, o las aprende el teléfono del repartidor la primera vez que entrega ahí.

CREATE TABLE IF NOT EXISTS puntos (
  clave TEXT PRIMARY KEY,                 -- dirección y comuna normalizadas (claveDeDireccion): la misma escrita distinto cuenta una vez
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  origen TEXT NOT NULL,                   -- manual (un pin) o repartidor (el GPS del teléfono al entregar)
  precision_m INTEGER,                    -- margen de error que informó el teléfono, en metros
  actualizado_en INTEGER NOT NULL
);

-- Posición de la parada en la ruta publicada de su día (1, 2, 3...). null = sin publicar: se ordena por comuna y dirección.
ALTER TABLE pedidos ADD COLUMN orden_ruta INTEGER;
