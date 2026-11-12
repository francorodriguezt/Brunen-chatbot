# Conocimiento del proyecto — Chatbot Brunen SpA
Fuente de verdad del negocio. Se actualiza al cierre de cada sesión.
Última actualización: 2026-11-11

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
- Respuestas del dueño (2026-10-29): carga inicial de 20 L, desde 3 envases a $5.000 cada uno (precio promocional vigente). Carga inicial de 12 L y 10 L: 1 envase $4.500, 2 envases $8.000.
- Mayorista (respuesta del dueño, 2026-10-29): recarga de 12 L y 10 L a $1.100 cada una; carga inicial mayorista de 20 L a $3.250 y de 12 L y 10 L a $2.000. Es nuestra lectura de su respuesta: confirmar que $3.250 y $2.000 son por envase.
- PENDIENTE: carga inicial de 12 L y 10 L desde 3 envases.
- PENDIENTE: ¿los precios especiales ($3.500 y $3.000 por 20 L) valen para 12 L y 10 L? El dueño no lo respondió.

## 3. Orden de cálculo del precio (lo hace `src/precios.ts`, no el LLM)
1. Cliente con precio especial en CLIENTES → ese precio por bidón (hoy solo definido para 20 L; PENDIENTE si vale para 12 L y 10 L).
2. Mayorista → recarga a $1.250 por bidón de 20 L y a $1.100 por bidón de 12 L o 10 L; carga inicial a $3.250 (20 L) o $2.000 (12 L y 10 L).
3. Si no, tramos por tipo y cantidad.
4. Si el cliente no indicó el tipo de bidón, el bot pregunta.
5. Cliente nuevo sin envase → ofrecer carga inicial.
6. Pedidos mezclados: cada tipo por separado; los tramos NO se suman entre tipos (confirmado por el dueño el 2026-10-29: 1 de 20 L y 1 de 12 L se cobran $4.500 y $2.500).
7. Empresa con plan mensual → cada empresa tiene su propia condición: siempre se deriva a Constanza; el bot cotiza con tramos solo como referencia (confirmado por el dueño el 2026-10-29).

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
4. Cliente nuevo: se anota el pedido y el bot le pide su nombre y su dirección con comuna y, si es departamento, el edificio y el número (D37). No se le promete precio ni fecha; una persona confirma el pedido y las condiciones de envases (carga inicial).
5. Cliente con envases pendientes: anotar para el repartidor.
6. Fuera de zona: informar comunas y registrar con estado `Fuera_de_zona`.
7. Festivo o pedido posterior a las 9:00: proponer el siguiente día de despacho.
8. Audio: el bot no responde. Los audios los responde siempre Constanza (dueño, 2026-10-29); el bot solo deja un aviso en el panel.
9. Imagen: posible comprobante → Drive, asociar al pedido pendiente, alertar.
10. Fuera del horario de Constanza: registrar y avisar que se responderá en horario de atención.
11. Contingencia: `ESTADO_SERVICIO = reducido` agrega `MENSAJE_EXCEPCION`; `BOT_ACTIVO = NO` apaga el bot.
12. Mensajes que inicia el negocio fuera de la ventana de 24 h requieren plantillas aprobadas por Meta.
13. **Un solo mensaje saliente por pedido** (presupuesto de mensajes gratis). Aprobado por el dueño el 2026-10-29 (opción A: Constanza escribe solo si algo cambia).
14. Cliente bloqueado: lo atiende una persona y el pedido no se anota (dueño, 2026-10-29). Facturas, boletas y empresas con plan mensual: siempre una persona.
15. Número compartido con la app (D46): si una persona le escribe a un cliente desde la app, el bot no le responde durante una hora (configurable) y, si el cliente quedó sin respuesta, deja un aviso en el panel.
16. Dirección en la respuesta (D55): cuando el bot conoce la dirección del cliente, la respuesta del pedido dice "Entrega en: …" e invita a escribir la nueva si cambió; ese mensaje llega a una persona.

## 10. Arquitectura (actualizada 2026-10-28)
- Canal: WhatsApp Cloud API (Meta). Número: el dueño eligió el actual con coexistencia (2026-10-29). Según la documentación oficial de Meta (revisada el 2026-10-29), el alta de coexistencia pasa por un Tech Provider o Solution Partner y exige la app WhatsApp Business 2.24.17 o superior; confirmado el 2026-11-10 que no se puede hacer directo (D45): como el número se mantiene, hay que elegir entre un proveedor autorizado o que Brunen sea su propio Tech Provider; un número nuevo queda solo como último recurso. Con coexistencia se desactivan las listas de difusión y hay que abrir la app al menos cada 14 días.
- Motor: código propio en **Cloudflare Workers + TypeScript** (plan gratuito). Reemplaza la idea inicial de n8n.
- Interpretación: parser por reglas + LLM de respaldo (Groq gratis). Gemini gratis descartado (usa los datos).
- Datos: los pedidos y los avisos viven en la base D1 de Cloudflare, junto con la memoria del bot (mensajes ya vistos, pedido a medias, último pedido); Google Sheets sigue para CLIENTES, PRECIOS, CONFIGURACION y FERIADOS (D32, D33). Respaldo de D1: Time Travel (7 días) y una exportación semanal guardada fuera del repositorio (D35).
- Panel de administración propio (un Worker aparte, detrás de Cloudflare Access: D34) para que Constanza y el dueño vean, confirmen y cambien pedidos y avisos. Telegram queda solo para lo muy urgente (reclamos y fallas del sistema). Desde el 2026-11-10 el panel también arma el reparto del día, listo para copiar o descargar, y permite anotar a mano los pedidos que no llegan por el bot (D42).
- Comprobantes: se guardarán en D1 por 60 días y se verán en el panel (D30, D32; Drive con la cuenta de servicio no sirve). Monitoreo: UptimeRobot → `/salud`. Además, una tarea programada (el vigía, D43) deja un aviso si un mensaje quedó sin atender y revisa cada mañana el token de WhatsApp y la planilla.
- Flujo: webhook → validar firma → 200 inmediato → deduplicar → revisar `BOT_ACTIVO` → buscar cliente → según tipo:
  - Texto: juntar los mensajes seguidos → parser (→ LLM si hace falta) → pedido / pregunta frecuente / escalamiento. El pedido y su aviso quedan en D1. Lo dudoso se anota igual y se manda a revisión; al cliente no se le promete.
  - Imagen: posible comprobante → aviso en el panel (guardar la imagen y anotar en PAGOS: Etapa 6). Audio u otro: pedir texto.

## 11. Google Sheets (un archivo)
> Desde D33 los pedidos y los avisos viven en D1 y el panel los lee y los cambia; las columnas de PEDIDOS de abajo quedan como formato de referencia y para un espejo futuro en la planilla.

- PEDIDOS: ID_Pedido, Fecha_Hora, Telefono, Nombre, Producto, Cantidad, Precio_Unitario, Total, Fecha_Entrega_Solicitada, Fecha_Entrega_Confirmada, Estado, Comuna, Direccion, Notas_Repartidor, Envases_A_Retirar, Confirmado_Por, Observaciones
- CLIENTES: Telefono (clave), Nombre, Direccion, Comuna, Tipo (normal/mayorista/empresa/especial), Precio_Especial_20L, Envases_Pendientes, Primera_Compra, Aviso_Hora, Credito (PENDIENTE: qué significa), Fecha_Ultimo_Pedido, Total_Pedidos, Notas, Estado (activo/bloqueado; PENDIENTE: qué hace el bot con bloqueados)
- PRECIOS (reemplaza a PRODUCTOS): Tipo, Desde, Hasta, Precio
- PAGOS: ID_Pago, Fecha_Hora, Telefono, ID_Pedido, Monto, Banco_Origen, URL_Comprobante, Estado, Verificado_Por
- CONFIGURACION: Variable, Valor, Descripción
- FERIADOS: Fecha (YYYY-MM-DD), Nombre
- RUTA_DEL_DIA, DASHBOARD, ERRORES, MENSAJES_PROCESADOS (deduplicación por wamid)
- Estados de pedido: Pendiente_Confirmacion → Confirmado → En_Ruta → Entregado. Alternos: Reprogramado, Cancelado, Fuera_de_zona. Pago aparte: Sin_Pago, Pago_Recibido, Pago_Verificado, Pagara_Contra_Entrega.

## 12. Textos del bot
Ver borradores en la sección 12 del documento del proyecto. Regla: una sola respuesta por mensaje del cliente, cercana y breve. Textos y tono aprobados por el dueño el 2026-10-29, sin cambios.

## 13. Prioridades (dolores del dueño)
1. Dejar de cargar a mano los clientes en la base del día siguiente.
2. Entregar al repartidor la lista del día en formato copiable a la app de rutas.
3. Responder rápido cuando un cliente hace un pedido.

Lo que el dueño quiere ver en el panel (2026-10-29): pedidos por confirmar (confirmarlos o cambiarlos con un toque), lista del día para el repartidor ordenada por comuna y lista para copiar, clientes por comuna y en un mapa, bidones entregados por día, semana y mes, envases pendientes de retiro por cliente y comprobantes de pago por revisar. No pidió ventas en pesos, clientes que dejaron de pedir ni reclamos abiertos. Usarán el panel Constanza y el dueño, más Franco para mantenerlo; el dueño también quiere los avisos urgentes por Telegram.

## 14. Costos verificados (2026-10-27; fuentes en DECISIONES.md)
- WhatsApp: 1.000 mensajes de servicio gratis por número al mes; luego USD 0,02 c/u en Chile. Marketing USD 0,0889. Exige método de pago registrado en Meta.
- Con ~520 pedidos/mes y 1 mensaje por pedido: USD 0. Peor caso (50 pedidos diarios todos los días, ~1.300/mes): ~USD 6/mes.
- Cloudflare Workers gratis: 100.000 solicitudes/día, 10 ms de CPU por invocación.
- Groq gratis: no entrena ni retiene datos por defecto.
- Ley 21.719 de datos personales: vigencia 1-dic-2026. El Senado aprobó en primer trámite (28-oct-2026) un proyecto que la posterga a 2027; mientras no sea ley, vale el 1-dic-2026 (D45).

## 15. Turno de reparto (lo describió Franco el 2026-10-28; falta confirmarlo con el dueño y el repartidor)
1. El repartidor llega a la planta.
2. Le dicen cuántos bidones debe sacar para cuántos puntos; la cantidad de bidones puede variar de un punto a otro.
3. Reparte en cada punto y retira los bidones vacíos. Si faltan vacíos (por ejemplo, el cliente pidió 3 y solo tiene 2 para entregar), se debe avisar y justificar el faltante.
4. Al terminar de entregar, pasa una de dos cosas: le piden que vaya a dejar los vacíos y deje el furgón en la planta, o que se lleve el furgón y vaya al día siguiente a dejar los vacíos que quedaron en él.
- Idea de Franco: al empezar el día, generar la ruta de direcciones lo más óptima posible, "de más cerca a más lejos de la planta de agua y de vuelta".
- Hoy el panel (pestaña Reparto, `src/reparto.ts`, D42) arma la lista del día ordenada por comuna y dirección, con la carga del furgón y los envases por retirar, y deja la optimización a la app de rutas (columnas provisionales).
- El dueño (audios que le mandó a Franco, 2026-10-29): si el repartidor termina temprano, deja el furgón estacionado en el lugar del dueño (confirmar si es la planta); si termina cerca de las 18:00, carga al día siguiente. El dueño lleva el control de los bidones que sobran del turno y al día siguiente le dice cuántos sacar (ejemplo: saca 60, sobran 5, al día siguiente saca 55). Eso debería poder hacerse en el panel.
- Lo que más le interesa al dueño: tener el Excel de los pedidos listo y ordenado, subirlo a la plataforma, que el repartidor use la plataforma, que él y Constanza le hagan seguimiento desde ahí y que la plataforma le entregue punto por punto lo que debe repartir.
- Franco aclaró (2026-10-29): hoy usan Optiroute y con él ven punto por punto dónde va el repartidor, su ubicación en vivo y cuánto demora de un punto a otro. Lo que se busca es crear una plataforma propia que haga las mismas funciones: la ruta con los puntos de la forma más eficiente posible y el seguimiento en vivo del repartidor (D38).
- Franco pidió que el bot pregunte el nombre, la dirección y, si es un departamento, el edificio, (hecho, D37), y que dé una referencia de la hora de llegada según la programación de la ruta (por diseñar con la plataforma propia, D38).
- PENDIENTE: nombre exacto y plan de Optiroute (¿es OptimoRoute?) y qué funciones usan; el archivo que suben hoy y quién lo arma; si los sobrantes siempre quedan en el furgón y si la carga lleva margen; qué pasa con un vacío que falta después de justificarlo; a quién se le da la hora de llegada y por qué canal; dirección de la planta (la ruta parte y termina ahí).

## 16. Segundo cuestionario a Felipe y Constanza (2026-11-10, lo recogió Franco)
Confirmado:
- El historial de pedidos vive en un Excel con: fecha de entrega, nombre, dirección, comuna, teléfono, tipo de cliente (hogar, minimarket o empresa), cantidad, tamaño (10, 12 o 20 L), precio, tipo de pago, si pide factura y estado del pago (pagado o pendiente). Falta revisar el archivo real: puede haber cantidad y tamaño duplicados o mezclados.
- Un cliente puede cambiar de dirección. Hoy se recupera buscando su último pedido. Debe conservarse el historial de direcciones y no asignar una antigua si hay duda de cuál vale.
- Del Excel principal sale otro Excel que se importa a la plataforma de rutas; su exportación trae datos que sobran, se limpia a mano, se pasa a Word y se le envía al repartidor una instrucción por vez.
- El furgón carga como máximo 65 bidones. Si el pedido del día supera eso, se usa una segunda planta (Actum, en Las Condes). Falta saber cuántos bidones de cada tamaño caben y la carga máxima permitida (65 bidones de 20 L pesan más de 1,3 toneladas solo en agua).
- Jornada: el repartidor retira el furgón donde se guarda, carga en la planta, reparte, vuelve a la planta a dejar los vacíos y devuelve el furgón.
- Felipe quiere ver la ubicación del repartidor en vivo, con los puntos entregados y pendientes. Avisos urgentes por Telegram. Constanza usará el panel en computador y celular. La cuenta administrativa será el correo de Brunen.
- Carga inicial (texto original): "10L: 4000 · 12L: 4500 y 2X8000". La promoción de 2 por $8.000 va escrita junto a los 12 L.
- El Excel del día siguiente se va armando el mismo día (el día anterior al reparto).
- La hoja del repartidor que arman hoy trae, por parada: nombre, dirección con comuna, teléfono, pedido ("15 de 20lts") y forma de pago; si paga en efectivo, el monto a cobrar. No trae el tipo de cliente, y debería.
- Cuando la ruta está lista se le avisa al repartidor, que la inicia desde la aplicación de la plataforma de rutas en su celular; desde ahí se ve en vivo dónde está y los puntos. Felipe necesita seguir viéndolo sí o sí, sobre todo para responderle a un cliente cuándo llega su pedido; Franco quiere que el bot pueda dar esa respuesta.
- Constanza recibe los avisos urgentes por Telegram.
- Franco quiere hacer por su cuenta todo lo posible en Meta: la gestión y los documentos.

Contradicciones y huecos (por resolver antes de construir):
- Carga inicial de 10 L: el cuestionario dice $4.000; el dueño dijo $4.500 para 12 L y 10 L (2026-10-29), y así está en `src/precios.ts`. No se cambia hasta confirmar.
- Tipos de cliente: el Excel usa hogar, minimarket y empresa; el sistema usa normal, mayorista, empresa y especial. Hogar sería normal y minimarket sería mayorista (a confirmar). "Especial" es una condición de precio, no un tipo.
- La tabla de pedidos no guarda tipo de pago, estado de pago ni si pide factura, que el Excel sí tiene.
- Dirección de inicio y fin de la ruta: el negocio figura en Pudahuel y el cuestionario habla de otra planta.
- Rastreo (2026-11-11): el repartidor usa hoy la aplicación de la plataforma de rutas y ahí se le ve en vivo. Franco quiere dejar esa plataforma (D49): el seguimiento propio será "en la medida que se pueda" y la plataforma no se cancela hasta haber probado el reemplazo.
- El Word (aclarado por Franco el 2026-11-11): no se le envía un Word al repartidor. Del Excel que exporta la plataforma se saca lo importante de cada parada y se ordena en un Word; desde ahí Constanza le escribe al repartidor por WhatsApp, un mensaje por parada, numerados en el orden de la ruta (la más eficiente en tiempo). El repartidor se guía por esos mensajes; la aplicación de la plataforma sirve sobre todo para verlo en vivo. Lo que Franco quiere: que el sistema deje esos mensajes listos para enviar o, si se puede, que los envíe.
- La plataforma de rutas no tiene API (lo confirmó Franco el 2026-11-11): los pedidos entran por archivo y la ruta sale por archivo.
- Cómo se arma el reparto de mañana (Franco, 2026-11-11): con los pedidos que van llegando hoy más los que ya estaban agendados para ese día (alguien pide el lunes para el miércoles). Falta aclarar si eso deja sin efecto el corte de las 9:00 con entrega el mismo día de la sección 6.
- El celular del repartidor: no se sabe si es de la empresa o personal, ni si es Android o iPhone. Cambia cómo se pide su consentimiento para el rastreo.

## 17. Lo que muestran los archivos reales (2026-11-11; solo totales, calculados con el anonimizador, D47)
**Excel de control de pedidos** (hoja PEDIDOS, 6.865 filas, de diciembre de 2024 a diciembre de 2026; algunas fechas son erróneas o futuras):
- Columnas: Fecha, Cliente, Dirección, Comuna, Contacto (es el teléfono), Tipo de cliente, Pedido (la cantidad), "20L - 12L" (el tamaño), Monto, Forma de pago, Boleta - Factura, Estado, N° de factura, Comentarios e Importante. Tiene además otras hojas: CONTROL EFECTIVO, CONTROL BIDONES, CUOTAS y DETALLE HOTEL (falta saber qué controla cada una).
- Una fila por pedido, con un solo tamaño. Los pedidos mezclados son raros (3 casos de mismo cliente y mismo día con tamaños distintos).
- 653 clientes y 595 teléfonos. 90 clientes cambiaron de dirección (14 %). 61 teléfonos aparecen con más de un nombre y 19 nombres con más de un teléfono: la identidad del cliente no puede ser solo el teléfono ni solo el nombre. El 99 % de los teléfonos viene con 11 dígitos (569 más 8).
- Tamaño: 20 L el 95 % de las filas (6.501), 12 L 209, 10 L 136. Cantidad por pedido: mediana 4, máximo 50. El tamaño se escribe de más de 15 formas ("20Lts", "20lts", "12 y 20"...).
- Forma de pago: transferencia 73 %, efectivo 19 %, Redcompra 4 %, Webpay 3 %, y unos pocos "plan", "abono", "debe". La columna trae montos y palabras mezclados.
- Volumen: unas 14 filas por día (máximo 30), de lunes a sábado. **Los bidones por día tienen mediana 67 y máximo 180: en 267 de 504 días se pasa de los 65 que caben en el furgón.** Recargar y hacer más de una carga en el día es lo normal, no la excepción.
- Faltan datos: 178 filas sin monto, 30 sin teléfono, 20 con fecha ilegible, y la mayoría de las facturas sin completar (78 % vacío en Boleta - Factura).

**Plantilla de importación de la plataforma de rutas** (17 columnas): nombre, dirección, departamento, extra, comuna, correo, teléfono, demanda, referencia_pedido, proveedor, habilidades, latitud, longitud, ventana_inicio, ventana_termino, tiempo_entrega, prioridad. "demanda" parece ser la cantidad de bidones. Hoy se suben nombre, dirección, departamento, comuna, teléfono y demanda; el resto va vacío.

**Formato del Word del repartidor**, por parada, en cuatro líneas: número y nombre; dirección con comuna y notas (portería, departamento); teléfono; cantidad ("15 de 20lts") y, si paga en efectivo, el monto ("*efectivo 4.500*"). Se escribe a mano, y a veces falta el teléfono.
