# Conocimiento del proyecto — Chatbot Brunen SpA
Fuente de verdad del negocio. Se actualiza al cierre de cada sesión.
Última actualización: 2026-10-28

> Datos sensibles (cuenta bancaria, teléfono de Constanza, teléfonos de clientes) NO se guardan en este repo:
> viven en la hoja CONFIGURACION / CLIENTES de la planilla. Aquí solo se indica dónde están.

---

## 1. Negocio
- Empresa: Brunen SpA · Pudahuel, Santiago. Giro: captación, tratamiento y distribución de agua.
- Web: www.brunen.cl · Instagram: @brunenlife
- Venta hoy: 100% por WhatsApp. Una persona recibe el pedido, lo agenda, recibe el comprobante y se despacha.
- Volumen: 15 a 20 clientes por día; **máximo ~50 solicitudes diarias**. Más ~20 empresas con plan mensual.
- Operación: 1 vehículo y 1 repartidor, más uno de emergencia. Falla operativa cada ~2 meses (se avisa a los clientes).
- Rutas: Excel + app "Optiroute" (PENDIENTE confirmar si es OptimoRoute).

## 2. Catálogo y precios (todos los bidones son retornables)
| Producto | Cantidad | Precio |
|---|---|---|
| Bidón 20 L | 1 | $4.500 |
| Bidón 20 L | 2 a 3 | $3.300 c/u |
| Bidón 20 L | 4 o más | $2.750 c/u |
| Bidón 12 L | 1 | $2.500 |
| Bidón 12 L | 2 o más | $2.400 c/u |
| Bidón 10 L | cualquiera | $2.200 c/u |
| Carga inicial (cliente sin envase) | 1 envase con carga | $5.500 |
| Carga inicial | 2 envases con carga | $10.000 |
| Mayorista (minimarket) | por bidón | $1.250 |

- Despacho gratis e incluido. Los precios no cambian por zona ni temporada.
- PENDIENTE: ¿la carga inicial aplica solo a 20 L? ¿Precio para 3+ envases?
- PENDIENTE: ¿el precio mayorista y los precios especiales aplican a 12 L y 10 L?

## 3. Orden de cálculo del precio (lo hace `src/precios.ts`, no el LLM)
1. Cliente con precio especial en CLIENTES → ese precio por bidón (hoy solo definido para 20 L).
2. Mayorista → $1.250 por bidón (hoy solo definido para 20 L).
3. Si no, tramos por tipo y cantidad.
4. Si el cliente no indicó el tipo de bidón, el bot pregunta.
5. Cliente nuevo sin envase → ofrecer carga inicial.
6. Pedidos mezclados: cada tipo por separado; se asume que los tramos NO se suman entre tipos (PENDIENTE confirmar).
7. Empresa con plan mensual → se cotiza con tramos y siempre va a revisión de Constanza.

## 4. Clientes con condiciones especiales
- Dos clientes con precio especial por bidón de 20 L ($3.500 y $3.000). Teléfonos PENDIENTES (se cargan en CLIENTES, no aquí).
- Mayoristas (minimarkets): lista PENDIENTE.
- ~20 empresas con plan mensual: condiciones PENDIENTES; el bot registra y escala.
- Casi todos los clientes piden la misma cantidad; varían los días.
- Algunos clientes piden aviso de hora aproximada de entrega.

## 5. Envases
- Control manual de envases por devolver; no se cobra; se retiran al día siguiente.
- El bot anota para el repartidor cuando el cliente tiene envases pendientes.

## 6. Horarios, cobertura y entregas
- Despacho: lunes a viernes 10:00–18:00 · sábado 10:00–15:00 · domingos y festivos no.
- Corte: pedidos **hasta las 9:00 (inclusive)** salen el mismo día; posteriores, el siguiente día de despacho (lunes a sábado sin festivos). Implementado en `src/despacho.ts`.
- Comunas (12): Ñuñoa, Macul, San Joaquín, Peñalolén, Santiago Centro, Providencia, Las Condes, Vitacura, Lo Barnechea, Recoleta, Huechuraba, La Reina.
- Cliente ausente: se llama; si no puede recibir, se reagenda al día siguiente.
- Reclamos: respuesta inmediata, solución al día siguiente; bidón defectuoso se cambia sin costo.

## 7. Pagos
- Transferencia (datos en hoja CONFIGURACION) o efectivo en la entrega.
- Puede ser antes o después de la entrega. El bot nunca bloquea un pedido por falta de pago.

## 8. Personas
- Constanza: operadora, disponible 8:00–21:00 (teléfono en CONFIGURACION). Confirma pedidos y atiende reclamos, facturas y pagos a proveedores.
- Dueño: hermano de Franco. Decide número, precios y condiciones.

## 9. Reglas del bot
1. Registra y calcula; no confirma. Constanza confirma.
2. Reclamos, facturas y pagos a proveedores: derivar de inmediato con contexto.
3. No avisa automáticamente cuando el pedido sale a despacho.
4. Cliente nuevo: ofrecer carga inicial y crear ficha.
5. Cliente con envases pendientes: anotar para el repartidor.
6. Fuera de zona: informar comunas y registrar con estado `Fuera_de_zona`.
7. Festivo o pedido posterior a las 9:00: proponer el siguiente día de despacho.
8. Audio: pedir amablemente que escriba.
9. Imagen: posible comprobante → Drive, asociar al pedido pendiente, alertar.
10. Fuera del horario de Constanza: registrar y avisar que se responderá en horario de atención.
11. Contingencia: `ESTADO_SERVICIO = reducido` agrega `MENSAJE_EXCEPCION`; `BOT_ACTIVO = NO` apaga el bot.
12. Mensajes que inicia el negocio fuera de la ventana de 24 h requieren plantillas aprobadas por Meta.
13. **Un solo mensaje saliente por pedido** (presupuesto de mensajes gratis). Diseño de confirmación por excepción PENDIENTE de aprobación del dueño.

## 10. Arquitectura (actualizada 2026-10-28)
- Canal: WhatsApp Cloud API (Meta). Número: nuevo vs. coexistencia con el actual (PENDIENTE, decide el dueño).
- Motor: código propio en **Cloudflare Workers + TypeScript** (plan gratuito). Reemplaza la idea inicial de n8n.
- Interpretación: parser por reglas + LLM de respaldo (Groq gratis). Gemini gratis descartado (usa los datos).
- Datos: Google Sheets. Memoria del bot (mensajes ya vistos, pedido a medias, último pedido): base D1 de Cloudflare. Alertas a Constanza: Telegram. Comprobantes: dónde guardarlos está por decidir (D30; Drive con la cuenta de servicio no sirve). Monitoreo: UptimeRobot → `/salud`.
- Flujo: webhook → validar firma → 200 inmediato → deduplicar → revisar `BOT_ACTIVO` → buscar cliente → según tipo:
  - Texto: juntar los mensajes seguidos → parser (→ LLM si hace falta) → pedido / pregunta frecuente / escalamiento. Lo dudoso se anota igual y se manda a revisión; al cliente no se le promete.
  - Imagen: comprobante → PAGOS + alerta. Audio u otro: pedir texto.

## 11. Google Sheets (un archivo)
- PEDIDOS: ID_Pedido, Fecha_Hora, Telefono, Nombre, Producto, Cantidad, Precio_Unitario, Total, Fecha_Entrega_Solicitada, Fecha_Entrega_Confirmada, Estado, Comuna, Direccion, Notas_Repartidor, Envases_A_Retirar, Confirmado_Por, Observaciones
- CLIENTES: Telefono (clave), Nombre, Direccion, Comuna, Tipo (normal/mayorista/empresa/especial), Precio_Especial_20L, Envases_Pendientes, Primera_Compra, Aviso_Hora, Credito (PENDIENTE: qué significa), Fecha_Ultimo_Pedido, Total_Pedidos, Notas, Estado (activo/bloqueado; PENDIENTE: qué hace el bot con bloqueados)
- PRECIOS (reemplaza a PRODUCTOS): Tipo, Desde, Hasta, Precio
- PAGOS: ID_Pago, Fecha_Hora, Telefono, ID_Pedido, Monto, Banco_Origen, URL_Comprobante, Estado, Verificado_Por
- CONFIGURACION: Variable, Valor, Descripción
- FERIADOS: Fecha (YYYY-MM-DD), Nombre
- RUTA_DEL_DIA, DASHBOARD, ERRORES, MENSAJES_PROCESADOS (deduplicación por wamid)
- Estados de pedido: Pendiente_Confirmacion → Confirmado → En_Ruta → Entregado. Alternos: Reprogramado, Cancelado, Fuera_de_zona. Pago aparte: Sin_Pago, Pago_Recibido, Pago_Verificado, Pagara_Contra_Entrega.

## 12. Textos del bot
Ver borradores en la sección 12 del documento del proyecto. Regla: una sola respuesta por mensaje del cliente, cercana y breve.

## 13. Prioridades (dolores del dueño)
1. Dejar de cargar a mano los clientes en la base del día siguiente.
2. Entregar al repartidor la lista del día en formato copiable a la app de rutas.
3. Responder rápido cuando un cliente hace un pedido.

## 14. Costos verificados (2026-10-27; fuentes en DECISIONES.md)
- WhatsApp: 1.000 mensajes de servicio gratis por número al mes; luego USD 0,02 c/u en Chile. Marketing USD 0,0889. Exige método de pago registrado en Meta.
- Con ~520 pedidos/mes y 1 mensaje por pedido: USD 0. Peor caso (50 pedidos diarios todos los días, ~1.300/mes): ~USD 6/mes.
- Cloudflare Workers gratis: 100.000 solicitudes/día, 10 ms de CPU por invocación.
- Groq gratis: no entrena ni retiene datos por defecto.
- Ley 21.719 de datos personales: vigencia 1-dic-2026 (proyecto para postergar a 2027).
