-- Datos ficticios para ver el panel en el computador (todo inventado: nombres, teléfonos, direcciones y mensajes).
-- SOLO LOCAL: se carga con `npm run datos-locales`, que usa --local y nunca toca la base real.
-- Se puede cargar varias veces: cada vez borra los datos de demostración anteriores (los que terminan en DEMO) y los
-- deja como recién llegados, con entregas para hoy y para mañana. Lo que se haya anotado a mano no se toca.
-- "Hoy" es la fecha de Chile en horario de verano (UTC-3): cerca de la medianoche de invierno puede correrse un día.

DELETE FROM historial_pedidos WHERE pedido_id LIKE 'P______-DEMO_';
DELETE FROM avisos WHERE origen LIKE 'demo-%';
DELETE FROM pedidos WHERE id LIKE 'P______-DEMO_';

INSERT INTO pedidos (id, creado_en, telefono, nombre, comuna, direccion, fecha_entrega, fecha_confirmada, estado, lineas, total, notas_repartidor, envases_a_retirar, observaciones, confirmado_por, actualizado_en) VALUES
  -- Por confirmar: lo que la operadora ve al abrir el panel.
  ('P261028-DEMO1', CAST(strftime('%s', 'now') AS INTEGER) - 420, '56955550001', 'Ana Prueba', 'Ñuñoa', 'Calle Falsa 123', date('now', '-3 hours', '+1 day'), NULL, 'Pendiente_Confirmacion',
   '[{"tipo":"20L","cantidad":2,"precioUnitario":3300,"subtotal":6600}]', 6600, 'Tocar el timbre. Avisar hora aproximada de entrega', 2, 'Pidió repetir su último pedido.', NULL, CAST(strftime('%s', 'now') AS INTEGER) - 420),
  ('P261028-DEMO2', CAST(strftime('%s', 'now') AS INTEGER) - 180, '56955550002', '', 'Providencia', '', date('now', '-3 hours', '+1 day'), NULL, 'Pendiente_Confirmacion',
   '[{"tipo":"12L","cantidad":2,"precioUnitario":null,"subtotal":null}]', NULL, '', 0, 'Cliente nuevo, sin ficha: pedir dirección y comuna, y ofrecer la carga inicial si no tiene envases. | Falta el precio: completarlo antes de confirmar.', NULL, CAST(strftime('%s', 'now') AS INTEGER) - 180),
  ('P261028-DEMO3', CAST(strftime('%s', 'now') AS INTEGER) - 3600, '56955550003', 'Camila Ejemplo', 'Maipú', 'Pasaje Inventado 45', date('now', '-3 hours', '+2 day'), NULL, 'Fuera_de_zona',
   '[{"tipo":"20L","cantidad":1,"precioUnitario":4500,"subtotal":4500}]', 4500, '', 0, '', NULL, CAST(strftime('%s', 'now') AS INTEGER) - 3600),
  -- Reparto de hoy: confirmados, uno en ruta y uno ya entregado.
  ('P261028-DEMO6', CAST(strftime('%s', 'now') AS INTEGER) - 70000, '56955550006', 'Hugo Demo', 'Macul', 'Calle Inventada 321', date('now', '-3 hours'), date('now', '-3 hours'), 'Confirmado',
   '[{"tipo":"20L","cantidad":4,"precioUnitario":2750,"subtotal":11000}]', 11000, '', 0, '', 'operadora@brunen.test', CAST(strftime('%s', 'now') AS INTEGER) - 60000),
  ('P261028-DEMO7', CAST(strftime('%s', 'now') AS INTEGER) - 69000, '56955550007', 'Rosa Ejemplo', 'Ñuñoa', 'Pasaje Inventado 45 depto 302', date('now', '-3 hours'), date('now', '-3 hours'), 'En_Ruta',
   '[{"tipo":"20L","cantidad":2,"precioUnitario":3300,"subtotal":6600}]', 6600, 'Edificio Los Aromos. Dejar en conserjería', 2, '', 'operadora@brunen.test', CAST(strftime('%s', 'now') AS INTEGER) - 9000),
  ('P261028-DEMO8', CAST(strftime('%s', 'now') AS INTEGER) - 68000, '56955550005', 'Luz Demo', 'Providencia', 'Camino Imaginario 12', date('now', '-3 hours'), date('now', '-3 hours'), 'Entregado',
   '[{"tipo":"10L","cantidad":1,"precioUnitario":2200,"subtotal":2200}]', 2200, '', 0, '', 'operadora@brunen.test', CAST(strftime('%s', 'now') AS INTEGER) - 5000),
  ('P261028-DEMO9', CAST(strftime('%s', 'now') AS INTEGER) - 67000, '56955550009', 'Oficina Ejemplo SpA', 'Las Condes', 'Calle de Mentira 1500 of. 21', date('now', '-3 hours'), date('now', '-3 hours'), 'Confirmado',
   '[{"tipo":"20L","cantidad":6,"precioUnitario":2750,"subtotal":16500},{"tipo":"12L","cantidad":1,"precioUnitario":2500,"subtotal":2500}]', 19000, 'Recepción hasta las 17:00', 5, '', 'operadora@brunen.test', CAST(strftime('%s', 'now') AS INTEGER) - 58000),
  ('P261028-DEMOA', CAST(strftime('%s', 'now') AS INTEGER) - 66000, '56955550010', 'Tomás Prueba', 'Ñuñoa', 'Calle Falsa 456', date('now', '-3 hours'), date('now', '-3 hours'), 'Confirmado',
   '[{"tipo":"20L","cantidad":1,"precioUnitario":4500,"subtotal":4500}]', 4500, '', 1, '', 'operadora@brunen.test', CAST(strftime('%s', 'now') AS INTEGER) - 57000),
  ('P261028-DEMOB', CAST(strftime('%s', 'now') AS INTEGER) - 65000, '56955550011', 'Carla Muestra', 'La Reina', 'Avenida Simulada 77', date('now', '-3 hours'), date('now', '-3 hours'), 'Confirmado',
   '[{"tipo":"20L","cantidad":3,"precioUnitario":3300,"subtotal":9900}]', 9900, 'Portón verde', 0, '', 'operadora@brunen.test', CAST(strftime('%s', 'now') AS INTEGER) - 56000),
  -- Reparto de mañana: dos confirmados (y los dos de arriba que siguen por confirmar).
  ('P261027-DEMO4', CAST(strftime('%s', 'now') AS INTEGER) - 90000, '56955550004', 'Pedro Muestra', 'Macul', 'Avenida Ficticia 987', date('now', '-3 hours', '+1 day'), date('now', '-3 hours', '+1 day'), 'Confirmado',
   '[{"tipo":"20L","cantidad":4,"precioUnitario":2750,"subtotal":11000}]', 11000, '', 0, '', 'operadora@brunen.test', CAST(strftime('%s', 'now') AS INTEGER) - 80000),
  ('P261028-DEMOC', CAST(strftime('%s', 'now') AS INTEGER) - 30000, '56955550012', 'Elena Ejemplo', 'Peñalolén', 'Pasaje Supuesto 9', date('now', '-3 hours', '+1 day'), date('now', '-3 hours', '+1 day'), 'Confirmado',
   '[{"tipo":"12L","cantidad":2,"precioUnitario":2400,"subtotal":4800}]', 4800, '', 2, 'Anotado a mano en el panel.', 'operadora@brunen.test', CAST(strftime('%s', 'now') AS INTEGER) - 29000),
  -- Ayer: ya cerrado.
  ('P261026-DEMO5', CAST(strftime('%s', 'now') AS INTEGER) - 180000, '56955550005', 'Luz Demo', 'Providencia', 'Camino Imaginario 12', date('now', '-3 hours', '-1 day'), date('now', '-3 hours', '-1 day'), 'Entregado',
   '[{"tipo":"10L","cantidad":1,"precioUnitario":2200,"subtotal":2200}]', 2200, '', 0, '', 'operadora@brunen.test', CAST(strftime('%s', 'now') AS INTEGER) - 100000);

INSERT INTO avisos (creado_en, tipo, telefono, nombre, resumen, motivos, texto, id_pedido, origen, estado) VALUES
  (CAST(strftime('%s', 'now') AS INTEGER) - 420, 'pedido', '56955550001', 'Ana Prueba', '2 × 20 L · Ñuñoa', '[]', 'quiero lo mismo de siempre', 'P261028-DEMO1', 'demo-1', 'abierto'),
  (CAST(strftime('%s', 'now') AS INTEGER) - 180, 'cliente_nuevo', '56955550002', '', '2 × 12 L · Providencia', '["Cliente nuevo, sin ficha"]', 'hola, quiero 2 de 12 litros para mañana', 'P261028-DEMO2', 'demo-2', 'abierto'),
  (CAST(strftime('%s', 'now') AS INTEGER) - 3600, 'fuera_de_zona', '56955550003', 'Camila Ejemplo', '1 × 20 L · Maipú', '[]', 'un bidón de 20 para el sábado', 'P261028-DEMO3', 'demo-3', 'abierto'),
  (CAST(strftime('%s', 'now') AS INTEGER) - 900, 'reclamo', '56955550004', 'Pedro Muestra', 'El cliente presenta un reclamo', '["Los reclamos los atiende una persona"]', 'el bidón que me trajeron ayer viene goteando', NULL, 'demo-4', 'abierto'),
  (CAST(strftime('%s', 'now') AS INTEGER) - 2400, 'pago', '56955550001', 'Ana Prueba', 'Envió una imagen: posible comprobante de pago', '[]', '', 'P261028-DEMO1', 'demo-5', 'abierto'),
  (CAST(strftime('%s', 'now') AS INTEGER) - 7200, 'no_entendido', '56955550006', '', 'No se entendió el mensaje', '[]', 'jaja y el otro q?', NULL, 'demo-6', 'abierto');

INSERT INTO historial_pedidos (pedido_id, en, quien, accion, detalle)
  SELECT p.id, p.creado_en, CASE WHEN p.observaciones LIKE 'Anotado a mano%' THEN 'operadora@brunen.test' ELSE 'bot' END, 'creado', CASE WHEN p.observaciones LIKE 'Anotado a mano%' THEN 'a mano en el panel' ELSE '' END
  FROM pedidos p WHERE p.id LIKE 'P______-DEMO_';

INSERT INTO historial_pedidos (pedido_id, en, quien, accion, detalle)
  SELECT p.id, p.creado_en + 600, 'operadora@brunen.test', 'estado: Pendiente_Confirmacion -> Confirmado', '' FROM pedidos p
  WHERE p.id LIKE 'P______-DEMO_' AND p.estado IN ('Confirmado', 'En_Ruta', 'Entregado');

INSERT INTO historial_pedidos (pedido_id, en, quien, accion, detalle)
  SELECT p.id, p.actualizado_en, 'operadora@brunen.test', CASE p.estado WHEN 'En_Ruta' THEN 'estado: Confirmado -> En_Ruta' ELSE 'estado: Confirmado -> Entregado' END, '' FROM pedidos p
  WHERE p.id LIKE 'P______-DEMO_' AND p.estado IN ('En_Ruta', 'Entregado');
