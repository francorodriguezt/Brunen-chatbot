# Plan por etapas

Cada etapa termina con una prueba concreta. No se avanza sin que la anterior funcione.

| # | Etapa | Estado |
|---|---|---|
| 0 | Repo base: precios, despacho, firma y webhook de eco con pruebas | ✅ Lista |
| 1 | Esqueleto de punta a punta con el número de prueba de Meta | ✅ Lista (2026-10-28) |
| 2 | Planilla de desarrollo + deduplicación por wamid + registro de mensajes | ✅ Lista (2026-10-28) |
| 3 | Intérprete: parser por reglas + LLM de respaldo, casos en `tests/mensajes.json` | ✅ Lista (2026-10-28): reglas (54 casos) y respaldo con IA verificado con una llamada real |
| 4 | Flujo de pedido: cotizar, fecha, guardar el pedido en D1, responder 1 mensaje, ERRORES | 🟡 Conectada al Worker detrás de `FLUJO_PEDIDO` (D33) y probada de punta a punta con servicios simulados y, desde el 2026-10-30, con mensajes reales (encendida solo para los números de prueba); faltan repetir la prueba tras la última corrección, bajar el CPU (D31), el visto bueno del dueño y abrirla a más números. Construido el 2026-11-10, sin desplegar: el vigía que avisa si un mensaje queda sin atender (D43) |
| 5 | Constanza: bandeja de pedidos y avisos con Confirmar / Cambiar; Telegram solo para lo muy urgente | 🟡 La bandeja y las acciones están en el panel (P1, probado en local); faltan el acceso, el despliegue y el bot de Telegram |
| 6 | Imágenes (comprobantes + PAGOS), audio, fuera de zona, reclamos, lista del día | 🟡 La lista del día está en el panel (pestaña Reparto, D42; columnas provisionales); comprobantes: guardarlos en D1 y verlos en el panel (D30, D32), sin construir |
| 7 | Producción: número definitivo, verificación de empresa, piloto con 5–10 clientes | |
| P | Panel de administración: pedidos, avisos, clientes, mapa, estadísticas | 🟡 P1 (bandeja) y la primera parte de P2 (reparto del día, pedidos a mano y búsqueda, D42) listas y probadas en local; acceso decidido: Cloudflare Access (D34), falta activarlo y desplegar; P3 a P5 sin empezar |

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
- Registro de cada mensaje en la hoja MENSAJES_PROCESADOS (teléfono enmascarado, sin el texto) y de cada fallo en ERRORES, en la planilla de desarrollo. Apagado desde el 2026-11-10 (D44): los pedidos, los avisos y las fallas ya se ven en el panel.
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

**Estado (2026-10-28):** conectada al Worker detrás del interruptor `FLUJO_PEDIDO` (D33), guardando pedidos y avisos en D1 y probada de punta a punta con Meta, Google, Telegram y Groq simulados. **Encendida el 2026-10-30 solo para los números de prueba** (`NUMEROS_PERMITIDOS`): los demás números siguen ignorados. Las migraciones 0003 y 0004 están aplicadas en la D1 real desde el 2026-10-29. Primera prueba real el 2026-10-30: el pedido, los datos y el edificio funcionaron; la respuesta «No tiene nombre, gracias» se corrigió y se desplegó el 2026-10-31 (versión `4c934673`). CPU medido con 3 mensajes reales: 62, 25 y 34 ms, sobre los 10 ms del plan gratis (D31). Falta repetir la prueba, bajar el CPU, el visto bueno del dueño sobre los textos y las decisiones pendientes, y abrirla a más números (más abajo).

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
| Vigía | `vigia.ts`, `almacen.ts` | Tarea programada cada 5 minutos: deja un aviso si un mensaje quedó sin atender y, a las 7:30, revisa el token de WhatsApp y la planilla (D43) |

Cómo conversa: [CONVERSACIONES.md](CONVERSACIONES.md) (12 casos, generados con el motor). Por qué así: D26 a D28 y D33.

**Cómo encenderlo** (cada paso con aprobación de Franco; se verifica con `npm run check` y un mensaje de prueba desde un número de `NUMEROS_PERMITIDOS`):
1. Aplicar las migraciones: `npx.cmd wrangler d1 migrations apply brunen-chatbot --remote` (crea `conversaciones`, `ultimos_pedidos`, `mensajes_pendientes`, `pedidos`, `avisos` e `historial_pedidos`). Hecho el 2026-10-29; antes conviene anotar el punto de restauración con `wrangler d1 time-travel info brunen-chatbot`.
2. Desplegar el bot (`npm run deploy`): el flujo sigue apagado. Hecho el 2026-10-29 (versión `55bb523b`).
3. Descomentar `FLUJO_PEDIDO = "SI"` en `[vars]` de `wrangler.toml` y volver a desplegar. Opcional: `ESPERA_AGRUPADOR_MS` (7.000 por defecto, D27). Hecho el 2026-10-30 (versión `b6713f21`); la corrección de la respuesta sobre el edificio se desplegó el 2026-10-31 (versión `4c934673`) y las de la revisión del código (D39) el 2026-11-01 (versión `865d95df`), seguidas ese día por el reconocimiento de clientes por sus pedidos anteriores (D40, versión `16e04d3c`).
4. Probar con los 12 casos de CONVERSACIONES.md y con 2 o 3 mensajes seguidos para el agrupador. Cada pedido y cada aviso debe aparecer en el panel.
5. Medir el CPU de cada tipo de mensaje con `wrangler tail` (límite de 10 ms en el plan gratis, D31) y la cantidad de llamadas a Google.
6. Recién entonces, ampliar a más números (Etapa 7), con el respaldo de la base ya probado (D35).
7. Pendiente desde el 2026-11-10: aplicar la migración `0005` (vigía, D43) y volver a desplegar. En el panel de Cloudflare debe aparecer la tarea programada `*/5 * * * *` en el Worker.

**Lo que respondió el dueño (2026-10-29, D36):** precios de carga inicial y mayorista, descuento por tamaño, empresas y facturas a una persona, un solo mensaje por pedido, textos sin cambios y los audios para Constanza. **Falta de su parte** (ver `docs/PENDIENTES.md`): carga inicial de 12 L y 10 L desde 3 envases, precios especiales de 12 L y 10 L, qué significa `Credito` y las gestiones en Meta. **Construido por sus respuestas (2026-10-29):** los precios nuevos (la recarga mayorista de 12 L y 10 L ya entra en el flujo; la carga inicial está calculada y probada, todavía sin usar) que el bot no responda los audios y que pida nombre, dirección y edificio al cliente nuevo (D37).

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
1. Crear el bot de Telegram con @BotFather y cargar `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` y el secreto del webhook. Sin ellos no sale ningún aviso por ahí, pero el panel los muestra igual. Hoy Telegram solo recibe los avisos urgentes. Confirmar pedidos desde Telegram necesitaría una ruta `/telegram` que todavía no existe: `telegram.ts` tiene las piezas sueltas (leer el botón, validar el chat y el secreto), sin conectar.
2. Que el panel esté desplegado con su acceso (ver "Panel de administración").
3. Decidir qué pasa con el cliente al cambiar un pedido en el panel (cada mensaje al cliente cuenta en el cupo gratis). Hoy el panel no escribe al cliente.

---

## Panel de administración (D32)

**Estado (2026-11-10):** la fase P1 (bandeja) y la primera parte de P2 (reparto del día, pedidos a mano y búsqueda, D42) están construidas y probadas en local; el acceso será Cloudflare Access (D34). Falta que Franco active Zero Trust y desplegar el panel. Las demás fases, sin empezar. Cómo se usa: [GUIA_PANEL.md](GUIA_PANEL.md).

**Qué es:** una página privada en un Worker aparte (`brunen-panel`), gratis, donde Constanza y el dueño ven los pedidos y los avisos del bot, los confirman y, más adelante, administran a los clientes por ubicación, bidones y mapa. Los datos viven en D1 (fuente de verdad); el panel no tiene ningún secreto de WhatsApp, Google ni Groq.

| Fase | Qué incluye |
|---|---|
| P1 Bandeja (lista) | Pedidos por confirmar, confirmados y cerrados, con confirmar / cambiar (fecha, comuna, dirección, notas, bidones y precios) / cancelar / en ruta / entregado, lo que escribió el cliente, observaciones del bot e historial de cambios; avisos (reclamos, facturas, comprobantes, mensajes no entendidos, fallas) con "resuelto"; se actualiza sola con sonido y notificación; funciona en el celular y con tema oscuro |
| P2 Reparto del día | **Primera parte lista (D42):** las paradas del día por comuna y dirección, con la carga del furgón, lo que se cobra y los envases por retirar; copiar para WhatsApp o para Excel, descargar el archivo y marcar en ruta o entregado; anotar un pedido a mano y buscar. En diseño (D38; ver `docs/PENDIENTES.md`): una plataforma propia que haga lo que hoy hace Optiroute (la ruta más eficiente con los puntos del día, la vista del repartidor punto por punto y el seguimiento en vivo), más la carga con los sobrantes de cada turno, los vacíos por parada con justificación de faltantes y la hora de llegada para el cliente. No depende de Meta |
| P3 Clientes y mapa | Ficha, historial y envases por cliente; importación del Excel; mapa por comuna y con punto exacto; el bot pasa a leer los clientes de D1 |
| P4 Estadísticas | Bidones entregados por día, semana y mes; envases pendientes por cliente; comprobantes por revisar. El dueño no pidió ventas en pesos, clientes que dejaron de pedir ni reclamos abiertos (D36) |
| P5 Configuración | Interruptor del bot y aviso de contingencia, precios, feriados y textos editables, sin tocar la planilla |

**Probarlo en tu computador** (sin tocar producción: todo es local):
1. `npm run datos-locales`: crea las tablas en la base D1 local y carga pedidos y avisos ficticios, con entregas para hoy y para mañana. Se puede repetir: cada vez los deja como recién llegados.
2. `npm run dev:panel -- --var PANEL_DEV_CORREO:tu@correo.test` y abrir http://localhost:8787 (si el puerto está ocupado, agregar `--port 8788`). `PANEL_DEV_CORREO` solo funciona desde localhost.

**Cómo encenderlo en producción** (cada paso con aprobación de Franco):
1. Aplicar las migraciones y desplegar el bot, como en la Etapa 4 (hecho el 2026-10-29).
2. Cloudflare → Zero Trust: elegir el nombre del equipo (queda `<equipo>.cloudflareaccess.com`) y el plan Free (hasta 50 usuarios, sin costo). **Cloudflare pide registrar un método de pago aunque no cobre** (D33): lo registra Franco o el dueño, y no se activa ningún producto de pago. El acceso con Cloudflare Access ya está decidido (D34).
3. `npm run deploy:panel`: el panel queda en `https://brunen-panel.<subdominio>.workers.dev` (sin direcciones de versión, D34) y responde 503 hasta el paso 5. No muestra nada sin acceso configurado.
4. Zero Trust → Access controls → Applications → Create new application → "Self-hosted and private" → agregar el nombre de host del panel → política "Allow" con los correos de Constanza, Franco y el dueño → método de acceso con código por correo. Si el menú no deja elegir un `workers.dev`, la configuración del Worker permite activar Access para su dirección `workers.dev` (https://developers.cloudflare.com/workers/configuration/routing/workers-dev/). Los nombres de los menús son los de la documentación del 2026-10-28; verificarlos al hacerlo. Duración de la sesión: dejar las 24 horas (D34).
5. En la aplicación: Configure → Additional settings → copiar el "Application Audience (AUD) Tag". En `wrangler.panel.toml` poner `ACCESS_TEAM_DOMAIN = "<equipo>.cloudflareaccess.com"` y `ACCESS_AUD = "<el tag>"` (no son secretos) y volver a desplegar el panel.
6. Abrir la dirección: debe pedir el correo, mandar un código y mostrar la bandeja. Probar que un correo que no está en la política no entra. Borrar la cookie `CF_Authorization` del navegador y esperar unos segundos: la pantalla debe mostrar "Se cerró tu sesión" con el botón "Volver a entrar", y el título de la pestaña debe empezar con ⚠. Opcional: `PANEL_CORREOS` como segunda barrera, cargada con `npx.cmd wrangler secret put PANEL_CORREOS -c wrangler.panel.toml` (son correos de personas: no van en `wrangler.panel.toml` porque el repositorio es público).
7. Medir el CPU del panel con `wrangler tail` (límite de 10 ms, D31 y D33).

**Cuidados:** el panel muestra datos personales (teléfonos, direcciones): acceso solo para personas autorizadas, sesión segura, registro de quién confirma qué, y ninguna dirección sale hacia servicios externos (el mapa no geocodifica con terceros).

---

## Plataforma de administración y reparto (D49)

**Estado (2026-11-11):** Franco aprobó el diseño ([DISENO_PLATAFORMA.md](DISENO_PLATAFORMA.md)). **Fase A construida y probada en local, sin desplegar** (D51): portada con dos entradas, ingreso con RUT y clave de 4 dígitos, administrador con Cloudflare Access además, dispositivo recordado, pestaña Equipo y aplicación instalable. **Fase B construida y probada en local, sin desplegar** (2026-11-12): pago, factura y tipo de cliente en cada pedido (D52, migración `0008`); fichas de clientes con varios teléfonos e historial de direcciones, y pestaña Clientes (D53, migración `0009`); cargador del historial del Excel (D54, probado en la base local con 6.795 pedidos); y el bot muestra "Entrega en: …" (D55). **Fase B terminada (2026-11-12, D57):** el bot lee las fichas (cliente por su ficha, aunque escriba desde otro número), sigue tomando pedidos si Google falla y "lo de siempre" usa los pedidos guardados. Además, "Les toca pedir" (D58) y pedidos fijos (D59, migración `0010`). **Fase C construida (2026-11-14, D63):** el reparto se parte en cargas de hasta 65 bidones (D60) y la pestaña Reparto calcula la ruta más corta desde la planta y de vuelta, con recarga en la planta o en Actum, la muestra en un mapa, deja cambiarla y ubicar direcciones a mano, y la publica para el repartidor. Las direcciones aprenden su punto con el GPS del repartidor al entregar. Migración `0012`. Sin publicar. **Fase D construida (2026-11-12, D61):** panel del repartidor con la ruta de hoy, Navegar, Llamar, Entregado (vacíos y cobro) y No se pudo (motivo y aviso), trabajo sin señal y el avance en la pestaña Reparto del administrador. Migración `0011`. Sin publicar. Siguen: E (posición en vivo), F (ruta eficiente y fin de la plataforma de pago), G (envases y caja).

**Probar la fase A en tu computador:** `npm run datos-locales` y luego `npm run dev:panel -- --port 8788 --var PANEL_DEV_CORREO:tu@correo.test --var PANEL_SECRETO:cualquier-texto-de-mas-de-32-caracteres`. Abre http://localhost:8788: la primera vez, la entrada Administrador te pide elegir tu RUT y tu clave; desde Equipo creas un repartidor y entras con él por la otra entrada.

**Para publicarla:** la versión al día de estos pasos, con dos direcciones (D56, opción 1), está en [PUBLICAR.md](PUBLICAR.md), y las cuentas y Zero Trust en [CUENTAS.md](CUENTAS.md). Lo de abajo queda como referencia de la primera versión (cada paso con aprobación de Franco; reemplaza los pasos 3 a 6 de la sección del panel, más abajo):
1. Migración `0007` en la base real (`npx.cmd wrangler d1 migrations apply brunen-chatbot --remote`), con el punto de restauración anotado antes.
2. Secreto de las claves: `npx.cmd wrangler secret put PANEL_SECRETO -c wrangler.panel.toml`, con un texto al azar de 48 caracteres o más que no se guarda en ningún otro lado. Si se pierde o se cambia, todas las claves dejan de servir y hay que crearlas de nuevo.
3. `npm run deploy:panel`.
4. En Zero Trust, la aplicación de Access cubre solo `<dirección del panel>/admin` y `/admin/*`, con la política de los correos de los administradores (el repartidor no va en esa lista) y la duración de sesión más larga que ofrezca. Si `workers.dev` no permite proteger solo una ruta, ver la alternativa en D51.
5. `ACCESS_TEAM_DOMAIN` y `ACCESS_AUD` en `wrangler.panel.toml` y volver a desplegar.
6. Comprobar: la portada abre sin pedir nada; `/admin/` pide el código por correo y después el RUT y la clave; `/admin/api/pedidos` sin sesión responde 401; un repartidor entra por su entrada y no puede abrir `/admin/`; instalar la aplicación en un teléfono y ver que no vuelve a pedir la clave.

## Etapa 6 — Comprobantes, audio y lista del día

**Estado (2026-11-10):** la lista del día está en el panel (pestaña Reparto, `reparto.ts`, D42; columnas provisionales); decidido dónde guardar los comprobantes (en D1: D30 y D32), sin construir.

**Falta:**
1. Lista del día: hecha en el panel (D42). Falta ajustar las columnas al archivo de importación de la app de rutas (confirmar si es OptimoRoute).
2. Imágenes: guardar los comprobantes en D1 (D30, D32). Con coexistencia la imagen también queda en la app de WhatsApp Business, así que se construye cuando esté decidido el número (D45). Bajar la imagen apenas llega (la dirección dura 5 minutos), avisar a la operadora y anotar en PAGOS; el bot no verifica pagos solo.
3. Audio: el bot no responde y deja un aviso, porque los audios los responde siempre Constanza (D36). Transcribirlos con Groq (Whisper, gratis hasta 2.000 solicitudes por día según la consola, D23) sería una decisión del dueño por privacidad.
4. Fuera de zona y reclamos ya están en el motor de la Etapa 4.
