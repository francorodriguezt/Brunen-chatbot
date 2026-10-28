-- Mensajes de WhatsApp ya procesados. Meta reintenta si no recibe 200 a tiempo, y sin esto
-- el bot podría responder dos veces al mismo mensaje. La clave primaria hace la revisión atómica.
CREATE TABLE IF NOT EXISTS mensajes_procesados (
  wamid TEXT PRIMARY KEY,
  recibido_en INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_mensajes_procesados_recibido_en ON mensajes_procesados (recibido_en);
