-- Pedidos y avisos del bot (D32): D1 es la fuente de verdad que ven y editan la operadora y el dueño en el panel.
-- Todavía no se usa en producción: se aplica al conectar el flujo de pedido.

-- Un pedido por fila; las líneas (producto, cantidad, precio) van como JSON porque siempre se leen juntas.
CREATE TABLE IF NOT EXISTS pedidos (
  id TEXT PRIMARY KEY,                       -- ID_Pedido, por ejemplo P261028-3K7Q9
  creado_en INTEGER NOT NULL,                -- segundos Unix
  telefono TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  comuna TEXT NOT NULL DEFAULT '',
  direccion TEXT NOT NULL DEFAULT '',
  fecha_entrega TEXT NOT NULL,               -- la que propone el bot (YYYY-MM-DD)
  fecha_confirmada TEXT,                     -- la que confirma la operadora
  estado TEXT NOT NULL,                      -- Pendiente_Confirmacion, Fuera_de_zona, Confirmado, En_Ruta, Entregado, Cancelado
  lineas TEXT NOT NULL,                      -- [{"tipo":"20L","cantidad":2,"precioUnitario":3300,"subtotal":6600}]
  total INTEGER,                             -- suma de los subtotales; null si falta algún precio
  notas_repartidor TEXT NOT NULL DEFAULT '',
  envases_a_retirar INTEGER NOT NULL DEFAULT 0,
  observaciones TEXT NOT NULL DEFAULT '',    -- por qué hay que revisarlo, y qué pidió el cliente
  confirmado_por TEXT,                       -- correo de quien lo confirmó en el panel
  actualizado_en INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pedidos_estado ON pedidos (estado, fecha_entrega);
CREATE INDEX IF NOT EXISTS idx_pedidos_telefono ON pedidos (telefono, creado_en);

-- Avisos para una persona: reclamos, mensajes que el bot no entendió, pedidos para revisar, fallas...
CREATE TABLE IF NOT EXISTS avisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  creado_en INTEGER NOT NULL,
  tipo TEXT NOT NULL,
  telefono TEXT NOT NULL,
  nombre TEXT NOT NULL DEFAULT '',
  resumen TEXT NOT NULL,
  motivos TEXT NOT NULL DEFAULT '[]',        -- JSON con la lista de motivos
  texto TEXT NOT NULL DEFAULT '',            -- lo que escribió el cliente; se borra a los 90 días
  id_pedido TEXT,
  origen TEXT,                               -- wamid del mensaje que lo causó: un reintento de Meta no lo duplica
  estado TEXT NOT NULL DEFAULT 'abierto',    -- abierto o resuelto
  resuelto_por TEXT,
  resuelto_en INTEGER
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_avisos_origen ON avisos (origen, tipo) WHERE origen IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_avisos_estado ON avisos (estado, creado_en);

-- Quién hizo qué con cada pedido (confirmar, cambiar, cancelar...).
CREATE TABLE IF NOT EXISTS historial_pedidos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id TEXT NOT NULL,
  en INTEGER NOT NULL,
  quien TEXT NOT NULL,                       -- correo, o "bot"
  accion TEXT NOT NULL,
  detalle TEXT NOT NULL DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_historial_pedido ON historial_pedidos (pedido_id, en);
