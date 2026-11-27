# Conectar el número de Brunen como su propio Tech Provider (respuesta 35, D116)

**Decisión de Franco (2026-11-27):** el número actual se conecta a la API manteniendo la app WhatsApp Business (coexistencia), y Brunen hace de su propio Tech Provider. Meta exige ser Tech Provider o Solution Partner para esto ([documentación](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users)). Costo de Meta: USD 0; el trabajo es de Franco y los trámites de la empresa son de Felipe.

> Verificado en la documentación oficial de Meta el 2026-11-27. Meta cambia estas páginas seguido: si algo no coincide con lo que ves en pantalla, manda la pantalla y se corrige aquí.

## Qué ya está construido (este cambio)
| Pieza | Para qué | Cómo se activa |
|---|---|---|
| `/privacidad` en la dirección pública del panel | Meta pide una URL de política de privacidad para la app, y la ley pide informar al cliente | Variables `PRIVACIDAD_*` en `wrangler.panel.toml` y publicar el panel público. Sin ellas da 404 |
| `/conectar` en la misma dirección | Abre el registro de Meta (Embedded Signup) y muestra el código, la cuenta y el número | `CONECTAR_ACTIVO = "SI"`, `META_APP_ID`, `META_CONFIG_ID`. Se activa el día de la conexión y se apaga después |
| `npm run conectar-numero` | Canjea el código por el token, suscribe la app y pide las sincronizaciones (las 24 horas) | Se corre en el computador de Franco, con el secreto de la app |
| `account_update` en el webhook del bot | Si Meta desconecta el número (el cliente toca "Desconectar" en la app, o falla), deja un aviso urgente | Automático. Hay que suscribir el campo en el panel de Meta (paso 4) |

El secreto de la app y el token del número **nunca pasan por el Worker ni por la página**: la página solo muestra en pantalla el código de un solo uso, y lo canjea el comando local.

## Pasos, en orden
**Los hace Felipe (la empresa)**
1. **Verificar la empresa en Meta** (Administrador de negocios → Seguridad → Verificación). Piden nombre, dirección, teléfono, correo, sitio web y, si no la encuentran, documentos. Es lo más lento (días) y **no se puede pedir la revisión de la app sin esto**.
2. **Agregar un medio de pago** en el Administrador de WhatsApp (Resumen → Agregar método de pago). Meta lo pide para cobrar los mensajes que pasen de los 1.000 gratis (CLAUDE.md, §14).
3. **Aprobar el texto de la política de privacidad** ([AVISO_PRIVACIDAD.md](AVISO_PRIVACIDAD.md)) y dar el RUT y el correo de contacto.

**Los hace Franco**
4. **La app de Meta** (developers.facebook.com/apps): caso de uso WhatsApp, asociada al portafolio de Brunen.
   - Configuración básica: ícono, categoría y **URL de la política de privacidad** = la de `/privacidad` (para esto primero hay que publicarla: paso 5).
   - Webhooks de WhatsApp: la URL del bot (`/webhook`) y el token de verificación; suscribir `messages` y, para la coexistencia, `account_update`, `history`, `smb_app_state_sync` y `smb_message_echoes`. El bot contesta 200 a todos; solo usa `messages`, `smb_message_echoes` y `account_update`. `history` y `smb_app_state_sync` traen datos de clientes que **el bot ignora a propósito**.
   - Si es una app nueva, **el secreto de la app es otro**: hay que cargarlo de nuevo con `wrangler secret put WHATSAPP_APP_SECRET`, o el bot rechaza todos los webhooks por firma inválida.
   - Inicio de sesión de Facebook para empresas → Configuración → "Dominios permitidos" y "URI de redirección": la dirección pública del panel (`https://brunen-panel.<subdominio>.workers.dev`). Activar: Client OAuth login, Web OAuth login, Enforce HTTPS, Embedded Browser OAuth Login, Strict Mode y Login with the JavaScript SDK.
   - Inicio de sesión de Facebook para empresas → Configuraciones → crear con la plantilla "WhatsApp Embedded Signup Configuration With 60 Expiration Token"; productos: WhatsApp Cloud API; activos: solo cuentas de WhatsApp. Anotar el **ID de configuración**.
5. **Publicar la política** (necesita la aprobación de Felipe): completar `PRIVACIDAD_PUBLICADA = "SI"`, `PRIVACIDAD_RUT`, `PRIVACIDAD_CORREO` y `PRIVACIDAD_FECHA` en `wrangler.panel.toml` y correr `npm run deploy:panel`. Abrir `https://brunen-panel.<subdominio>.workers.dev/privacidad` y revisarla.
6. **Tech Provider en la app** (Casos de uso → Personalizar → "Tech Provider onboarding"): verificación (paso 1) y **App Review** con acceso avanzado a `whatsapp_business_messaging` y `whatsapp_business_management`. Piden dos videos: un mensaje enviado desde la app y recibido en WhatsApp, y la creación de una plantilla. Sirve grabar el cURL de "API Setup" y el Administrador de WhatsApp en vez de una interfaz propia. Meta puede pedir correcciones: cuenta con semanas.
7. **El día de la conexión** (un momento tranquilo, con el teléfono del número a mano, la app WhatsApp Business en la versión 2.24.17 o más nueva y abierta):
   1. Completar `CONECTAR_ACTIVO = "SI"`, `META_APP_ID` y `META_CONFIG_ID` en `wrangler.panel.toml` y `npm run deploy:panel`.
   2. En `.dev.vars`: `META_APP_ID` y `META_APP_SECRET` (el comando también pide el secreto sin mostrarlo si no está).
   3. Abrir `/conectar`, "Conectar con Meta", elegir conectar la app WhatsApp Business que ya usan, poner el número y el código que llega a la app, **no compartir el historial de chats** (el bot no lo usa y son datos de clientes) y terminar con "Finalizar".
   4. La página muestra un comando. **Dentro de 5 minutos**, copiarlo y correrlo en el computador: `npm run conectar-numero -- --code … --waba … --telefono … --guardar`.
   5. El comando canjea el código, suscribe la app, confirma que el número quedó en la API y en la app (`is_on_biz_app` y `CLOUD_API`) y pide las dos sincronizaciones. Con `--guardar` carga `WHATSAPP_TOKEN` y `WHATSAPP_PHONE_NUMBER_ID` sin mostrarlos.
   6. Dejar `CONECTAR_ACTIVO = ""` y volver a publicar el panel: la página vuelve a dar 404.
8. **Después:** agregar a `NUMEROS_PERMITIDOS` los números con los que se prueba (y quitarlos cuando se abra a todos), mandar un mensaje de prueba, revisar `/salud` y `npm run comprobar`. Con coexistencia hay que **abrir la app WhatsApp Business al menos cada 14 días**.

## Cosas a saber
- **Las 24 horas:** después de canjear el código, las dos sincronizaciones deben pedirse dentro de 24 horas o Meta desconecta el número y hay que repetir el registro. El comando las pide solas; cada una se puede pedir **una sola vez**.
- **El código vale 5 minutos** y se usa una vez. Si se pasa el tiempo, se repite el registro desde `/conectar`.
- **Se pierde en la app** (con coexistencia): listas de difusión, mensajes temporales, llamadas y las herramientas de la app (respuestas rápidas, etiquetas, mensaje de ausencia, catálogo); los grupos no se sincronizan. Con la API y la app a la vez el límite es de 20 mensajes por segundo (de sobra).
- **Si el cliente toca "Desconectar"** en la app (Ajustes → Cuenta → Plataforma comercial), Meta manda `PARTNER_REMOVED`: el bot deja un aviso urgente y ya no puede responder hasta repetir la conexión.
- **Versión de Embedded Signup:** la documentación de Meta (2026-11-14) dice que v2 y v3 se retiraron el 2026-10-15 y habla de v4 y v5; en v5 la coexistencia viene activa por omisión. La página usa `featureType: whatsapp_business_app_onboarding` (de v4), que en v5 no molesta. **Sin probar contra Meta desde aquí.**
- **Probar antes de la revisión:** Meta dice que quien esté como administrador o desarrollador de la app puede probar el registro con su propia cuenta. Si Meta deja conectar el número de Brunen antes de aprobar el App Review, no está confirmado: se verá en el paso 7. *(PENDIENTE confirmar en la práctica.)*

## Incertidumbres (no inventar: confirmar al hacerlo)
- **Vencimiento del token.** La documentación dice que el token de empresa (de Embedded Signup) sirve para automatizar "sin pedir una nueva autenticación", pero la plantilla de configuración se llama "…With 60 Expiration Token" y no encontré aquí si vence a los 60 días. El vigía del bot revisa el token cada mañana y avisa si falla. Si vence, la alternativa es un **token de usuario del sistema** (Configuración del negocio → Usuarios del sistema → generar token con los tres permisos y vencimiento "nunca"), que la documentación describe como de larga vida; asignarle la cuenta de WhatsApp **y** la de mensajería.
- **Qué hace falta para ser aprobado** depende de la revisión de Meta; lo de arriba es lo que dice su documentación hoy.
- **La CSP de `/conectar`** deja pasar solo lo mínimo del SDK de Facebook (scripts de `connect.facebook.net`; marcos y consultas a `www.facebook.com`). No se pudo probar con el SDK real. Si la ventana no abre, mirar la consola del navegador: un bloqueo de la política dice qué dominio falta (`POLITICA_CONECTAR` en `src/conectar.ts`).

## Fuentes (revisadas el 2026-11-27)
- Convertirse en Tech Provider: developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers
- Embedded Signup, implementación (SDK, eventos, código de 5 minutos): …/whatsapp/embedded-signup/implementation
- Onboarding de clientes como Tech Provider (canje del código, `subscribed_apps`, pago): …/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider
- Usuarios de la app WhatsApp Business / coexistencia (requisitos, 24 horas, `smb_app_data`, desconexión): …/whatsapp/embedded-signup/onboarding-business-app-users
- Tokens de acceso: …/whatsapp/access-tokens
