# Decisiones

Formato: fecha · estado (Tomada / Propuesta / Descartada) · contexto · decisión · motivo · fuente.

---

### D1 · 2026-10-27 · Tomada (reversible)
**Motor: código propio en Cloudflare Workers + TypeScript, en lugar de n8n.**
- Contexto: objetivo de costo $0. n8n Cloud cuesta ~USD 24/mes; n8n en Oracle Free tiene riesgo de falta de capacidad y de reclamo de instancias inactivas.
- Motivo: Workers gratis da 100.000 solicitudes/día y 10 ms de CPU por invocación (esperar respuestas de red no cuenta como CPU). Siempre encendido, sin servidor que mantener. Permite pruebas automáticas del cálculo de precios y fechas.
- Alternativa si se prefiere Python: Google Cloud Run (gratis hasta 2M solicitudes/mes; requiere tarjeta).
- Fuentes: https://developers.cloudflare.com/workers/platform/pricing/ · https://developers.cloudflare.com/workers/platform/limits/

### D2 · 2026-10-27 · Tomada
**API oficial de WhatsApp (Cloud API). Descartadas librerías no oficiales (Baileys, whatsapp-web.js).**
- Motivo: violan los términos de WhatsApp y arriesgan el bloqueo del número; Brunen vende el 100% por ese canal.
- Fuente de costos: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing (tarifas desde 1-oct-2026: servicio USD 0,02 en Chile tras 1.000 gratis por número/mes).

### D3 · 2026-10-27 · Tomada
**Validar firma X-Hub-Signature-256, responder 200 de inmediato y procesar en segundo plano.**
- Motivo: el webhook es público; sin firma cualquiera puede inyectar pedidos. Meta reintenta si no recibe 200 a tiempo, lo que genera duplicados.

### D4 · 2026-10-27 · Descartada
**Google Apps Script como receptor del webhook.**
- Motivo: responde los POST con una redirección 302 a otro dominio; en otros servicios esto provoca fallos o reintentos duplicados. Sí sirve para tareas programadas sobre la planilla.

### D5 · 2026-10-27 · Propuesta (pendiente aprobación del dueño)
**Un solo mensaje saliente por pedido, con confirmación por excepción.**
- Motivo: mantenerse bajo los 1.000 mensajes gratis. Constanza confirma internamente y solo escribe si algo cambia. Alternativa: 2 mensajes por pedido (~USD 4/mes).

### D6 · 2026-10-27 · Propuesta
**Interpretación: parser por reglas primero; LLM de respaldo con Groq (plan gratuito).**
- Motivo: la mayoría de los pedidos son repetitivos; reglas = gratis y testeable. Groq no entrena ni retiene datos por defecto. Gemini gratis descartado porque usa los datos para mejorar productos.
- Fuente: https://console.groq.com/docs/your-data

### D7 · 2026-10-27 · Propuesta
**Alertas a Constanza por Telegram.** Gratis y sin ventana de 24 h; por WhatsApp cada alerta consume el cupo gratuito.

### D8 · 2026-10-27 · Tomada
**Google Sheets como base de datos del MVP.** Volumen muy por debajo de los límites de la API (60 solicitudes/min por usuario). Revisar si aparecen errores 429 frecuentes o >2.000 pedidos/mes.
- Fuente: https://developers.google.com/sheets/api/limits

### D9 · 2026-10-27 · Tomada
**Datos sensibles fuera del repo.** Cuenta bancaria, teléfonos de Constanza y clientes viven en la planilla (CONFIGURACION, CLIENTES), no en `docs/`.

### D10 · 2026-10-27 · Tomada
**Aprobar los scripts de instalación de esbuild y workerd (`allowScripts` en `package.json`).**
- Contexto: npm 11 bloquea los `postinstall` de paquetes no aprobados; sin ellos no se descargan los binarios de esbuild y workerd, y `npm run dev` / `npm run deploy` fallan.
- Motivo: son dependencias directas de wrangler (Cloudflare). La aprobación queda fija a la versión exacta: si se actualizan, npm vuelve a pedirla y se revisa de nuevo.
- Fuente: aviso de `npm install` (npm 11.19.1) y `npm install-scripts ls`.

### D11 · 2026-10-27 · Reemplazada por D14
**Repositorio público en GitHub (github.com/francorodriguezt/Brunen-chatbot), como portafolio de Franco.**
- Contexto: el dueño autorizó publicar. Los documentos incluyen datos comerciales (precios, comunas, volumen) pero no secretos.
- Reglas que se mantienen: tokens solo en `.dev.vars` / `wrangler secret`; datos reales de clientes, cuenta bancaria y teléfonos nunca entran al repo (D9). Revisar el diff antes de cada push.

### D12 · 2026-10-27 · Tomada
**CI con GitHub Actions (`.github/workflows/check.yml`) que corre `npm ci` + `npm run check` en cada push a `main` y en cada pull request.**
- Motivo: detectar una prueba rota antes de desplegar, sin depender de acordarse de correr `npm run check`. Gratis en repos públicos. No usa secretos.

### D13 · 2026-10-27 · Tomada
**Scripts locales `verificar-config` y `simular-mensaje` en `scripts/`.**
- Motivo: probar la configuración y el webhook firmado sin esperar a Meta, y sin exponer `.dev.vars`: los scripts nunca imprimen valores.

### D14 · 2026-10-27 · Reemplazada por D15
**Repositorio privado en GitHub hasta que el proyecto esté listo; luego se vuelve público como portafolio.**
- Contexto: Franco prefiere mostrarlo terminado. Reemplaza a D11.
- Antes de volver a publicarlo: revisar los datos comerciales y el nombre de la operadora en `docs/`, y que no haya secretos en el historial.
- Efecto en el CI: en repos privados, GitHub Actions descuenta minutos del cupo gratuito de la cuenta; cada corrida de `check` dura alrededor de 1 minuto.

### D15 · 2026-10-27 · Tomada
**Repositorio público desde hoy: Franco lo publicó antes de terminar el proyecto.** Reemplaza a D14.
- Revisión hecha después de publicar: sin secretos ni archivos sensibles en todo el historial (búsqueda de tokens de Meta, claves de Groq y Telegram, llaves privadas y App Secrets). Los teléfonos de las pruebas son ficticios.
- Pendiente de decidir (no es un riesgo de seguridad): el nombre completo y el horario de Constanza en `docs/conocimiento_brunen.md` (sección 8) y el correo personal de Franco en los commits. Quitarlos de los archivos no los borra del historial; borrarlos del historial exige reescribirlo y forzar el push.
- 2026-10-28: por pedido de Franco se quitó el apellido de Constanza de `docs/conocimiento_brunen.md`; sigue en el historial de git. Lo que ella responda (pregunta 14 del cuestionario) define si además se reescribe el historial.
- Efecto en el CI: en repos públicos GitHub Actions es gratis, así que ya no aplica el aviso de minutos de D14.

### D16 · 2026-10-27 · Tomada
**Intérprete por reglas (`src/interprete.ts`): sin red ni LLM, con un contrato JSON compartido con el LLM de respaldo.**
- Contrato: `Interpretacion` usa las claves de `tests/mensajes.json` (snake_case: `fecha_texto`, `comuna_mencionada`, `tipo_pregunta`), las mismas que se le pedirán a Groq; así las dos salidas pasan por la misma validación.
- Orden de decisión: reclamo, factura o proveedor se escalan a una persona; luego "lo de siempre", preguntas (precio, zona, horario, pago), pedido, aviso de pago, saludo y cierre. Lo que no calza queda `desconocido` y lo toma el LLM.
- Solo extrae: no calcula precios ni fechas de entrega (principio 1). La fecha se devuelve como texto ("mañana", "viernes"). "En la mañana" no es el día siguiente.
- Los mensajes que solo cierran ("gracias", "ok") se reconocen para no responderlos: cada respuesta gasta el cupo de mensajes gratis (D5).
- "Bidón de 20" es 1; "bidones de 20" no dice cuántos (`cantidad: null`, se pregunta). Si repite un tipo, suma.
- Las otras 40 comunas de la Región Metropolitana son un dato geográfico público, solo para reconocer pedidos fuera de zona (regla 6). Las 12 atendidas vienen de `conocimiento_brunen.md`.
- PENDIENTE (dueño): hoy las boletas se derivan igual que las facturas. Ver `docs/PENDIENTES.md`.
- Para la Etapa 4: los clientes mandan el pedido en varios mensajes seguidos ("2 bidones" y después "de 20"). Hay que juntar los mensajes recientes del mismo número antes de interpretar, para responder una sola vez.

### D17 · 2026-10-27 · Tomada
**Activar Workers Logs (`[observability] enabled = true` en `wrangler.toml`).**
- Motivo: ver en el panel de Cloudflare los errores del Worker (token vencido, Meta rechaza un envío) sin tener `wrangler tail` abierto. Los logs ya enmascaran los teléfonos (`enmascararTelefono`).
- Límites verificados hoy en la documentación de Cloudflare: plan gratis con 200.000 eventos de log por día y 3 días de retención; muestreo del 100 % por defecto. Revisar si el volumen se acerca al tope.
- Fuente: https://developers.cloudflare.com/workers/observability/logs/workers-logs/

### D18 · 2026-10-28 · Tomada
**Graph API v25.0 en `wrangler.toml`.**
- Fuente: la pantalla "Paso 1. Pruébalo" (API Setup) de la app Brunen Chatbot en developers.facebook.com, que usa `https://graph.facebook.com/v25.0/...` en su ejemplo. Visto el 2026-10-28.
- Meta da unos 2 años de vida a cada versión: revisar el aviso de fin de vida y subir de versión antes de que venza.

### D19 · 2026-10-28 · Tomada
**La app debe estar suscrita a la cuenta de WhatsApp (WABA) para recibir los webhooks.**
- Síntoma: URL y verify token del webhook bien configurados, pero ningún mensaje llegaba al Worker.
- Causa: la cuenta de prueba solo estaba suscrita a una app interna de Meta ("WA DevX Webhook Events 1P App"), no a Brunen Chatbot. Se vio con `GET /{WABA_ID}/subscribed_apps`.
- Arreglo: `POST /{WABA_ID}/subscribed_apps` con el token de la app (HTTP 200, `{"success":true}`). Desde ese momento empezaron a llegar los avisos.
- Para el número definitivo (Etapa 7): repetir la suscripción en su cuenta de WhatsApp.
- Primera prueba sin respuesta: Meta aceptó el envío (200) pero el texto libre solo se entrega si el destinatario escribió al número en las últimas 24 h. Se confirmó cuando el mensaje llegó después de escribirle al número de prueba. Con clientes reales no pasa: el cliente siempre escribe primero.

### D20 · 2026-10-28 · Tomada
**Deduplicar mensajes en D1 (base de Cloudflare), no en Google Sheets.** D8 se mantiene para los datos del negocio (pedidos, clientes).
- Motivo: Meta puede reintentar dos veces casi a la vez. D1 hace la revisión atómica (`INSERT OR IGNORE` sobre una clave primaria); Sheets es lento y no atómico, así que dos reintentos simultáneos pasarían los dos.
- Límites del plan gratis, verificados el 2026-10-27: 5 millones de filas leídas y 100.000 escritas por día, 5 GB. El bot usa una escritura por mensaje.
- Si D1 falla, el mensaje se procesa igual (quizá dos veces): el cliente nunca debe quedar sin respuesta.
- El mensaje se reclama antes de procesarlo y se libera si el procesamiento falla, para que un reintento pueda responderlo en vez de descartarlo como repetido.
- Retención de 7 días; las filas viejas se borran en 1 de cada ~50 lotes, al terminar y fuera del camino de la respuesta.
- 2026-10-28: base `brunen-chatbot` creada y activada (binding `DB`, región ENAM) y migración aplicada. Verificado en producción: el mismo `wamid` enviado dos veces se registra una vez ("Mensaje repetido ignorado") y, si el envío falla, el mensaje se libera.
- Sin el bloque `[[d1_databases]]` en `wrangler.toml` no se deduplica: así el despliegue actual no cambia hasta crear la base.
- Fuente: https://developers.cloudflare.com/d1/platform/pricing/

### D21 · 2026-10-28 · Tomada
**Registro en Google Sheets con cuenta de servicio, sin librerías y en segundo plano.**
- Cuenta de servicio `bot-brunen` del proyecto de Google Cloud `brunen-chatbot`; la clave JSON va solo como secreto de Cloudflare (`GOOGLE_SERVICE_ACCOUNT_JSON`) y la planilla como `GOOGLE_SHEET_ID`. La clave no entra al repositorio.
- El JWT se firma con RS256 en WebCrypto y el token de acceso se guarda en memoria hasta 2 minutos antes de vencer, para no gastar CPU en cada mensaje (límite de 10 ms en el plan gratis).
- La planilla es una vista para Constanza: si Google falla, el mensaje se atiende igual y el error queda en el log. Nunca se anota el texto del mensaje, y el teléfono va enmascarado.
- Los mensajes repetidos (reintentos de Meta) no se anotan en la planilla: solo quedan en el log.
- Las hojas y sus columnas salen de `docs/conocimiento_brunen.md` (sección 11) y se crean con `npm run preparar-planilla`, que no pisa datos. RUTA_DEL_DIA tiene columnas provisionales hasta conocer el formato de importación de la app de rutas.

### D22 · 2026-10-28 · Tomada
**El intérprete se conecta en modo prueba: el bot responde lo que entendió y lo anota en la planilla.**
- Motivo: probar el intérprete con mensajes reales desde el celular antes de armar el flujo de pedido (Etapa 4). Cada mensaje mal entendido se agrega, anonimizado, a `tests/mensajes.json`.
- Solo responde a `NUMEROS_PERMITIDOS`. Los mensajes que no son de texto siguen recibiendo "Recibí un mensaje de tipo …".
- La hoja MENSAJES_PROCESADOS suma la columna Intencion (pedido, pregunta, reclamo, desconocido…). No guarda el texto del mensaje.
- El LLM de respaldo (Groq) todavía no está: lo que el intérprete no entiende queda como "desconocido".

### D23 · 2026-10-28 · Tomada
**Cuenta de Groq a nombre de Brunen, con retención de datos cero.**
- La cuenta es de la empresa (correo de Brunen), no personal: si cambia quien mantiene el bot, el dueño conserva el acceso y puede generar otra clave. La clave va solo como secreto de Cloudflare (`GROQ_API_KEY`).
- Datos (verificado el 2026-10-28): Groq no guarda las entradas ni las salidas por defecto, salvo registros temporales de hasta 30 días para fallas o abuso; se guardan en Estados Unidos. Con Zero Data Retention activado tampoco guarda esos registros, y solo se pierden funciones que el bot no usa (batch y fine-tuning).
- Zero Data Retention global activado en la cuenta el 2026-10-28 (Batch y Fine-tuning quedan apagados; el bot no los usa).
- Plan Free, USD 0, sin tarjeta registrada (revisado en la consola el 2026-10-28).
- Límites del plan gratis, leídos en la consola el 2026-10-28: `openai/gpt-oss-20b` y `openai/gpt-oss-120b`, 30 solicitudes por minuto, 1.000 por día, 8.000 tokens por minuto y 200.000 por día; `whisper-large-v3-turbo`, 20 por minuto, 2.000 por día y 28.800 segundos de audio por día. Los modelos Llama ya no aparecen en la lista de la cuenta. Con ~50 mensajes al día y el LLM solo como respaldo, el consumo queda muy por debajo.
- Si se pasa del límite, Groq responde 429: el bot debe tratarlo como "no entendido" y escalar, nunca dejar al cliente sin respuesta.
- Fuentes: https://console.groq.com/docs/rate-limits · https://console.groq.com/docs/your-data

### D24 · 2026-10-28 · Tomada
**El respaldo con IA solo extrae, solo entra cuando las reglas no entienden y nunca deja al cliente sin respuesta.**
- Modelo `openai/gpt-oss-20b` con salida estructurada estricta (`json_schema`, `strict: true`, soportada por ese modelo según https://console.groq.com/docs/structured-outputs), temperatura 0 y razonamiento bajo.
- El modelo entrega intención, tipos y cantidades. Fecha y comuna salen de las reglas, y la acción la decide el código. Todo pasa por la misma validación que las reglas; cantidades fuera de 1–999, tipos inventados o intenciones desconocidas se descartan.
- Solo viaja el texto del mensaje (máximo 300 caracteres); nunca teléfono ni nombre. Si el texto incluye una dirección, viaja con él: por eso la cuenta tiene retención cero (D23).
- Tope de 500 llamadas por día en la tabla `uso_llm` (D1, migración `0002`), con una sola sentencia atómica. Cuenta las reservas, no solo los éxitos, y el día es UTC: es deliberado, porque el fallo es seguro y deja la mitad del cupo gratis de Groq.
- Cualquier fallo (sin clave, 429, tiempo agotado, JSON inválido, tabla ausente) deja el resultado de las reglas. Los logs solo llevan el estado HTTP, nunca el contenido del mensaje.
- Verificado en producción el 2026-10-28: un mensaje que las reglas no entienden ("necesito aguita pal finde") se respondió con la IA y quedó 1 llamada en `uso_llm`.
- `BOT_ACTIVO` también se lee de la hoja CONFIGURACION cada minuto (`src/configuracion.ts`). Si Google falla se usa lo último leído; una caída de Google nunca apaga el bot.

### D25 · 2026-10-28 · Tomada
**Feriados cargados desde el calendario público y conectados a la fecha de entrega.**
- Fuente: calendarios públicos que coinciden entre sí (Chilevisión para 2026; Buk y feriados.cl para 2027, que citan las leyes 19.668, 20.983 y 21.357). No hay un documento oficial del Gobierno para 2027 todavía: el 21 de junio de 2027 (solsticio) y el 17 de septiembre de 2027 se confirmarán cuando se publique. Están todos los feriados nacionales, incluido el Sábado Santo (Brunen despacha los sábados). No están los regionales (Arica, Chillán) porque las comunas atendidas son de Santiago.
- Se cargaron como texto (`2026-01-01`) en la hoja FERIADOS de la planilla de desarrollo, no en el código. Con la planilla real hay que copiarlos (Etapa 7).
- `proponerEntrega` une la hoja con las reglas de despacho y devuelve `feriadosAlDia`: false si la hoja está vacía o no tiene feriados del año de la entrega. Mientras no exista el flujo de pedido, solo se muestra en modo prueba.
- Hay que renovar la hoja antes del 31 de diciembre de 2027.
- Lección del 2026-10-28: la primera carga guardó el tabulador dentro de la celda A (fecha y nombre juntos) y el Worker leyó la hoja como vacía. Se corrigió escribiendo cada columna por separado, y una hoja vacía ahora se relee al minuto (antes se recordaba 6 horas). Para cargar datos en la planilla, no usar tabuladores al teclear: pegar o escribir columna por columna.

### D26 · 2026-10-28 · Tomada
**El flujo de pedido se construye como piezas puras con dependencias inyectables, y todavía no se conecta al Worker.**
- Motivo: la Etapa 4 depende de decisiones del dueño (confirmación por excepción, cliente nuevo, precios especiales, cantidades...). Cada decisión pendiente quedó como una política explícita (`POLITICAS` en `src/motor.ts`) o como un caso que se manda a revisión: cambiarla es cambiar una línea y su prueba. Mientras no se conecte, nada de esto cambia lo que ve un cliente.
- `motor.ts` decide (respuesta, pedido a anotar, aviso a la operadora, memoria) sin hacer entrada ni salida. `flujo.ts` lo une con "puertos" (fichas, precios, entrega, memoria, intérprete) y nunca lanza errores: si algo inesperado falla, el cliente recibe una respuesta y la operadora un aviso de error.
- Regla de fondo: **lo dudoso no se le promete al cliente.** Si el precio depende de algo pendiente, la hoja PRECIOS está dañada, la ficha tiene datos raros, la cantidad es inusual o la fecha no es segura, el pedido se anota igual, la operadora recibe los motivos y al cliente se le dice que lo confirman. Cliente nuevo, cliente bloqueado, hoja de clientes ilegible y todo lo que el bot no entiende se escalan a una persona.
- Hoja PEDIDOS: una fila por producto con el mismo ID; Total es el subtotal de la línea (el del pedido se suma por ID); notas, envases y observaciones van solo en la primera fila. La fecha que propone el bot va en `Fecha_Entrega_Solicitada`; `Fecha_Entrega_Confirmada` y `Confirmado_Por` los llena la operadora.
- ID de pedido `P261028-3K7Q9`: fecha del pedido y 5 caracteres sacados del wamid, así un reintento de Meta da el mismo ID.
- Supuestos nuevos, a confirmar con el dueño: más de 20 bidones de un tipo va a revisión; el horario de atención de la operadora es 8:00–21:00 (documento de conocimiento, sección 8) y se avisa fuera de él solo cuando una persona debe contestar.
- Los textos son borradores (`src/textos.ts`). `docs/CONVERSACIONES.md` muestra 12 conversaciones generadas con el motor para que el dueño las revise.

### D27 · 2026-10-28 · Tomada
**Memoria de la conversación y agrupador de mensajes seguidos, en D1.**
- Migración `0003_etapa4.sql` (sin aplicar en producción hasta conectar el flujo): `conversaciones` (pedido a medias, vence a las 12 horas), `ultimos_pedidos` ("lo de siempre", se borra a los 180 días sin pedir) y `mensajes_pendientes` (agrupador).
- Respuestas cortas en contexto: "de 20" después de "¿de qué tamaño?" se entiende sin llamar a la IA. Es estricto a propósito: "para mañana a las 10" no es un bidón de 10 litros. Lo que no calza sigue el camino normal.
- Agrupador (cumple lo anotado en D16): cada mensaje espera 7 segundos en D1; si llega otro del mismo número, el último procesa todos juntos y se responde una sola vez. El texto queda en D1 solo esos segundos y se borra al procesarlo (lo huérfano, a la hora). Si D1 falla, el mensaje se atiende solo. Esperar no gasta CPU y `waitUntil` admite hasta 30 s. La espera de 7 s es provisional: se ajusta con mensajes reales.
- La memoria es una ayuda: si D1 falla se anota en el log y el bot vuelve a preguntar. No guarda direcciones ni nombres.
- Las pruebas corren el SQL de verdad sobre SQLite (`node:sqlite`, por eso Node 22.13 o superior) con las migraciones reales, no sobre un doble que solo anota qué se le pidió. También verifican el tope diario de la IA (D24). Falta confirmar en la D1 remota que un `INSERT ... ON CONFLICT ... WHERE` que no cambia nada devuelve `changes = 0`: está probado en SQLite y en D1 local, y si fallara solo se perdería el tope propio (Groq igual responde 429).

### D28 · 2026-10-28 · Tomada
**Lectura de hojas común, por nombre de columna, con caché y con respaldo marcado.**
- `src/hojas.ts` concentra la lectura de la planilla (feriados, configuración, clientes, precios): caché de 1 minuto (feriados, 6 horas), el fallo y el resultado vacío también se recuerdan 1 minuto (para notar rápido que se corrigió la hoja y no insistir con Google caído), y una sola lectura a la vez por hoja. El token de Google también se pide una sola vez a la vez: en un arranque en frío, varias lecturas juntas firmaban varios JWT y gastaban CPU (D31).
- CLIENTES y PRECIOS se leen por el nombre de la columna, no por su posición. Lo que no se entiende de una fila queda en `avisos` y manda el pedido a revisión.
- Si PRECIOS tiene errores (huecos, tramos que se pisan, precio ilegible), se usa la tabla del documento de conocimiento marcada "respaldo", y con ella nunca se le promete un precio al cliente: podría no ser el vigente.
- Los teléfonos se normalizan: `+56 9 8765 4321`, `987654321` y `56987654321` son el mismo.
- Fechas pedidas (`fechas.ts`): "viernes" es siempre el próximo; "15 de noviembre", "15/11" (día primero, como en Chile) y "el 20" se resuelven con la fecha de hoy. Si no se entiende, se propone lo más pronto y se avisa; si cae en domingo o feriado, se pasa al siguiente día de despacho y se explica cuál de los dos es.

### D29 · 2026-10-28 · Tomada
**Avisos por Telegram y lista del día: construidos, sin conectar (Etapas 5 y 6).**
- Aviso (`telegram.ts`): etiqueta, ID, nombre, enlace `wa.me` al teléfono, resumen, motivos y lo que escribió el cliente; botones Confirmar y Cambiar en los pedidos. Todo texto del cliente va escapado y cada parte tiene su tope (recortar el HTML ya armado podía cortar una etiqueta y Telegram rechazaría el aviso). No lleva la dirección.
- Botones: `callback_data` `c:<ID>` o `x:<ID>`. Solo se obedecen los tocados en el chat de la operadora y con el secreto del webhook (cabecera `X-Telegram-Bot-Api-Secret-Token`; el secreto admite 1–256 caracteres: letras, números, `_` y `-`).
- Límites usados: 4.096 caracteres por mensaje (documentación oficial de `sendMessage`) y 64 bytes de `callback_data` (documentación de bibliotecas; confirmar en la oficial al conectar). Fuentes: https://core.telegram.org/bots/api · https://core.telegram.org/bots/api/methods/sendmessage.md
- Con D32, Telegram queda solo para lo muy urgente y la bandeja con botones pasa al panel. Falta: crear el bot (@BotFather), cargar `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` y el secreto, la ruta `/telegram` en el Worker, actualizar PEDIDOS al confirmar y decidir qué hace "Cambiar".
- Lista del día (`rutaDelDia.ts`): arma las paradas de los pedidos confirmados de un día, ordenadas por comuna y dirección, como filas de RUTA_DEL_DIA y como texto copiable. El formato es PROVISIONAL hasta conocer el archivo de importación de la app de rutas.

### D30 · 2026-10-28 · Propuesta (decide Franco; ver D32)
**Dónde guardar los comprobantes de pago (imágenes) sin gastar.**
- Hallazgo: el plan original (subir a Drive con la cuenta de servicio) no sirve en una cuenta de Gmail normal. Las cuentas de servicio de Google no tienen cuota de almacenamiento ni pueden ser dueñas de archivos: suben a una unidad compartida (requiere Workspace de pago) o usan OAuth en nombre de una persona. Fuente (foro oficial de Google): https://discuss.google.dev/t/storagequotaexceeded-the-users-drive-storage-quota-has-been-exceeded-for-service-account/104375
- Meta: la dirección de descarga de una imagen dura 5 minutos y el ID del medio en un webhook vence a los 7 días: hay que bajarla apenas llega. Fuente: https://developers.facebook.com/documentation/business-messaging/whatsapp/business-phone-numbers/media
- Opciones: **A.** enviar la imagen por Telegram (`sendPhoto`) junto al aviso: USD 0, sin cuenta nueva, la operadora la ve donde recibe todo; en PAGOS queda el ID del mensaje; son datos financieros en un tercero (el mismo que ya recibe los avisos). **B.** Drive con OAuth (token de actualización de la cuenta de Google de Brunen): los archivos quedan en el Drive de Brunen (15 GB gratis); más pasos de configuración. **C.** Cloudflare R2: 10 GB gratis, pero fuentes recientes dicen que pide un método de pago para activarlo (verificar en el panel); descartada mientras el costo sea estrictamente USD 0. **D.** Guardar la imagen en D1: cabe, pero hace falta un visor.
- Recomendación: A para el piloto; B si el dueño quiere los archivos en Drive. **Actualizada por D32:** con un panel propio que muestre las imágenes, la mejor opción pasa a ser la D (guardarlas en D1 por 60 días y verlas en el panel); Telegram deja de ser necesario para esto.

### D31 · 2026-10-28 · Tomada
**Presupuesto de CPU: medirlo al conectar el flujo.**
- Límite verificado: plan gratis, 10 ms de CPU por solicitud; al pasarse Cloudflare responde error 1102 ("exceededCpu"). Esperar la red no cuenta; la documentación no aclara si el trabajo dentro de `waitUntil` cuenta. Fuente: https://developers.cloudflare.com/workers/platform/limits/
- Medido en producción (versión `09b3bd37`, `wrangler tail`): 15–20 ms en los primeros mensajes tras un despliegue (firma del JWT de Google y arranque) y 1–4 ms después, todos con resultado "ok". Hay tolerancia, pero no se debe confiar en ella.
- Medidas ya tomadas: token en memoria y pedido una sola vez, caché de las hojas, y el flujo lee solo lo que cada intención necesita (un "gracias" no lee nada).
- Al conectar: medir cada tipo de mensaje con `wrangler tail`. Si se pasa, opciones sin costo: menos trabajo por mensaje o mover lecturas a una tarea programada. Pasar al plan de pago queda descartado mientras el objetivo sea USD 0.

### D32 · 2026-10-28 · Tomada (Franco aceptó la dirección y las recomendaciones)
**Un panel de administración propio reemplaza a Telegram como bandeja de avisos; Telegram queda solo para lo muy urgente.**
- Franco aceptó el 2026-10-28 las 12 recomendaciones de `docs/PENDIENTES.md` (qué es urgente, acceso, datos, mapa, comprobantes, audios, cliente nuevo, cantidad inusual, envases, espera del agrupador, textos y licencia MIT). Decisión de Franco: quiere el panel "para esto mismo" (ver y confirmar pedidos y avisos, clientes por ubicación y bidones, mapa) y dejar Telegram solo para lo muy importante. Esto cambia la Etapa 5 (la bandeja y los botones Confirmar / Cambiar pasan al panel) y suaviza D29 y D7. Qué es "muy urgente" lo define Franco; propuesta: reclamos y fallas del sistema.
- Dónde: el mismo Worker (rutas `/panel` y `/api`), con archivos estáticos: "las solicitudes a archivos estáticos son gratis e ilimitadas" (https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/). Costo USD 0. **Cambió en D33: es un Worker aparte.**
- Datos (propuesta): D1 pasa a ser la fuente de verdad de pedidos, avisos y clientes, con la planilla como espejo y exportación. Motivo: confirmar o cambiar un pedido es un `UPDATE` por ID en D1, mientras que en Sheets hay que buscar la fila (la parte difícil de la Etapa 5), y las lecturas de Sheets tienen cuota y gastan CPU. PRECIOS, CONFIGURACION y FERIADOS siguen en la planilla hasta que haya pantallas para editarlos.
- Acceso (propuesta, hay que elegir): **A.** Cloudflare Access (gratis hasta 50 usuarios según fuentes de terceros; entra con código de un solo uso por correo, sin programar; falta confirmar en la documentación oficial si exige tarjeta para activar Zero Trust). **B.** Inicio de sesión con Google dentro del Worker, solo para correos autorizados, con una credencial OAuth de Google Cloud. Recomendación: probar A y pasar a B si pide tarjeta. En cualquiera, quién confirma cada pedido queda registrado (`Confirmado_Por`).
- Mapa (propuesta): baldosas de OpenStreetMap, cuya política permite el uso interactivo normal pero pide mostrar la atribución, enviar el Referer, no precargar ni descargar en masa y no usar encabezados no-cache (https://operations.osmfoundation.org/policies/tiles/). Los puntos: el centro de la comuna, y el punto exacto cuando el cliente comparte su ubicación por WhatsApp o la operadora lo marca en el mapa. No se geocodifican direcciones con servicios externos: las direcciones de los clientes no salen de Brunen.
- Comprobantes (cambia la recomendación de D30): con un visor propio, guardar la imagen en D1 pasa a ser la mejor opción. Límites de D1 verificados el 2026-10-28 (https://developers.cloudflare.com/d1/platform/limits/): 2 MB por fila o valor, 500 MB por base en el plan gratis (10 bases por cuenta) y 50 consultas por invocación. Con unos 600 comprobantes al mes de ~200 KB y retención de 60 días caben (~240 MB); se mide con imágenes reales y se rechazan las de más de 1,5 MB avisando a una persona. D20 hablaba de "5 GB": son 5 GB por cuenta, pero 500 MB por base.
- Avisos en el panel: la bandeja se actualiza sola cada pocos segundos y suena o notifica mientras está abierta; es suficiente para el volumen (15 a 50 pedidos al día).
- Fases (ver `docs/ETAPAS.md`): P1 bandeja (pedidos y avisos, confirmar / cambiar / rechazar, interruptor del bot); P2 reparto del día; P3 clientes, importación del Excel y mapa; P4 estadísticas; P5 configuración (precios, feriados, textos). Antes de P1 hay que conectar el flujo de pedido para que escriba en D1.

### D33 · 2026-10-28 · Tomada
**El panel es un Worker aparte y el flujo de pedido ya escribe en D1 (ajusta D32).**
- Worker aparte (`brunen-panel`, `wrangler.panel.toml`, `src/panel/`) en vez de rutas dentro del bot. Cloudflare Access protege una dirección completa: si el panel compartiera la dirección `workers.dev` del bot, Access también bloquearía el webhook de Meta. Además el panel no recibe ningún secreto de WhatsApp, Google ni Groq, así que si algo falla hay menos que perder. Comparte la base D1 (mismo `database_id`; las migraciones se aplican desde el bot). La pantalla (`panel/`) son archivos estáticos.
- Acceso: el Worker comprueba en cada solicitud el token de Access (cabecera `Cf-Access-Jwt-Assertion`): firma RS256 con las claves públicas del equipo (`https://<equipo>.cloudflareaccess.com/cdn-cgi/access/certs`, guardadas una hora y vueltas a pedir si Cloudflare las rota), emisor, aplicación (AUD) y vencimiento, más una lista opcional de correos (`PANEL_CORREOS`). Solo RS256: aceptar el algoritmo que declara el token es el truco clásico para falsificarlos. Falla cerrado: sin `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` responde 503 y no sirve nada. `PANEL_DEV_CORREO` deja entrar sin token solo desde localhost, para desarrollar. Fuente: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- **Hallazgo (verificado el 2026-10-28):** Zero Trust Free pide registrar un método de pago al activarse: "this step is still needed but you will not be charged" (https://developers.cloudflare.com/cloudflare-one/setup/). El límite de 50 usuarios gratis solo lo dicen fuentes de terceros. D32 aceptaba "pasar a inicio de sesión con Google si pide tarjeta": pide, aunque no cobre, así que Franco debía confirmar la opción. **Resuelto en D34:** Cloudflare Access, y el tope de 50 usuarios quedó confirmado en la página oficial de precios.
- Escrituras: solo `POST` con `Content-Type: application/json`, la cabecera `X-Panel: 1` y, si el navegador manda `Origin`, del mismo sitio. No se habilita CORS: otra página no puede mover pedidos con la sesión de la operadora.
- Cabeceras de seguridad en toda respuesta (`src/panel/index.ts`): política de contenido que solo deja correr scripts y estilos del propio panel, sin marcos y sin caché. Van en el Worker y no en un archivo `_headers` para que valgan igual en local y en producción y estén probadas. La pantalla escribe todo con `textContent`: lo que escribe un cliente nunca se interpreta como HTML.
- Flujo conectado (`atencion.ts`): `FLUJO_PEDIDO = "SI"` lo enciende; sin esa variable el bot sigue en modo prueba, como hoy en producción. Si no se puede guardar el pedido o el aviso en D1, al cliente se le dice que una persona lo revisa y se avisa de la falla: no se le promete lo que no quedó anotado. Un reintento de Meta no duplica nada (el ID del pedido y el del aviso salen del `wamid`). Los reclamos y las fallas salen además por Telegram si está configurado, y una misma falla se avisa una vez por hora.
- Pedidos y avisos (`repositorio.ts`): no se puede confirmar un pedido sin precio en todas sus líneas; el estado no salta (uno entregado no se reabre; uno cancelado sí, por si fue un error) y todo cambio exige que el estado siga siendo el que se vio; cada cambio queda en `historial_pedidos` con el correo de quien lo hizo.
- Los avisos que nacen con un pedido (`pedido`, `pedido_revision`, `cliente_nuevo`, `fuera_de_zona`) no van a la bandeja de avisos: el pedido ya está en "Por confirmar", con sus observaciones y con lo que escribió el cliente. En "Avisos" quedan los casos sin pedido: reclamos, facturas, comprobantes, mensajes que el bot no entendió y fallas. Así un pedido nuevo no cuenta dos veces. El texto del cliente se borra a los 90 días; el aviso queda.
- Costos del panel (verificados el 2026-10-28). Workers gratis: 100.000 solicitudes al día y 10 ms de CPU por invocación (https://developers.cloudflare.com/workers/platform/pricing/). D1 gratis: 5 millones de filas leídas y 100.000 escritas al día; las filas leídas son las que la consulta recorre, no las que devuelve (https://developers.cloudflare.com/d1/platform/pricing/). La pantalla consulta `/api/estado` cada 8 segundos a la vista y cada 20 oculta (unas 6.000 solicitudes por pestaña en una jornada de 13 horas) y recarga las listas solo si algo cambió o cada minuto. Esa consulta usa solo índices, y una prueba lo vigila con `EXPLAIN QUERY PLAN`. Como el Worker corre primero, para comprobar el acceso antes de servir archivos, también cada carga de la pantalla cuenta como solicitud. Falta medir el CPU en producción (como en D31). Las listas "Cerrados" y "Todos" recorren todos los pedidos cerrados: con miles de pedidos habrá que acotarlas por fecha.
- Todavía no hay espejo en la planilla: PEDIDOS no se escribe en la hoja desde el flujo (CLIENTES, PRECIOS, CONFIGURACION y FERIADOS siguen allí). El interruptor del bot y el aviso de contingencia siguen en CONFIGURACION y pasan al panel en la fase P5.
- La pantalla suena y notifica cuando llega algo nuevo mientras está abierta. El navegador solo deja sonar después de un clic en la página, y las notificaciones del navegador piden permiso (botón "Activar avisos del navegador").

### D34 · 2026-10-28 · Tomada (Franco delegó la elección: "el que consideres mejor para términos prácticos, seguridad y a largo plazo")
**El panel entra por Cloudflare Access (opción A de D32 y D33).**
- Por qué A y no el inicio de sesión con Google dentro del Worker. Práctico: Access ya trae el inicio de sesión por código de un solo uso al correo, la sesión y el cierre de sesión; no hay nada que programar ni mantener. Seguridad: un servicio administrado hace la autenticación y el Worker vuelve a comprobar el token en cada solicitud (D33), así que hay dos barreras y ningún código propio de inicio de sesión (donde suelen estar los fallos). Largo plazo: lo único que depende de Access es `src/panel/acceso.ts`; si Cloudflare cambiara las condiciones del plan gratis, pasar a otra opción cambia ese archivo y sus pruebas, no el panel.
- Costo (verificado el 2026-10-28): el plan Free de Zero Trust es "$0 | forever" con tope de 50 usuarios (https://www.cloudflare.com/plans/sase-zero-trust.md); pasarse costaría USD 7 por usuario al mes y el panel lo usarán 3 o 4 personas. Al activarlo piden registrar un método de pago aunque no cobren (D33): lo registra Franco o el dueño (el asistente no puede escribir datos de pago) y no se activa ningún producto de pago. Qué tarjeta se usa lo deciden ellos; la cuenta pasa a Brunen en la Etapa 7.
- Sesión (verificado): 24 horas por defecto, configurable entre 15 minutos y un mes (https://developers.cloudflare.com/cloudflare-one/access-controls/access-settings/session-management/). Se deja en 24 horas: cada persona entra una vez al día con un código al correo.
- Al vencer la sesión: Access redirige al inicio de sesión y una llamada de la página no puede leer esa respuesta. Con D33 la pantalla mostraba "sin conexión" y, con la pestaña en segundo plano, dejaba de avisar sin que nadie lo notara: el silencio parecía "no hay pedidos". Según la documentación (misma página), con la cabecera `X-Requested-With: XMLHttpRequest` Access contesta 401; la pantalla la manda en cada llamada y además reconoce la redirección (`redirect: 'manual'`). Entonces muestra "Se cerró tu sesión" con el botón "Volver a entrar", pone ⚠ en el título de la pestaña y, una sola vez, suena y notifica. Con la conexión caída hace lo mismo a los 3 sondeos seguidos (unos 25 s), para no molestar por un tropiezo de la red. Probado en el navegador: sesión vencida, redirección, sin internet y una acción con la sesión vencida (el botón queda usable y el aviso no se repite).
- Direcciones de versión desactivadas (`preview_urls = false` en `wrangler.panel.toml`, https://developers.cloudflare.com/workers/configuration/previews/): por defecto cada versión tendría su propia dirección `workers.dev`, fuera de la aplicación de Access. Aunque existiera, el Worker responde 401 sin token (D33).
- `PANEL_CORREOS` (segunda barrera, opcional) salió de `wrangler.panel.toml`: se carga como secreto, porque son correos de personas y el repositorio es público.

### D35 · 2026-10-28 · Tomada
**Respaldo de la base D1 antes de usar datos reales.**
- Desde D33 los pedidos viven solo en D1 (todavía no hay espejo en la planilla): si se pierde la base, se pierden los pedidos y los avisos.
- Primera capa, sin hacer nada: D1 trae "Time Travel", siempre activo y sin costo, que permite volver a cualquier minuto de los últimos 7 días en el plan gratis (30 en el de pago) (https://developers.cloudflare.com/d1/reference/time-travel/). Cubre errores humanos (un `UPDATE` mal hecho, una migración), no la pérdida de la cuenta. `wrangler d1 time-travel info brunen-chatbot` da el punto actual y `wrangler d1 time-travel restore brunen-chatbot --timestamp=<unix>` vuelve a uno anterior; restaurar sobrescribe la base y la salida trae el punto para deshacerlo.
- Segunda capa, una copia propia: `npx wrangler d1 export brunen-chatbot --remote --output=<archivo>.sql` cada semana (https://developers.cloudflare.com/d1/best-practices/import-export-data/). El archivo tiene teléfonos y direcciones: se guarda fuera del repositorio y de carpetas compartidas, y se borran las de más de un mes. Una exportación en curso bloquea las demás consultas: se hace fuera del horario de pedidos (después de las 21:00).
- Antes de encender `FLUJO_PEDIDO` con clientes reales: hacer una exportación y restaurarla en una base local para comprobar que sirve.
