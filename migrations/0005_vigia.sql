-- Vigía de mensajes sin atender: si el Worker se interrumpe a mitad de camino (por el límite de CPU, una caída o un
-- despliegue), Meta ya recibió su 200 y no reintenta, así que el mensaje se perdería en silencio. Con estas dos columnas
-- una tarea programada encuentra los mensajes que llegaron y nunca terminaron de atenderse, y deja un aviso para una persona.

-- De quién es el mensaje, para decirle a la persona a quién hay que escribirle. Se borra junto con la fila, a los 7 días.
ALTER TABLE mensajes_procesados ADD COLUMN telefono TEXT NOT NULL DEFAULT '';
-- Cuándo terminó la atención (segundos Unix); NULL mientras no termine.
ALTER TABLE mensajes_procesados ADD COLUMN atendido_en INTEGER;

-- Todo lo anterior a esta migración ya se atendió.
UPDATE mensajes_procesados SET atendido_en = recibido_en WHERE atendido_en IS NULL;

-- El vigía pregunta cada 5 minutos: con este índice parcial solo lee las filas pendientes, que casi siempre son cero.
CREATE INDEX IF NOT EXISTS idx_mensajes_sin_atender ON mensajes_procesados (recibido_en) WHERE atendido_en IS NULL;
