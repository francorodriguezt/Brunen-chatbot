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
