# Lo que falta hacer para usar todo (actualizado 2026-11-18, noche)

Todo lo construido hasta D80 está en GitHub, pero **sin publicar**. Estos son los pasos, en orden. Los que dicen "Claude" los hago yo cuando me des permiso; los demás son tuyos (o de Felipe), porque piden tu tarjeta, tus claves o el teléfono del repartidor.

Revisado hoy en la base real: le faltan solo las migraciones `0014` (días sin reparto) y `0015` (seguimiento).

## Hecho
- [x] **Zero Trust activado** (2026-11-18).

## Ahora, en orden

| # | Qué | Quién | Paso a paso |
|---|---|---|---|
| 1 | Agregar el ingreso con código por correo (One-time PIN) | Franco | 1. dash.cloudflare.com → **Zero Trust** → **Integrations** → **Identity providers**. 2. **Add new identity provider** → **One-time PIN** → guardar. **Por qué:** desde 2026 las organizaciones nuevas solo traen el ingreso "con cuenta de Cloudflare", y Coni no tiene una. Con el código por correo, cada uno entra con su correo sin crear otra cuenta. |
| 2 | Crear el bot de Telegram | Franco | 1. En Telegram, abre **@BotFather** → escribe `/newbot` → un nombre (por ejemplo "Avisos Brunen") → un usuario que termine en `bot`. 2. BotFather te da un **token**: cópialo y no lo pegues en el chat. 3. Crea un grupo con Coni y Felipe y agrega el bot. 4. En el grupo escribe `/start`. 5. En el navegador abre `https://api.telegram.org/bot<TOKEN>/getUpdates` y busca `"chat":{"id":-100…`. Ese número, con el signo menos, es el chat id. 6. En la terminal, dentro de la carpeta del proyecto: `npx.cmd wrangler secret put TELEGRAM_BOT_TOKEN` (pega el token cuando lo pida) y `npx.cmd wrangler secret put TELEGRAM_CHAT_ID` (pega el número). |
| 3 | Migraciones `0014` y `0015` en la base real | Claude, con tu permiso | 1. Me dices "aplica las migraciones". 2. Anoto el punto de restauración (`wrangler d1 time-travel info`). 3. Las aplico. 4. Compruebo que las tablas existan. Solo agregan tablas: el bot publicado sigue igual. |
| 4 | Publicar el bot | Claude, con tu permiso | 1. Me dices "publica el bot". 2. `npm run deploy`. 3. Compruebo `/salud`, la firma falsa (401) y el token falso (403). 4. Tú mandas un pedido de prueba desde un número permitido: debe llegar una sola respuesta. |
| 5 | Secreto del panel | Franco | 1. Genera un texto al azar en tu terminal: `node -e "console.log(require('crypto').randomBytes(36).toString('base64url'))"` (salen 48 caracteres). 2. Cópialo en tu gestor de claves. 3. Cárgalo dos veces, el mismo texto: `npx.cmd wrangler secret put PANEL_SECRETO -c wrangler.panel.toml` y `npx.cmd wrangler secret put PANEL_SECRETO -c wrangler.panel.toml --env admin`. 4. Cierra la terminal. Si se pierde, hay que crear todas las claves de nuevo. |
| 6 | Publicar la administración | Claude, con tu permiso | `npm run deploy:panel-admin`. Queda en `brunen-admin.<subdominio>.workers.dev` y, sin el paso 7, responde "El panel todavía no está configurado" (no deja entrar a nadie). |
| 7 | Protegerla con Access | Franco | 1. **Workers & Pages** → **brunen-admin** → pestaña **Access** → **Protect this Worker behind Access**. 2. Elige **All traffic** (no "Previews only"). 3. En quién puede entrar: **correos**: el de Brunen (Felipe), el de Coni y el tuyo. El repartidor no va. 4. Métodos de ingreso: **One-time PIN** (y, si quieres, Cloudflare). 5. **Apply Access**. 6. Copia dos datos (no son secretos): el **AUD tag** (Zero Trust → **Access controls** → **Applications** → la de brunen-admin → **Edit** → **Additional settings** → "Application Audience (AUD) Tag") y el **nombre del equipo** (Zero Trust → **Settings**). 7. Pásamelos por el chat. |
| 8 | Terminar de configurar y publicar la dirección pública | Claude, con tu permiso | 1. Pongo el AUD tag, el dominio del equipo y `PANEL_ADMIN_URL` en `wrangler.panel.toml`. 2. Publico de nuevo la administración y después la pública (`npm run deploy:panel`). 3. Compruebo: la portada abre sin pedir nada; "Administrador" lleva a la otra dirección; `/admin/api/pedidos` en la pública da 404; la administración pide el código del correo. |
| 9 | Crear las cuentas | Felipe, Coni y Franco | 1. Cada administrador abre la dirección de administración, pide el código a su correo y, la primera vez, elige su RUT y una clave de 4 dígitos. El correo tiene que ser el mismo que pusiste en el paso 7. 2. En **Equipo → + Nuevo repartidor**: su nombre, su RUT y una clave que se le dice en persona. |
| 10 | Cargar el historial del Excel | Franco, luego Claude con tu permiso | 1. En tu computador: `npm run cargar-historial -- "datos/CONTROL PEDIDOS.xlsx"` (solo simula y muestra totales; yo no puedo abrir `datos/`). 2. Mándame las líneas de **escrituras estimadas** y de **direcciones con notas**. 3. Si están bien, corres lo mismo con `--generar`. 4. Yo anoto un punto de restauración y lo cargo **una sola vez ese día** (gasta cerca de la mitad del cupo diario gratis de escrituras). |
| 11 | Instalar la app en el teléfono del repartidor (Android) | Repartidor, con Franco | 1. Abre la dirección pública en **Chrome** → menú ⋮ → **Agregar a pantalla de inicio**. 2. Entra con su RUT y su clave y marca "Recordar este dispositivo". 3. Acepta el permiso de **ubicación** cuando la app lo pida. 4. Ajustes del teléfono → Apps → Chrome → Batería: **sin restricciones**. 5. En la tarjeta de la app, acepta compartir su ubicación durante la jornada. |
| 12 | Probar la ubicación (10 minutos) | Repartidor, con Franco | 1. En su app: **Probar la ubicación en este teléfono → Empezar**. 2. Usa Google Maps 2 minutos y vuelve. 3. Pantalla dividida (Maps arriba, la app abajo) 2 minutos. 4. Teléfono bloqueado 2 minutos. 5. Captura del registro y me la mandas. Con eso sabemos cuánto confiar en la posición en vivo (D79). |
| 13 | Un día de prueba real | Coni, el repartidor y Franco | 1. Coni confirma los pedidos en **Hoy** y publica la ruta en **Reparto**. 2. El repartidor toca **Iniciar ruta** y marca cada entrega. 3. Coni mira el mapa y las horas estimadas. 4. Al final, **Terminar jornada** y revisan el cierre del día. 5. Me cuentas qué falló o qué molestó. |
| 14 | Decisiones de Felipe | Felipe | 1. El margen de hora que se le da al cliente (hoy ±10 min como mínimo). 2. Cuánto tiempo se guardan los pedidos y las fichas (lo pide el aviso de privacidad). 3. Más adelante: promociones y recordatorios a clientes frecuentes. |

Lo que pide permiso cada vez: aplicar migraciones, publicar (`deploy`), cargar secretos y tocar la planilla real. Los secretos los escribe Franco en su terminal: nunca se pegan en el chat.

## Antes de abrir el bot a todos los clientes
El bot hoy solo le contesta a los números de prueba (`NUMEROS_PERMITIDOS`). Para abrirlo a todos falta:

| Qué | Por qué | Quién |
|---|---|---|
| **Coexistencia del número** (D45, D46) | Es el bloqueo más grande: el número actual solo se puede conectar a la API por un proveedor autorizado de Meta o con Brunen como su propio Tech Provider. | Felipe decide; Franco lo tramita |
| **Aviso de privacidad** (Ley 21.719) | La ley rige desde el **1 de diciembre de 2026** mientras no se publique la postergación: hay que decirle al cliente qué datos se guardan y para qué. | Claude redacta el borrador; Felipe lo aprueba |
| **Monitoreo de `/salud`** | Para enterarse si el bot se cae. Cuenta gratis de UptimeRobot con aviso al correo. | Franco |
| **Borrar los pedidos de prueba** de la base real | Que no se mezclen con los de verdad en el panel ni en las cuentas del día. | Claude, con tu permiso |
| **Cuentas a nombre de Brunen** | Verificación en dos pasos del correo de Brunen en Cloudflare y correos de facturación en ese correo ([CUENTAS.md](CUENTAS.md)). | Felipe y Franco |
| **Coni** | Que acepte recibir los avisos por Telegram y que su nombre y horario estén en el repositorio público. | Franco le pregunta |

## Mejoras que propongo (las hago yo)
1. **Borrador del aviso de privacidad**: lo más urgente, por la fecha de la ley.
2. **Cerrar los pendientes del seguimiento (D80)**: borrar las posiciones al desactivar a un repartidor, contar los 3 días desde que se guardó cada posición, elegir bien la posición si un día hay dos repartidores, y guardar los cortes de viaje al publicar la ruta.
3. **Que el bot lea las fichas de la base** en vez de la hoja CLIENTES: una sola fuente de clientes, la misma que ve el panel.
4. **Una comprobación automática después de publicar** (`npm run comprobar`): revisa sola `/salud`, la firma falsa, que la pública no muestre la administración, etc., en vez de hacerlo a mano cada vez.

## ¿Hace falta otro servidor (Supabase, Vercel, Netlify)?
No. El servidor ya existe y es **Cloudflare Workers**: corre el código del bot y del panel y entrega los archivos de la app web (la portada, el panel y la app del repartidor). La base de datos es **Cloudflare D1** (cumple el papel que tendría Supabase). Usar otro servicio duplicaría lo que ya hace Cloudflare, sumaría cuentas, claves y un posible costo, y mandaría los datos de los clientes a otra empresa. Solo se pensaría en otro si se pasan los límites del plan gratis (100.000 solicitudes al día, 10 ms de CPU por solicitud, 5 millones de lecturas de D1 al día), que hoy quedan muy lejos.

Fuentes (revisadas el 2026-11-18): [proteger un Worker con Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [One-time PIN](https://developers.cloudflare.com/cloudflare-one/integrations/identity-providers/one-time-pin/), [el ingreso por defecto ahora es Cloudflare](https://developers.cloudflare.com/changelog/post/2026-06-18-cloudflare-idp-default/), [dónde está el AUD tag](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/#get-your-aud-tag).
