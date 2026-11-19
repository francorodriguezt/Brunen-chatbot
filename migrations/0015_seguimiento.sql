-- Seguimiento del repartidor (fase E, D80): su consentimiento, sus jornadas y las posiciones que manda su teléfono
-- mientras la app está abierta durante la jornada. Las posiciones se borran a los 3 días: sirven para el mapa en vivo
-- y la hora de llegada, no para guardar su recorrido.

-- Su consentimiento para compartir la ubicación durante la jornada. Lo da (y lo puede retirar) en su app.
CREATE TABLE IF NOT EXISTS consentimientos_ubicacion (
  usuario_id INTEGER PRIMARY KEY,
  aceptado_en INTEGER,                       -- segundos Unix; null = no lo ha dado o lo retiró
  retirado_en INTEGER,
  version TEXT NOT NULL DEFAULT ''           -- qué texto aceptó (fecha de la versión)
);

-- "Iniciar ruta" y "Terminar jornada". Solo durante una jornada abierta se aceptan posiciones.
CREATE TABLE IF NOT EXISTS jornadas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  fecha TEXT NOT NULL,                       -- YYYY-MM-DD, hora de Santiago
  iniciada_en INTEGER NOT NULL,
  terminada_en INTEGER
);
CREATE INDEX IF NOT EXISTS idx_jornadas_usuario ON jornadas (usuario_id, fecha);

CREATE TABLE IF NOT EXISTS posiciones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL,
  jornada_id INTEGER NOT NULL,
  en INTEGER NOT NULL,                       -- cuándo la midió el teléfono (segundos Unix)
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  precision_m INTEGER
);
-- Una por repartidor y segundo: una tanda que se reenvía (se perdió la respuesta) no se duplica.
CREATE UNIQUE INDEX IF NOT EXISTS idx_posiciones_usuario ON posiciones (usuario_id, en);
CREATE INDEX IF NOT EXISTS idx_posiciones_en ON posiciones (en);
