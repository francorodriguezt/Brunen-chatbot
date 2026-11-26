# Lo que falta hacer para usar todo (actualizado 2026-11-19, madrugada)

Los que dicen "Claude" los hago yo cuando me des permiso; los demás son tuyos (o de Felipe), porque piden tu tarjeta, tus claves o el teléfono del repartidor.

## Hecho (2026-11-18 y 19)
- [x] **Zero Trust activado** (Franco). Nombre del equipo: `raspy-mode-40d3`.
- [x] **Ingreso con código por correo (One-time PIN)** agregado en Zero Trust → Integrations → Identity providers. La pantalla de ingreso ofrece "Cloudflare" o el código por correo.
- [x] **Migraciones `0014` y `0015`** aplicadas en la base real. Punto de restauración anterior: `0000095b-00000000-00005128-57804ff20383f37f9f22cb1693de81f6`.
- [x] **Bot publicado**, versión `d792c4c9`: `/salud` responde `ok`, firma falsa 401, token falso 403.
- [x] **Secreto del panel** (`PANEL_SECRETO`) generado al azar y cargado en las dos direcciones sin mostrarse. Copia en `BRUNEN_PANEL_SECRETO.txt`, en tu carpeta Documentos (fuera del repositorio): **pásalo a tu gestor de claves y borra el archivo**.
- [x] **Administración publicada y protegida**: `https://brunen-admin.brunen-chatbot.workers.dev`, entera detrás de Access ("Todo el tráfico") con la política reutilizable **"Administradores del panel Brunen"** (hoy solo el correo de Brunen). El AUD tag y el dominio del equipo están en `wrangler.panel.toml`.
- [x] **Dirección pública publicada**: `https://brunen-panel.brunen-chatbot.workers.dev` (portada y app del repartidor). Comprobado: la portada abre (200), `/admin` manda a la administración, `/admin/api/pedidos` da 404, y la administración sin sesión manda al ingreso de Access.

## Ahora, en orden

| # | Qué | Quién | Paso a paso |
|---|---|---|---|
| 1 | Guardar el secreto del panel | Franco | Abre `BRUNEN_PANEL_SECRETO.txt` en tu carpeta Documentos, copia el texto a tu gestor de claves y **borra el archivo** (y vacía la papelera). |
| 2 | Crear el bot de Telegram | Franco | 1. En Telegram, abre **@BotFather** → escribe `/newbot` → un nombre (por ejemplo "Avisos Brunen") → un usuario que termine en `bot`. 2. BotFather te da un **token**: cópialo y no lo pegues en el chat. 3. Crea un grupo con Coni y Felipe y agrega el bot. 4. En el grupo escribe `/start`. 5. En el navegador abre `https://api.telegram.org/bot<TOKEN>/getUpdates` y busca `"chat":{"id":-100…`. Ese número, con el signo menos, es el chat id. 6. En la terminal, dentro de la carpeta del proyecto: `npx.cmd wrangler secret put TELEGRAM_BOT_TOKEN` (pega el token cuando lo pida) y `npx.cmd wrangler secret put TELEGRAM_CHAT_ID` (pega el número). |
| 3 | Primera cuenta de administrador | Felipe (o Franco con el correo de Brunen) | 1. Abre `https://brunen-admin.brunen-chatbot.workers.dev`. 2. Escribe el correo de Brunen → **Send login code** → pega el código que llega al correo (o "Cloudflare" si ya tienes la sesión abierta). 3. La primera vez el panel pide elegir el RUT y una clave de 4 dígitos. |
| 4 | Sumar a Coni (y a ti) | Franco, o Claude con el correo | 1. Zero Trust → **Access controls** → **Policies** → **Administradores del panel Brunen** → agregar su correo en "Emails" → guardar. 2. Ella entra igual que en el paso 3 con su correo. Si me pasas los correos, lo hago yo. |
| 5 | Crear al repartidor | Un administrador | En el panel: **Equipo → + Nuevo repartidor**: su nombre, su RUT y una clave que se le dice en persona. |
| 6 | Cargar el historial del Excel | Franco, luego Claude con tu permiso | 1. En tu computador: `npm run cargar-historial -- "datos/CONTROL PEDIDOS.xlsx"` (solo simula y muestra totales; yo no puedo abrir `datos/`). 2. Mándame las líneas de **escrituras estimadas** y de **direcciones con notas**. 3. Si están bien, corres lo mismo con `--generar`. 4. Yo anoto un punto de restauración y lo cargo **una sola vez ese día** (gasta cerca de la mitad del cupo diario gratis de escrituras). |
| 7 | Instalar la app en el teléfono del repartidor (Android) | Repartidor, con Franco | 1. Abre `https://brunen-panel.brunen-chatbot.workers.dev` en **Chrome** → menú ⋮ → **Agregar a pantalla de inicio**. 2. Entra con su RUT y su clave y marca "Recordar este dispositivo". 3. Acepta el permiso de **ubicación** cuando la app lo pida. 4. Ajustes del teléfono → Apps → Chrome → Batería: **sin restricciones**. 5. En la tarjeta de la app, acepta compartir su ubicación durante la jornada. |
| 8 | Probar la ubicación (10 minutos) | Repartidor, con Franco | 1. En su app: **Probar la ubicación en este teléfono → Empezar**. 2. Usa Google Maps 2 minutos y vuelve. 3. Pantalla dividida (Maps arriba, la app abajo) 2 minutos. 4. Teléfono bloqueado 2 minutos. 5. Captura del registro y me la mandas. Con eso sabemos cuánto confiar en la posición en vivo (D79). |
| 9 | Un día de prueba real | Coni, el repartidor y Franco | 1. Coni confirma los pedidos en **Hoy** y publica la ruta en **Reparto**. 2. El repartidor toca **Iniciar ruta** y marca cada entrega. 3. Coni mira el mapa y las horas estimadas. 4. Al final, **Terminar jornada** y revisan el cierre del día. 5. Me cuentas qué falló o qué molestó. |
| 10 | Decisiones de Felipe | Felipe | 1. El margen de hora que se le da al cliente (hoy ±10 min como mínimo). 2. Cuánto tiempo se guardan los pedidos y las fichas (lo pide el aviso de privacidad). 3. Más adelante: promociones y recordatorios a clientes frecuentes. |

Lo que pide permiso cada vez: aplicar migraciones, publicar (`deploy`), cargar secretos y tocar la planilla real. Los secretos los escribe Franco en su terminal: nunca se pegan en el chat.

## Antes de abrir el bot a todos los clientes
El bot hoy solo le contesta a los números de prueba (`NUMEROS_PERMITIDOS`). Para abrirlo a todos falta:

| Qué | Por qué | Quién |
|---|---|---|
| **Coexistencia del número** (D45, D46) | Es el bloqueo más grande: el número actual solo se puede conectar a la API por un proveedor autorizado de Meta o con Brunen como su propio Tech Provider. | Felipe decide; Franco lo tramita |
| **Aviso de privacidad** (Ley 21.719) | La ley rige desde el **15 de octubre de 2027** (Ley 21.855, D82): hay que decirle al cliente qué datos se guardan y para qué. Conviene tenerlo antes de abrir a todos. | Claude redacta el borrador; Felipe lo aprueba |
| **Monitoreo de `/salud`** | Para enterarse si el bot se cae. Cuenta gratis de UptimeRobot con aviso al correo. Desde D84, `/salud` también avisa si la base no responde. | Franco |
| **Borrar los pedidos de prueba** de la base real | Que no se mezclen con los de verdad en el panel ni en las cuentas del día. | Claude, con tu permiso |
| **Correos de facturación** en el correo de Brunen | La verificación en dos pasos ya está activa en las dos cuentas de Cloudflare; falta revisar los correos de facturación ([CUENTAS.md](CUENTAS.md)). | Felipe y Franco |
| **Coni** | Que acepte recibir los avisos por Telegram y que su nombre y horario estén en el repositorio público. | Franco le pregunta |

## Mejoras que propongo (las hago yo)
1. **Borrador del aviso de privacidad**: la ley rige desde el 15-oct-2027 (D82); conviene tenerlo antes de abrir a todos.
2. ~~Cerrar los pendientes del seguimiento (D80)~~: hecho el 2026-11-25 (D84), salvo guardar los cortes de viaje al publicar la ruta. También se corrigió la cola de la app del repartidor, que podía perder marcas.
3. **Que el bot lea las fichas de la base** en vez de la hoja CLIENTES: una sola fuente de clientes, la misma que ve el panel.
4. **Una comprobación automática después de publicar** (`npm run comprobar`): revisa sola `/salud`, la firma falsa, que la pública no muestre la administración, etc., en vez de hacerlo a mano cada vez.

## ¿Hace falta otro servidor (Supabase, Vercel, Netlify)?
No. El servidor ya existe y es **Cloudflare Workers**: corre el código del bot y del panel y entrega los archivos de la app web (la portada, el panel y la app del repartidor). La base de datos es **Cloudflare D1** (cumple el papel que tendría Supabase). Usar otro servicio duplicaría lo que ya hace Cloudflare, sumaría cuentas, claves y un posible costo, y mandaría los datos de los clientes a otra empresa. Solo se pensaría en otro si se pasan los límites del plan gratis (100.000 solicitudes al día, 10 ms de CPU por solicitud, 5 millones de lecturas de D1 al día), que hoy quedan muy lejos.

Fuentes (revisadas el 2026-11-18): [proteger un Worker con Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [el ingreso por defecto ahora es Cloudflare](https://developers.cloudflare.com/changelog/post/2026-06-18-cloudflare-idp-default/), [dónde está el AUD tag](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/#get-your-aud-tag).
