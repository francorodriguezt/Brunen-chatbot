# Pendientes

Separados por quién decide o actúa. Franco decide lo que no es de dinero, de número ni de cómo se presenta Brunen; al dueño solo se le consulta lo muy importante, en un documento que Franco le envía ("Chatbot de WhatsApp de Brunen: lo que necesito de ti", en Claude Docs; no vive en este repositorio).

## Próxima sesión
Estado al 2026-11-01: el bot está desplegado con la corrección del edificio (versión `4c934673`) y el flujo encendido solo para los números de prueba; el panel y Telegram siguen sin activar. La revisión del código del 2026-11-01 (D39) dejó correcciones hechas y probadas en el repositorio que **todavía no están desplegadas**.
1. Repetir la prueba del edificio desde el número de prueba: `quiero 2 de 20` → el bot pide nombre y dirección → `Ana Torres, Av. Irarrázaval 2345 depto 502, Ñuñoa` (datos ficticios) → `No tiene nombre, gracias`. El bot no debe contestar esa última respuesta. Revisar en la base que quedó anotado «Sobre el edificio dijo: …» y medir el CPU con `wrangler tail`.
2. Franco: activar Zero Trust Free y crear el bot de Telegram; después se despliega el panel y se configura Access (pasos en `docs/ETAPAS.md`).
3. Dueño: empezar las gestiones de Meta (método de pago, verificación de empresa y si la coexistencia se puede hacer) y responder los precios que faltan.
4. Después: bajar el CPU y limpiar los pedidos de prueba de la base real (con el visto bueno de Franco). El ensayo del respaldo (D35) ya se hizo el 2026-11-01; falta decidir quién lo hace cada semana y dónde se guarda.
5. Desplegar las correcciones de la revisión del código (D39) con el visto bueno de Franco y repetir la prueba; medir el CPU con y sin `REGISTRO_PLANILLA`.

## Decide Franco
Franco aceptó las recomendaciones el 2026-10-28 y delegó la del acceso al panel (D34); quedan abiertas las dos que dependen de Constanza.
- [x] **Acceso al panel:** Cloudflare Access (D34; Franco delegó la elección el 2026-10-28 en "lo mejor en lo práctico, la seguridad y el largo plazo"). Entra con un código al correo y no hay código propio de inicio de sesión. Cloudflare pide registrar un método de pago aunque no cobre (D33): ese paso es de Franco o del dueño (ver "Técnicos").
- [x] Qué es "muy urgente" para Telegram (D32). Recomendación: reclamos y fallas del sistema (token de WhatsApp vencido, Google o D1 caídos, hoja PRECIOS dañada, tope de la IA agotado). Todo lo demás, en el panel.
- [x] Acceso al panel (D32): Cloudflare Access (código por correo, sin programar; confirmar si pide tarjeta) o inicio de sesión con Google en el propio Worker. Recomendación: probar Access primero.
- [x] Datos del panel: D1 como fuente de verdad de pedidos, avisos y clientes, con la planilla como espejo (D32). Recomendación: sí.
- [x] Mapa: por comuna y con el punto exacto cuando el cliente comparte su ubicación por WhatsApp o la operadora lo marca; sin geocodificar direcciones con servicios externos (D32). Recomendación: sí.
- [x] Comprobantes de pago: guardarlos en D1 por 60 días y verlos en el panel (D30, D32). Recomendación: sí.
- [x] Audios: pedir al cliente que escriba (regla 8). Recomendación: sí, al inicio.
- [x] Cliente nuevo: se anota y una persona coordina dirección y envases, sin prometer precio ni fecha (hoy). Recomendación: dejarlo así.
- [x] Cantidad inusual: más de 20 bidones de un tipo va a revisión y no se le promete precio (`POLITICAS.cantidadInusual`). Recomendación: 20.
- [x] ¿El bot pregunta si hay envases vacíos para devolver? Recomendación: no preguntar; anotarlos cuando el cliente avise (ahorra mensajes).
- [x] Espera del agrupador de mensajes seguidos: 7 s (D27). Recomendación: 7 s y ajustar con uso real.
- [x] Texto del aviso de contingencia (`MENSAJE_EXCEPCION`) y tono de los textos (`docs/CONVERSACIONES.md`). Recomendación: aprobar el borrador y ajustar con lo que diga el dueño.
- [x] Licencia del repositorio público (por ejemplo MIT, o ninguna): hoy no tiene y, sin licencia, nadie puede reutilizar el código.
- [ ] Historial de git: ¿se reescribe para quitar el correo personal, el apellido de la operadora y los avisos de coautoría de los commits? Exige reescribir y forzar el push (D15); se decide después de la respuesta de la operadora (pregunta 14 del cuestionario).
- [ ] Preguntar a Constanza si acepta que su nombre y horario figuren en el repo público (`docs/conocimiento_brunen.md`, sección 8) y si acepta recibir los avisos urgentes por Telegram.

## Decide el dueño (solo lo muy importante)
Respondió el cuestionario el 2026-10-29 (D36). Marcadas las que quedaron resueltas; en las demás, lo que falta:
- [ ] 1. Carga inicial: respondido (D36). Falta el precio de 3 o más envases en 12 L y 10 L.
- [ ] 2. Mayorista: respondido (D36; confirmar que $3.250 y $2.000 son por envase). Faltan los precios especiales ($3.500 y $3.000) para 12 L y 10 L.
- [x] 3. Los descuentos por cantidad son por tamaño (D36).
- [x] 4. Empresas con plan mensual: cada una tiene su condición y siempre se derivan a Constanza (D36).
- [ ] 5. Cliente bloqueado: lo atiende una persona y no se anota el pedido (D36). Falta qué significa `Credito` en su Excel y si al bloqueado se le contesta algo (hoy el bot le dice que una persona lo revisará).
- [x] 6. Facturas y boletas: siempre las atiende una persona (D36).
- [ ] 7. Número de WhatsApp: eligió el actual con coexistencia (D36). Falta confirmar que se pueda hacer (Meta exige un Tech Provider o Solution Partner) y qué prefiere si no se puede: un número nuevo solo para el bot u otra vía. Con coexistencia, si el bot cae se sigue atendiendo desde la app de siempre.
- [x] 8. Un solo mensaje del bot por pedido, opción A (D36).
- [x] 9. Sí, en los reclamos se promete "lo resolvemos a más tardar mañana" (D36).
- [x] 10. Tono de los textos: sin cambios (D36).
- [ ] 11. Qué quiere ver: respondido (D36). Usarán el panel Constanza, el dueño y Franco; falta el repartidor, que aparece en sus audios.
- [x] 12. Sí, quiere los avisos urgentes por Telegram (D36). Falta crear el bot y que abra el chat.

## Acciones del dueño
- [ ] Registrar un método de pago en Meta (lo exige aunque no se cobre dentro del cupo gratis).
- [ ] Verificar la empresa en Meta con los documentos de Brunen SpA (puede tardar de días a semanas).
- [ ] Pasar a Franco el Excel de clientes, los teléfonos de los dos clientes con precio especial y la lista de mayoristas. No subirlos al repositorio.
- [ ] Decir qué app de rutas usan (¿OptimoRoute?) y mandar un archivo de importación de ejemplo.
- [ ] Autorizar que los servicios queden a nombre de Brunen y dar acceso al correo contactobrunen@gmail.com (o pasar los códigos de verificación).
- [ ] Aprobar el aviso de privacidad cuando Franco lo redacte.

## Técnicos
- [x] Respaldo con IA activo: migración `0002` aplicada, `GROQ_API_KEY` cargada y probado con una llamada real (D24).
- [x] Fila `BOT_ACTIVO` = `SI` agregada en la hoja CONFIGURACION de la planilla de desarrollo.
- [x] Cuenta de Groq a nombre de Brunen, plan gratis sin tarjeta y retención de datos cero activada (D23).
- [x] Feriados nacionales 2026 y 2027 cargados en la hoja FERIADOS (D25).
- [x] Versión de la Graph API: v25.0 (D18).
- [x] Base D1 `brunen-chatbot` creada, migrada y activa (D20).
- [x] Token permanente (usuario del sistema `bot-brunen`, sin vencimiento) cargado en Cloudflare el 2026-10-28.
- [x] Flujo de pedido conectado al Worker y guardando en D1, detrás de `FLUJO_PEDIDO` (D33). Probado con SQLite real y con Meta, Google, Telegram y Groq simulados.
- [x] Panel, fase P1 (bandeja de pedidos y avisos): construido y probado en local (D33).
- [ ] Salida a prueba, cada paso con aprobación de Franco. Hecho el 2026-10-29: migraciones 0003 y 0004 aplicadas en la D1 real (con el punto de restauración anterior anotado) y bot desplegado con el flujo apagado (versión `55bb523b`; `/salud`, firma falsa y token falso comprobados). Hecho el 2026-10-30: `FLUJO_PEDIDO` encendido para los números de prueba (versión `b6713f21`). Primera prueba real (2026-10-30): el pedido, los datos y el edificio funcionaron de punta a punta; la respuesta «No tiene nombre, gracias» caía en «no entendido» y se corrigió: la corrección se desplegó el 2026-10-31 (versión `4c934673`; `/salud`, firma falsa y token falso comprobados). Falta: repetir esa prueba, desplegar el panel y activar Access (pasos en `docs/ETAPAS.md`).
- [ ] Activar Zero Trust (plan Free, hasta 50 usuarios, sin costo) en la cuenta de Cloudflare: lo hace Franco en el panel de Cloudflare, incluido el método de pago; no se pueden escribir datos de pago desde aquí. Decidir con el dueño qué tarjeta se registra (la de Franco hoy, la de Brunen al traspasar la cuenta). Después, crear la aplicación de Access y pasar el dominio del equipo y el AUD tag (pasos en `docs/ETAPAS.md`, "Panel de administración").
- [ ] Respaldo de D1 (D35), antes de encender `FLUJO_PEDIDO` con clientes reales: **ensayado el 2026-11-01**. `wrangler d1 export brunen-chatbot --remote --output <archivo>.sql` exportó la base real (14,5 KiB) y el archivo se restauró en una base SQLite local con las mismas filas en las 9 tablas (pedidos 1, avisos 3, mensajes vistos 57...) y los 10 índices. Wrangler imprime un enlace de descarga temporal (vale una hora): no hay que pegarlo en ningún lado. Falta decidir quién lo hace cada semana y dónde se guarda el archivo (fuera del repositorio) y repetir el ensayo con datos de clientes reales antes de abrir.
- [ ] CPU (D31): medido el 2026-10-30 con 3 mensajes reales del bot (62, 25 y 34 ms, más 1 a 3 ms por cada aviso de estado de Meta). Todos terminaron "ok" pero superan los 10 ms del plan gratis. Investigar en qué se va (hipótesis: las consultas a D1 por mensaje, que se pueden agrupar con `batch`, y la lectura de las hojas) y vigilar el error 1102. Falta medir el panel y ajustar la espera del agrupador (D27) con más mensajes reales. Tras la revisión del 2026-11-01 (D39) el formateador de fechas se crea una sola vez por zona y el registro de cada lote en la hoja se puede apagar con `REGISTRO_PLANILLA = "NO"` en `wrangler.toml`: falta desplegar y medir con y sin, un mensaje a la vez, para saber cuánto pesa cada cosa antes de cambiar más.
- [ ] Panel, fases P2 a P5 (reparto del día, clientes y mapa, estadísticas, configuración; ver `docs/ETAPAS.md`).
- [x] Precios nuevos del dueño (D36) en `src/precios.ts`, con pruebas primero (2026-10-29): la recarga mayorista de 12 L y 10 L ya se cotiza en el flujo. La carga inicial por tipo y la mayorista están calculadas y probadas, pero el bot todavía no las usa: a un cliente nuevo no se le promete precio. Lo que sigue sin respuesta va a revisión.
- [x] Audios (D36), hecho el 2026-10-29: el bot ya no responde y deja un aviso de tipo escalamiento para Constanza (`atencion.ts`, con prueba). `docs/CONVERSACIONES.md` no tenía ejemplo de audio.
- [ ] Coexistencia (D36): confirmar con Meta o con un Tech Provider si Franco puede hacer el alta de la línea actual, y acordar el plan B con el dueño. Con coexistencia, el bot debería ignorar los ecos de lo que Constanza escribe desde la app y no responder una conversación que Constanza ya tomó.
- [ ] Reparto (idea de Franco, 2026-10-28; el proceso está en `docs/conocimiento_brunen.md`, sección 15): ruta, carga por punto, vacíos por parada (avisando y justificando los faltantes) y cierre del turno (vacíos en la planta o en el furgón). Dirección de Franco (D38, 2026-10-29): la plataforma que usan hoy es Optiroute, donde ven punto por punto al repartidor, su ubicación en vivo y cuánto demora entre puntos, pero lo que se busca es crear una propia con las mismas funciones: la ruta con los puntos de la forma más eficiente posible y el seguimiento en vivo, más el control de los bidones que sobran de cada turno ("saco 60, sobran 5, al día siguiente saca 55"), los vacíos por parada con justificación de faltantes y la hora de llegada para el cliente. Es un proyecto aparte, con su propio diseño antes de construir (coordenadas, distancias, seguimiento en vivo y cómo entra el repartidor). Amplía la fase P2 del panel y no depende de Meta.
- [x] El bot pide nombre, dirección y edificio al cliente nuevo (D37, hecho el 2026-10-29, con pruebas primero). Falta que el dueño apruebe los textos nuevos (se cambian en `src/textos.ts`), incluir a los clientes con ficha pero sin dirección y la referencia de la hora de llegada, que sigue como propuesta y depende de la plataforma propia (D38).
- [ ] Reconocer al cliente por sus pedidos (D39): hoy un cliente que no está en la hoja CLIENTES vuelve a recibir la pregunta de nombre y dirección en cada pedido (2 mensajes del bot cada vez). Propuesta: tratar como conocido a un teléfono con un pedido ya entregado en D1 y usar la dirección de ese pedido (el índice `idx_pedidos_telefono` ya existe). Cambia lo que se le promete a un cliente (precio y fecha) sin que Constanza lo haya cargado: lo deciden Franco y el dueño.
- [ ] Panel: que la pantalla mande la versión del pedido que mostraba (`actualizadoEn`) al confirmar o editar, para que dos personas no se pisen; hoy el servidor compara con lo que leyó en la misma solicitud y gana el último que guarda (D39).
- [ ] Acotar por fecha las listas "Cerrados" y "Todos" del panel cuando haya miles de pedidos (D1 gratis: 5 millones de filas leídas al día; D33).
- [ ] Crear el bot de Telegram (@BotFather) solo para lo muy urgente y cargar `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` y el secreto del webhook (D29, D32). Lo hace Franco: no se pueden crear cuentas desde aquí.
- [ ] Clientes: importar el Excel desde el panel cuando exista esa pantalla; mientras tanto, 2 o 3 clientes de prueba en la hoja CLIENTES (tu número, un mayorista, uno fuera de zona) para probar el flujo. Sin fichas, todos los clientes son "nuevos".
- [ ] Traspasar a la cuenta de Brunen lo que hoy está a nombre de Franco: Cloudflare, Google Cloud/planilla y la app de Meta. Mientras tanto, invitar a contactobrunen@gmail.com como administrador de Cloudflare. Se hace completo en la Etapa 7.
- [ ] La clave JSON de Google quedó en la carpeta Descargas del computador: guardarla en un lugar seguro fuera del proyecto o borrarla (ya está en Cloudflare y se puede generar otra).
- [ ] Renovar la hoja FERIADOS con los feriados de 2028 antes del 31 de diciembre de 2027 (el bot lo avisa con "feriados sin cargar") y confirmar el 21 de junio de 2027 cuando el Gobierno publique el calendario oficial.
- [ ] Mensajes reales de clientes, anonimizados, para ampliar `tests/mensajes.json`: es lo que más mejora el intérprete.
- [ ] Confirmar en la D1 remota que una escritura `INSERT ... ON CONFLICT ... WHERE` que no cambia nada devuelve `changes = 0` (D27). Prioridad baja.
- [ ] Revisar disponibilidad de coexistencia en Chile si el dueño la elige.

## Antes de salir a producción (Etapa 7)
Datos de Meta tomados de fuentes secundarias el 2026-10-28: confirmar todo en la documentación oficial de Meta antes de actuar.
- [ ] **No abrir a clientes reales hasta que el panel y Telegram estén activos:** hoy el bot le dice a quien reclama «ya avisamos al equipo», pero el aviso queda en la base y nadie lo ve ni lo recibe (no hay panel desplegado ni bot de Telegram). Con los números de prueba no importa.
- [ ] Número definitivo. Lo más simple es un número nuevo solo para la API. La "coexistencia" (usar el mismo número en la app de WhatsApp Business y en la API) parece estar disponible en Chile, pero su alta pasa por un flujo de registro ("Embedded Signup") pensado para proveedores de tecnología: verificar si Franco puede hacerlo directo.
- [ ] Verificación de empresa en Meta y aprobación del nombre visible. Sin verificar, el límite es de unos 250 contactos nuevos por día iniciados por la empresa (los clientes que escriben primero no cuentan); con verificación sube. Puede tardar de días a semanas.
- [ ] Mensajes que inicia la empresa fuera de las 24 horas (por ejemplo, avisar la hora aproximada a los clientes con `Aviso_Hora`) exigen plantillas aprobadas por Meta y pueden cobrarse: decidir si se hacen.
- [ ] Monitoreo: cuenta gratuita de UptimeRobot (o similar) apuntando a `/salud`, con aviso por correo.
- [ ] Datos personales: la Ley 21.719 (vigencia 1-dic-2026 según el documento de conocimiento; se discute postergarla) pide informar al cliente qué datos se guardan y para qué. Redactar un aviso breve de privacidad (qué se guarda, cuánto tiempo, que parte del texto pasa por Groq en EE. UU. con retención cero) y decidir cuándo se le muestra al cliente. El panel muestra datos personales: acceso solo para personas autorizadas.
- [ ] Planilla real: copiar la de desarrollo, correr `npm run preparar-planilla` con la clave de esa planilla, compartirla con la cuenta de servicio, cambiar `GOOGLE_SHEET_ID` y revisar los permisos de quién puede editarla.
- [ ] Copias de seguridad según D35 (los pedidos ya no están en la planilla) y quién tiene acceso a Cloudflare, Meta, Groq y Telegram.
- [ ] Plan B si el bot o el panel se caen: cómo responde una persona a los clientes y desde dónde. Con coexistencia sigue la app de WhatsApp Business de siempre; con un número solo para la API habría que verificar qué bandeja de Meta permite responder a mano. Definir cuándo se usa `BOT_ACTIVO = NO` y qué se le avisa al cliente. Pesa en la decisión 7 del dueño (número).

## Información que falta o es ambigua (2026-10-29)
Segunda ronda: lo que falta después del cuestionario respondido y de los audios del dueño. Entre paréntesis, quién la tiene o decide.

**Dueño**
- [ ] Archivo que suben hoy a Optiroute (o su plantilla de importación), de un día real y sin datos de clientes: columnas, cómo se anotan los bidones de cada punto, los envases por retirar y cómo se ordena; quién lo arma y a qué hora queda listo.
- [ ] Optiroute hoy: nombre exacto o dirección web (¿es OptimoRoute?), qué plan tienen y cuánto pagan, y qué funciones usan todos los días (ruta, app del repartidor con GPS, seguimiento en vivo, avisos a clientes) y cuáles no. Es la lista de lo que la plataforma propia (D38) tiene que hacer.
- [ ] Hora de llegada para el cliente (`Aviso_Hora`): ¿a todos o solo a los que la piden? ¿La manda Optiroute por SMS o correo, o el bot por WhatsApp con un mensaje extra (gasta el cupo gratis y, fuera de las 24 horas, exige plantilla aprobada)?
- [ ] Sobrantes: confirmar que los bidones que sobran quedan en el furgón de un día para otro, si se cuentan por tamaño y si la carga de cada día lleva un margen "por si acaso".
- [ ] Furgón: si el lugar donde se estaciona es la planta, qué pasa con los vacíos cuando el repartidor termina tarde y si alguna vez se lleva el furgón a su casa.
- [ ] Vacíos que faltan en una entrega: después de justificar el faltante, ¿se retira al día siguiente, queda como saldo del cliente o se cobra? ¿Se espera un vacío por cada bidón entregado?
- [ ] Número: si la línea actual está en la app WhatsApp Business o en WhatsApp normal, quién la administra y en qué teléfono; qué prefiere si la coexistencia no se puede hacer; si usa listas de difusión o grupos con clientes (la coexistencia desactiva las listas y no sincroniza los grupos).
- [ ] Gestiones en Meta (método de pago y verificación de empresa) y las otras acciones del dueño: en qué estado están.
- [ ] Precios que faltan: carga inicial de 12 L y 10 L desde 3 envases; precios especiales para 12 L y 10 L; confirmar que la carga inicial mayorista ($3.250 y $2.000) es por envase.
- [ ] `Credito`: qué significa en su Excel; y si a un cliente bloqueado se le contesta algo.
- [ ] Nombre, dirección y edificio (D37, ya construido): aprobar los textos nuevos y que un cliente nuevo pase de 1 a 2 mensajes del bot (3 si hay que repetir la pregunta). ¿También a los clientes con ficha pero sin dirección?
- [ ] Costo: si un mes se pasan de 1.000 mensajes, el peor caso ronda USD 6 al mes. Confirmar que es aceptable.
- [ ] Excel de clientes y de pedidos anteriores: su formato, para importar las fichas y para "lo de siempre".
- [ ] Cuánto tiempo se guardan los pedidos y las fichas (lo pide el aviso de privacidad de la Ley 21.719).

**Constanza**
- [ ] Si acepta que su nombre y horario figuren en el repositorio público y recibir los avisos urgentes por Telegram.
- [ ] Cómo arma hoy el Excel del día (desde los chats, a mano), a qué hora, con qué columnas, y cómo anota los envases pendientes de cada cliente.
- [ ] Qué hace cuando un cliente no está o no tiene los vacíos, y cómo reagenda.
- [ ] Desde qué aparato usará el panel (computador o celular) y con qué correo entrará.

**Franco**
- [ ] Coordenadas de los clientes (D32: las direcciones no salen de Brunen). Las necesita la ruta propia (D38) y también el mapa del panel (P3). Opciones: guardar el punto exacto con el GPS del celular del repartidor o con la ubicación que comparta el cliente, o permitir un servicio externo de geocodificación para pasar cada dirección a un punto una sola vez. Decide Franco.
- [ ] Permisos del panel: hoy todos los que pasan por Access ven y cambian todo. El repartidor va a usar la plataforma propia (D38), así que hay que separar roles: él solo debería ver su ruta del día.
- [ ] Qué se le dice al cliente cuando la operadora cambia o cancela un pedido en el panel (hoy no se le escribe y cada mensaje cuenta en el cupo gratis).
- [ ] Comprobantes: a qué pedido se asocia la imagen cuando el cliente tiene varios sin pagar.
- [ ] Datos de Meta que vienen de fuentes secundarias (límite de unos 250 contactos nuevos al día, costos, países de la coexistencia): confirmarlos en la documentación oficial.

## Mejoras posibles
Ninguna bloquea la salida a prueba; van de más a menos útiles para el piloto.
- [ ] Guía de uso del panel para la operadora (una página) y "qué hacer si falla": token de WhatsApp vencido, Google caído, el panel pide volver a entrar.
- [ ] Capturas del panel con datos ficticios en el README: hoy solo tiene la insignia de la revisión automática, y es lo primero que mira un reclutador.
- [ ] Buscar pedidos por teléfono o nombre en el panel: hoy solo se filtra por grupo y fecha.
- [ ] Bajar el CPU del bot pasando CLIENTES, PRECIOS, CONFIGURACION y FERIADOS de Google Sheets a D1 (D31 y D32: la firma del token de Google y las lecturas de las hojas son lo que más gasta). Llega con las fases P3 y P5.
- [ ] Espejo de PEDIDOS en la planilla cada noche, como segunda copia y para quien prefiera ver Excel durante la transición.
- [ ] Panel instalable en el celular ("Agregar a la pantalla de inicio") y botón "Salir".
- [ ] Pruebas automáticas de la pantalla (hoy se probó a mano en el navegador): sacar la lógica de `panel/app.js` a módulos que se puedan probar.
- [ ] Dependabot y `npm audit` en la revisión automática (hoy solo corre `npm ci` y `npm run check`), y subir wrangler a 4.155.0 (parche).
- [ ] Formateador y linter (hoy no hay): estilo uniforme con Prettier y ESLint.
- [ ] Reescribir el historial de git (correo personal y coautoría): ver "Decide Franco".
