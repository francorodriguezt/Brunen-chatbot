-- Datos ficticios para ver el panel en el computador (todo inventado: nombres, teléfonos y mensajes).
-- SOLO LOCAL: se carga con `npm run datos-locales`, que usa --local y nunca toca la base real.
-- Se puede cargar varias veces: los pedidos y avisos de prueba tienen claves fijas y no se duplican.

INSERT OR IGNORE INTO pedidos (id, creado_en, telefono, nombre, comuna, direccion, fecha_entrega, fecha_confirmada, estado, lineas, total, notas_repartidor, envases_a_retirar, observaciones, confirmado_por, actualizado_en) VALUES
  ('P261028-DEMO1', CAST(strftime('%s', 'now') AS INTEGER) - 420, '56955550001', 'Ana Prueba', 'Ñuñoa', 'Calle Falsa 123', date('now', '+1 day'), NULL, 'Pendiente_Confirmacion',
   '[{"tipo":"20L","cantidad":2,"precioUnitario":3300,"subtotal":6600}]', 6600, 'Tocar el timbre. Avisar hora aproximada de entrega', 2, 'Pidió repetir su último pedido.', NULL, CAST(strftime('%s', 'now') AS INTEGER) - 420),
  ('P261028-DEMO2', CAST(strftime('%s', 'now') AS INTEGER) - 180, '56955550002', '', 'Providencia', '', date('now', '+1 day'), NULL, 'Pendiente_Confirmacion',
   '[{"tipo":"12L","cantidad":2,"precioUnitario":null,"subtotal":null}]', NULL, '', 0, 'Cliente nuevo, sin ficha: pedir dirección y comuna, y ofrecer la carga inicial si no tiene envases. | Falta el precio: completarlo antes de confirmar.', NULL, CAST(strftime('%s', 'now') AS INTEGER) - 180),
  ('P261028-DEMO3', CAST(strftime('%s', 'now') AS INTEGER) - 3600, '56955550003', 'Camila Ejemplo', 'Maipú', 'Pasaje Inventado 45', date('now', '+2 day'), NULL, 'Fuera_de_zona',
   '[{"tipo":"20L","cantidad":1,"precioUnitario":4500,"subtotal":4500}]', 4500, '', 0, '', NULL, CAST(strftime('%s', 'now') AS INTEGER) - 3600),
  ('P261027-DEMO4', CAST(strftime('%s', 'now') AS INTEGER) - 90000, '56955550004', 'Pedro Muestra', 'Macul', 'Avenida Ficticia 987', date('now', '+1 day'), date('now', '+1 day'), 'Confirmado',
   '[{"tipo":"20L","cantidad":4,"precioUnitario":2750,"subtotal":11000}]', 11000, '', 0, '', 'operadora@brunen.test', CAST(strftime('%s', 'now') AS INTEGER) - 80000),
  ('P261026-DEMO5', CAST(strftime('%s', 'now') AS INTEGER) - 180000, '56955550005', 'Luz Demo', 'Providencia', 'Camino Imaginario 12', date('now', '-1 day'), date('now', '-1 day'), 'Entregado',
   '[{"tipo":"10L","cantidad":1,"precioUnitario":2200,"subtotal":2200}]', 2200, '', 0, '', 'operadora@brunen.test', CAST(strftime('%s', 'now') AS INTEGER) - 100000);

INSERT OR IGNORE INTO avisos (creado_en, tipo, telefono, nombre, resumen, motivos, texto, id_pedido, origen, estado) VALUES
  (CAST(strftime('%s', 'now') AS INTEGER) - 420, 'pedido', '56955550001', 'Ana Prueba', '2 × 20 L · Ñuñoa', '[]', 'quiero lo mismo de siempre', 'P261028-DEMO1', 'demo-1', 'abierto'),
  (CAST(strftime('%s', 'now') AS INTEGER) - 180, 'cliente_nuevo', '56955550002', '', '2 × 12 L · Providencia', '["Cliente nuevo, sin ficha"]', 'hola, quiero 2 de 12 litros para mañana', 'P261028-DEMO2', 'demo-2', 'abierto'),
  (CAST(strftime('%s', 'now') AS INTEGER) - 3600, 'fuera_de_zona', '56955550003', 'Camila Ejemplo', '1 × 20 L · Maipú', '[]', 'un bidón de 20 para el sábado', 'P261028-DEMO3', 'demo-3', 'abierto'),
  (CAST(strftime('%s', 'now') AS INTEGER) - 900, 'reclamo', '56955550004', 'Pedro Muestra', 'El cliente presenta un reclamo', '["Los reclamos los atiende una persona"]', 'el bidón que me trajeron ayer viene goteando', NULL, 'demo-4', 'abierto'),
  (CAST(strftime('%s', 'now') AS INTEGER) - 2400, 'pago', '56955550001', 'Ana Prueba', 'Envió una imagen: posible comprobante de pago', '[]', '', 'P261028-DEMO1', 'demo-5', 'abierto'),
  (CAST(strftime('%s', 'now') AS INTEGER) - 7200, 'no_entendido', '56955550006', '', 'No se entendió el mensaje', '[]', 'jaja y el otro q?', NULL, 'demo-6', 'abierto');

INSERT INTO historial_pedidos (pedido_id, en, quien, accion, detalle)
  SELECT p.id, p.creado_en, 'bot', 'creado', '' FROM pedidos p
  WHERE p.id LIKE 'P2610%-DEMO_' AND NOT EXISTS (SELECT 1 FROM historial_pedidos h WHERE h.pedido_id = p.id);

INSERT INTO historial_pedidos (pedido_id, en, quien, accion, detalle)
  SELECT p.id, p.actualizado_en, 'operadora@brunen.test', 'estado: Pendiente_Confirmacion -> Confirmado', '' FROM pedidos p
  WHERE p.id IN ('P261027-DEMO4', 'P261026-DEMO5')
    AND NOT EXISTS (SELECT 1 FROM historial_pedidos h WHERE h.pedido_id = p.id AND h.accion LIKE 'estado:%');
