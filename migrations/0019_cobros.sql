-- Cobros (D107): cada pago queda anotado con quién lo informó y quién lo verificó. Un pedido puede tener varios pagos
-- (un abono y el resto después). El efectivo del día se verifica al rendir: lo que trae el repartidor, menos la bencina.
--
-- Estados de un pago: informado (el repartidor dijo que cobró, o una persona lo anotó sin haberlo visto todavía),
-- verificado (una persona vio el dinero o la transferencia en el banco) o rechazado (no llegó: no cuenta).
-- El pedido guarda la suma para no recalcularla en cada lista, y su estado de pago pasa a ser uno de:
-- pendiente, abonado (pagó una parte), informado (pagó todo, falta verificar) o pagado (verificado).

CREATE TABLE IF NOT EXISTS pagos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pedido_id TEXT NOT NULL,
  monto INTEGER NOT NULL,                         -- pesos, mayor que 0
  forma TEXT NOT NULL,                            -- efectivo, transferencia, redcompra, webpay u otro
  origen TEXT NOT NULL,                           -- repartidor (al entregar) o panel (lo anotó una persona)
  fecha TEXT NOT NULL,                            -- día del pago en Santiago (YYYY-MM-DD): el efectivo se rinde por día
  estado TEXT NOT NULL DEFAULT 'informado',       -- informado, verificado o rechazado
  nota TEXT NOT NULL DEFAULT '',
  informado_por TEXT NOT NULL,
  informado_en INTEGER NOT NULL,
  verificado_por TEXT,                            -- también quien lo rechazó
  verificado_en INTEGER
);
CREATE INDEX IF NOT EXISTS pagos_por_pedido ON pagos (pedido_id);
CREATE INDEX IF NOT EXISTS pagos_por_estado ON pagos (estado, fecha);

-- La rendición del día: el efectivo que el repartidor entrega al terminar. A veces carga bencina con ese efectivo.
CREATE TABLE IF NOT EXISTS rendiciones (
  fecha TEXT PRIMARY KEY,                         -- YYYY-MM-DD
  efectivo_cobrado INTEGER NOT NULL,              -- lo que sumaban sus cobros en efectivo al rendir
  bencina INTEGER NOT NULL DEFAULT 0,             -- lo que gastó en bencina con ese efectivo
  entregado INTEGER NOT NULL,                     -- lo que entregó
  nota TEXT NOT NULL DEFAULT '',
  registrado_por TEXT NOT NULL,
  registrado_en INTEGER NOT NULL
);

ALTER TABLE pedidos ADD COLUMN monto_pagado INTEGER NOT NULL DEFAULT 0;      -- suma de pagos informados y verificados
ALTER TABLE pedidos ADD COLUMN monto_verificado INTEGER NOT NULL DEFAULT 0;  -- suma de pagos verificados

-- Cliente a crédito: paga después (por ejemplo, a fin de mes). Su saldo no es un atraso.
ALTER TABLE clientes ADD COLUMN credito INTEGER NOT NULL DEFAULT 0;
