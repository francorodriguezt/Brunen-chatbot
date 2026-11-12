# Publicar los cambios (bot, base y panel)

Cada paso se hace solo con el visto bueno de Franco. Las reglas de `.claude/settings.json` piden confirmación antes de subir a GitHub, desplegar o tocar la base real.

Antes de empezar, en el computador:

```bash
npm run check
```

## Paso 1. Subir los commits a GitHub

```bash
git push origin main
```

Antes de subir, revisar que el diff no tenga claves, teléfonos reales ni nombres de clientes. GitHub corre las pruebas solo (`.github/workflows/check.yml`).

## Paso 2. Punto de restauración y migraciones `0007` a `0010`

```bash
npx.cmd wrangler d1 time-travel info brunen-chatbot
```

Anotar el *bookmark* que muestra: sirve para volver atrás hasta 7 días.

```bash
npx.cmd wrangler d1 migrations list brunen-chatbot --remote
```

Debe listar solo `0007` a `0010`. Después:

```bash
npx.cmd wrangler d1 migrations apply brunen-chatbot --remote
```

Por qué va antes que el bot: las migraciones solo agregan tablas y columnas. El bot que está publicado sigue funcionando igual, y el bot nuevo necesita esas tablas (fichas y pedidos fijos).

## Paso 3. Desplegar el bot

```bash
npm run deploy
```

Comprobar:
- `/salud` responde `ok`.
- Un POST con firma falsa responde 401, y la verificación con un token falso responde 403.
- Desde un número de `NUMEROS_PERMITIDOS`, un pedido de prueba recibe una sola respuesta, con "Entrega en" si el número ya pidió antes.

El CPU ya se midió con los datos reales de Cloudflare desde el 29 de octubre: 447 invocaciones, 0 errores, 3,4 ms de CPU en la mitad de ellas y 26 ms en el 1 % más lento, sin ningún corte por límite. Repetir la medición una semana después de desplegar.

## Paso 4. Cargar el historial del Excel

1. Simular primero, en el computador de Franco (yo no puedo abrir `datos/`):

   ```bash
   npm run cargar-historial -- "datos/CONTROL PEDIDOS.xlsx"
   ```

   Revisar dos líneas nuevas: las **escrituras estimadas** (alrededor de 50.000 de las 100.000 diarias gratis) y cuántas **direcciones traen notas internas**.
2. Generar el archivo con `--generar` y anotar otro punto de restauración (`time-travel info`).
3. Cargar **una sola vez ese día**:

   ```bash
   npx.cmd wrangler d1 execute brunen-chatbot --remote --file datos/historial.sql
   ```

   Desde el 2026-09-01, al pasarse del límite diario las consultas fallan hasta la medianoche UTC, y el bot no podría guardar pedidos.

Por qué va después del bot: así ningún cliente reconocido por el historial recibe una respuesta sin el límite de un año, que protege los números reciclados.

## Paso 5. El panel (dos direcciones, opción 1 de D56)

Antes de este paso: las cuentas a nombre de Brunen y Zero Trust activado ([CUENTAS.md](CUENTAS.md)).

1. Cargar el secreto de las claves en las dos direcciones. Franco lo escribe en la terminal y nunca queda guardado en otro lado:

   ```bash
   npx.cmd wrangler secret put PANEL_SECRETO -c wrangler.panel.toml
   ```

   ```bash
   npx.cmd wrangler secret put PANEL_SECRETO -c wrangler.panel.toml --env admin
   ```

   Tiene que ser el mismo texto en las dos.
2. Desplegar la dirección de administración:

   ```bash
   npm run deploy:panel-admin
   ```

   Protegerla entera con Access (CUENTAS.md, sección 2, paso 4). Copiar el AUD tag y el dominio del equipo en `[env.admin.vars]` de `wrangler.panel.toml` y volver a desplegar.
3. En `[vars]` de `wrangler.panel.toml`, poner `PANEL_ADMIN_URL = "https://brunen-admin.<subdominio>.workers.dev"` y desplegar la dirección pública:

   ```bash
   npm run deploy:panel
   ```

4. Comprobar:
   - La portada pública abre sin pedir nada, y "Administrador" lleva a la otra dirección.
   - `/admin/api/pedidos` en la dirección pública responde 404.
   - La dirección de administración pide el código por correo y después el RUT y la clave.
   - El repartidor entra por la pública con su RUT y su clave.

## Antes de abrir el bot a todos los clientes

- Telegram configurado: sin él, los avisos urgentes quedan solo en el panel.
- El panel publicado y en uso por Constanza.
- La coexistencia del número actual resuelta (D45, D46).

Cloudflare recomienda no dejar en `workers.dev` lo que es crítico para un negocio. Cuando el dueño quiera, el paso siguiente es un dominio propio (por ejemplo `app.brunen.cl`, opción 2 de D56).
