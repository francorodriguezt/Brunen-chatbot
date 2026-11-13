-- Lo que anota el repartidor en cada parada (fase D, D61). En el pedido mismo: una parada es un pedido del día.
-- "Entregado" pasa el pedido a ese estado y guarda los vacíos que retiró y si cobró. "No se pudo" deja el pedido
-- abierto, con su motivo, para que una persona lo reagende (no hay un estado "Reprogramado").

ALTER TABLE pedidos ADD COLUMN entregado_en INTEGER;
ALTER TABLE pedidos ADD COLUMN vacios_retirados INTEGER;
ALTER TABLE pedidos ADD COLUMN cobrado_en_entrega INTEGER;          -- lo que cobró al entregar (null = no cobró)
ALTER TABLE pedidos ADD COLUMN no_entregado_en INTEGER;
ALTER TABLE pedidos ADD COLUMN no_entregado_motivo TEXT NOT NULL DEFAULT '';
