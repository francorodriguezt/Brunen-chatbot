# Pendientes

Separados por quién decide o actúa. Franco decide lo que no es de dinero, de número ni de cómo se presenta Brunen; al dueño solo se le consulta lo muy importante, en un documento que Franco le envía ("Chatbot de WhatsApp de Brunen: lo que necesito de ti", en Claude Docs; no vive en este repositorio).

## Decide Franco
Franco aceptó las recomendaciones el 2026-10-28; quedan abiertas la del acceso al panel, que cambió al verificarla, y las dos que dependen de Constanza.
- [ ] **Acceso al panel: confirmar la opción.** Verifiqué en la documentación de Cloudflare (2026-10-28) que Zero Trust Free pide registrar un método de pago aunque no cobre (D33), y habías aceptado "pasar a inicio de sesión con Google si pide tarjeta". **A.** Access con esa tarjeta registrada: código por correo, nada que programar ni mantener, sin cobro mientras sean pocas personas (el tope de 50 usuarios gratis solo lo confirman fuentes de terceros). **B.** Inicio de sesión con Google dentro del Worker: sin tarjeta, pero hay que programarlo, probarlo y mantenerlo, y crear una credencial OAuth en Google Cloud. Recomendación: A, porque Meta ya exige un método de pago para el número del bot y así no escribimos código de seguridad propio. Qué tarjeta usar (la tuya hoy, la de Brunen después) lo deciden tú y el dueño.
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
Están en el documento para el dueño, numeradas igual:
- [ ] 1. Carga inicial: ¿solo 20 L? ¿Precio para 3 o más envases?
- [ ] 2. Precios mayorista y especiales para 12 L y 10 L.
- [ ] 3. ¿Los descuentos por cantidad se suman entre tamaños de bidón? (hoy se asume que no)
- [ ] 4. Condiciones de las ~20 empresas con plan mensual.
- [ ] 5. Qué significan `Credito` y `bloqueado`, y qué debe hacer el bot con un cliente bloqueado.
- [ ] 6. Facturas y boletas: ¿siempre las atiende una persona? (hoy sí)
- [ ] 7. Número de WhatsApp: nuevo solo para el bot o el actual con coexistencia.
- [ ] 8. Confirmación por excepción (1 mensaje por pedido, USD 0) o doble mensaje (~USD 4/mes).
- [ ] 9. ¿Prometer en los reclamos "lo resolvemos a más tardar mañana"?
- [ ] 10. Tono de los textos.
- [ ] 11. Quién usará el panel y qué quiere ver.
- [ ] 12. ¿Quiere recibir también los avisos urgentes por Telegram?

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
- [ ] Salida a prueba, cada paso con aprobación de Franco: aplicar las migraciones 0003 y 0004 en la D1 remota, desplegar el bot, encender `FLUJO_PEDIDO` con un número de prueba, desplegar el panel y activar Access (pasos en `docs/ETAPAS.md`).
- [ ] Medir el CPU por mensaje del bot y por solicitud del panel con `wrangler tail` (D31, D33) y ajustar la espera del agrupador (D27) con mensajes reales.
- [ ] Panel, fases P2 a P5 (reparto del día, clientes y mapa, estadísticas, configuración; ver `docs/ETAPAS.md`).
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
- [ ] Número definitivo. Lo más simple es un número nuevo solo para la API. La "coexistencia" (usar el mismo número en la app de WhatsApp Business y en la API) parece estar disponible en Chile, pero su alta pasa por un flujo de registro ("Embedded Signup") pensado para proveedores de tecnología: verificar si Franco puede hacerlo directo.
- [ ] Verificación de empresa en Meta y aprobación del nombre visible. Sin verificar, el límite es de unos 250 contactos nuevos por día iniciados por la empresa (los clientes que escriben primero no cuentan); con verificación sube. Puede tardar de días a semanas.
- [ ] Mensajes que inicia la empresa fuera de las 24 horas (por ejemplo, avisar la hora aproximada a los clientes con `Aviso_Hora`) exigen plantillas aprobadas por Meta y pueden cobrarse: decidir si se hacen.
- [ ] Monitoreo: cuenta gratuita de UptimeRobot (o similar) apuntando a `/salud`, con aviso por correo.
- [ ] Datos personales: la Ley 21.719 (vigencia 1-dic-2026 según el documento de conocimiento; se discute postergarla) pide informar al cliente qué datos se guardan y para qué. Redactar un aviso breve de privacidad (qué se guarda, cuánto tiempo, que parte del texto pasa por Groq en EE. UU. con retención cero) y decidir cuándo se le muestra al cliente. El panel muestra datos personales: acceso solo para personas autorizadas.
- [ ] Planilla real: copiar la de desarrollo, correr `npm run preparar-planilla` con la clave de esa planilla, compartirla con la cuenta de servicio, cambiar `GOOGLE_SHEET_ID` y revisar los permisos de quién puede editarla.
- [ ] Copia de seguridad (el historial de versiones de la planilla sirve para lo básico; la base D1 se puede exportar con `wrangler d1 export`) y quién tiene acceso a Cloudflare, Meta, Groq y Telegram.
