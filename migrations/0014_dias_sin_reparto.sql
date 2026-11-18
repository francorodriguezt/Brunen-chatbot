-- Días sin reparto (D74): un feriado que no está en la hoja, un cierre, una falla del furgón. Los anota una persona en
-- el panel; el bot no ofrece esos días y le dice al cliente por qué. El motivo lo lee el cliente.
CREATE TABLE IF NOT EXISTS dias_sin_reparto (
  fecha TEXT PRIMARY KEY,                  -- YYYY-MM-DD, hora de Santiago
  motivo TEXT NOT NULL DEFAULT '',         -- "feriado", "mantención del furgón"...
  creado_por TEXT NOT NULL DEFAULT '',     -- correo de quien lo anotó
  creado_en INTEGER NOT NULL               -- segundos Unix
);
