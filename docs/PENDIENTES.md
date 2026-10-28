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
- [ ] Respaldo con IA: aplicar la migración `0002_uso_llm.sql` en D1, crear la clave en Groq, cargarla como `GROQ_API_KEY` y probar una llamada real (D24).
- [ ] Agregar la fila `BOT_ACTIVO` = `SI` en la hoja CONFIGURACION (la planilla real no se tocó sin permiso).
- [x] Cuenta de Groq a nombre de Brunen, plan gratis sin tarjeta y retención de datos cero activada (D23).
- [ ] Cargar la lista oficial de feriados de Chile en la hoja FERIADOS de la planilla (Fecha YYYY-MM-DD y Nombre).
- [ ] La clave JSON de Google quedó en la carpeta Descargas del computador: guardarla en un lugar seguro fuera del proyecto o borrarla (ya está en Cloudflare y se puede generar otra).
- [x] Versión de la Graph API: v25.0 (D18).
- [x] Base D1 `brunen-chatbot` creada, migrada y activa (D20).
- [x] Token permanente (usuario del sistema `bot-brunen`, sin vencimiento) cargado en Cloudflare el 2026-10-28.
- [ ] Revisar disponibilidad de coexistencia en Chile si el dueño la elige.
