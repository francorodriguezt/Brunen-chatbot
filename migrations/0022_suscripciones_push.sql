-- Notificaciones del panel en el teléfono (D115): cada dispositivo que activó los avisos deja aquí su dirección de envío
-- (la entrega el navegador, p. ej. Apple en un iPhone) y sus dos claves públicas para cifrar el aviso. No guarda nombres
-- de clientes ni nada del negocio: solo de qué dispositivo y de qué correo del equipo es.
CREATE TABLE IF NOT EXISTS suscripciones_push (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  endpoint TEXT NOT NULL UNIQUE,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  correo TEXT NOT NULL,
  creado_en INTEGER NOT NULL,
  ultimo_envio INTEGER,
  fallas INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS suscripciones_push_por_correo ON suscripciones_push (correo);
