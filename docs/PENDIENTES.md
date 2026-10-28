# Pendientes

## Decide el dueño
- [ ] Número: comprar SIM nuevo o usar coexistencia con el WhatsApp Business actual.
- [ ] Confirmación por excepción (1 mensaje por pedido, USD 0) o doble mensaje (~USD 4/mes).
- [ ] Registrar un método de pago en Meta (obligatorio aunque no se cobre).
- [ ] ¿Carga inicial solo 20 L? ¿Precio para 3+ envases?
- [ ] ¿Precio mayorista y precios especiales para 12 L y 10 L?
- [ ] ¿Los tramos se suman entre tipos de bidón? (hoy se asume que no)
- [ ] Condiciones de las ~20 empresas con plan mensual.
- [ ] ¿El bot pregunta si el cliente tiene envases vacíos para devolver?
- [ ] ¿El bot deriva las boletas a una persona o solo las facturas? (hoy se derivan ambas, como las facturas).
- [ ] Cantidad máxima razonable por pedido (el intérprete acepta hasta 999; sin tope, un error de tipeo se cotiza igual).

## Datos por conseguir
- [ ] Excel de clientes (cargar CLIENTES, marcar mayoristas y especiales). No subirlo al repo.
- [ ] Teléfonos de los dos clientes con precio especial.
- [ ] Confirmar si "Optiroute" es OptimoRoute y conseguir un archivo de importación de ejemplo.
- [ ] Qué significa la columna `Credito` y qué hace el bot con clientes `bloqueado`.
- [ ] ¿Constanza acepta recibir alertas por Telegram?
- [ ] Mensajes reales de clientes, anonimizados, para ampliar `tests/mensajes.json`: es lo que más mejora el parser.
- [ ] Preguntar a Constanza si acepta que su nombre y horario figuren en el repo público (`docs/conocimiento_brunen.md`, sección 8).

## Técnicos
- [x] Versión de la Graph API: v25.0 (D18).
- [ ] Crear la base D1 `brunen-chatbot`, activar su bloque en `wrangler.toml` y desplegar (D20). Pide confirmación: crea un recurso en Cloudflare.
- [ ] Mientras no haya token permanente: el token temporal vence cada 24 h. Generar uno nuevo en API Setup y cargarlo con `npx wrangler secret put WHATSAPP_TOKEN` (y actualizar `.dev.vars` si se prueba en local).
- [ ] Token permanente (System User) antes de producción; el de API Setup dura 24 h.
- [ ] Revisar disponibilidad de coexistencia en Chile si el dueño la elige.
