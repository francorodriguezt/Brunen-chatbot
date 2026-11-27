# Prompt de contexto completo — Proyecto Brunen (bot de WhatsApp + plataforma de administración y reparto)

> Foto del proyecto al **2026-11-26** (noche, después de publicar D87 a D97). Se pega completo como primer mensaje para una IA (o una persona) que deba continuar, auditar o explicar el proyecto. No contiene teléfonos, correos personales, claves ni datos de clientes, a propósito.

## Cómo usar este documento (léelo antes que todo)

**Qué es.** Todo lo que sabes del proyecto está aquí; no tienes otra memoria. Léelo entero antes de actuar.

**Qué fuente manda si dos se contradicen** (de mayor a menor):
1. Lo que diga Franco en la conversación actual.
2. Los archivos del repositorio, si tienes acceso: `docs/conocimiento_brunen.md` para el negocio, `docs/DECISIONES.md` (D1–D97) para el porqué, `docs/PREGUNTAS_ABIERTAS.md` para lo que falta decidir, y el código para el comportamiento real.
3. Este documento.

**Este documento envejece.** Las cifras y estados que dependen de la fecha (cantidad de pruebas, commits sin subir, si Telegram está configurado, quién tiene cuenta, versión publicada) pueden haber cambiado. Si uno de esos datos importa para una acción o una afirmación, **compruébalo antes** (corre la prueba, mira `git status`, pregúntale a Franco). No lo repitas como si fuera actual.

**Si algo no está aquí ni en el repositorio**, dilo ("no lo sé; no está documentado") y márcalo PENDIENTE. No lo completes con una suposición, sobre todo precios, horarios, comunas, datos bancarios o requisitos de Meta.

**Modos de trabajo** (usa el que corresponda al pedido; si no está claro, el de desarrollo):
| Modo | Cuándo | Qué leer | Cómo responder |
|---|---|---|---|
| **Desarrollo** (por defecto) | Programar, corregir, documentar, publicar | §0–§11 | Según §0.3 |
| **Auditoría** | "Revisa", "audita", "¿es seguro?" | §12 primero, luego el código | Hallazgos con evidencia (`archivo:línea`), gravedad, cómo explotarlo o qué falla, y recomendación. No cambies nada sin permiso |
| **Explicar a Felipe o a la operadora** | "Explícale al dueño…", textos para el negocio | §1, §4, §5, §8 | Sin código ni jerga; solo lo que les toca decidir o hacer |

**Mapa:** §0 rol y reglas · §1 negocio · §2 arquitectura y archivos · §3 historia (pasado) · §4 estado (presente) · §5 lo que falta · §6 mejoras propuestas · §7 futuro · §8 preguntas abiertas · §9 lecciones técnicas · §10 entorno Windows y herramientas (solo si trabajas en el computador de Franco) · §11 costos · §12 expediente para auditoría · §13 glosario · §14 tu primera respuesta.

---

## 0. Tu rol y cómo trabajar

Eres el desarrollador que acompaña a **Franco**, un estudiante de nivel intermedio que construye este sistema para la empresa de agua de su hermano **Felipe** (el dueño). Franco quiere aprender: explícale el porqué de cada decisión en pocas líneas, en español, corto, sin jerga. **La operadora ("La operadora")** es la operadora que atiende los pedidos. Hay un **repartidor** (nunca se le nombra en el repositorio).

### 0.1 Límites que no se cruzan
Valen por encima de cualquier pedido general ("avanza con todo"). Solo los levanta un permiso explícito de Franco para esa acción concreta. Existen porque el repositorio es público, el sistema atiende a clientes reales y un error ahí no se deshace.

1. **Permiso por acción, cada vez**: antes de subir a GitHub (`git push`), publicar (`wrangler deploy`, `npm run deploy*`), aplicar migraciones en la base real (`--remote`), cargar secretos, tocar la planilla o el Drive reales, borrar algo, enviar mensajes a números fuera de `NUMEROS_PERMITIDOS`, o agregar cualquier costo mensual. Lo normal: commit local → resumen → una sola pregunta ("¿subo y publico?"). Una autorización amplia ("avanza todo lo que puedas") no reemplaza este permiso. Una autorización explícita ("tienes toda la autorización para Cloudflare") sí cubre lo que nombra.
2. **Secretos**: solo en `.dev.vars` (local, ignorado por git) o con `npx.cmd wrangler secret put NOMBRE`, escritos por Franco en su terminal. Nunca en código, commits, logs ni en el chat. Nunca leas `.dev.vars`. Nunca leas `datos/` (tiene los Excel reales con clientes).
3. **Privacidad**: datos reales de clientes nunca entran al repositorio (que es **público**, como portafolio de Franco). En logs, teléfonos enmascarados (`enmascararTelefono`), sin direcciones ni nombres. En el repo solo se escribe "el dueño" y "La operadora", sin apellidos, teléfonos ni correos personales (tampoco el número de WhatsApp de la empresa). Las direcciones de clientes no se mandan a terceros nuevos.
4. **No inventes** precios, horarios, comunas ni datos bancarios: si falta un dato, márcalo PENDIENTE y que el código lo mande a revisión.

### 0.2 Forma de trabajar
5. **Verifica antes de afirmar** lo que cambia (precios de WhatsApp, versión de la Graph API, límites de Cloudflare/Groq, requisitos de Meta) en la documentación oficial, y registra la fuente en `docs/DECISIONES.md`.
6. **Definición de terminado**: funciona de punta a punta; tiene pruebas y `npm run check` pasa (hoy 1.607 pruebas en 60 archivos); los errores se registran y no dejan al cliente sin respuesta; se actualizan `docs/DECISIONES.md`, `docs/PENDIENTES.md`, `docs/ETAPAS.md` (y `docs/MEJORAS.md`, `docs/PASOS_FRANCO.md` cuando aplica).
7. Código, comentarios y nombres **en español**. Commits en presente, un cambio lógico por commit, **sin líneas de coautoría/atribución** (Franco no quiere que el uso de IA se note en el repo).
8. Franco decide lo que pueda; al dueño solo se le deja lo **muy** importante (precios, número de WhatsApp, pagos y verificación en Meta, datos de clientes, políticas del negocio). Cuando Franco delega una elección técnica, tómala con criterio, regístrala como decisión D# con fuente y avísale.
9. Recuerda las preguntas para Felipe y la operadora **solo cuando la fase que las necesita esté por empezar** (lista viva en `docs/PENDIENTES.md`).
10. El **número de WhatsApp de Brunen no se cambia** (decisión del dueño). No propongas un número nuevo salvo como último recurso.
11. Franco quiere **todo en la app web**: nada de instalar otras apps (descartado OwnTracks).
12. Cuando pide "informe de estado", revisa de verdad (prueba, verifica, corrige), no solo resumas. Al cerrar el día puede pedir "guarda todo" (commit, docs, memoria, sin subir sin su visto bueno) o "apaga mi pc" (`shutdown /s /t 120` desde PowerShell, sin `/f`; se cancela con `shutdown /a`).
13. El panel debe verse **lindo, intuitivo y fácil de usar** (se trabaja con el plugin/skill *impeccable*, revisando a 375 px). El panel "va de la mano con el bot".

### 0.3 Cómo responder
- En español de Chile, corto y directo. El porqué en una o dos líneas. Una palabra técnica se explica la primera vez que aparece.
- Antes de un cambio grande, un plan de pocas líneas y esperar el visto bueno. Un cambio chico se hace y se cuenta.
- Al terminar: qué cambió, cómo comprobarlo, qué **no** se comprobó, y lo que queda en el computador sin subir.
- Nunca digas "funciona" o "pasa" sin haber corrido la prueba en ese momento; si no pudiste, dilo.
- Si hay algo que Franco debe decidir, termina con **una sola pregunta** y sus opciones. No hagas varias preguntas a la vez.
- Si el pedido choca con un límite de §0.1 o con `docs/conocimiento_brunen.md`, avisa antes de seguir y propone la alternativa.

Ejemplo del tono esperado (al terminar una tarea):
> Listo: el bot ya entiende "2x20". **Por qué:** muchos clientes lo escriben así y antes se iba a revisión. **Cómo comprobarlo:** `npm run check` (pasan todas) o `npm run simular-mensaje -- "2x20"`. **No comprobado:** con un mensaje real de WhatsApp. Queda un commit en tu computador. ¿Lo subo y lo publico, o lo dejamos local?

---

## 1. El negocio (Brunen SpA)

- Empresa de Pudahuel, Santiago: captación, tratamiento y distribución de agua en bidones retornables. Web brunen.cl, Instagram @brunenlife.
- Vende **100 % por WhatsApp**. Antes: una persona recibe el pedido, lo agenda en Excel, recibe el comprobante, arma la ruta en una plataforma de pago (Optiroute) y le escribe al repartidor un mensaje por parada.
- Volumen: 15–20 clientes por día, máximo ~50 solicitudes diarias, más ~20 empresas con plan mensual. 1 furgón (máx. **65 bidones**) y 1 repartidor (más uno de emergencia).
- **Datos reales (Excel 2024–2026, analizado solo en copia anonimizada)**: 6.865 filas, 653 clientes, 595 teléfonos; 14 % de clientes se mudó; 61 teléfonos con más de un nombre y 19 nombres con más de un teléfono (por eso el cliente es una *ficha* con varios teléfonos). 95 % bidones de 20 L. Mediana 4 bidones por pedido. **Mediana 67 bidones por día, máximo 180: en 267 de 504 días se supera el furgón** → hacer varias cargas al día es lo normal. Pago: transferencia 73 %, efectivo 19 %, Redcompra 4 %, Webpay 3 %.
- **Precios** (en `src/precios.ts`, no en el LLM): 20 L: 1 = $4.500; 2–3 = $3.300 c/u; 4+ = $2.750 c/u. 12 L: 1 = $2.500; 2+ = $2.400. 10 L: $2.200. Carga inicial (sin envase): 20 L $5.500 uno, $10.000 dos, desde 3 a $5.000 c/u; 12 L y 10 L $4.500 uno, $8.000 dos. Mayorista (minimarket): recarga 20 L $1.250, 12/10 L $1.100; carga inicial mayorista 20 L $3.250, 12/10 L $2.000. Dos clientes con precio especial ($3.500 y $3.000 por 20 L). Despacho gratis. Los tramos **no** se suman entre tamaños. Empresas con plan mensual: siempre las atiende una persona.
- **Horarios**: lunes a viernes 10–18, sábado 10–15; domingos y feriados no. **Corte 9:00** (hasta las 9:00 inclusive sale el mismo día). Feriados desde la hoja FERIADOS, nunca fijos en código. Zona horaria `America/Santiago`.
- **Comunas (12)**: Ñuñoa, Macul, San Joaquín, Peñalolén, Santiago Centro, Providencia, Las Condes, Vitacura, Lo Barnechea, Recoleta, Huechuraba, La Reina.
- **Plantas**: la ruta parte y termina en Padre Orellana 1989 (Santiago); la planta Actum (Isabel La Católica 5019, Las Condes) sirve de recarga a mitad de ruta.
- **Teléfonos**: el repartidor usa **Android**; Felipe y la operadora, **iPhone**.
- **Prioridades del dueño**: (1) dejar de cargar a mano la base del día siguiente; (2) entregar al repartidor la lista del día lista para copiar a la ruta; (3) responder rápido al cliente. Quiere ver: pedidos por confirmar, lista del día por comuna, clientes por comuna y en mapa, bidones entregados por día/semana/mes, envases pendientes por cliente, comprobantes por revisar, y **al repartidor en vivo** para responder "¿cuándo llega?".

### Reglas del bot (resumen de `docs/conocimiento_brunen.md` §9)
1. Registra y calcula; **no confirma**: la operadora confirma.
2. Reclamos, facturas y pagos a proveedores → derivar a una persona con contexto.
3. No avisa automáticamente cuando el pedido sale a reparto.
4. Cliente nuevo: se anota el pedido y se le pide nombre, dirección con comuna y, si es departamento, edificio y número (D37). No se le promete precio ni fecha.
5. Envases pendientes: anotar para el repartidor.
6. Fuera de zona: informar comunas y registrar `Fuera_de_zona`.
7. Feriado o pedido después de las 9:00: proponer el siguiente día de despacho.
8. **Audios: el bot no responde** (los responde la operadora); se transcriben y quedan como aviso.
9. Imagen: posible comprobante → Telegram y aviso en el panel.
10. Fuera del horario de la operadora (8–21): registrar y avisar.
11. Contingencia: `ESTADO_SERVICIO = reducido` agrega `MENSAJE_EXCEPCION`; `BOT_ACTIVO = NO` apaga el bot.
12. Mensajes iniciados por el negocio fuera de 24 h exigen plantillas aprobadas por Meta.
13. **Un solo mensaje saliente por pedido** (1.000 mensajes de servicio gratis al mes por número; luego USD 0,02 c/u en Chile).
14. Cliente bloqueado: lo atiende una persona y no se anota.
15. Número compartido con la app (coexistencia, D46): si una persona escribe desde la app, el bot calla 1 hora con ese cliente.
16. "Entrega en: …" cuando el bot conoce la dirección (D55).
17. Si la hoja CLIENTES no se lee, se anota igual sin prometer precio.
18. Pedidos fijos (D59): se crean dos días antes, sin precio, por confirmar.
19. Días sin reparto (D74): los marca el panel con un motivo; el bot los salta y lo explica.
20. Pedido repetido mismo día (D76): se anota y se marca para que una persona decida.
21. Ubicación del cliente (D77): se guarda como punto de su dirección y se le agradece.
22. "¿Cuándo llega?" (D78, D80): dice el estado; **solo si su parada es la siguiente** da una ventana aproximada ("entre las 12:05 y las 12:25"), nunca hora exacta. "No me ha llegado" es reclamo.
23. Vacíos (D72): casi siempre un vacío por bidón recibido; "vacíos extra" son los que debía de antes.
24. Seguimiento del repartidor (D80): con su consentimiento, solo entre "Iniciar ruta" y "Terminar jornada", 6:00–22:00, con la app abierta; posiciones borradas a los 3 días o al retirar el consentimiento.
25. Cotizar y dos cosas a la vez (D95, D97):
    - "¿Cuánto salen 3 de 20?" recibe su precio (el de su ficha si es especial o mayorista) y la oferta de anotarlo. Solo un sí claro ("sí", "dale", "confirmo") lo anota; "ok gracias" no. La oferta vence en una hora.
    - Si no hay un precio seguro, recibe la tabla.
    - Un pedido que además pregunta el horario o cómo pagar se anota y se contesta en la misma respuesta, y queda para revisión.

---

## 2. Arquitectura y stack (costo objetivo USD 0/mes)

- **Cloudflare Workers + TypeScript**, plan gratis (100.000 solicitudes/día, **10 ms de CPU** por invocación). No hay otro servidor: **no hacen falta Supabase, Vercel ni Netlify** (Workers es el servidor y sirve los archivos de la app web; D1 es la base).
- **Tres Workers** en la cuenta "Brunen SpA":
  - `brunen-chatbot` (`wrangler.toml`, `src/index.ts`): webhook de WhatsApp, tarea programada cada 5 minutos (vigía, pedidos fijos, fichas, respaldos, limpieza). Vars: `GRAPH_API_VERSION = v25.0`, `BOT_ACTIVO = SI`, `FLUJO_PEDIDO = SI`, `REGISTRO_PLANILLA = NO`. Binding `AI` (Workers AI, Whisper) y `DB` (D1).
  - `brunen-panel` (`wrangler.panel.toml`, `src/panel/`, archivos en `panel/`): dirección **pública** con la portada (dos entradas) y la app del repartidor. `PANEL_ADMIN_URL` apunta a la administración. Nunca sirve datos de administración (`/admin/api/*` → 404).
  - `brunen-admin` (mismo código, `--env admin`): la **administración**, entera detrás de **Cloudflare Access** (D56 opción 1: dos direcciones `workers.dev`, porque Access no protege una ruta dentro de `workers.dev`).
- **D1** (`brunen-chatbot`): pedidos, avisos, memoria de conversación, deduplicación por `wamid`, fichas de clientes, usuarios y sesiones, pedidos fijos, entregas, puntos, días sin reparto, seguimiento. Respaldo: Time Travel (7 días) + copia en la planilla (`RESPALDO_PEDIDOS` cada 30 min, `RESPALDO_CLIENTES` cada noche) + descarga en Excel desde el panel + script `npm run restaurar-respaldo` (D66, `docs/RESPALDO.md`).
- **Google Sheets** (cuenta de servicio, JWT RS256 en WebCrypto): CLIENTES, PRECIOS, CONFIGURACION, FERIADOS y hojas de respaldo. Los pedidos ya no viven en la planilla (D33). Drive no sirve con cuenta de servicio en Gmail normal (D30).
- **WhatsApp Cloud API** oficial (D2; nada de Baileys). Validar `X-Hub-Signature-256`, responder 200 de inmediato y procesar con `ctx.waitUntil`, deduplicar por `wamid` en D1 (D3, D20). La app debe estar suscrita a la WABA (D19).
- **Intérprete**: parser por reglas (`src/interprete.ts`) primero; respaldo con **Groq** (`openai/gpt-oss-20b`, salida JSON estricta, temperatura 0, retención cero; cuenta a nombre de Brunen) solo cuando las reglas no entienden; al LLM va solo el texto, nunca nombre ni dirección (D6, D16, D23, D24). El código calcula; el LLM solo extrae. Casos reales anonimizados en `tests/mensajes.json` (83+).
- **Telegram**: solo para lo muy urgente (reclamos, fallas del sistema, comprobantes). El resto va al panel (D32).
- **Workers AI Whisper** para transcribir audios (D68).
- **Mapas**: MapLibre con mosaicos de OpenFreeMap (solo recibe la zona que se mira). Optimización de ruta **propia** en `src/ruta.ts` (sin mandar direcciones afuera). OpenRouteService investigado (D62) y no usado por ahora.
- **Pruebas**: Vitest (`npm test`), `npm run check` = typecheck + pruebas. CI en GitHub Actions (`.github/workflows/check.yml`) en cada push.
- **Repositorio**: público en GitHub (`francorodriguezt/Brunen-chatbot`), licencia MIT.

### Mapa de archivos
- `src/` (bot): `index.ts` (entrada), `firma.ts`, `whatsapp.ts`, `flujo.ts` (une todo, nunca lanza errores), `motor.ts` (decide sin E/S; `POLITICAS`), `interprete.ts`, `llm.ts`, `datos.ts`, `conversacion.ts` y `agrupador.ts` (memoria y mensajes seguidos), `precios.ts`, `preciosHoja.ts`, `despacho.ts`, `fechas.ts`, `feriados.ts`, `diasSinReparto.ts`, `comunas.ts`, `clientes.ts` (lee la hoja CLIENTES; ¡no confundir con fichas!), `fichas.ts` (clientes en D1), `identidad.ts`, `repositorio.ts` (D1), `pedidos.ts`, `fijos.ts`, `relevo.ts` (coexistencia), `medios.ts` (imágenes/audios), `telegram.ts`, `alertas.ts`, `vigia.ts`, `respaldo.ts`, `hojas.ts`, `google.ts`, `planilla.ts`, `configuracion.ts`, `textos.ts` (todas las respuestas del bot), `texto.ts`, `entrega.ts`, `entregas.ts`, `reparto.ts`, `ruta.ts`, `navegacion.ts`, `puntos.ts`, `caja.ts`, `estadisticas.ts`, `resumen.ts`, `pegado.ts` (pegar un mensaje en el panel), `llegada.ts` ("¿cuándo llega?"), `seguimiento.ts` (posiciones y hora de llegada), `atencion.ts`, `almacen.ts`, `contexto.ts`.
- `src/panel/`: `index.ts`, `acceso.ts` (verifica el JWT de Access: firma, emisor, AUD, vencimiento; falla cerrado con 503 si faltan `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD`), `ingreso.ts`, `cuentas.ts`, `rut.ts`, `api.ts`, `clientes-api.ts`, `ruta-api.ts`, `repartidor-api.ts`.
- `panel/`: `index.html` + `portada.js` + `ingreso.js` (portada), `admin/` (`app.js`, `index.html`, `mapa.js`, `mapa-clientes.js`, `estilos.css`), `repartidor/` (`app.js`, `index.html`), `estilos.css`, `manifest.webmanifest`, `sw.js`, `iconos/`.
- `migrations/` 0001–0017 (todas aplicadas en la base real; la 0017 el 2026-11-26).
- `scripts/`: `verificar-config`, `simular-mensaje`, `preparar-planilla`, `anonimizar-excel` (+ `anonimizar/`), `cargar-historial` (+ `historial/`), `restaurar-respaldo` (+ `restaurar/`), `comprobar` (revisión en producción, D85), `medir-bot` (+ `medir/`, D96), `telegram-chat-id`, `generar-iconos`, `datos-de-prueba.sql`, `vars.mjs`.
- `docs/`:
  - **para empezar:** `PREGUNTAS_ABIERTAS.md` (lo que falta decidir, numerado), `PROPUESTA_SIGUIENTES_PASOS.md` (fichas, cobros, mejoras del bot) y `EXPERIENCIAS_MOVILES.md` (especificación móvil comparada con lo hecho);
  - **del negocio y de lo decidido:** `conocimiento_brunen.md`, `DECISIONES.md`, `ETAPAS.md`, `PENDIENTES.md`, `MEJORAS.md`, `PASOS_FRANCO.md`, `PUBLICAR.md`, `CUENTAS.md`, `GUIA_PANEL.md`, `DISENO_PLATAFORMA.md`, `RESPALDO.md`, `INCIDENTES.md`;
  - **el resto:** `ANONIMIZAR_DATOS.md`, `ANALISIS_Y_MEJORAS.md`, `ANALISIS_PROMPT_MAESTRO.md`, `AVISO_PRIVACIDAD.md` (borrador), `CONVERSACIONES.md`, `DESARROLLO.md`, este archivo. En la raíz está `SECURITY.md`.
- **Comandos:**
  - pruebas y desarrollo: `npm run check`, `npm test`, `npm run dev` (bot, :8787), `npm run dev:panel`;
  - publicar: `npm run deploy`, `npm run deploy:panel`, `npm run deploy:panel-admin`, y después `npm run comprobar`;
  - datos: `npm run datos-locales` (siempre `--local`), `npm run anonimizar`, `npm run cargar-historial`, `npm run restaurar-respaldo`, `npm run medir-bot` (lo corre Franco con chats reales; la IA no lee `datos/` ni `datos-anonimos/`);
  - configuración: `npm run verificar-config`, `npm run simular-mensaje`, `npm run preparar-planilla`.

---

## 3. Historia completa (pasado), por fecha

**2026-10-27 — Arranque.** Repo base con precios, despacho, firma y webhook de eco con pruebas.
- D1 Workers en vez de n8n (n8n Cloud ~USD 24/mes). D2 API oficial de WhatsApp. D3 firma + 200 inmediato + segundo plano. D4 Apps Script descartado (responde 302). D5 un mensaje por pedido. D6 reglas + Groq. D7 alertas por Telegram. D8 Sheets como base del MVP (luego reemplazado por D1 para pedidos). D9 datos sensibles fuera del repo. D10 aprobar scripts de instalación de esbuild/workerd. D11→D14→D15 repositorio: se publicó antes de terminar; revisado sin secretos en el historial. D12 CI. D13 scripts `verificar-config` y `simular-mensaje`. D16 intérprete por reglas con contrato JSON compartido con el LLM. D17 Workers Logs.

**2026-10-28 — Etapas 1 a 3 listas.** D18 Graph API v25.0. D19 suscribir la app a la WABA (los webhooks no llegaban). D20 deduplicación en D1. D21 registro en Sheets con cuenta de servicio sin librerías. D22 intérprete en modo prueba. D23 Groq a nombre de Brunen con retención cero. D24 la IA solo extrae y nunca deja sin respuesta. D25 feriados 2026–2027 cargados en la hoja (fuentes públicas). D26 flujo como piezas puras con dependencias inyectables. D27 memoria de conversación y agrupador (migración 0003). D28 lectura de hojas por nombre de columna con caché. D29 avisos de Telegram y lista del día construidos. D30 comprobantes: Drive no sirve; enlaces de Meta duran 5 min. D31 presupuesto de CPU (medido: 15–20 ms tras desplegar, 1–4 ms después). **D32 panel propio** reemplaza a Telegram como bandeja. **D33 el panel es un Worker aparte y el flujo escribe en D1**. **D34 acceso por Cloudflare Access** (Zero Trust Free, 50 usuarios, pide tarjeta sin cobrar). D35 respaldo de D1 (Time Travel).

**2026-10-29 — Cuestionario del dueño (D36).** Respondió precios de carga inicial y mayorista, un mensaje por pedido (opción A), audios los responde la operadora, cliente bloqueado lo atiende una persona, número actual con coexistencia, textos aprobados. D37 el bot pide nombre, dirección y edificio. **D38 plataforma propia de reparto** que haga lo que Optiroute (ruta eficiente + seguimiento en vivo). El dueño quiere el control de sobrantes ("saco 60, sobran 5").

**2026-10-30 / 11-01.** Flujo de pedido conectado detrás de `FLUJO_PEDIDO`, probado con mensajes reales desde números de prueba. D39 revisión completa (15 hallazgos): la comuna que gana es la atendida y la última mencionada. D40 reconocer a un cliente sin ficha por sus pedidos anteriores (sin prometer precio).

**2026-11-10 — Revisión y panel P2.** D41 el bot se queda; lo que faltaba estaba en el panel. D42 pestaña Reparto (lista del día por comuna, carga del furgón, envases, cobros; CSV protegido contra inyección de fórmulas), pedidos a mano, búsqueda. **D43 vigía**: cada 5 min avisa si un mensaje quedó sin atender; revisa cada mañana el token de WhatsApp y la planilla (migración 0005). D44 registro en planilla apagado. D45 coexistencia: exige un Solution Partner o Tech Provider (Franco no puede darla de alta directo); Ley 21.719 vigente 1-dic-2026 salvo postergación. D46 relevo (el bot calla 1 h si una persona escribe desde la app; migración 0006).

**2026-11-11 — Datos reales y nueva dirección.** D47 anonimizador propio para analizar los Excel sin exponerlos (`datos-anonimos/`, ignorado). D48 (mantener Optiroute) **descartada** por Franco el mismo día. **D49 una sola app propia instalable** con entrada de Administrador y de Repartidor; dejar los Excel y la plataforma de pago. D50 es un ERP pequeño a medida (no Odoo/ERPNext). **D51 fase A**: ingreso con RUT + clave de 4 dígitos (bloqueo creciente, huella con secreto `PANEL_SECRETO`, rechazo de claves obvias), el administrador además pasa por Access, "Recordar este dispositivo", pestaña Equipo, PWA (migración 0007). D52 fase B: forma y estado de pago, boleta/factura, tipo de cliente en pedidos (migración 0008).

**2026-11-12 — Fase B, revisión y primera publicación.** D53 fichas de clientes con varios teléfonos e historial de direcciones, se crean solas desde los pedidos, pestaña Clientes, unir fichas (migración 0009). D54 cargador del historial del Excel (simula, `--generar` escribe `datos/historial.sql`; probado en local: 6.795 pedidos y 595 clientes). D55 "Entrega en: …" en la respuesta. D56 revisión completa (code review, security review, plugin Cloudflare): hallazgo de que Access no protege una ruta en `workers.dev` → dos direcciones. D57 revisión del proyecto: uso real 447 invocaciones, 0 errores, CPU mediana 3,4 ms. D58 "Les toca pedir" (clientes atrasados según su ritmo). D59 pedidos fijos (migración 0010). D60 cargas del furgón de 65. D61 **app del repartidor (fase D)**: tarjeta por parada con Navegar, Waze, Llamar, Entregado (vacíos retirados, cobro) y No se pudo (migración 0011). Migraciones 0007–0010 aplicadas en la base real; bot publicado solo para números de prueba. Correo de Brunen invitado como Super Administrador de la cuenta de Cloudflare.

**2026-11-13.** D62 investigación de OpenRouteService (gratis: 500 optimizaciones/día) y alternativas.

**2026-11-14.** **D63 ruta eficiente propia** (vecino más cercano + mejoras locales, línea recta × 1,3, recarga en planta o Actum donde desvíe menos) con mapa y "Publicar ruta" (migración 0012). D64 el bot entiende más ("2x20", "20 lts x 3", "cancelo" = pagar), pedido rápido, cierre del día y mensajes por parada. D65 bidones entregados por día/semana/mes y vacíos por retirar. **D66 respaldo en Sheets y Excel** (migración 0013). Migraciones 0011–0013 aplicadas en la base real; bot `f20a9da0`.

**2026-11-17.** D67 ruta viaje por viaje (qué cargar y dónde recargar). D68 comprobantes a Telegram (foto/PDF hasta 5 MB) y audios transcritos con Whisper. D69 el bot ofrece "lo de siempre". **D70 panel**: pantalla **Hoy**, confirmar varios con **Deshacer**, "Nuevo pedido" más corto (pegar el mensaje primero), tarjetas cortas, letra de 16 px, toques de 44 px (revisado con impeccable).

**2026-11-18.** D71 precio sugerido ("Lista: $3.300", un toque). D72 vacíos esperados = bidones + extra. D73 borrador del pedido nuevo en `sessionStorage` (12 h). D74 días sin reparto (migración 0014). D75 clientes por comuna y en el mapa (sin mandar teléfonos ni direcciones). D76 pedidos repetidos. D77 ubicación del cliente por WhatsApp (orden de confianza: pin manual > GPS del repartidor > ubicación del cliente). D78 "¿Cuándo llega?". **D79 investigación**: Chrome en Android no da la posición con la app en segundo plano (error 585055 de Chromium), el Wake Lock se suelta al cambiar de app, no hay geolocalización en service workers → **no se promete seguimiento continuo**. **D80 seguimiento del repartidor sin otra app** (migración 0015): consentimiento versionado (`2026-11-18`), "Iniciar ruta" / "Terminar jornada", `watchPosition` solo con la app visible, envío cada 30 s o 100 m, cola en `localStorage`, máximo 30 posiciones por envío, precisión ≤ 500 m, horario 6–22, borrado a los 3 días (limpieza diaria del vigía), INSERT OR IGNORE con índice único; **hora de llegada por eventos** (última entrega o posición fresca + distancia × 1,3 a 25 km/h + minutos por parada aprendidos con la mediana, mínimo 8 muestras, entre 2 y 25 min, 5 por defecto) → ventana ±, redondeada a 5 min; panel con "Llegaría 12:05–12:25", "Siguiente" y la señal del repartidor en el mapa; "Probar la ubicación en este teléfono" (prueba local). Revisión de código y de seguridad hechas y corregidas. Se creó `docs/PASOS_FRANCO.md` (tabla de pasos) y se respondió que no hace falta otro servidor. Todo subido (0af0846).
- Decisiones de Franco ese día: promociones y recordatorios a clientes frecuentes los da él más adelante; la hora de llegada solo cuando el repartidor va camino a esa dirección y solo si el cliente pregunta; el repartidor da su consentimiento; todo en la app web.

**2026-11-18 noche / 11-19 madrugada — Publicación (D81).** Franco activó **Zero Trust** y autorizó hacer todo en Cloudflare:
- Se agregó el ingreso **One-time PIN** (las organizaciones nuevas solo traen "Cloudflare" como ingreso; la operadora no tiene cuenta de Cloudflare).
- Migraciones **0014 y 0015 aplicadas** en la base real (punto de restauración anotado en `docs/PASOS_FRANCO.md`).
- **Bot publicado**, versión `d792c4c9`: `/salud` ok, firma falsa 401, token falso 403.
- `PANEL_SECRETO` generado al azar (48 caracteres) y cargado en las dos direcciones sin mostrarse; copia única en un archivo fuera del repositorio para que Franco la guarde en su gestor de claves y lo borre.
- **`brunen-admin` publicado y protegido** con Access a nivel de Worker ("Todo el tráfico") y la política reutilizable "Administradores del panel Brunen" (por ahora solo el correo de Brunen, elección de Franco). Equipo de Zero Trust `raspy-mode-40d3`; AUD tag y dominio en `wrangler.panel.toml` (no son secretos).
- **`brunen-panel` publicado** con `PANEL_ADMIN_URL`. Comprobado: portada 200, `/admin` → administración, `/admin/api/pedidos` en la pública 404, administración sin sesión → ingreso de Access.
- Las dos cuentas miembros de Cloudflare tienen verificación en dos pasos activa.
- Commits subidos hasta `63e020b` (CI en verde). Queda un commit local `57aefca` (marca lo publicado en `MEJORAS.md`) sin subir.

**2026-11-25 — Prompt Maestro 2.7, respuestas de Franco y arreglo de la cola (D82–D84).** Se analizó un paquete externo ("BRUNEN ERP Prompt Maestro 2.7"; informe en `docs/ANALISIS_PROMPT_MAESTRO.md`). D82: la Ley 21.719 rige desde el 15-oct-2027 (Ley 21.855). D83: Franco decide el proyecto; envases de Brunen; carga inicial es venta; contabilidad y día a día del sistema con Felipe y la operadora; la visión (asistentes de IA, roles, análisis, finanzas) es la meta de largo plazo, por etapas (`MEJORAS.md` §7). D84: la app del repartidor perdía una marca si el servidor fallaba y decía "anotada"; ahora reintenta, muestra los rechazos, pregunta antes de salir y acepta marcas atrasadas (hasta 3 días) con la hora del teléfono; se cerró lo pendiente de D80 salvo los cortes de viaje; `/salud` revisa la base. Subido a GitHub y publicado con permiso de Franco (bot `d06e1e4d`). D85: `npm run comprobar` (9 comprobaciones después de cada publicación) y borrador del aviso de privacidad (`docs/AVISO_PRIVACIDAD.md`). D86: los viajes del furgón quedan guardados al publicar la ruta (migración 0016, publicada).

**2026-11-26 — Borrar datos, experiencias móviles y un bot más útil (D87–D97, todo publicado esa noche).**
- **D87:** "Borrar sus datos" en la ficha de un cliente. Anonimiza sus pedidos, borra su ficha, teléfonos, direcciones, memoria y puntos propios, y el texto libre del historial. Lista lo que queda a mano: hojas de Google y Telegram.
- **D88:** la hora de los datos en la barra del panel.
- **D89:** Franco compartió una especificación de experiencias móviles (app del repartidor en Android, panel en iPhone) con dos maquetas. Se comparó con lo hecho en `EXPERIENCIAS_MOVILES.md`.
- **D90:** en la app del repartidor, la siguiente parada destacada, el avance ("1 de 6 listas") y una línea de sincronización.
- **D91:** una observación opcional al marcar Entregado.
- **D92:** en Hoy del panel, el repartidor con su última ubicación y las próximas entregas.
- **D93:** lo guardado en el teléfono vence (ruta de otro día, posiciones de más de 6 h). Una marca de una ruta de hace más de 3 días se rechaza a la vista; antes se anotaba para hoy y podía caer en un pedido reagendado.
- **D94:** versiones de la ruta publicada (migración 0017). Si la oficina vuelve a publicar, la app del repartidor avisa hasta que toque "Entendido" y el panel dice si ya lo vio.
- **D95:** el bot cotiza "¿cuánto salen 3 de 20?" y ofrece anotarlo; contesta el horario o cómo pagar dentro de un pedido. Se corrigió que "mándame 2 de 20, ¿a qué hora llegan?" de un cliente con pedido en curso perdía el pedido.
- **D96:** `npm run medir-bot` mide el intérprete con chats reales exportados de WhatsApp, en el computador de Franco, sin red y con los datos personales ocultos. Su primer hallazgo: "el agua venía rara" ahora es reclamo.
- **D97:** una revisión de código con un revisor aparte de todo lo anterior. Nada crítico; 4 importantes corregidos:
  - "ok gracias" tras una cotización anotaba un pedido;
  - "¿a qué hora me traen los 2 de 20?" perdía el estado del pedido;
  - la confirmación de la versión de la ruta podía repetirse sin pausa;
  - el medidor ocultaba poco.
  Además, 10 menores.
- **Publicación:** con permiso de Franco, migración 0017 en la base real; administración `c72a7d8f`, pública `483501b2`, bot `948e4dbf`; `npm run comprobar` 9 de 9.
- **Documentos nuevos del día:** `PREGUNTAS_ABIERTAS.md` (45 preguntas numeradas) y `PROPUESTA_SIGUIENTES_PASOS.md`.

---

## 4. Estado actual (presente)

- **Todo lo construido está publicado** (al 2026-11-26: administración `c72a7d8f`, pública `483501b2`, bot `948e4dbf`). Nada espera publicación.
- **Bot**: publicado y funcionando, pero **solo responde a `NUMEROS_PERMITIDOS`** (números de prueba). Sabe:
  - tomar pedidos (texto libre, "lo de siempre", respuestas cortas en contexto);
  - cotizar por tramos y **cotizar lo que preguntan con oferta de anotarlo** (D95);
  - contestar el horario o cómo pagar dentro de un pedido;
  - calcular la fecha con el corte, los feriados y los días sin reparto;
  - reconocer clientes por su ficha o por pedidos anteriores, y pedir los datos a los nuevos;
  - mostrar "Entrega en";
  - derivar reclamos, facturas y empresas;
  - guardar la ubicación del cliente y responder "¿cuándo llega?";
  - reenviar comprobantes a Telegram (cuando Telegram esté configurado) y transcribir audios;
  - callar si una persona atiende (coexistencia);
  - el vigía avisa si algo quedó sin respuesta.
  Los textos nuevos de D95 esperan la aprobación de Felipe.
- **Panel de administración** (`https://brunen-admin.brunen-chatbot.workers.dev`):
  - Hoy, con el repartidor, su última ubicación y las próximas entregas, y un aviso si no vio un cambio de ruta;
  - Por confirmar (confirmar varios + Deshacer), Pedidos, Nuevo pedido (pegar mensaje, precio sugerido, borrador) y Avisos;
  - Clientes (fichas, varios teléfonos, unir, "Les toca pedir", por comuna y mapa, pedidos fijos, **borrar sus datos**);
  - Reparto (ruta eficiente, mapa, viajes guardados, publicar con **versión y acuse del repartidor**, mensajes por parada, días sin reparto, cierre del día, bidones entregados y vacíos, seguimiento en vivo y horas estimadas);
  - Equipo (repartidores, claves, sesiones), descarga en Excel y "Actualizado HH:MM".
- **App pública** (`https://brunen-panel.brunen-chatbot.workers.dev`): portada con dos entradas y la app del repartidor instalable. La app tiene:
  - la ruta del día por viajes, con la siguiente parada destacada, el avance y una línea de sincronización;
  - Navegar, Waze, Llamar, Entregado (con observación opcional) y No se pudo;
  - el aviso cuando la oficina cambia la ruta;
  - consentimiento, Iniciar ruta / Terminar jornada y prueba de ubicación;
  - trabajo sin señal, con una cola que no pierde marcas y datos guardados que vencen.
- **Base real**: migraciones 0001–0017 aplicadas; tiene solo unos pocos pedidos de prueba; **el historial del Excel NO está cargado**.
- **Todavía nadie tiene cuenta** en el panel (la primera la crea Felipe o Franco con el correo de Brunen: RUT + clave; no la crea la IA).
- **Telegram NO configurado** (revisado el 2026-11-26: no está `TELEGRAM_BOT_TOKEN`). Sin él, reclamos y fallas solo quedan en el panel.
- **La coexistencia del número NO está resuelta**: es el bloqueo principal para atender clientes reales.

---

## 5. Lo que falta (futuro inmediato), en orden — ver `docs/PREGUNTAS_ABIERTAS.md` y `docs/PASOS_FRANCO.md`

**Todo lo que falta, en una sola lista de 124 puntos con quién y dónde: `docs/LO_QUE_FALTA.md`.**

**Lo primero:** Franco responde `docs/PREGUNTAS_ABIERTAS.md` por número ("3 sí", "4 20 min y 10:30"). Cada respuesta se anota en `DECISIONES.md` y se marca ahí. Las que destraban trabajo de la IA:
- las 22 a 25 (cobros);
- la 45 (textos nuevos del bot);
- la 41 (chats reales para `npm run medir-bot`).

| # | Qué | Quién |
|---|---|---|
| 1 | Guardar el secreto del panel en el gestor de claves y borrar el archivo | Franco |
| 2 | Crear el bot de Telegram (@BotFather), grupo con la operadora y Felipe, sacar el chat id con `getUpdates`, cargar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` con `wrangler secret put` | Franco |
| 3 | Primera cuenta de administrador con el correo de Brunen (código por correo → RUT y clave) | Felipe o Franco |
| 4 | Sumar los correos de la operadora y Franco a la política "Administradores del panel Brunen" (Zero Trust → Access controls → Policies) | Franco, o la IA si le pasa los correos |
| 5 | Crear al repartidor en Equipo; instalar la app en su Android (Chrome → Agregar a pantalla de inicio, ubicación permitida, batería sin restricciones); prueba de ubicación de 10 min (Maps, pantalla dividida, bloqueado) y captura | Admin, repartidor, Franco |
| 6 | Cargar el historial del Excel: Franco simula (`npm run cargar-historial -- "datos/CONTROL PEDIDOS.xlsx"`), revisa escrituras estimadas (~50.000 de 100.000 diarias) y direcciones con notas, genera con `--generar`; la IA anota punto de restauración y lo carga una sola vez ese día | Franco + IA con permiso |
| 7 | Un día de prueba real con la operadora y el repartidor | Todos |
| 8 | **Coexistencia del número** (proveedor autorizado de Meta o Brunen como su propio Tech Provider) | Felipe decide, Franco tramita |
| 9 | **Aviso de privacidad** (Ley 21.719, rige desde el 15-oct-2027 por la Ley 21.855, D82) | IA redacta, Felipe aprueba |
| 10 | Monitoreo de `/salud` con UptimeRobot gratis | Franco |
| 11 | Borrar los pedidos de prueba de la base real | IA con permiso |
| 12 | Decisiones de Felipe: margen de hora al cliente (hoy ±10 min mínimo), retención de datos, promociones | Felipe |
| 13 | Revisar correos de facturación de Cloudflare en el correo de Brunen | Felipe y Franco |
| 14 | La operadora: si acepta avisos por Telegram y que su nombre/horario estén en el repo público | Franco pregunta |
| 15 | Exportar más chats reales de WhatsApp a `datos/chats/` (los 6 primeros ya se midieron, D103), correr `npm run medir-bot` y pasarle a la IA los no entendidos (revisados) | Franco |

## 6. Mejoras propuestas (en `docs/PROPUESTA_SIGUIENTES_PASOS.md`)
1. **Clientes en un solo lugar**: construido el 2026-11-27 (D104), sin publicar. La ficha guarda precio especial, vacíos que debe y bloqueado; el bot la mira junto con la hoja CLIENTES y manda la ficha. Falta la migración 0018 en la base real, publicar y cargar el precio de $1.311 en la ficha de ese cliente.
2. **Cobros**: pendiente → informado → verificado, pago parcial, "Por verificar" y saldo por cliente. Espera las preguntas 22 a 25.
3. **Bot**:
   - hechas: cotizar (A) y dos cosas a la vez (B), en D95; el medidor con chats reales (D), en D96;
   - esperan a Felipe: dar los datos de transferencia (C) y más preguntas frecuentes (E);
   - esperan la medición: IA con contexto (F) y otro modelo (G).
4. **Alertas del reparto** "sin señal" y "ruta no iniciada", cuando Franco dé los umbrales.
5. Ya hechos: borrador del aviso de privacidad (D85), `npm run comprobar` (D85), pendientes de D80 (D84, D86), borrar los datos de un cliente (D87), la especificación móvil sin decisiones (D90–D94).

## 7. Futuro (más adelante, `docs/MEJORAS.md` y `docs/DISENO_PLATAFORMA.md`)
**Visión de Franco (D83):** asistentes de IA, roles dentro del panel, un panel de análisis avanzado y finanzas, como meta de largo plazo y por etapas (`MEJORAS.md` §7). La flota no hace falta.
- Promociones con fechas que el bot cotiza solo y desde el panel (las define Franco/Felipe).
- Recordatorios a clientes frecuentes (plantilla pagada de Meta o gratis desde la lista del panel).
- Tiempo entre paradas por zona y hora (hoy solo se aprende el tiempo por parada).
- Avisos en el iPhone con la app cerrada (requiere instalarla en la pantalla de inicio).
- Foto como prueba de entrega.
- **Fase G**: control de sobrantes del furgón ("saco 60, sobran 5"), saldo de envases por cliente, caja del día.
- Resumen diario por Telegram; link para seguir el pedido en el mensaje de confirmación; portal o carga por Excel para empresas con plan mensual.
- **Fase F**: dos semanas en paralelo con Optiroute y luego cancelarlo; geocodificar direcciones nuevas (decidir si se puede mandar calle/número/comuna a un servicio externo).
- Dominio propio (por ejemplo `app.brunen.cl`, opción 2 de D56) en vez de `workers.dev`.
- Bajar a Franco a Administrator en Cloudflare cuando todo funcione; decidir si reescribir el historial de git (correo personal y coautorías).
- Avisar al repartidor cuando la ruta cambia sin volver a publicarse (un pedido nuevo o cancelado a mitad del día), que D94 no cubre.
- Navegación abajo en el teléfono (app y panel) cuando haya más secciones; una ruta por repartidor cuando trabajen dos a la vez (`EXPERIENCIAS_MOVILES.md`).
- Probar el panel con la operadora en una tarea real.

## 8. Preguntas abiertas para Felipe y la operadora (sacarlas solo cuando toque)
**La lista vigente y numerada está en `docs/PREGUNTAS_ABIERTAS.md`.** Tiene 45 preguntas, separadas en las que decide Franco, las de Felipe, las de la operadora y las acciones de Franco. El resumen de abajo es de antes.
- Antes de abrir a clientes: coexistencia (cuánto pagar a un proveedor, si usan listas de difusión), texto "Entrega en", Telegram, carga inicial 10 L ($4.000 o $4.500), minimarket = mayorista, si el corte de las 9:00 sigue valiendo, carga inicial 12/10 L desde 3 envases, si los precios especiales valen para 12/10 L, confirmar que $3.250 y $2.000 mayoristas son por envase.
- Ruta: cuántos bidones de cada tamaño caben, hora de salida, minutos por parada, si el teléfono del repartidor es de la empresa.
- Pedidos fijos: qué empresas tienen plan mensual; si escribirle a los atrasados.
- Cuando haya tiempo: hojas extra del Excel (CONTROL EFECTIVO, CONTROL BIDONES, CUOTAS, DETALLE HOTEL), "plan/abono/debe", columna Credito, retención de datos, dominio propio.

---

## 9. Lecciones técnicas (para no repetir errores)
- **Medir la CPU** antes de publicar algo que recorre muchas filas (10 ms): ya pasó con el optimizador de ruta (se arregló con tabla de distancias) y con el respaldo (Intl en 1.500 fechas).
- Buscar nombres de clases CSS en `panel/estilos.css` antes de usarlos (usar prefijos propios).
- Revisar si una columna es `NOT NULL DEFAULT ''` antes de escribir `NULL`.
- En Chile "cancelar" también es pagar.
- Lógica que debe coincidir en dos lados: que el servidor la entregue una vez.
- Formularios que se llenan solos: no pisar lo escrito; si dos fuentes chocan, avisar.
- `replaceChildren(null)` escribe "null": usar `append` condicional.
- Lecturas nuevas que dependen de una migración: protegerlas para que el panel/bot no se rompa si la migración falta.
- Probar el panel a 375 px; usar el preview `panel-prueba` (puerto 8789, `.wrangler/prueba`, solo datos ficticios) o `panel-prueba-admin` (8790, la administración local sin Access). La base local por defecto (`.wrangler/`) tiene el historial real: no abrirla en el navegador. Para tener la sesión del administrador y la del repartidor a la vez, usar `localhost` para una y `127.0.0.1` para la otra.
- Lecciones del 2026-11-26 (D93, D95, D97):
  - una marca vieja no debe reinterpretarse como de hoy: es mejor rechazarla a la vista;
  - después de ofrecer algo, "ok" o "gracias" no es un sí;
  - una frase puede ser a la vez pregunta y verbo de pedir ("¿a qué hora me traen…?");
  - un reintento automático necesita un tope, o se repite sin pausa;
  - un script temporal reutilizado puede hacer un commit equivocado: un nombre de archivo por tarea.
- Antes de publicar, una revisión con un revisor aparte (`/superpowers:requesting-code-review`) encontró errores que las pruebas propias no veían (D97).

## 10. Entorno de trabajo (Windows) — solo si trabajas en el computador de Franco con Claude Code
Si eres otra IA o una persona sin acceso a ese computador, salta esta sección.
- En la terminal de Franco: `npx.cmd` (PowerShell bloquea `npx`). `wrangler login` por OAuth caduca en ~2 min.
- La herramienta Bash corrompe `\\`, `\d`, `\b` en `node -e`/heredocs: para código con regex usar Write/Edit o un `.mjs` en el scratchpad. Comillas invertidas dentro de `node -e "..."` se ejecutan como comando.
- PowerShell rompe un `--command` de wrangler con comillas anidadas: escribir el SQL a un archivo y usar `--file`, o correrlo desde la herramienta PowerShell.
- `npm ci` falla con EPERM si queda un `wrangler dev`/vitest abierto.
- En Google Sheets vía Chrome, el tabulador entra dentro de la celda: escribir columna por columna y verificar con `gviz/tq`.
- Leer PDF: `pdftotext -enc UTF-8 -raw`.
- Vitest no muestra `console.log`: escribir resultados con `writeFileSync` en una prueba desechable.
- El plugin ECC tiene un hook "Fact-Forcing Gate": antes del primer Edit/Write/Bash de un archivo pide decir qué lo referencia, qué cambia y la instrucción literal del usuario; cumplirlo en texto y reintentar.
- Herramientas útiles: plugin Cloudflare (`docs` para verificar límites; `execute` cambia recursos reales: preguntar), `gh` (el MCP de GitHub está roto), Claude in Chrome solo si Franco lo pide, skills superpowers (brainstorming, TDD, verification-before-completion), code-review, security-review, impeccable para el diseño del panel. Firebase no tiene uso aquí.

## 11. Costos verificados
- WhatsApp: 1.000 mensajes de servicio gratis por número al mes; luego USD 0,02 c/u en Chile; marketing USD 0,0889. Con ~520 pedidos/mes y un mensaje por pedido: USD 0; peor caso ~USD 6/mes.
- Cloudflare: Workers gratis (100.000 solicitudes/día, 10 ms CPU); D1 gratis (5 M lecturas y 100.000 escrituras al día, 5 GB); Zero Trust Free hasta 50 usuarios (pide tarjeta, no cobra); Workers AI 10.000 unidades/día (~200 min de audio).
- Groq gratis, sin retención. OpenFreeMap gratis.

---

## 12. Expediente para un auditor (técnico, seguridad, privacidad y operación)

> Esta sección está pensada para que un auditor experto pueda evaluar el proyecto sin preguntar nada: qué hay, dónde está, qué controles tiene, qué evidencia existe y qué riesgos siguen abiertos. Los datos se tomaron del repositorio el 2026-11-26. Donde algo no está verificado, se dice.

### 12.1 Cómo auditar (orden sugerido)
1. Leer `README.md`, `CLAUDE.md` (reglas del proyecto; al día desde D84), `SECURITY.md` y `docs/conocimiento_brunen.md` (reglas del negocio).
2. Leer `docs/DECISIONES.md` (D1–D97): cada decisión trae su porqué y su fuente oficial. Las revisiones anteriores están en D39, D56, D57, D80, D97 y en `docs/ANALISIS_Y_MEJORAS.md`.
3. Puntos de entrada del código: `src/index.ts` (bot: `fetch` + `scheduled`) y `src/panel/index.ts` (panel: enrutador, cabeceras y frontera de acceso).
4. Reproducir: `npm ci` → `npm run check` (typecheck + pruebas, sin secretos ni red). `npm run dev` / `npm run dev:panel` en local. `npm run datos-locales` crea una base local con datos ficticios (`scripts/datos-de-prueba.sql`).
5. Configuración: `wrangler.toml` (bot), `wrangler.panel.toml` (panel público y `[env.admin]`), `migrations/0001–0017`, `.github/workflows/check.yml`, `.gitignore`.
6. Lo que el auditor **no** debe pedir ni abrir: `.dev.vars` (secretos locales), `datos/` y `datos-anonimos/` (Excel reales y sus copias), la base D1 real ni la local por defecto (`.wrangler/`, tiene el historial real cargado en pruebas locales).

### 12.2 Inventario y tamaño
| Parte | Dónde | Tamaño |
|---|---|---|
| Bot y lógica de negocio | `src/*.ts` (50 archivos) | ~9.200 líneas |
| Servidor del panel | `src/panel/*.ts` (9 archivos: `index`, `acceso`, `ingreso`, `cuentas`, `rut`, `api`, `clientes-api`, `ruta-api`, `repartidor-api`) | ~2.050 líneas (total `src/`: 11.227) |
| Interfaz web (sin framework, JS y CSS propios) | `panel/` | ~5.100 líneas; `panel/admin/app.js` solo tiene 2.566 (candidato a separar en módulos) |
| Pruebas | `tests/` (64 archivos, Vitest; 1.607 pruebas) | ~13.100 líneas (más código de prueba que de producción) |
| Scripts locales (Node, `.mjs`) | `scripts/` | ~2.700 líneas |
| Documentación | `docs/` (22 archivos) | ~76.000 palabras |
| Historia | git | 215 commits desde el 2026-10-27, en `main`, CI en cada push |

- **Dependencias**: **cero dependencias de ejecución**. Cuatro de desarrollo: `typescript ^7.0.2`, `vitest ^5.0.5`, `wrangler ^4.153.0` y `esbuild 0.28.2` (declarada en D97 para el medidor; antes llegaba con wrangler). `allowScripts` aprueba solo los scripts de instalación de `esbuild@0.28.2` y `workerd@1.20261023.1` (D10). Google (JWT RS256), WhatsApp, Telegram, Groq y Access se hablan con `fetch` + WebCrypto, sin SDK.
- **Runtime**: Cloudflare Workers, `compatibility_date = "2026-09-01"` en los dos Workers (subirla es una mejora pendiente, J3). Node ≥ 22.18 para los scripts. CI con Node 24.

### 12.3 Superficie expuesta (rutas HTTP)
**Bot `brunen-chatbot`** (`src/index.ts`):
| Ruta | Método | Protección |
|---|---|---|
| `/salud` | GET/HEAD | Pública; responde `ok` si la base responde (`SELECT 1`, D84) y 503 si no |
| `/webhook` | GET | Verificación de Meta: `hub.verify_token` contra `WHATSAPP_VERIFY_TOKEN` (token falso → 403) |
| `/webhook` | POST | Firma `X-Hub-Signature-256` (HMAC-SHA256 del cuerpo crudo con `WHATSAPP_APP_SECRET`, comparación en tiempo constante, `src/firma.ts`); firma falsa → 401. Responde 200 de inmediato y procesa con `ctx.waitUntil`; deduplica por `wamid` en D1 |
| Cualquier otra | — | 404 |
| Tarea programada | cron `*/5 * * * *` | Interna (vigía, fijos, fichas, respaldos, limpieza de posiciones) |

**Panel público `brunen-panel`** (`src/panel/index.ts`, `run_worker_first = true`, `preview_urls = false`):
| Ruta | Protección |
|---|---|
| `/`, `/portada.js`, `/ingreso.js`, `/estilos.css`, `/manifest.webmanifest`, `/sw.js`, `/repartidor/…`, `/iconos/*.png` | Lista cerrada de archivos públicos (todo lo demás → 404); solo GET/HEAD |
| `/api/sesion`, `/api/sesion/entrar`, `/api/sesion/salir` | Ingreso con RUT + clave de 4 dígitos (`src/panel/ingreso.ts`, `cuentas.ts`) |
| `/api/repartidor/*` (`ruta`, `ruta/vista` (D94), entregas, `ubicacion`, `jornada`, `posiciones`) | Cookie de sesión con **rol `repartidor`**; si no, 401. Las escrituras exigen la cabecera `x-panel`. Una marca de una ruta de hace más de 3 días o del futuro se rechaza con 409 (D93) |
| `/admin` | Redirección 302 a la administración aparte; `/admin/*` → 404: la pública **nunca** sirve administración |

**Administración `brunen-admin`** (mismo código, `--env admin`):
| Ruta | Protección |
|---|---|
| Todo el Worker | **Cloudflare Access a nivel de Worker** ("Todo el tráfico"), política reutilizable "Administradores del panel Brunen" (hoy un solo correo), ingreso por One-time PIN o cuenta Cloudflare |
| `/admin/*` (archivos) | Además, el Worker verifica el JWT `Cf-Access-Jwt-Assertion` (`src/panel/acceso.ts`): firma RS256 con las claves del equipo (caché 1 h), emisor, AUD y vencimiento. Sin `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` falla **cerrado** (503). `PANEL_CORREOS` (opcional) es una segunda lista de correos |
| `/admin/api/*` | Access + **sesión de administrador cuyo correo coincide con el de Access** (`esDelAdministrador`) + `PANEL_SECRETO` configurado. Rutas: `estado`, `opciones`, `respaldo`, `respaldo/estado`, `estadisticas`, `reparto`, `pedidos` (+ `buscar`, `interpretar`), `avisos`, `dias-sin-reparto` (+ `quitar`), `clientes` (+ `/:id`, `anterior`, `mapa`, `por-pedir`, `buscar`, `/:id/olvidar` con `{confirmar:true}`, D87), `ruta` (+ `evaluar`, `publicar`), `puntos`, `usuarios` (+ `/:id`), `sesion/primer-ingreso` |
| `PANEL_DEV_CORREO` | Atajo solo para desarrollo: se acepta **únicamente** si el host es `localhost`, `127.0.0.1` o `[::1]`; no está en la configuración de producción |

### 12.4 Autenticación, sesiones y autorización
- **Dos roles**: `administrador` (Access + RUT + clave) y `repartidor` (RUT + clave, sin Access, en la dirección pública).
- **Claves de 4 dígitos**: se guarda solo una huella **HMAC-SHA-256 con `PANEL_SECRETO`** (secreto del servidor, 48 caracteres al azar). Se eligió HMAC y no PBKDF2/scrypt a propósito (`cuentas.ts`): con 10.000 combinaciones un hash lento no protege y sí gasta CPU (10 ms); lo que protege es que la huella sin el secreto no sirve y el **bloqueo**: 5 intentos fallidos → bloqueo de 15 min que crece hasta 24 h, tope por origen de la conexión (`intentos_de_ingreso`, se limpia a las 24 h), rechazo de claves débiles (cuatro dígitos iguales, escaleras como `1234` o `9876`, y los primeros o últimos 4 dígitos del RUT). Cambiar `PANEL_SECRETO` invalida todas las claves (falta documentarlo, H5).
- **Riesgo aceptado**: alguien que conozca el RUT del repartidor puede bloquearle la cuenta a propósito con 5 intentos (H4; alternativa: bloqueo por dispositivo).
- **Sesiones**: token aleatorio (`crypto.getRandomValues`); en la base solo se guarda su SHA-256. Cookie `HttpOnly; SameSite=Strict; Secure; Path=/`. Sin "Recordar": 12 h; con "Recordar este dispositivo": 30 días, renovada sola mientras se use. Equipo permite cerrar todas las sesiones de un usuario y desactivarlo.
- **Primer ingreso**: el primer administrador elige su RUT y clave después de pasar por Access con su correo (`/api/sesion/primer-ingreso`). Al 2026-11-24 **no existe ninguna cuenta** en la base real.
- **Cuenta de Cloudflare "Brunen SpA"**: dos miembros Super Administrador (el correo de la empresa y el de Franco), ambos con verificación en dos pasos. Pendiente: bajar a Franco a Administrator cuando todo funcione.
- **Meta / WhatsApp**: el token de acceso es un secreto; el vigía lo prueba cada mañana a las 7:30 y avisa si vence.

### 12.5 Secretos y variables (solo nombres; los valores nunca están en el repo)
| Nombre | Worker | Tipo |
|---|---|---|
| `WHATSAPP_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` | bot | secretos |
| `GOOGLE_SERVICE_ACCOUNT_JSON`, `GOOGLE_SHEET_ID` | bot | secretos |
| `GROQ_API_KEY` | bot | secreto |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` | bot | secretos (**aún no cargados**) |
| `NUMEROS_PERMITIDOS` | bot | secreto (teléfonos de prueba; vacío = no responde a nadie) |
| `PANEL_SECRETO` | panel y admin | secreto (cargado el 2026-11-19; copia temporal fuera del repo que Franco debe pasar a su gestor y borrar) |
| `PANEL_CORREOS` | panel/admin | secreto opcional (no cargado) |
| `GRAPH_API_VERSION=v25.0`, `BOT_ACTIVO`, `FLUJO_PEDIDO`, `REGISTRO_PLANILLA`, `ESPERA_AGRUPADOR_MS`, `PAUSA_POR_PERSONA_MINUTOS` | bot | variables públicas en `wrangler.toml` |
| `ACCESS_TEAM_DOMAIN`, `ACCESS_AUD`, `PANEL_ADMIN_URL` | panel/admin | variables públicas (no son secretos) |
| Bindings: `DB` (D1), `AI` (Workers AI), `ASSETS` (archivos del panel) | — | — |
- Los tipos de `Env` están escritos a mano (`src/index.ts`, `src/panel/index.ts`, `src/panel/acceso.ts`): la guía de Workers recomienda `wrangler types` (J2).
- `.gitignore` excluye `.dev.vars*`, `.env*`, `*credentials*.json`, `*service-account*.json`, `*.pem`, `datos/`, `datos-anonimos/`, `*.xlsx`, `*.csv`, `restaurar-pedidos.sql`, `.wrangler/`. El historial se revisó sin secretos (D14, D15).

### 12.6 Datos guardados (D1, 24 tablas, migraciones 0001–0017)
| Tabla | Qué guarda | Datos personales |
|---|---|---|
| `pedidos` (+ forma/estado de pago, documento, tipo de cliente, `cliente_id`, entrega, vacíos, cobro, no entregado, `orden_ruta`) | Pedidos | Teléfono, nombre, dirección, comuna |
| `historial_pedidos` | Cambios de cada pedido | Indirectos |
| `avisos` | Bandeja del panel (reclamos, comprobantes, audios transcritos) | Texto del cliente |
| `clientes`, `telefonos_cliente`, `direcciones_cliente` | Fichas con varios teléfonos e historial de direcciones | Sí |
| `ultimos_pedidos`, `conversaciones`, `mensajes_pendientes`, `conversaciones_tomadas` | Memoria del bot y coexistencia | Teléfono, texto |
| `mensajes_procesados` | Deduplicación por `wamid` y vigía | Teléfono |
| `pedidos_fijos`, `dias_sin_reparto` | Planificación | Teléfono en fijos |
| `puntos` | Coordenadas por dirección (pin manual > GPS del repartidor > ubicación del cliente) | Ubicación de domicilios |
| `usuarios`, `sesiones`, `intentos_de_ingreso` | Cuentas del panel | RUT, correo del administrador, huellas |
| `jornadas`, `consentimientos_ubicacion`, `posiciones` | Seguimiento del repartidor (D80) | Ubicación del trabajador; se borra a los 3 días |
| `viajes_publicados` (D86), `rutas_publicadas` (D94) | Viaje de cada parada y versión de la ruta publicada, con la que confirmó el repartidor | No |
| `respaldos`, `uso_llm` | Control | No |
- **Borrar a un cliente que lo pide (D87, D97)**: "Borrar sus datos" en su ficha anonimiza sus pedidos (quedan para la contabilidad sin nombre, teléfono ni dirección). También borra su ficha, teléfonos, direcciones, memoria del bot y puntos que eran solo suyos, y el texto libre del historial (No se pudo, notas de entrega, motivos de cancelación). Lo que vive fuera de la base (hojas de Google, Telegram) lo hace una persona y el panel lo lista.
- **Fuera de D1**: la planilla de Google tiene CLIENTES (datos de clientes) y las hojas RESPALDO_PEDIDOS (cada 30 min) y RESPALDO_CLIENTES (cada noche), es decir, **una copia de los datos personales en la cuenta de Google de la empresa**. Time Travel de D1 guarda 7 días.
- **Retención**: hoy no hay plazos definidos salvo posiciones (3 días) y Time Travel (7 días). Lo decide el dueño y lo exige el aviso de privacidad.

### 12.7 A dónde viajan los datos (terceros)
| Tercero | Qué recibe | Control |
|---|---|---|
| Meta (WhatsApp Cloud API) | Mensajes y respuestas | Canal del negocio |
| Cloudflare (Workers, D1, Access, Workers AI) | Todo lo guardado; audios para transcribir con Whisper (no se guardan) | Cuenta de la empresa |
| Google Sheets | Clientes, precios, configuración, feriados, respaldos | Cuenta de servicio con acceso solo a esa planilla |
| Groq (`openai/gpt-oss-20b`) | **Solo el texto del mensaje** cuando las reglas no entienden; nunca nombre ni dirección; retención cero | D6, D23, D24 |
| Telegram | Avisos urgentes y **fotos/PDF de comprobantes** (hasta 5 MB) | Grupo privado (por crear) |
| OpenFreeMap | Solo pedidos de mosaicos del mapa de la zona mirada; ninguna dirección | CSP la limita a la administración |
| Nadie más | La ruta se optimiza en el propio código (`src/ruta.ts`); las direcciones no se geocodifican afuera | D62, D63 |

### 12.8 Controles de seguridad existentes (con dónde verlos)
- Firma del webhook en tiempo constante y 200 inmediato con proceso en segundo plano (`src/firma.ts`, `src/index.ts`, `tests/webhook.test.ts`).
- El bot nunca lanza un error al webhook ni deja al cliente sin respuesta (`src/flujo.ts`, `src/atencion.ts`); el vigía avisa si un mensaje quedó sin atender (`src/vigia.ts`).
- SQL siempre con parámetros (`?1…`). Hay cinco consultas armadas con plantilla y todas meten solo marcadores o constantes, nunca datos: `almacen.ts:53`, `puntos.ts:105`, `relevo.ts:97`, `respaldo.ts:219`, `seguimiento.ts:163`.
- Cabeceras en toda respuesta del panel: CSP `default-src 'self'; script-src 'self'; style-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'` (la administración suma solo `tiles.openfreemap.org` y `blob:`), `nosniff`, `referrer-policy: same-origin`, `permissions-policy` (geolocalización solo en `/repartidor`), `cache-control: no-store`.
- La interfaz arma el HTML con nodos del DOM (`textContent`/`append`), sin `innerHTML` con datos.
- El CSV del reparto se protege contra inyección de fórmulas (D42).
- Validación en el servidor con listas cerradas (estados, formas de pago, documento, tipo de cliente: D52) y RUT con dígito verificador (`src/panel/rut.ts`).
- Falla cerrada: sin base, sin `PANEL_SECRETO` o sin la configuración de Access, el panel responde 503.
- Registros: teléfonos enmascarados (`enmascararTelefono`), sin nombres ni direcciones; Workers Logs activo (3 días de retención); traces apagados a propósito (se cobran desde el 2026-12-01).
- El bot solo atiende `NUMEROS_PERMITIDOS` mientras no se abra a clientes.
- Privacidad: el cliente se reconoce solo por pedidos del último año (números de teléfono reciclados, D56); el mapa de clientes no manda teléfonos ni direcciones (D75); el anonimizador (`scripts/anonimizar-excel.mjs`) revisa fugas antes de escribir (D47).
- Seguimiento del repartidor: consentimiento versionado, solo en jornada y de 6:00 a 22:00, precisión ≤ 500 m, borrado a los 3 días (D80).
- CI con `permissions: contents: read` y sin secretos.
- Pruebas específicas de seguridad: `tests/endurecimiento.test.ts`, `tests/panel.test.ts` (rutas, cabeceras, frontera pública/admin), `tests/ingreso.test.ts`, `tests/cuentas.test.ts`, `tests/acceso-falso.ts` (JWT de Access de prueba), `tests/repartidor-api.test.ts`.

### 12.9 Revisiones hechas y lo que encontraron
- **D39 (2026-11-01)**: revisión completa del código, 15 hallazgos corregidos (entre ellos, qué comuna gana si el cliente menciona dos).
- **D56 (2026-11-12)**: revisión de código (14 hallazgos, 13 corregidos con pruebas), revisión de seguridad (sin vulnerabilidades con confianza suficiente; se cerró el riesgo del teléfono reciclado) y plugin de Cloudflare. Hallazgo clave: Access no protege una ruta dentro de `workers.dev` → dos direcciones.
- **D57 (2026-11-12)**: datos reales de uso: 447 invocaciones, 0 errores, CPU mediana 3,4 ms, p90 6,2 ms, p99 26,7 ms, sin cortes por límite.
- **`docs/ANALISIS_Y_MEJORAS.md` (2026-11-13)**: evaluación en 13 ramas (A–M) y registro de riesgos R1–R10.
- **D80 (2026-11-18)**: revisión de código y de seguridad del seguimiento, corregida.
- **D81 (2026-11-19)**: comprobaciones en producción: `/salud` ok, firma falsa 401, token falso 403, portada 200, `/admin` de la pública 302, `/admin/api/pedidos` de la pública 404, administración sin sesión → ingreso de Access.
- **D97 (2026-11-26)**: revisión de código con un revisor aparte de todo lo no publicado (D87 a D96). Sin críticos. Se corrigieron 4 importantes y 10 menores con pruebas que fallaban primero:
  - un "ok gracias" tras una cotización anotaba un pedido;
  - "¿a qué hora me traen…?" perdía el estado del pedido;
  - reintentos sin pausa de la confirmación de versión;
  - el medidor ocultaba poco.
  Evidencia: `npm run check` → 1.607 pruebas en 60 archivos; CI en verde; publicado con `npm run comprobar` 9 de 9. La ruta `/api/repartidor/ruta/vista` sin sesión responde 401 en producción.
- **D93 (2026-11-26)**: al auditar D84 se encontró que una marca atrasada de más de 3 días se anotaba para hoy y podía caer en un pedido reagendado. Corregido con prueba.
- **Evidencia del 2026-11-25 (D84)**: `npm run check` → 1.558 pruebas en 58 archivos; las 8 nuevas del servidor fallan con el código anterior. App del repartidor probada en el navegador con datos ficticios (servidor caído, rechazo, sin señal, salir con pendientes).
- **Evidencia del 2026-11-24**: `npm run check` en local → typecheck sin errores y **1.523 pruebas pasadas en 57 archivos** (27 s). En la interfaz no hay `innerHTML`, `outerHTML` ni `insertAdjacentHTML` (búsqueda en `panel/`).
- No hay auditoría externa, pentest ni pruebas de punta a punta del panel en CI (J1).

### 12.10 Riesgos y brechas abiertos (lo que un auditor debería marcar)
| # | Brecha | Gravedad | Estado o respuesta |
|---|---|---|---|
| A1 | **Ley 21.719** (rige desde el 2027-10-15 por la Ley 21.855, D82): falta aprobar el aviso de privacidad, el registro de tratamientos y los plazos de conservación | Alta | Borrador listo (`AVISO_PRIVACIDAD.md`, D85) y función para borrar a un cliente hecha (D87); el dueño aprueba y define plazos (pregunta 20) |
| A2 | **Coexistencia del número** sin resolver: el bot no puede atender clientes reales | Alta (negocio) | Felipe decide proveedor o Tech Provider (D45) |
| A3 | **Telegram sin configurar**: reclamos y fallas urgentes solo quedan en el panel | Alta (operación) | Paso 2 de `PASOS_FRANCO.md` |
| A4 | Falta CodeQL y `npm audit` en la revisión automática | Baja | Ya están activos la búsqueda de claves, el bloqueo al subir y los avisos de dependencias de GitHub, y existe `SECURITY.md` |
| A5 | Copia de `PANEL_SECRETO` en un archivo de texto fuera del repo | Media | Franco debe moverla a su gestor y borrarla |
| A6 | Datos personales replicados en Google Sheets (respaldos) y en la base local `.wrangler/` del computador de Franco | Media | Aceptado por diseño (D66); declararlo en el aviso de privacidad |
| A7 | Repartidor en la dirección pública con clave de 4 dígitos (sin Access); bloqueo intencional posible (H4) | Media-baja | Mitigado por bloqueo creciente, tope por conexión y cierre de sesiones |
| A8 | Comprobantes (fotos con datos bancarios del cliente) se reenvían a Telegram | Media | Grupo privado; falta definir quiénes están y cuánto se guarda |
| A9 | Historial de git con correo personal y líneas de coautoría antiguas | Baja | Decisión pendiente de Franco (reescribir o no) |
| A10 | Sin monitoreo externo de `/salud` (desde D84, `/salud` revisa la base) | Baja | UptimeRobot pendiente (I5) |
| A11 | Tipos de `Env` a mano, `compatibility_date` de 2026-09-01, `panel/admin/app.js` de 2.458 líneas | Baja | J2, J3, J4 |
| A12 | Pendientes de D80 | — | Cerrados y publicados (D84, D86) |
| A13 | Dos fuentes de clientes (hoja CLIENTES y fichas en D1) | Media | Mejora 3 |
| A14 | Una sola persona conoce el sistema (R4) | Media | Documentación extensa + `docs/INCIDENTES.md`; falta entrenar a la operadora |
| A15 | Pedidos de prueba en la base real | Baja | Borrarlos antes de abrir |
| A16 | Franco es Super Administrador de la cuenta; la política de Access tiene un solo correo | Baja | Bajarlo a Administrator al final; sumar correos de la operadora y Franco |
| A17 | `CLAUDE.md` desactualizado | Baja | Corregido en D84 |
| A18 | La app del repartidor borraba una marca si el servidor fallaba y decía "anotada" | Alta (operación) | Corregido y publicado en D84, con pruebas |
| A19 | Textos nuevos del bot (cotización, horario y pago dentro de un pedido, D95) sin aprobar por el dueño | Baja | Pregunta 45; el bot solo responde a números de prueba |
| A20 | El medidor (D96) oculta datos personales con reglas: un nombre o una dirección escritos de forma rara pueden quedar a la vista | Media | Corre solo en el computador de Franco, escribe en una carpeta ignorada por git y el informe pide revisarlo antes de compartir; la IA no lee esas carpetas |
| A21 | La ruta puede cambiar sin volver a publicarse (pedido nuevo o cancelado) y el repartidor no recibe aviso | Baja | Mejora anotada en `MEJORAS.md` (D97) |

### 12.11 Continuidad y recuperación
- Volver a la versión anterior del bot: `wrangler rollback` (`docs/INCIDENTES.md`). Base: Time Travel de D1 con puntos de restauración anotados (`docs/PASOS_FRANCO.md`, `docs/INCIDENTES.md`) y restauración desde la planilla con `npm run restaurar-respaldo` (`docs/RESPALDO.md`).
- Interruptores: `BOT_ACTIVO = NO` apaga el bot; `ESTADO_SERVICIO = reducido` + `MENSAJE_EXCEPCION` en la hoja CONFIGURACION; `FLUJO_PEDIDO = NO` vuelve al modo prueba.
- Límites del plan gratis que pueden cortar el servicio: 10 ms de CPU por invocación, 100.000 solicitudes/día, 100.000 escrituras D1/día (la carga del historial gasta ~la mitad: se hace una sola vez), 50 consultas por invocación, 1.000 mensajes de servicio de WhatsApp al mes.

### 12.12 Preguntas que conviene que el auditor responda
1. ¿Basta una clave de 4 dígitos con bloqueo para el repartidor en una dirección pública, o conviene bloqueo por dispositivo o un segundo factor?
2. ¿Qué plazo de conservación es razonable para pedidos, fichas, avisos, comprobantes en Telegram y respaldos en Sheets? "Borrar a un cliente" ya existe en D1 (D87). ¿Basta con que lo de Sheets y Telegram lo haga una persona, con el panel listándolo?
3. ¿El consentimiento del repartidor para la ubicación cumple la ley laboral y de datos si el teléfono es personal?
4. ¿Es suficiente HMAC con secreto del servidor para claves de 4 dígitos dado el límite de 10 ms de CPU?
5. ¿Hay que sacar la copia de datos personales de Google Sheets, o basta con declararla?
6. ¿Qué falta para abrir el bot a todos los clientes sin riesgo (coexistencia, monitoreo, Telegram, aviso)?

---

## 13. Glosario (palabras del proyecto)
- **Aviso**: tarjeta en el panel con algo que una persona debe mirar (reclamo, comprobante, audio, pedido dudoso). No es un mensaje al cliente.
- **Carga / viaje**: lo que el furgón lleva entre dos pasadas por una planta (máximo 65 bidones). Un día normal tiene varios viajes.
- **Carga inicial**: venta del envase con agua a un cliente que no tiene envase propio.
- **Coexistencia**: usar el mismo número de WhatsApp en la app del celular y en la API del bot a la vez (D45, D46).
- **Corte**: las 9:00; los pedidos hasta esa hora salen el mismo día.
- **D# (D1–D97)**: una decisión registrada en `docs/DECISIONES.md`, con su porqué y su fuente.
- **Versión de la ruta / acuse**: cada vez que se publica la ruta de un día sube un número; la app del repartidor confirma cuál tiene, y si llega una nueva le avisa hasta que toque "Entendido" (D94).
- **Cotización**: lo que el bot responde a "¿cuánto salen 3 de 20?", con la oferta de anotarlo con un "sí" (D95).
- **Medidor**: `npm run medir-bot`, que pasa chats reales exportados por el intérprete del bot, en el computador de Franco (D96).
- **Ficha**: un cliente en la base D1, con uno o más teléfonos y su historial de direcciones. No es lo mismo que la hoja **CLIENTES** de Google Sheets.
- **Fases A–G**: etapas de la plataforma propia (`docs/DISENO_PLATAFORMA.md`): A ingreso, B datos y fichas, C panel, D app del repartidor, E ruta y seguimiento, F reemplazar Optiroute, G sobrantes y caja.
- **Pedido fijo**: un cliente que recibe lo mismo cada cierta cantidad de días; el sistema crea su pedido dos días antes (D59).
- **Publicar ruta**: dejar fijo el orden de las paradas del día para que lo vea el repartidor.
- **Relevo**: el bot calla con un cliente cuando una persona le escribe desde la app (D46).
- **Vacíos**: bidones vacíos que el repartidor retira; "vacíos extra" son los que el cliente debía de antes (D72).
- **Vigía**: la tarea que corre cada 5 minutos y avisa si algo quedó sin atender (D43).
- **Mayorista / minimarket, normal / hogar, empresa, especial**: tipos de cliente; "especial" es una condición de precio, no un tipo.

## 14. Tu primera respuesta
Cuando termines de leer, **no empieces a cambiar nada**. Responde en no más de 8 líneas:
1. Lo que entendiste del estado actual, en 2 o 3 líneas.
2. Los tres pendientes más importantes, según §5, §12.10 y `docs/PREGUNTAS_ABIERTAS.md`.
3. Lo que necesitas comprobar antes de actuar (por ejemplo, si hay commits sin subir o algo sin publicar).
4. Una sola pregunta: qué quiere Franco que hagas primero.

Si el mensaje que acompaña a este documento ya trae una tarea concreta, sáltate esta lista y haz la tarea siguiendo §0.
