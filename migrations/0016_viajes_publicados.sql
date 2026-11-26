-- Viajes de la ruta publicada (D86): en qué viaje del furgón quedó cada parada al publicar la ruta de un día.
-- Así la app del repartidor y el mapa del administrador muestran los mismos viajes, y un cambio posterior (un pedido
-- cancelado, una cantidad corregida) no mueve paradas de un viaje a otro en plena ruta.
-- Se reescribe cada vez que se publica ese día; lo de hace más de 30 días se borra al publicar.
-- Sin esta tabla todo funciona como antes: los viajes se arman por capacidad.

CREATE TABLE IF NOT EXISTS viajes_publicados (
  pedido_id TEXT PRIMARY KEY,
  fecha TEXT NOT NULL,                       -- YYYY-MM-DD, el día de la ruta
  viaje INTEGER NOT NULL                     -- 1, 2...: el viaje del furgón al publicar
);
CREATE INDEX IF NOT EXISTS idx_viajes_publicados_fecha ON viajes_publicados (fecha);
