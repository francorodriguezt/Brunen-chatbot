-- Pedidos fijos (D59): clientes que reciben lo mismo cada cierta cantidad de días (las empresas con plan mensual y los
-- hogares que piden cada semana). La tarea programada crea el pedido unos días antes de la entrega, pendiente de
-- confirmar. Uno por cliente: si un cliente necesita dos ritmos distintos, una persona anota el otro a mano.

CREATE TABLE IF NOT EXISTS pedidos_fijos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL UNIQUE,
  telefono TEXT NOT NULL,                 -- el teléfono al que queda asociado cada pedido
  lineas TEXT NOT NULL,                   -- JSON: [{"tipo":"20L","cantidad":10}]
  cada_dias INTEGER NOT NULL,             -- 7 = cada semana, 14 = cada dos semanas...
  proxima_fecha TEXT NOT NULL,            -- YYYY-MM-DD de la próxima entrega
  activo INTEGER NOT NULL DEFAULT 1,
  notas TEXT NOT NULL DEFAULT '',
  creado_en INTEGER NOT NULL,
  actualizado_en INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pedidos_fijos_proxima ON pedidos_fijos (activo, proxima_fecha);
