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
