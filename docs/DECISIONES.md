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
