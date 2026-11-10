-- Relevo (src/relevo.ts): con el número compartido entre el bot y la app WhatsApp Business (coexistencia), Meta avisa al
-- bot de cada mensaje que una persona envía desde la app. Mientras una persona atiende a un cliente, el bot no le responde.

CREATE TABLE IF NOT EXISTS conversaciones_tomadas (
  telefono TEXT PRIMARY KEY,
  hasta INTEGER NOT NULL,          -- el bot no le responde a este cliente hasta este momento (segundos Unix)
  ultimo_eco_en INTEGER NOT NULL,  -- último mensaje que una persona le envió desde la app
  espera_desde INTEGER             -- el cliente escribió después y nadie le ha respondido; NULL si no espera nada
);
-- El vigía busca cada 5 minutos las pausas que ya terminaron.
CREATE INDEX IF NOT EXISTS idx_conversaciones_tomadas_hasta ON conversaciones_tomadas (hasta);
