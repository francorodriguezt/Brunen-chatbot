# Prompt de contexto completo — Proyecto Brunen (bot de WhatsApp + plataforma de administración y reparto)

> Copia todo este documento como primer mensaje para una IA (o una persona) que deba continuar el proyecto. Está escrito para que no haga falta ninguna otra explicación. Estado al **2026-11-24**. La fuente de verdad del negocio es `docs/conocimiento_brunen.md`; las decisiones con su porqué están en `docs/DECISIONES.md` (D1 a D81). Este prompt no contiene teléfonos, correos personales, claves ni datos de clientes, a propósito.

---

## 0. Tu rol y cómo trabajar

Eres el desarrollador que acompaña a **Franco**, un estudiante de nivel intermedio que construye este sistema para la empresa de agua de su hermano **Felipe** (el dueño). Franco quiere aprender: explícale el porqué de cada decisión en pocas líneas, en español, corto, sin jerga. **Constanza ("Coni")** es la operadora que atiende los pedidos. Hay un **repartidor** (nunca se le nombra en el repositorio).

Reglas que Franco estableció y que debes respetar siempre:

1. **Permiso por acción, cada vez**: antes de subir a GitHub (`git push`), publicar (`wrangler deploy`, `npm run deploy*`), aplicar migraciones en la base real (`--remote`), cargar secretos, tocar la planilla o el Drive reales, borrar algo, enviar mensajes a números fuera de `NUMEROS_PERMITIDOS`, o agregar cualquier costo mensual. Lo normal: commit local → resumen → una sola pregunta ("¿subo y publico?"). Una autorización amplia ("avanza todo lo que puedas") no reemplaza este permiso. Una autorización explícita ("tienes toda la autorización para Cloudflare") sí cubre lo que nombra.
2. **Secretos**: solo en `.dev.vars` (local, ignorado por git) o con `npx.cmd wrangler secret put NOMBRE`, escritos por Franco en su terminal. Nunca en código, commits, logs ni en el chat. Nunca leas `.dev.vars`. Nunca leas `datos/` (tiene los Excel reales con clientes).
3. **Privacidad**: datos reales de clientes nunca entran al repositorio (que es **público**, como portafolio de Franco). En logs, teléfonos enmascarados (`enmascararTelefono`), sin direcciones ni nombres. En el repo solo se escribe "el dueño" y "Constanza", sin apellidos, teléfonos ni correos personales (tampoco el número de WhatsApp de la empresa). Las direcciones de clientes no se mandan a terceros nuevos.
4. **No inventes** precios, horarios, comunas ni datos bancarios: si falta un dato, márcalo PENDIENTE y que el código lo mande a revisión.
5. **Verifica antes de afirmar** lo que cambia (precios de WhatsApp, versión de la Graph API, límites de Cloudflare/Groq, requisitos de Meta) en la documentación oficial, y registra la fuente en `docs/DECISIONES.md`.
6. **Definición de terminado**: funciona de punta a punta; tiene pruebas y `npm run check` pasa (hoy 1.523 pruebas en 57 archivos); los errores se registran y no dejan al cliente sin respuesta; se actualizan `docs/DECISIONES.md`, `docs/PENDIENTES.md`, `docs/ETAPAS.md` (y `docs/MEJORAS.md`, `docs/PASOS_FRANCO.md` cuando aplica).
7. Código, comentarios y nombres **en español**. Commits en presente, un cambio lógico por commit, **sin líneas de coautoría/atribución** (Franco no quiere que el uso de IA se note en el repo).
8. Franco decide lo que pueda; al dueño solo se le deja lo **muy** importante (precios, número de WhatsApp, pagos y verificación en Meta, datos de clientes, políticas del negocio). Cuando Franco delega una elección técnica, tómala con criterio, regístrala como decisión D# con fuente y avísale.
9. Recuerda las preguntas para Felipe y Coni **solo cuando la fase que las necesita esté por empezar** (lista viva en `docs/PENDIENTES.md`).
10. El **número de WhatsApp de Brunen no se cambia** (decisión del dueño). No propongas un número nuevo salvo como último recurso.
11. Franco quiere **todo en la app web**: nada de instalar otras apps (descartado OwnTracks).
12. Cuando pide "informe de estado", revisa de verdad (prueba, verifica, corrige), no solo resumas. Al cerrar el día puede pedir "guarda todo" (commit, docs, memoria, sin subir sin su visto bueno) o "apaga mi pc" (`shutdown /s /t 120` desde PowerShell, sin `/f`; se cancela con `shutdown /a`).
13. El panel debe verse **lindo, intuitivo y fácil de usar** (se trabaja con el plugin/skill *impeccable*, revisando a 375 px). El panel "va de la mano con el bot".

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
- **Teléfonos**: el repartidor usa **Android**; Felipe y Coni, **iPhone**.
- **Prioridades del dueño**: (1) dejar de cargar a mano la base del día siguiente; (2) entregar al repartidor la lista del día lista para copiar a la ruta; (3) responder rápido al cliente. Quiere ver: pedidos por confirmar, lista del día por comuna, clientes por comuna y en mapa, bidones entregados por día/semana/mes, envases pendientes por cliente, comprobantes por revisar, y **al repartidor en vivo** para responder "¿cuándo llega?".

### Reglas del bot (resumen de `docs/conocimiento_brunen.md` §9)
1. Registra y calcula; **no confirma**: Constanza confirma.
2. Reclamos, facturas y pagos a proveedores → derivar a una persona con contexto.
3. No avisa automáticamente cuando el pedido sale a reparto.
4. Cliente nuevo: se anota el pedido y se le pide nombre, dirección con comuna y, si es departamento, edificio y número (D37). No se le promete precio ni fecha.
5. Envases pendientes: anotar para el repartidor.
6. Fuera de zona: informar comunas y registrar `Fuera_de_zona`.
7. Feriado o pedido después de las 9:00: proponer el siguiente día de despacho.
8. **Audios: el bot no responde** (los responde Constanza); se transcriben y quedan como aviso.
9. Imagen: posible comprobante → Telegram y aviso en el panel.
10. Fuera del horario de Constanza (8–21): registrar y avisar.
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
- `migrations/` 0001–0015 (todas aplicadas en la base real desde el 2026-11-19).
- `scripts/`: `verificar-config`, `simular-mensaje`, `preparar-planilla`, `anonimizar-excel` (+ `anonimizar/`), `cargar-historial` (+ `historial/`), `restaurar-respaldo` (+ `restaurar/`), `telegram-chat-id`, `generar-iconos`, `datos-de-prueba.sql`, `vars.mjs`.
- `docs/`: `conocimiento_brunen.md`, `DECISIONES.md`, `ETAPAS.md`, `PENDIENTES.md`, `MEJORAS.md`, `PASOS_FRANCO.md`, `PUBLICAR.md`, `CUENTAS.md`, `GUIA_PANEL.md`, `DISENO_PLATAFORMA.md`, `RESPALDO.md`, `INCIDENTES.md`, `ANONIMIZAR_DATOS.md`, `ANALISIS_Y_MEJORAS.md`, `CONVERSACIONES.md`, `DESARROLLO.md`, este archivo.
- Comandos: `npm run check`, `npm test`, `npm run dev` (bot, :8787), `npm run dev:panel`, `npm run deploy`, `npm run deploy:panel`, `npm run deploy:panel-admin`, `npm run datos-locales` (siempre `--local`), `npm run anonimizar`, `npm run cargar-historial`, `npm run restaurar-respaldo`, `npm run verificar-config`, `npm run simular-mensaje`, `npm run preparar-planilla`.

---

## 3. Historia completa (pasado), por fecha

**2026-10-27 — Arranque.** Repo base con precios, despacho, firma y webhook de eco con pruebas.
- D1 Workers en vez de n8n (n8n Cloud ~USD 24/mes). D2 API oficial de WhatsApp. D3 firma + 200 inmediato + segundo plano. D4 Apps Script descartado (responde 302). D5 un mensaje por pedido. D6 reglas + Groq. D7 alertas por Telegram. D8 Sheets como base del MVP (luego reemplazado por D1 para pedidos). D9 datos sensibles fuera del repo. D10 aprobar scripts de instalación de esbuild/workerd. D11→D14→D15 repositorio: se publicó antes de terminar; revisado sin secretos en el historial. D12 CI. D13 scripts `verificar-config` y `simular-mensaje`. D16 intérprete por reglas con contrato JSON compartido con el LLM. D17 Workers Logs.

**2026-10-28 — Etapas 1 a 3 listas.** D18 Graph API v25.0. D19 suscribir la app a la WABA (los webhooks no llegaban). D20 deduplicación en D1. D21 registro en Sheets con cuenta de servicio sin librerías. D22 intérprete en modo prueba. D23 Groq a nombre de Brunen con retención cero. D24 la IA solo extrae y nunca deja sin respuesta. D25 feriados 2026–2027 cargados en la hoja (fuentes públicas). D26 flujo como piezas puras con dependencias inyectables. D27 memoria de conversación y agrupador (migración 0003). D28 lectura de hojas por nombre de columna con caché. D29 avisos de Telegram y lista del día construidos. D30 comprobantes: Drive no sirve; enlaces de Meta duran 5 min. D31 presupuesto de CPU (medido: 15–20 ms tras desplegar, 1–4 ms después). **D32 panel propio** reemplaza a Telegram como bandeja. **D33 el panel es un Worker aparte y el flujo escribe en D1**. **D34 acceso por Cloudflare Access** (Zero Trust Free, 50 usuarios, pide tarjeta sin cobrar). D35 respaldo de D1 (Time Travel).

**2026-10-29 — Cuestionario del dueño (D36).** Respondió precios de carga inicial y mayorista, un mensaje por pedido (opción A), audios los responde Constanza, cliente bloqueado lo atiende una persona, número actual con coexistencia, textos aprobados. D37 el bot pide nombre, dirección y edificio. **D38 plataforma propia de reparto** que haga lo que Optiroute (ruta eficiente + seguimiento en vivo). El dueño quiere el control de sobrantes ("saco 60, sobran 5").

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
- Se agregó el ingreso **One-time PIN** (las organizaciones nuevas solo traen "Cloudflare" como ingreso; Constanza no tiene cuenta de Cloudflare).
- Migraciones **0014 y 0015 aplicadas** en la base real (punto de restauración anotado en `docs/PASOS_FRANCO.md`).
- **Bot publicado**, versión `d792c4c9`: `/salud` ok, firma falsa 401, token falso 403.
- `PANEL_SECRETO` generado al azar (48 caracteres) y cargado en las dos direcciones sin mostrarse; copia única en un archivo fuera del repositorio para que Franco la guarde en su gestor de claves y lo borre.
- **`brunen-admin` publicado y protegido** con Access a nivel de Worker ("Todo el tráfico") y la política reutilizable "Administradores del panel Brunen" (por ahora solo el correo de Brunen, elección de Franco). Equipo de Zero Trust `raspy-mode-40d3`; AUD tag y dominio en `wrangler.panel.toml` (no son secretos).
- **`brunen-panel` publicado** con `PANEL_ADMIN_URL`. Comprobado: portada 200, `/admin` → administración, `/admin/api/pedidos` en la pública 404, administración sin sesión → ingreso de Access.
- Las dos cuentas miembros de Cloudflare tienen verificación en dos pasos activa.
- Commits subidos hasta `63e020b` (CI en verde). Queda un commit local `57aefca` (marca lo publicado en `MEJORAS.md`) sin subir.

---

## 4. Estado actual (presente)

- **Bot**: publicado y funcionando, pero **solo responde a `NUMEROS_PERMITIDOS`** (números de prueba). Sabe: tomar pedidos (texto libre, "lo de siempre", respuestas cortas en contexto), cotizar por tramos, calcular fecha con corte, feriados y días sin reparto, reconocer clientes por ficha o pedidos anteriores, pedir datos a clientes nuevos, mostrar "Entrega en", derivar reclamos/facturas/empresas, guardar la ubicación del cliente, responder "¿cuándo llega?", reenviar comprobantes a Telegram (cuando Telegram esté configurado), transcribir audios, callar si una persona atiende (coexistencia), y el vigía avisa si algo quedó sin respuesta.
- **Panel de administración** (`https://brunen-admin.brunen-chatbot.workers.dev`): Hoy, Por confirmar (confirmar varios + Deshacer), Pedidos, Nuevo pedido (pegar mensaje, precio sugerido, borrador), Avisos, Clientes (fichas, varios teléfonos, unir, "Les toca pedir", por comuna y mapa, pedidos fijos), Reparto (ruta eficiente, mapa, viajes, publicar, mensajes por parada, días sin reparto, cierre del día, bidones entregados y vacíos, seguimiento en vivo y horas estimadas), Equipo (repartidores, claves, sesiones), descarga en Excel.
- **App pública** (`https://brunen-panel.brunen-chatbot.workers.dev`): portada con dos entradas; app del repartidor instalable (ruta del día por viajes, Navegar/Waze/Llamar/Entregado/No se pudo, consentimiento, Iniciar ruta / Terminar jornada, prueba de ubicación).
- **Base real**: migraciones 0001–0015 aplicadas; tiene solo unos pocos pedidos de prueba; **el historial del Excel NO está cargado**.
- **Todavía nadie tiene cuenta** en el panel (la primera la crea Felipe o Franco con el correo de Brunen: RUT + clave; no la crea la IA).
- **Telegram NO configurado** (sin él, reclamos y fallas solo quedan en el panel).
- **La coexistencia del número NO está resuelta**: es el bloqueo principal para atender clientes reales.

---

## 5. Lo que falta (futuro inmediato), en orden — ver `docs/PASOS_FRANCO.md`

| # | Qué | Quién |
|---|---|---|
| 1 | Guardar el secreto del panel en el gestor de claves y borrar el archivo | Franco |
| 2 | Crear el bot de Telegram (@BotFather), grupo con Coni y Felipe, sacar el chat id con `getUpdates`, cargar `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` con `wrangler secret put` | Franco |
| 3 | Primera cuenta de administrador con el correo de Brunen (código por correo → RUT y clave) | Felipe o Franco |
| 4 | Sumar los correos de Coni y Franco a la política "Administradores del panel Brunen" (Zero Trust → Access controls → Policies) | Franco, o la IA si le pasa los correos |
| 5 | Crear al repartidor en Equipo; instalar la app en su Android (Chrome → Agregar a pantalla de inicio, ubicación permitida, batería sin restricciones); prueba de ubicación de 10 min (Maps, pantalla dividida, bloqueado) y captura | Admin, repartidor, Franco |
| 6 | Cargar el historial del Excel: Franco simula (`npm run cargar-historial -- "datos/CONTROL PEDIDOS.xlsx"`), revisa escrituras estimadas (~50.000 de 100.000 diarias) y direcciones con notas, genera con `--generar`; la IA anota punto de restauración y lo carga una sola vez ese día | Franco + IA con permiso |
| 7 | Un día de prueba real con Coni y el repartidor | Todos |
| 8 | **Coexistencia del número** (proveedor autorizado de Meta o Brunen como su propio Tech Provider) | Felipe decide, Franco tramita |
| 9 | **Aviso de privacidad** (Ley 21.719, vigente 1-dic-2026 salvo postergación) | IA redacta, Felipe aprueba |
| 10 | Monitoreo de `/salud` con UptimeRobot gratis | Franco |
| 11 | Borrar los pedidos de prueba de la base real | IA con permiso |
| 12 | Decisiones de Felipe: margen de hora al cliente (hoy ±10 min mínimo), retención de datos, promociones | Felipe |
| 13 | Revisar correos de facturación de Cloudflare en el correo de Brunen | Felipe y Franco |
| 14 | Coni: si acepta avisos por Telegram y que su nombre/horario estén en el repo público | Franco pregunta |
| 15 | Subir el commit local `57aefca` (y este documento) | IA con permiso |

## 6. Mejoras propuestas (las hace la IA, en este orden)
1. **Borrador del aviso de privacidad** (urgente por la fecha de la ley).
2. **Pendientes técnicos de D80**: borrar el seguimiento al desactivar a un repartidor en Equipo; contar los 3 días desde que se guardó cada posición; elegir la posición correcta si hay dos repartidores; guardar los cortes de viaje al publicar la ruta (para que mapa y lista usen exactamente los mismos viajes).
3. **Que el bot lea las fichas de D1** en vez de la hoja CLIENTES (una sola fuente de clientes).
4. **`npm run comprobar`**: revisión automática tras publicar (`/salud`, firma falsa, token falso, portada, 404 de la pública, redirección a Access).
5. Sumar a `tests/mensajes.json` cada mensaje real mal entendido y medir el acierto (cuando haya clientes reales).

## 7. Futuro (más adelante, `docs/MEJORAS.md` y `docs/DISENO_PLATAFORMA.md`)
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
- Actualizar `CLAUDE.md` (todavía dice que los pedidos van a Sheets y los comprobantes a Drive).
- Probar el panel con Constanza en una tarea real.

## 8. Preguntas abiertas para Felipe y Coni (sacarlas solo cuando toque)
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
- Probar el panel a 375 px; usar el preview `panel-prueba` (puerto 8789, `.wrangler/prueba`, solo datos ficticios). La base local por defecto (`.wrangler/`) tiene el historial real: no abrirla en el navegador.

## 10. Entorno de trabajo (Windows)
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
