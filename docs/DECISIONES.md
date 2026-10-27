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

### D11 · 2026-10-27 · Tomada
**Repositorio público en GitHub (github.com/francorodriguezt/Brunen-chatbot), como portafolio de Franco.**
- Contexto: el dueño autorizó publicar. Los documentos incluyen datos comerciales (precios, comunas, volumen) pero no secretos.
- Reglas que se mantienen: tokens solo en `.dev.vars` / `wrangler secret`; datos reales de clientes, cuenta bancaria y teléfonos nunca entran al repo (D9). Revisar el diff antes de cada push.

### D12 · 2026-10-27 · Tomada
**CI con GitHub Actions (`.github/workflows/check.yml`) que corre `npm ci` + `npm run check` en cada push a `main` y en cada pull request.**
- Motivo: detectar una prueba rota antes de desplegar, sin depender de acordarse de correr `npm run check`. Gratis en repos públicos. No usa secretos.

### D13 · 2026-10-27 · Tomada
**Scripts locales `verificar-config` y `simular-mensaje` en `scripts/`.**
- Motivo: probar la configuración y el webhook firmado sin esperar a Meta, y sin que Claude lea `.dev.vars`: los scripts nunca imprimen valores.
