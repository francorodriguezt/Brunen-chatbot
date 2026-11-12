# Cuentas a nombre de Brunen

Los servicios del bot y de la plataforma tienen que quedar a nombre de la empresa, con el correo de Brunen, y no en la cuenta personal de quien los programó. Si esa persona deja el proyecto, el negocio no puede quedar sin acceso a su propio sistema.

Regla general: **se agrega la cuenta de la empresa como dueña, sin mover nada**. Mover servicios de una cuenta a otra obliga a recrearlos (la base, los secretos, la dirección del webhook en Meta) y es donde se pierden cosas.

## 1. Cloudflare (bot, panel y base de datos)

Hoy la cuenta de Cloudflare está a nombre de una persona. No se cambia el correo de esa persona ni se crea una cuenta nueva: se invita al correo de Brunen como **Super Administrador** de la misma cuenta. Así los Workers, la base D1, los secretos y la dirección `workers.dev` siguen donde están.

1. Quien tiene la cuenta hoy comprueba que su correo esté verificado en Cloudflare (es requisito para invitar).
2. En el panel de Cloudflare: **Manage Account → Members → Invite**. Correo: el de Brunen. Alcance: toda la cuenta. Rol: **Super Administrator - All Privileges**.
3. El dueño acepta la invitación desde el correo de Brunen, crea su contraseña y **activa la verificación en dos pasos** (2FA).
4. Con la sesión del correo de Brunen: **Configurations → Account Name → "Brunen SpA"**.
5. Los correos de facturación y de notificaciones se cambian aparte. Ponerlos en el correo de Brunen.
6. Cuando todo funcione, el dueño puede bajar a quien programa a **Administrator**. Con ese rol puede seguir desplegando, pero no maneja miembros ni facturación.

Fuentes: [miembros de una cuenta](https://developers.cloudflare.com/fundamentals/manage-members/manage/), [cambiar el correo](https://developers.cloudflare.com/fundamentals/user-profiles/change-password-or-email/), [nombre de la cuenta](https://developers.cloudflare.com/fundamentals/account/create-account/).

## 2. Zero Trust (la capa extra del administrador)

Se activa **después del paso 1 y con la sesión del correo de Brunen**. Así la organización de Zero Trust y su forma de pago quedan a nombre de la empresa desde el principio.

1. En el panel de Cloudflare, entrar a **Zero Trust**. Elegir el nombre del equipo, por ejemplo `brunen`. Ese nombre será `brunen.cloudflareaccess.com`.
2. Elegir el plan **Zero Trust Free**. Cloudflare pide igual una tarjeta, pero no cobra. La tarjeta es de Brunen y la ingresa el dueño.
3. Método de ingreso: agregar **One-time PIN**, que manda un código al correo.
4. Proteger el Worker de administración entero (opción 1 de D56): **Workers & Pages → brunen-admin → Access → Protect this Worker behind Access**. La política permite solo los correos del dueño, de Constanza y de quien mantiene el sistema. El repartidor no va en la lista, porque entra por la dirección pública.
5. En **Zero Trust → Access → Applications**, abrir la aplicación creada y copiar dos datos: el **AUD tag** y el dominio del equipo. No son secretos: van en `wrangler.panel.toml` (`[env.admin.vars]`).

Fuentes: [crear la organización](https://developers.cloudflare.com/cloudflare-one/setup/), [proteger un Worker con Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/).

## 3. Las demás cuentas

| Servicio | Qué tiene | Qué hacer |
|---|---|---|
| Meta (WhatsApp) | El número, la aplicación y la verificación de la empresa | En el portafolio de negocio, agregar el correo de Brunen como administrador con control total. La verificación de la empresa va a nombre de Brunen SpA. Lo decide y lo hace el dueño. |
| Google Cloud | La cuenta de servicio que lee la planilla | En el proyecto, **IAM → Agregar** el correo de Brunen como **Propietario**. La planilla debe estar en el Drive de Brunen. |
| Groq (IA de respaldo) | Una clave de API | Crear la cuenta con el correo de Brunen, generar una clave nueva y cargarla con `wrangler secret put GROQ_API_KEY`. Después, borrar la clave anterior. |
| Telegram | El bot de avisos urgentes | Crearlo con @BotFather desde el teléfono del dueño o de Constanza, no desde uno personal ajeno al negocio. |
| OpenRouteService (ruta, fase F) | Una clave de API, cuando se use | Crear la cuenta con el correo de Brunen y revisar ahí su cupo diario y si permite uso comercial. |
| GitHub | El código | El repositorio público es el portafolio de quien lo programó y no tiene datos de clientes: puede quedar en su cuenta. |

## 4. Orden recomendado

1. Invitar al correo de Brunen en Cloudflare (sección 1). Toma 10 minutos y no cambia nada de lo que funciona.
2. Activar Zero Trust con la sesión de Brunen (sección 2, pasos 1 a 3).
3. Publicar el panel (ver [PUBLICAR.md](PUBLICAR.md)) y proteger `brunen-admin` (sección 2, pasos 4 y 5).
4. El resto de las cuentas, sin apuro, antes de abrir el bot a todos los clientes.
