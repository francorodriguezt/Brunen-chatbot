# Plan por etapas

Cada etapa termina con una prueba concreta. No se avanza sin que la anterior funcione.

| # | Etapa | Estado |
|---|---|---|
| 0 | Repo base: precios, despacho, firma y webhook de eco con pruebas | ✅ Lista |
| 1 | Esqueleto de punta a punta con el número de prueba de Meta | ✅ Lista (2026-10-28) |
| 2 | Planilla de desarrollo + deduplicación por wamid + registro de mensajes | |
| 3 | Intérprete: parser por reglas + LLM de respaldo, casos en `tests/mensajes.json` | 🟡 Parser por reglas listo (45 casos); falta el LLM de respaldo |
| 4 | Flujo de pedido: cotizar, fecha, registrar en PEDIDOS, responder 1 mensaje, ERRORES | |
| 5 | Constanza: alerta por Telegram con botones Confirmar / Cambiar, actualiza estado | |
| 6 | Imágenes (Drive + PAGOS), audio, fuera de zona, reclamos, RUTA_DEL_DIA | |
| 7 | Producción: número definitivo, token permanente, piloto con 5–10 clientes | |

---

## Etapa 1 — Esqueleto de punta a punta

**Avance:** ✅ Lista el 2026-10-28. Worker desplegado en https://brunen-chatbot.brunen-chatbot.workers.dev, con los 5 secretos en Cloudflare y el webhook de Meta apuntando a `/webhook`. Verificado en producción: `/salud` responde `ok`; firma inválida da 401 y token falso da 403; un mensaje de un número permitido recibe "Recibí: <texto>"; uno de un número no permitido no recibe respuesta y el log muestra el teléfono enmascarado. Ojo: el token de WhatsApp de API Setup dura 24 h (ver `docs/PENDIENTES.md`).

**Objetivo:** escribes desde tu celular al número de prueba y recibes "Recibí: <tu texto>".

**Cuentas y credenciales (las crea el responsable del proyecto):**
1. Crear cuenta en Cloudflare (gratis) y en Meta for Developers.
2. En Meta: crear una app de tipo Business, agregar el producto WhatsApp, agregar tu número como destinatario de prueba.
3. Copiar `.dev.vars.example` como `.dev.vars` y completar valores (no se sube a git).
4. Correr `npm run verificar-config`: revisa el formato sin mostrar ningún valor.

**Configuración y pruebas:**
0. Prueba local: `npm run dev` en una terminal y, en otra, `npm run simular-mensaje -- "hola 2 bidones de 20"`. Con un token real y tu número permitido, la respuesta llega de verdad a tu WhatsApp. Para detener `npm run dev`, Ctrl+C.
1. `npx wrangler login` y luego `npm run deploy` (te pedirá confirmación).
2. Cargar los secretos con `npx wrangler secret put NOMBRE` (tú pegas cada valor).
3. Poner la versión de la Graph API en `wrangler.toml` (la que muestra Meta en API Setup).
4. En Meta > WhatsApp > Configuration: URL `https://brunen-chatbot.<tu-subdominio>.workers.dev/webhook`, el mismo verify token, suscribir el campo `messages`.
5. Suscribir la app a la cuenta de WhatsApp de prueba con `POST /{WABA_ID}/subscribed_apps` (token de la app). Sin esto Meta manda los mensajes a una app interna y el webhook no recibe nada (D19).

**Prueba de aceptación:**
- `https://.../salud` responde `ok`.
- Meta verifica el webhook sin error.
- Escribes "hola 2 bidones de 20" → recibes "Recibí: hola 2 bidones de 20" en < 5 s.
- Desde un número fuera de `NUMEROS_PERMITIDOS` no hay respuesta (modo prueba).
- `npx wrangler tail` muestra el log con el teléfono enmascarado.

---

## Etapa 2 — Planilla, deduplicación y registro de mensajes

**Objetivo:** un mismo mensaje enviado dos veces (Meta reintenta si no recibe el 200 a tiempo) recibe una sola respuesta y deja una sola fila, y los mensajes y errores quedan en una planilla que Constanza puede mirar.

**Avance (2026-10-28):** adelantado sin cuentas nuevas. Deduplicación por `wamid` con la base D1 de Cloudflare (código, migración y pruebas; la base ya está creada y activa en producción desde el 2026-10-28), registro de los avisos de entrega fallida de Meta y aviso claro en el registro cuando el token de WhatsApp vence. Falta todo lo que toca Google Sheets.

**Lo haces tú:**
1. Crear un proyecto en Google Cloud, activar la API de Sheets y crear una cuenta de servicio con su clave JSON. La clave es un secreto: va a `wrangler secret`, nunca al repositorio.
2. Crear una planilla de desarrollo, sin datos reales, con las hojas PEDIDOS, CLIENTES, PRECIOS, PAGOS, CONFIGURACION, FERIADOS, RUTA_DEL_DIA, DASHBOARD, ERRORES y MENSAJES_PROCESADOS, y compartirla (editor) con el correo de la cuenta de servicio.
3. Confirmar la creación de la base D1 (cambia tu cuenta de Cloudflare).

**Lo hace Claude:**
1. ~~Crear la base D1 y aplicar la migración~~ (hecho el 2026-10-28).
2. Cliente de Google Sheets para Workers (firma RS256 con WebCrypto y token en caché), con pruebas sin red.
3. Registrar cada mensaje en MENSAJES_PROCESADOS y cada fallo en ERRORES, como vista para Constanza.
4. Leer FERIADOS desde la hoja y guardar el resultado en caché.

**Prueba de aceptación:**
- El mismo `wamid` enviado dos veces recibe una sola respuesta y deja una sola fila.
- El mensaje aparece en MENSAJES_PROCESADOS.
- Un fallo al enviar a Meta aparece en ERRORES.
- Los feriados se leen de la hoja FERIADOS, no del código.
