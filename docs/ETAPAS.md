# Plan por etapas

Cada etapa termina con una prueba concreta. No se avanza sin que la anterior funcione.

| # | Etapa | Estado |
|---|---|---|
| 0 | Repo base: precios, despacho, firma y webhook de eco con pruebas | ✅ Lista |
| 1 | Esqueleto de punta a punta con el número de prueba de Meta | ✅ Lista (2026-10-28) |
| 2 | Planilla de desarrollo + deduplicación por wamid + registro de mensajes | ✅ Lista (2026-10-28) |
| 3 | Intérprete: parser por reglas + LLM de respaldo, casos en `tests/mensajes.json` | ✅ Lista (2026-10-28): reglas (54 casos) y respaldo con IA verificado con una llamada real |
| 4 | Flujo de pedido: cotizar, fecha, registrar en PEDIDOS, responder 1 mensaje, ERRORES | 🟡 Piezas listas y probadas (2026-10-28), sin conectar: falta el visto bueno del dueño |
| 5 | Constanza: bandeja de pedidos y avisos con Confirmar / Cambiar; Telegram solo para lo muy urgente | 🟡 Aviso de Telegram listo; la bandeja pasa al panel (D32) |
| 6 | Imágenes (comprobantes + PAGOS), audio, fuera de zona, reclamos, RUTA_DEL_DIA | 🟡 Lista del día lista (formato provisional); comprobantes: guardarlos en D1 y verlos en el panel (D30, D32) |
| 7 | Producción: número definitivo, verificación de empresa, piloto con 5–10 clientes | |
| P | Panel de administración: pedidos, avisos, clientes, mapa, estadísticas | ⏳ Dirección decidida (D32); empieza al conectar el flujo |

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

## Etapa 4 — Flujo de pedido

**Estado (2026-10-28):** conectada al Worker detrás del interruptor `FLUJO_PEDIDO` (D33), guardando pedidos y avisos en D1 y probada de punta a punta con Meta, Google, Telegram y Groq simulados. **En producción sigue apagada**: el bot responde en modo prueba. Falta aplicar las migraciones 0003 y 0004, el visto bueno del dueño sobre los textos y las decisiones pendientes, y encenderla (más abajo).

**Qué hay** (todo en `src/`, con sus pruebas en `tests/`):

| Pieza | Archivos | Qué hace |
|---|---|---|
| Lectura de hojas | `hojas.ts`, `clientes.ts`, `preciosHoja.ts`, `configuracion.ts`, `feriados.ts` | Fichas de clientes por teléfono, tabla de precios validada, feriados y configuración (interruptor y aviso de contingencia), con caché |
| Fechas | `fechas.ts`, `entrega.ts` | Entiende "el viernes", "15/11", "el 20"; propone la entrega con feriados y explica los ajustes |
| Memoria | `conversacion.ts`, `contexto.ts` | Pedido a medias y último pedido en D1; entiende "de 20" después de "¿de qué tamaño?" sin gastar IA |
| Mensajes seguidos | `agrupador.ts` | Junta "2 bidones" y "de 20" para responder una sola vez |
| Decisión | `motor.ts`, `textos.ts`, `pedidos.ts`, `alertas.ts` | Decide respuesta, fila de PEDIDOS y aviso a la operadora; lo dudoso se manda a revisión |
| Flujo | `flujo.ts` | Une todo con dependencias inyectables y nunca lanza errores |
| Conexión | `atencion.ts`, `index.ts`, `repositorio.ts` | Recibe cada mensaje, junta los seguidos, guarda el pedido y el aviso en D1, envía la respuesta única y avisa por Telegram solo lo urgente |

Cómo conversa: [CONVERSACIONES.md](CONVERSACIONES.md) (12 casos, generados con el motor). Por qué así: D26 a D28 y D33.

**Cómo encenderlo** (cada paso con aprobación de Franco; se verifica con `npm run check` y un mensaje de prueba desde un número de `NUMEROS_PERMITIDOS`):
1. Aplicar las migraciones: `npx.cmd wrangler d1 migrations apply brunen-chatbot --remote` (crea `conversaciones`, `ultimos_pedidos`, `mensajes_pendientes`, `pedidos`, `avisos` e `historial_pedidos`).
2. Desplegar el bot (`npm run deploy`): el flujo sigue apagado.
3. Descomentar `FLUJO_PEDIDO = "SI"` en `[vars]` de `wrangler.toml` y volver a desplegar. Opcional: `ESPERA_AGRUPADOR_MS` (7.000 por defecto, D27).
4. Probar con los 12 casos de CONVERSACIONES.md y con 2 o 3 mensajes seguidos para el agrupador. Cada pedido y cada aviso debe aparecer en el panel.
5. Medir el CPU de cada tipo de mensaje con `wrangler tail` (límite de 10 ms en el plan gratis, D31) y la cantidad de llamadas a Google.
6. Recién entonces, ampliar a más números (Etapa 7).

**Depende del dueño** (ver `docs/PENDIENTES.md`): confirmación por excepción o doble mensaje, aprobar los textos, cómo tratar a un cliente nuevo, carga inicial, precios mayorista y especial para 12 L y 10 L, tramos entre tipos de bidón, empresas con plan mensual, cantidad inusual por pedido, boletas, clientes bloqueados y la columna `Credito`.

**Qué falta construir aunque el dueño ya haya respondido:** la ficha de los clientes reales en la hoja CLIENTES (Constanza), y las lecturas de PEDIDOS para "lo de siempre" de clientes antiguos (hoy el bot recuerda solo lo que pidió a través de él).

**Prueba de aceptación:**
- Un cliente conocido pide "2 bidones de 20 para el viernes" y recibe **un** mensaje con el precio y la fecha, una fila en PEDIDOS y un aviso a la operadora.
- "4 bidones" y después "de 20", escritos seguidos, dan **una** respuesta y un pedido.
- Un reclamo, una factura o un mensaje que el bot no entiende llegan a una persona y el cliente igual recibe respuesta.
- Un error de Google, de D1 o de Telegram no deja al cliente sin respuesta.

---

## Etapa 5 — La operadora recibe y confirma

**Estado (2026-10-28):** la bandeja y las acciones Confirmar / Cambiar / Cancelar viven en el **panel** (fase P1, D33), no en Telegram: el flujo ya guarda lo que decide el motor en D1 y el panel lo muestra, guardando quién hizo cada cambio. Telegram queda solo para lo muy urgente (reclamos y fallas del sistema): `telegram.ts` y el filtro ya están listos (D29).

**Falta:**
1. Crear el bot de Telegram con @BotFather y cargar `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` y el secreto del webhook. Sin ellos no sale ningún aviso por ahí, pero el panel los muestra igual. Si más adelante se quiere confirmar desde Telegram, la ruta `/telegram` y el resto de las piezas ya están construidas.
2. Que el panel esté desplegado con su acceso (ver "Panel de administración").
3. Decidir qué pasa con el cliente al cambiar un pedido en el panel (cada mensaje al cliente cuenta en el cupo gratis). Hoy el panel no escribe al cliente.

---

## Panel de administración (D32)

**Estado (2026-10-28):** la fase P1 (bandeja) está construida y probada en local (D33); falta elegir el acceso, aplicar las migraciones y desplegar. Las demás fases, sin empezar.

**Qué es:** una página privada en un Worker aparte (`brunen-panel`), gratis, donde Constanza y el dueño ven los pedidos y los avisos del bot, los confirman y, más adelante, administran a los clientes por ubicación, bidones y mapa. Los datos viven en D1 (fuente de verdad); el panel no tiene ningún secreto de WhatsApp, Google ni Groq.

| Fase | Qué incluye |
|---|---|
| P1 Bandeja (lista) | Pedidos por confirmar, confirmados y cerrados, con confirmar / cambiar (fecha, comuna, dirección, notas, bidones y precios) / cancelar / en ruta / entregado, lo que escribió el cliente, observaciones del bot e historial de cambios; avisos (reclamos, facturas, comprobantes, mensajes no entendidos, fallas) con "resuelto"; se actualiza sola con sonido y notificación; funciona en el celular y con tema oscuro |
| P2 Reparto del día | Lista del día por comuna lista para copiar (`rutaDelDia.ts`), envases por retirar |
| P3 Clientes y mapa | Ficha, historial y envases por cliente; importación del Excel; mapa por comuna y con punto exacto; el bot pasa a leer los clientes de D1 |
| P4 Estadísticas | Bidones y ventas por día, semana y mes; clientes que dejaron de pedir; reclamos abiertos; comprobantes por revisar |
| P5 Configuración | Interruptor del bot y aviso de contingencia, precios, feriados y textos editables, sin tocar la planilla |

**Probarlo en tu computador** (sin tocar producción: todo es local):
1. `npm run datos-locales`: crea las tablas en la base D1 local y carga pedidos y avisos ficticios (se puede repetir).
2. `npm run dev:panel -- --var PANEL_DEV_CORREO:tu@correo.test` y abrir http://localhost:8787 (si el puerto está ocupado, agregar `--port 8788`). `PANEL_DEV_CORREO` solo funciona desde localhost.

**Cómo encenderlo en producción** (cada paso con aprobación de Franco):
1. Aplicar las migraciones y desplegar el bot, como en la Etapa 4.
2. Cloudflare → Zero Trust: elegir el nombre del equipo (queda `<equipo>.cloudflareaccess.com`) y el plan Free. **Cloudflare pide registrar un método de pago aunque no cobre** (D33); confirmar antes la opción de acceso (`docs/PENDIENTES.md`).
3. `npm run deploy:panel`: el panel queda en `https://brunen-panel.<subdominio>.workers.dev` y responde 503 hasta el paso 5. No muestra nada sin acceso configurado.
4. Zero Trust → Access controls → Applications → Create new application → "Self-hosted and private" → agregar el nombre de host del panel → política "Allow" con los correos de Constanza, Franco y el dueño → método de acceso con código por correo. Si el menú no deja elegir un `workers.dev`, la configuración del Worker permite activar Access para su dirección `workers.dev` (https://developers.cloudflare.com/workers/configuration/routing/workers-dev/). Los nombres de los menús son los de la documentación del 2026-10-28; verificarlos al hacerlo.
5. En la aplicación: Configure → Additional settings → copiar el "Application Audience (AUD) Tag". En `wrangler.panel.toml` poner `ACCESS_TEAM_DOMAIN = "<equipo>.cloudflareaccess.com"` y `ACCESS_AUD = "<el tag>"` (no son secretos) y volver a desplegar el panel.
6. Abrir la dirección: debe pedir el correo, mandar un código y mostrar la bandeja. Probar que un correo que no está en la política no entra. Opcional: `PANEL_CORREOS` como segunda barrera.
7. Medir el CPU del panel con `wrangler tail` (límite de 10 ms, D31 y D33).

**Cuidados:** el panel muestra datos personales (teléfonos, direcciones): acceso solo para personas autorizadas, sesión segura, registro de quién confirma qué, y ninguna dirección sale hacia servicios externos (el mapa no geocodifica con terceros).

---

## Etapa 6 — Comprobantes, audio y lista del día

**Estado (2026-10-28):** construida la lista del día (`rutaDelDia.ts`, formato provisional); investigado dónde guardar los comprobantes (D30, propuesta).

**Falta:**
1. Lista del día: leer los pedidos confirmados del día, escribir la hoja RUTA_DEL_DIA y dar el texto copiable (por ejemplo, con un comando en Telegram o una tarea programada). Ajustar el formato al archivo de importación de la app de rutas (confirmar si es OptimoRoute).
2. Imágenes: el dueño elige dónde guardar los comprobantes (D30). Bajar la imagen apenas llega (la dirección dura 5 minutos), avisar a la operadora y anotar en PAGOS; el bot no verifica pagos solo.
3. Audio: pedir amablemente que escriba (regla 8). Transcribirlo con Groq (Whisper, gratis hasta 2.000 solicitudes por día según la consola, D23) es una decisión del dueño por privacidad.
4. Fuera de zona y reclamos ya están en el motor de la Etapa 4.
