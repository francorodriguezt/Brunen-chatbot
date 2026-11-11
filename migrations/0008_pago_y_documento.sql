-- Fase B (D52): lo que el Excel de control de pedidos guarda y la base todavía no. Valores cerrados, validados en
-- `src/repositorio.ts` (OPCIONES_DE_PEDIDO). Vacío = todavía no se sabe.
ALTER TABLE pedidos ADD COLUMN forma_pago TEXT NOT NULL DEFAULT '';        -- transferencia, efectivo, redcompra, webpay, plan, otro
ALTER TABLE pedidos ADD COLUMN estado_pago TEXT NOT NULL DEFAULT 'pendiente'; -- pendiente o pagado
ALTER TABLE pedidos ADD COLUMN documento TEXT NOT NULL DEFAULT '';         -- boleta o factura
ALTER TABLE pedidos ADD COLUMN numero_documento TEXT NOT NULL DEFAULT '';  -- número de la boleta o la factura
ALTER TABLE pedidos ADD COLUMN tipo_cliente TEXT NOT NULL DEFAULT '';      -- hogar, minimarket o empresa
