-- Versiones de la ruta publicada (D94): cuántas veces se publicó la ruta de un día y cuál confirmó el repartidor.
-- Si la oficina cambia la ruta cuando el repartidor ya la tenía, su app lo avisa hasta que toque "Entendido", y el
-- panel dice si ya lo vio. Una fila por día; lo de hace más de 30 días se borra al publicar.
-- Sin esta tabla todo funciona como antes, sin el aviso.

CREATE TABLE IF NOT EXISTS rutas_publicadas (
  fecha TEXT PRIMARY KEY,                    -- YYYY-MM-DD, el día de la ruta
  version INTEGER NOT NULL,                  -- 1 la primera vez que se publica ese día; sube con cada publicación
  publicada_en INTEGER NOT NULL,             -- segundos Unix de la última publicación
  vista_version INTEGER,                     -- la última versión que confirmó la app del repartidor
  vista_en INTEGER
);
