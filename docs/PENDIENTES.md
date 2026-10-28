# Pendientes

## Decide el dueño
- [ ] Número: comprar SIM nuevo o usar coexistencia con el WhatsApp Business actual.
- [ ] Confirmación por excepción (1 mensaje por pedido, USD 0) o doble mensaje (~USD 4/mes).
- [ ] Registrar un método de pago en Meta (obligatorio aunque no se cobre).
- [ ] ¿Carga inicial solo 20 L? ¿Precio para 3+ envases?
- [ ] ¿Precio mayorista y precios especiales para 12 L y 10 L?
- [ ] ¿Los tramos se suman entre tipos de bidón? (hoy se asume que no)
- [ ] Condiciones de las ~20 empresas con plan mensual.
- [ ] ¿El bot pregunta si el cliente tiene envases vacíos para devolver?
- [ ] ¿El bot deriva las boletas a una persona o solo las facturas? (hoy se derivan ambas, como las facturas).
- [ ] Cantidad máxima razonable por pedido (el intérprete acepta hasta 999; sin tope, un error de tipeo se cotiza igual).
- [ ] Aprobar los textos del bot (`docs/CONVERSACIONES.md`; los borradores están en `src/textos.ts`): tono, frases y qué se dice en cada caso.
- [ ] Cantidad inusual: hoy un pedido con más de 20 bidones de un tipo va a revisión y no se le promete precio (`POLITICAS.cantidadInusual`). ¿Cuál es el número razonable?
- [ ] Cliente nuevo: hoy se anota el pedido y una persona coordina dirección y envases, sin prometer precio ni fecha. ¿Quiere que el bot ofrezca la carga inicial y pida la dirección?
- [ ] Cliente bloqueado: hoy lo atiende una persona y no se anota su pedido. ¿Es lo correcto?
- [ ] Dónde guardar los comprobantes de pago (D30): enviarlos por Telegram (recomendado para el piloto), Drive con OAuth, u otra opción.
- [ ] Audios: ¿se transcriben con Groq (Whisper, gratis) o se le pide al cliente que escriba (regla 8)?

## Datos por conseguir
- [ ] Excel de clientes (cargar CLIENTES, marcar mayoristas y especiales). No subirlo al repo.
- [ ] Teléfonos de los dos clientes con precio especial.
- [ ] Confirmar si "Optiroute" es OptimoRoute y conseguir un archivo de importación de ejemplo.
- [ ] Qué significa la columna `Credito` y qué hace el bot con clientes `bloqueado`.
- [ ] ¿Constanza acepta recibir alertas por Telegram?
- [ ] Mensajes reales de clientes, anonimizados, para ampliar `tests/mensajes.json`: es lo que más mejora el parser.
- [ ] Preguntar a Constanza si acepta que su nombre y horario figuren en el repo público (`docs/conocimiento_brunen.md`, sección 8).

## Técnicos
- [x] Respaldo con IA activo: migración `0002` aplicada, `GROQ_API_KEY` cargada y probado con una llamada real (D24).
- [x] Fila `BOT_ACTIVO` = `SI` agregada en la hoja CONFIGURACION de la planilla de desarrollo.
- [ ] Traspasar a la cuenta de Brunen (correo de la empresa) lo que hoy está a nombre de Franco: Cloudflare, Google Cloud/planilla y la app de Meta. Mientras tanto, invitar a contactobrunen@gmail.com como administrador de Cloudflare. Se hace completo en la Etapa 7.
- [x] Cuenta de Groq a nombre de Brunen, plan gratis sin tarjeta y retención de datos cero activada (D23).
- [x] Feriados nacionales 2026 y 2027 cargados en la hoja FERIADOS (D25).
- [ ] Renovar la hoja FERIADOS con los feriados de 2028 antes del 31 de diciembre de 2027 (el bot lo avisa con "feriados sin cargar") y confirmar el 21 de junio de 2027 cuando el Gobierno publique el calendario oficial.
- [ ] La clave JSON de Google quedó en la carpeta Descargas del computador: guardarla en un lugar seguro fuera del proyecto o borrarla (ya está en Cloudflare y se puede generar otra).
- [x] Versión de la Graph API: v25.0 (D18).
- [x] Base D1 `brunen-chatbot` creada, migrada y activa (D20).
- [x] Token permanente (usuario del sistema `bot-brunen`, sin vencimiento) cargado en Cloudflare el 2026-10-28.
- [ ] Revisar disponibilidad de coexistencia en Chile si el dueño la elige.
- [ ] Al conectar la Etapa 4: aplicar la migración `0003_etapa4.sql` en D1, medir el CPU por mensaje con `wrangler tail` (D31) y ajustar la espera del agrupador (7 s, D27) con mensajes reales.
- [ ] Crear el bot de Telegram (@BotFather) y cargar `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID` y el secreto del webhook (Etapa 5, D29). Lo hace Franco: yo no puedo crear cuentas.
- [ ] Cargar en la hoja CLIENTES los clientes reales (Constanza), con sus teléfonos, comunas y tipos, para probar el flujo con fichas. Sin esos datos todos los clientes son "nuevos".
- [ ] Confirmar en la D1 remota que una escritura `INSERT ... ON CONFLICT ... WHERE` que no cambia nada devuelve `changes = 0` (D27). Prioridad baja.
- [ ] La planilla real (Etapa 7): copiar la hoja FERIADOS, CONFIGURACION y PRECIOS, y revisar que la ficha de cada cliente use los nombres de columna de `docs/conocimiento_brunen.md`, sección 11.

## Decide Franco
- [ ] Licencia del repositorio público (por ejemplo MIT, o ninguna): hoy no tiene y, sin licencia, nadie puede reutilizar el código.
- [ ] Historial de git: ¿se reescribe para quitar el correo personal, el apellido de la operadora y los avisos de coautoría de los commits? Exige reescribir y forzar el push (D15); se decide después de la respuesta de la operadora (pregunta 14 del cuestionario).
- [ ] Qué hacer con las cuentas a nombre de Franco (Cloudflare, Google Cloud, Meta): traspaso a Brunen en la Etapa 7.

## Antes de salir a producción (Etapa 7)
Datos de Meta tomados de fuentes secundarias el 2026-10-28: confirmar todo en la documentación oficial de Meta antes de actuar.
- [ ] Número definitivo. Lo más simple es un número nuevo solo para la API. La "coexistencia" (usar el mismo número en la app de WhatsApp Business y en la API) parece estar disponible en Chile, pero su alta pasa por un flujo de registro ("Embedded Signup") pensado para proveedores de tecnología: verificar si Franco puede hacerlo directo.
- [ ] Verificación de empresa en Meta y aprobación del nombre visible. Sin verificar, el límite es de unos 250 contactos nuevos por día iniciados por la empresa (los clientes que escriben primero no cuentan); con verificación sube. Puede tardar de días a semanas.
- [ ] Método de pago registrado en Meta (lo exige aunque no se cobre dentro del cupo gratis).
- [ ] Mensajes que inicia la empresa fuera de las 24 horas (por ejemplo, avisar la hora aproximada a los clientes con `Aviso_Hora`) exigen plantillas aprobadas por Meta y pueden cobrarse: decidir si se hacen.
- [ ] Monitoreo: cuenta gratuita de UptimeRobot (o similar) apuntando a `/salud`, con aviso por correo.
- [ ] Datos personales: la Ley 21.719 (vigencia 1-dic-2026 según el documento de conocimiento; se discute postergarla) pide informar al cliente qué datos se guardan y para qué. Redactar un aviso breve de privacidad (qué se guarda, cuánto tiempo, que parte del texto pasa por Groq en EE. UU. con retención cero) y decidir cuándo se le muestra al cliente.
- [ ] Planilla real: copiar la de desarrollo, correr `npm run preparar-planilla` con la clave de esa planilla, compartirla con la cuenta de servicio, cambiar `GOOGLE_SHEET_ID` y revisar los permisos de quién puede editarla.
- [ ] Copia de seguridad de la planilla (el historial de versiones de Google sirve para lo básico) y quién tiene acceso a Cloudflare, Meta, Groq y Telegram.
