-- Clientes en la base (fase B, D53). En el Excel real, 61 teléfonos aparecen con más de un nombre y 19 nombres con
-- más de un teléfono: el cliente es una ficha propia, con varios teléfonos y un historial de direcciones.

CREATE TABLE IF NOT EXISTS clientes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL DEFAULT '',
  tipo_cliente TEXT NOT NULL DEFAULT '',     -- hogar, minimarket o empresa (vacío = sin definir)
  notas TEXT NOT NULL DEFAULT '',
  creado_en INTEGER NOT NULL,
  actualizado_en INTEGER NOT NULL
);

-- Un teléfono es de un solo cliente; un cliente puede tener varios.
CREATE TABLE IF NOT EXISTS telefonos_cliente (
  telefono TEXT PRIMARY KEY,                 -- solo dígitos, con código de país
  cliente_id INTEGER NOT NULL,
  agregado_en INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_telefonos_cliente ON telefonos_cliente (cliente_id);

-- Cada dirección donde se le ha entregado. La vigente es la última usada; las anteriores no se borran.
CREATE TABLE IF NOT EXISTS direcciones_cliente (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cliente_id INTEGER NOT NULL,
  clave TEXT NOT NULL,                       -- dirección y comuna normalizadas: la misma escrita distinto cuenta una vez
  direccion TEXT NOT NULL,
  comuna TEXT NOT NULL DEFAULT '',
  notas_repartidor TEXT NOT NULL DEFAULT '',
  usos INTEGER NOT NULL DEFAULT 1,
  primer_uso INTEGER NOT NULL,
  ultimo_uso INTEGER NOT NULL,
  UNIQUE (cliente_id, clave)
);

ALTER TABLE pedidos ADD COLUMN cliente_id INTEGER;
CREATE INDEX IF NOT EXISTS idx_pedidos_cliente ON pedidos (cliente_id, creado_en);
CREATE INDEX IF NOT EXISTS idx_pedidos_sin_cliente ON pedidos (creado_en) WHERE cliente_id IS NULL;
