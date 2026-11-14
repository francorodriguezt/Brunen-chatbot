# Qué hacer si algo falla

Para Franco o quien mantenga el sistema. La guía para Constanza (qué ve ella y a quién avisa) está en
[GUIA_PANEL.md](GUIA_PANEL.md#si-algo-falla). Regla de oro: **primero que ningún cliente quede sin respuesta**
(Constanza atiende a mano), después se arregla.

## Primeros 5 minutos
1. ¿El bot responde? Abre `https://brunen-chatbot.brunen-chatbot.workers.dev/salud`: debe decir `ok`.
2. Mira qué está pasando, con los teléfonos enmascarados:

   ```bash
   npx.cmd wrangler tail
   ```

3. Si el bot responde cosas equivocadas, **apágalo**: en la planilla, hoja CONFIGURACION, `BOT_ACTIVO` en `NO` (tarda
   hasta un minuto). Los mensajes siguen llegando al WhatsApp y Constanza los atiende desde la app.

## Según lo que falla

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Empezó a fallar justo después de publicar | El código nuevo | Volver a la versión anterior (abajo) y revisar con calma |
| Aviso "El token de WhatsApp venció" | Meta cortó el token | Generar uno nuevo en Meta y cargarlo: `npx.cmd wrangler secret put WHATSAPP_TOKEN` |
| Aviso "No se pudo leer la planilla" | Google caído o la planilla dejó de estar compartida | Revisar que la planilla siga compartida con la cuenta de servicio. Mientras, el bot anota los pedidos y los deja para una persona |
| Aviso "El respaldo … no se actualiza" | Google rechaza la escritura | En el panel, Equipo > Respaldo muestra el error. Los pedidos están a salvo en la base; el respaldo retoma solo |
| Errores 1102 o "exceeded CPU" en `wrangler tail` | Una solicitud pasó los 10 ms del plan gratis | Ver cuál ruta es. Si se repite, apagar el bot y avisar: hay que aligerar ese código |
| La base no responde (errores de D1) | Falla de Cloudflare | Ver https://www.cloudflarestatus.com. El bot responde "lo vemos" y deja un aviso; esperar o restaurar (abajo) |
| Datos borrados o dañados | Un error o una mala carga | Restaurar la base a un minuto anterior (abajo) |
| Meta no entrega mensajes | Falla de Meta | Ver https://metastatus.com. No hay nada que hacer de nuestro lado |

## Volver a la versión anterior del bot
Cada publicación queda guardada. Para ver las versiones y volver a una:

```bash
npx.cmd wrangler deployments list
```

```bash
npx.cmd wrangler rollback ID_DE_LA_VERSION
```

Para el panel, lo mismo con `-c wrangler.panel.toml` (y `--env admin` para la dirección de administración).

## Volver la base a un momento anterior
Time Travel guarda la base minuto a minuto durante 7 días. **Reemplaza toda la base**: lo que entró después de ese
momento se pierde, salvo que esté en el respaldo de Google Sheets ([RESPALDO.md](RESPALDO.md)).

1. Anota dónde está hoy, para poder deshacerlo:

   ```bash
   npx.cmd wrangler d1 time-travel info brunen-chatbot
   ```

2. Vuelve al momento elegido (hora en UTC: Chile más 3 horas en verano, más 4 en invierno):

   ```bash
   npx.cmd wrangler d1 time-travel restore brunen-chatbot --timestamp=2026-11-14T12:00:00Z
   ```

3. Si después faltan pedidos de ese intervalo, recupéralos del respaldo con `npm run restaurar-respaldo`: no pisa lo
   que ya está en la base.

## Puntos de restauración anotados
| Fecha | Antes de | Bookmark |
|---|---|---|
| 2026-11-12 | Migraciones 0007 a 0010 | `00000213-00000000-00005121-b3a6589c994befc32bea20f27e2aa43e` |
| 2026-11-14 | Migraciones 0011 a 0013 | `000003ff-00000000-00005123-4d895ce639e77a77d07eb70abd7c7767` |

Para usar uno: `npx.cmd wrangler d1 time-travel restore brunen-chatbot --bookmark=…` (sirve solo dentro de los 7 días).

## Después del incidente
Anota en [DECISIONES.md](DECISIONES.md) qué pasó, por qué y qué se cambió para que no se repita. Si fue un mensaje que
el bot entendió mal, agrégalo (anonimizado) a `tests/mensajes.json`.
