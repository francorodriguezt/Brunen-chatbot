-- Respaldo en Google Sheets (D66): hasta dónde se copió cada hoja, para seguir desde ahí en la próxima vuelta.
-- Una fila por hoja de respaldo. Solo se escribe cuando hubo algo que copiar o cuando falló: no gasta escrituras de más.
CREATE TABLE IF NOT EXISTS respaldos (
  hoja TEXT PRIMARY KEY,
  hasta INTEGER NOT NULL DEFAULT 0,        -- actualizado_en del último pedido copiado
  ultimo_id TEXT NOT NULL DEFAULT '',      -- y su id, para los que cambiaron en el mismo segundo
  filas INTEGER NOT NULL DEFAULT 0,        -- filas escritas en total (0 = hoja todavía sin encabezado)
  ultimo_ok INTEGER,                       -- cuándo se copió bien por última vez (segundos Unix)
  ultimo_error TEXT NOT NULL DEFAULT ''    -- el último error, para el aviso a una persona
);
