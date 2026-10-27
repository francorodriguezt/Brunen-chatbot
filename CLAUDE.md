# CLAUDE.md — Chatbot de WhatsApp para Brunen SpA

## Qué es
Bot de WhatsApp (Cloud API de Meta) que recibe pedidos de bidones, calcula precio y fecha de entrega, registra en Google Sheets, guarda comprobantes en Drive y deriva a Constanza (operadora) lo que no debe manejar. Lo construye Franco (estudiante, nivel intermedio, quiere aprender: explica el porqué de cada decisión en pocas líneas). El dueño es su hermano.

La fuente de verdad del negocio es `docs/conocimiento_brunen.md` (importado abajo). Si el código o una petición lo contradice, avisa antes de seguir. **Nunca inventes precios, horarios, comunas ni datos bancarios**: si falta un dato, márcalo PENDIENTE y que el código lo mande a revisión.

@docs/conocimiento_brunen.md

## Stack (costo objetivo: USD 0/mes)
- Cloudflare Workers + TypeScript (plan gratuito). Entrada: `src/index.ts`.
- Datos: Google Sheets (API). Archivos: Google Drive. Alertas internas: Telegram.
- Interpretación de mensajes: parser por reglas primero; LLM (Groq, plan gratuito) solo como respaldo. Al LLM se envía solo el texto del mensaje, nunca nombre ni dirección.
- Pruebas: Vitest. Despliegue: `wrangler`.
- Decisiones y su porqué: `docs/DECISIONES.md`. Plan por etapas: `docs/ETAPAS.md`.

## Comandos
- `npm run check` — typecheck + pruebas. Córrelo antes de dar algo por terminado.
- `npm test` — solo pruebas. `npm run dev` — Worker local en http://localhost:8787.
- `npm run deploy` — publica en Cloudflare. **Pide confirmación antes.**

## Principios (no negociables)
1. El LLM extrae e interpreta; el código calcula. Precios, tramos, fechas y feriados se calculan en `src/precios.ts` y `src/despacho.ts`, con pruebas.
2. El bot registra y propone; Constanza confirma.
3. Reclamos, facturas y pagos a proveedores se derivan siempre a una persona.
4. Ante la duda, escalar en vez de adivinar.

## Reglas técnicas
- **Presupuesto de mensajes:** Meta da 1.000 mensajes de servicio gratis al mes por número; después cobra cada uno. Objetivo: 1 mensaje saliente por pedido. Nunca partir una respuesta en varios mensajes. Las alertas a Constanza van por Telegram, no por WhatsApp.
- **Webhook:** validar siempre `X-Hub-Signature-256`; responder 200 de inmediato y procesar con `ctx.waitUntil`; deduplicar por `wamid` (Meta reintenta).
- **Zona horaria:** `America/Santiago` en todo cálculo de fechas. Feriados desde la hoja FERIADOS, nunca fijos en código.
- **Pruebas:** toda función de cálculo lleva casos del documento de conocimiento (1–5 bidones de 20 L, 12 L, 10 L, cliente especial, mayorista, empresa, cliente nuevo, pedido mezclado, corte de las 9:00, sábado, domingo, feriado). Cada mensaje real mal interpretado se agrega (anonimizado) a `tests/mensajes.json`.
- **Errores:** nunca dejan al cliente sin respuesta ni rompen el 200 al webhook; se registran (hoja ERRORES desde la Etapa 4).
- Código y comentarios en español, nombres consistentes en español. Commits en presente, un cambio lógico por commit.

## Seguridad y datos
- Tokens, claves y contraseñas solo en `.dev.vars` (local, ignorado por git) o `wrangler secret put` (producción). Nunca en código, commits, logs ni en el chat.
- Logs: teléfonos enmascarados (`enmascararTelefono`). Sin direcciones ni nombres.
- Datos reales de clientes no entran al repo. Pruebas con datos ficticios.

## Antes de actuar, pregunta
- Desplegar (`wrangler deploy`) o cargar secretos.
- Cualquier cambio en la planilla o el Drive reales.
- Enviar mensajes a números que no estén en `NUMEROS_PERMITIDOS`.
- Borrar archivos u hojas; cambiar el número de WhatsApp o la verificación de empresa en Meta.
- Cualquier cosa que agregue costo mensual.

## Datos que cambian: verifica antes de afirmar
Precios de la API de WhatsApp, versión de la Graph API, límites de Groq/Gemini/Cloudflare, requisitos de Meta. Busca en la documentación oficial y registra la fuente en `docs/DECISIONES.md`.

## Definición de terminado (por funcionalidad)
1. Funciona de punta a punta con un mensaje de prueba.
2. Tiene pruebas y `npm run check` pasa.
3. Los errores se registran y no dejan al cliente sin respuesta.
4. `docs/DECISIONES.md`, `docs/PENDIENTES.md` y `docs/ETAPAS.md` actualizados.

## Cómo trabajar con Franco
Una etapa a la vez (ver `docs/ETAPAS.md`). Antes de escribir código grande, propón el plan en pocas líneas. Al terminar una etapa, indica cómo verificarla. Al cerrar la sesión: decisiones tomadas, pendientes y qué actualizar en `docs/conocimiento_brunen.md`.
