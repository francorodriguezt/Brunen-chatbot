# Investigación del 2026-11-27

Responde las preguntas de [RESPUESTAS_2026-11-27.md](RESPUESTAS_2026-11-27.md). Los datos que cambian (precios, límites, requisitos) se verificaron ese día en la documentación oficial cuando fue posible; se dice cuando no.

## 1. ¿Se pasan de 1.000 mensajes al mes? (punto 9)

Meta da **1.000 mensajes de servicio gratis al mes por número**; no se acumulan ([precios](https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing)). En Chile, después cuestan unos USD 0,02 cada uno (D-registro del 2026-10-27; la página de precios no muestra el valor por país). **Los mensajes que una persona envía desde la app WhatsApp Business siguen gratis** con coexistencia ([onboarding de usuarios de la app](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)): solo cuentan los del bot.

Estimación con los datos del Excel (unas 14 filas al día, de lunes a sábado; máximo 30):

| Escenario | Pedidos al mes | Mensajes del bot por pedido (con aclaraciones y cliente nuevo) | Otros (preguntas, avisos de pago, envases) | Total |
|---|---|---|---|---|
| Normal | ~365 | ~1,35 | ~130 | **~620** |
| Alto (20 pedidos al día) | ~520 | ~1,35 | ~180 | ~880 |
| Punta (30 pedidos todos los días) | ~780 | ~1,35 | ~200 | ~1.250 → **~USD 5** |

**Conclusión:** en un mes normal no se pasan. Solo un mes de punta sostenida pasaría, y costaría unos USD 5. Los supuestos 1,35 y "otros" son estimaciones: conviene medirlos con un **contador de mensajes salientes** en el panel que avise al llegar a 800 (por construir).

## 2. Conectar el número actual sin pagar, o lo menos posible (punto 35)

Verificado en Meta: para que un número siga en la app y además use la API (coexistencia), quien lo conecta **tiene que ser Solution Partner o Tech Provider**; exige la app Business 2.24.17 o superior ([documentación](https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users/)). Con coexistencia se apagan listas de difusión, mensajes temporales, llamadas y las herramientas de la app (respuestas rápidas, etiquetas, mensaje de ausencia, catálogo). Los grupos no se sincronizan.

| Camino | Costo al mes | Trabajo | Riesgo |
|---|---|---|---|
| **A. Brunen como su propio Tech Provider** | USD 0 de Meta | Alto: verificar la empresa, App Review (permisos `whatsapp_business_messaging` y `whatsapp_business_management` en acceso avanzado, política de privacidad, ícono, dos videos) y construir el registro (Embedded Signup) ([requisitos](https://developers.facebook.com/documentation/business-messaging/whatsapp/solution-providers/get-started-for-tech-providers)) | Semanas; Meta puede pedir correcciones |
| **B. Un proveedor autorizado** | Según fuentes de terceros, desde unos USD 24 (Zoko) a USD 49–59 (360dialog, Wati). Algunos anuncian USD 0, sin verificar | Bajo | Cuesta cada mes |
| **C. Un número nuevo solo para el bot** | USD 0 | Bajo | Los clientes tienen que escribir al número nuevo |

**Recomendación:** si el objetivo es no pagar, **A** (se puede ir preparando mientras Felipe consigue la verificación de la empresa, que igual hace falta). Antes de elegir B, confirmar el precio en la página del proveedor: las cifras de arriba vienen de comparadores, no de las páginas oficiales.

Otro dato verificado: una cuenta sin verificar puede iniciar conversaciones con hasta 250 contactos en 24 horas ([límites](https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits)). **No afecta las respuestas del bot** dentro de las 24 horas del mensaje del cliente.

## 3. Modelos de IA gratis para entender mensajes (punto 66)

El requisito: gratis de forma permanente, que no entrene con los mensajes de los clientes, y con salida en JSON.

| Opción | Gratis | ¿Entrena o guarda? | Veredicto |
|---|---|---|---|
| **Groq `gpt-oss-20b`** (el actual) | 30 por minuto, 1.000 al día (consola, 2026-10-28) | No guarda por defecto; con Zero Data Retention (activado) tampoco para fallas; datos en EE. UU. ([your data](https://console.groq.com/docs/your-data)) | **Mantener** |
| **Cloudflare Workers AI `gpt-oss-20b`** | 10.000 neuronas al día, compartidas con la transcripción de audios; una clasificación gasta unas 17, o sea ~500 al día ([precios](https://developers.cloudflare.com/workers-ai/platform/pricing/)) | No entrena ni guarda ([data usage](https://developers.cloudflare.com/workers-ai/platform/data-usage/)) | **Sumar como respaldo** si Groq falla o llega al tope: ya está conectado (`AI`), sin cuentas nuevas. La documentación de [JSON mode](https://developers.cloudflare.com/workers-ai/features/json-mode/) no lista este modelo: hay que probar que responda JSON válido (el código ya lo valida) |
| Gemini gratis | Sí | **Sí**: usa los datos para mejorar sus productos y personas pueden revisarlos ([términos](https://ai.google.dev/gemini-api/terms)) | No |
| Mistral gratis | Sí | La retención cero solo está en el plan pagado ([ayuda](https://help.mistral.ai/en/articles/347612-can-i-activate-zero-data-retention-zdr)); sobre entrenamiento en el gratis no lo encontré | No sin confirmarlo |
| Cerebras | Ya no tiene plan gratis permanente: crédito de USD 5 ([precios](https://www.cerebras.ai/pricing)) | — | No |
| OpenRouter gratis | 50 al día | Depende del proveedor de cada modelo; algunos entrenan | No |

**Qué haría:** dejar Groq como primero, sumar Workers AI de respaldo y comparar los dos con los mensajes de `tests/mensajes.json` y los de los chats antes de decidir.

## 4. IA con contexto: cómo se hace (punto 65)

Hoy la IA de respaldo ve solo el mensaje suelto. "Dos por favor" no dice nada solo; si la IA sabe que el bot preguntó "¿cuántos bidones de 20 L?", lo entiende. Se hace agregando a la consulta una línea como `El bot preguntó: cantidad de bidones de 20 L`, que no tiene nombre, dirección ni teléfono. Las respuestas cortas ya las entienden las reglas (`src/contexto.ts`), así que **solo vale la pena si la medición muestra que quedan sin entender**.

## 5. Si Telegram no le acomoda a la operadora (punto 3)

| Alternativa | Costo | Notas |
|---|---|---|
| **Notificaciones del panel instalado en el iPhone** (Web Push) | USD 0 | iOS 16.4 o superior y el panel agregado a la pantalla de inicio ([WebKit](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/)). Hay que construirlo. **La que recomiendo** como reemplazo |
| Correo desde Cloudflare | USD 0 a direcciones verificadas ([precios](https://developers.cloudflare.com/email-service/platform/pricing/)) | Necesita un dominio administrado en Cloudflare (hay que confirmarlo) y un correo se ve más tarde que un aviso |
| WhatsApp al número de la operadora | Cada aviso fuera de 24 h es una plantilla pagada | No |
| ntfy | Gratis | Los temas públicos los puede leer cualquiera que los conozca: no con datos de clientes |

Telegram sigue siendo lo más simple: gratis, ya está construido y solo falta crear el bot.

## 6. Cómo proponer promociones (punto 75)

Una forma de llevárselo a Felipe, sin inventar precios (los pone él):
1. **Elegir una cosa a mejorar:** que quien pide 1 bidón de 20 L pida 2, que un cliente atrasado vuelva, o llenar un día flojo.
2. **Una promoción simple, con fecha de término y una regla que el código pueda calcular.** Ejemplos: "la primera recarga de la semana con descuento", "4 o más a precio de mayorista el martes", "un bidón de 10 L de regalo con la carga inicial".
3. **Medir antes y después:** bidones por semana de los clientes a los que se ofreció (el panel ya cuenta bidones).
4. **Cómo llega al cliente:** por la app WhatsApp Business (gratis) o escrita en la respuesta del bot cuando el cliente pide (gratis, no es un mensaje aparte). Un mensaje que parte del negocio es una plantilla de marketing pagada (~USD 0,09 en Chile).

## 7. Recordatorios a clientes atrasados (puntos 49 y 76)

El bot no puede escribir primero sin pagar una plantilla de Meta. La forma gratis: en "Les toca pedir", un botón **"Escribirle"** que abra su chat con el texto listo, y la persona lo envía desde la app (como "Avisar al cliente", D99). Por construir.

## 8. Planes de plazos de conservación (punto 4)

Quedaron como recomendación en [AVISO_PRIVACIDAD.md](AVISO_PRIVACIDAD.md); los aprueba Felipe.
