-- Memoria del flujo de pedido (Etapa 4). Todavía no se usa en producción: se aplica al conectar el flujo.

-- Pedido a medias de cada cliente, cuando el bot le hizo una pregunta ("¿de qué tamaño?"). Vence a las 12 horas.
CREATE TABLE IF NOT EXISTS conversaciones (
  telefono TEXT PRIMARY KEY,
  estado TEXT NOT NULL,
  actualizado_en INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversaciones_actualizado ON conversaciones (actualizado_en);

-- Último pedido de cada cliente, para responder "lo de siempre".
CREATE TABLE IF NOT EXISTS ultimos_pedidos (
  telefono TEXT PRIMARY KEY,
  items TEXT NOT NULL,
  actualizado_en INTEGER NOT NULL
);

-- Mensajes recién llegados que esperan unos segundos para juntarse con los siguientes del mismo número
-- ("2 bidones" y después "de 20") y responder una sola vez. Se borran apenas se procesan.
CREATE TABLE IF NOT EXISTS mensajes_pendientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wamid TEXT NOT NULL UNIQUE,
  telefono TEXT NOT NULL,
  texto TEXT NOT NULL,
  recibido_en INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pendientes_telefono ON mensajes_pendientes (telefono, id);
