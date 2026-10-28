# Plan por etapas

Cada etapa termina con una prueba concreta. No se avanza sin que la anterior funcione.

| # | Etapa | Estado |
|---|---|---|
| 0 | Repo base: precios, despacho, firma y webhook de eco con pruebas | ✅ Lista |
| 1 | Esqueleto de punta a punta con el número de prueba de Meta | ✅ Lista (2026-10-28) |
| 2 | Planilla de desarrollo + deduplicación por wamid + registro de mensajes | ✅ Lista (2026-10-28) |
| 3 | Intérprete: parser por reglas + LLM de respaldo, casos en `tests/mensajes.json` | ✅ Lista (2026-10-28): reglas (54 casos) y respaldo con IA verificado con una llamada real |
| 4 | Flujo de pedido: cotizar, fecha, registrar en PEDIDOS, responder 1 mensaje, ERRORES | |
| 5 | Constanza: alerta por Telegram con botones Confirmar / Cambiar, actualiza estado | |
| 6 | Imágenes (Drive + PAGOS), audio, fuera de zona, reclamos, RUTA_DEL_DIA | |
| 7 | Producción: número definitivo, verificación de empresa, piloto con 5–10 clientes | |

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

**Avance (2026-10-28):** ✅ Lista, salvo cargar los feriados. En producción:
- Deduplicación por `wamid` en la base D1 (D20), con liberación si el envío falla.
- Registro de cada mensaje en la hoja MENSAJES_PROCESADOS (teléfono enmascarado, sin el texto) y de cada fallo en ERRORES, en la planilla de desarrollo.
- Aviso en el log cuando el token de WhatsApp vence, y registro de las entregas fallidas de Meta.
- Lectura de la hoja FERIADOS con caché de 6 horas (`src/feriados.ts`), todavía sin conectar al cálculo de fechas (Etapa 4).

**Verificado en producción:** el mismo `wamid` enviado dos veces dejó 1 fila en D1, 1 fila en la planilla y una sola respuesta.

**Pendiente:**
- [x] Hoja FERIADOS cargada el 2026-10-28 con los feriados nacionales de 2026 y 2027 (D25).
- [x] Feriados conectados al cálculo de la fecha de entrega (`proponerEntrega`, `src/entrega.ts`): en modo prueba, un pedido responde "entrega propuesta …". En la Etapa 4, el flujo debe avisar a una persona cuando `feriadosAlDia` sea false.
- [ ] Copiar la planilla de desarrollo a la planilla real cuando se pase a producción (Etapa 7), con `npm run preparar-planilla` y los secretos de esa planilla.

**Prueba de aceptación:**
- ✅ El mismo `wamid` enviado dos veces recibe una sola respuesta y deja una sola fila.
- ✅ El mensaje aparece en MENSAJES_PROCESADOS.
- ✅ Un fallo al enviar a Meta aparece en ERRORES (probado con Meta simulado).
- ✅ Los feriados se leen de la hoja FERIADOS, no del código: cargados, probados con la hoja simulada y verificados en producción el 2026-10-28 con un pedido real (sin avisos en el registro).

---

## Etapa 3 — Intérprete: reglas y respaldo con IA

**Objetivo:** convertir el texto del cliente en datos (intención, bidones, fecha, comuna) sin gastar dinero, y escalar lo que no se entiende.

**Avance (2026-10-28):**
- ✅ Parser por reglas conectado en modo prueba: el bot responde lo que entendió y lo anota en la planilla.
- ✅ Respaldo con IA (Groq, `src/llm.ts`, D24): solo se usa cuando las reglas dicen "desconocido", con tope de 500 llamadas al día y sin enviar teléfono ni nombre. Su respuesta se valida con el mismo contrato que las reglas y, si falla en cualquier punto, queda el resultado de las reglas. Probado con Groq simulado y, el 2026-10-28, con una llamada real desde WhatsApp ("necesito aguita pal finde" respondió "(con IA)").
- ✅ `BOT_ACTIVO` se puede apagar desde la hoja CONFIGURACION (se lee cada minuto), además de la variable del Worker.

**Cómo se dejó funcionando de punta a punta (hecho el 2026-10-28):**
1. Aplicar la migración `0002_uso_llm.sql` en D1 (`npx wrangler d1 migrations apply brunen-chatbot --remote`).
2. Crear la clave en Groq y cargarla con `npx wrangler secret put GROQ_API_KEY`.
3. Desplegar y enviar un mensaje que las reglas no entiendan (por ejemplo "necesito aguita pal finde"): la respuesta debe decir "(con IA)".
4. En la hoja CONFIGURACION, agregar la fila `BOT_ACTIVO` con `SI` (columnas Variable, Valor, Descripción).

---

## Etapa 4 — Flujo de pedido (preparación)

**Estado (2026-10-28):** no empezada; espera las respuestas del dueño. Esto es lo que ya existe y lo que falta.

**Ya listo y probado:** intérprete con respaldo de IA, cálculo de precios (`precios.ts`), fecha de entrega con feriados (`entrega.ts`), deduplicación, apagado desde la planilla, una sola respuesta por mensaje y registro de mensajes y errores.

**Falta construir, sin depender del dueño:**
1. Leer CLIENTES por teléfono (tipo de cliente, precio especial, envases pendientes) y PRECIOS desde la planilla. El lector de hojas ya existe.
2. **Estado de la conversación en D1:** cuando el bot pregunta "¿de qué tamaño?", la respuesta siguiente ("20") solo se entiende si el bot recuerda el pedido a medias. Necesita una tabla con vencimiento por teléfono.
3. Escribir en PEDIDOS (ID_Pedido, estado `Pendiente_Confirmacion`) y registrar fallos en ERRORES.
4. Redactar los textos de respuesta (el borrador de la sección 12 del documento original no está en el repositorio) y que el dueño los apruebe.
5. Fuera de zona: registrar con estado `Fuera_de_zona` e informar las comunas atendidas.

**Depende del dueño (ver PENDIENTES):** confirmación por excepción o doble mensaje, carga inicial, precios mayorista y especial para 12 L y 10 L, tramos entre tipos de bidón, empresas con plan mensual, cantidad máxima por pedido, boletas, y qué hacer con clientes bloqueados y con `Credito`.
