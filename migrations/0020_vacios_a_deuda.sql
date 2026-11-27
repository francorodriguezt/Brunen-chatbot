-- Vacíos que faltan como deuda (D108): al entregar, la diferencia entre los bidones que se dejaron y los vacíos que se
-- retiraron pasa a la ficha del cliente (`clientes.vacios_pendientes`) y se retira la próxima vez. Esta columna guarda lo
-- que ya se le sumó (o restó) a la ficha por ese pedido, para que corregir la entrega el mismo día no lo cuente dos veces.
ALTER TABLE pedidos ADD COLUMN vacios_a_deuda INTEGER NOT NULL DEFAULT 0;
