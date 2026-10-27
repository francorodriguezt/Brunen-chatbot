# Plan por etapas

Cada etapa termina con una prueba concreta. No se avanza sin que la anterior funcione.

| # | Etapa | Estado |
|---|---|---|
| 0 | Repo base: precios, despacho, firma y webhook de eco con pruebas | ✅ Lista (58 pruebas) |
| 1 | Esqueleto de punta a punta con el número de prueba de Meta | ⏳ Siguiente |
| 2 | Planilla de desarrollo + deduplicación por wamid + registro de mensajes | |
| 3 | Intérprete: parser por reglas + LLM de respaldo, casos en `tests/mensajes.json` | |
| 4 | Flujo de pedido: cotizar, fecha, registrar en PEDIDOS, responder 1 mensaje, ERRORES | |
| 5 | Constanza: alerta por Telegram con botones Confirmar / Cambiar, actualiza estado | |
| 6 | Imágenes (Drive + PAGOS), audio, fuera de zona, reclamos, RUTA_DEL_DIA | |
| 7 | Producción: número definitivo, token permanente, piloto con 5–10 clientes | |

---

## Etapa 1 — Esqueleto de punta a punta

**Avance:** Paso 0 listo (dependencias instaladas, scripts de esbuild y workerd aprobados, `npx wrangler --version` funciona). Siguiente: crear cuentas en Cloudflare y Meta.

**Objetivo:** escribes desde tu celular al número de prueba y recibes "Recibí: <tu texto>".

**Lo haces tú (cuentas y credenciales, no las hace Claude):**
1. Crear cuenta en Cloudflare (gratis) y en Meta for Developers.
2. En Meta: crear una app de tipo Business, agregar el producto WhatsApp, agregar tu número como destinatario de prueba.
3. Copiar `.dev.vars.example` como `.dev.vars` y completar valores (no se sube a git).

**Lo hace Claude Code contigo:**
1. `npx wrangler login` y luego `npm run deploy` (te pedirá confirmación).
2. Cargar los secretos con `npx wrangler secret put NOMBRE` (tú pegas cada valor).
3. Poner la versión de la Graph API en `wrangler.toml` (la que muestra Meta en API Setup).
4. En Meta > WhatsApp > Configuration: URL `https://brunen-chatbot.<tu-subdominio>.workers.dev/webhook`, el mismo verify token, suscribir el campo `messages`.

**Prueba de aceptación:**
- `https://.../salud` responde `ok`.
- Meta verifica el webhook sin error.
- Escribes "hola 2 bidones de 20" → recibes "Recibí: hola 2 bidones de 20" en < 5 s.
- Desde un número fuera de `NUMEROS_PERMITIDOS` no hay respuesta (modo prueba).
- `npx wrangler tail` muestra el log con el teléfono enmascarado.

## Primer mensaje para Claude Code
Abre la carpeta del repo, ejecuta `claude` y pega:

> Lee CLAUDE.md, docs/ETAPAS.md y docs/PENDIENTES.md. Corre `npm install` y `npm run check` y dime si todo pasa. Crea la carpeta `.claude` y mueve `claude-settings.example.json` a `.claude/settings.json` (son los permisos del proyecto). Inicializa git (`git init -b main`) y haz el primer commit. Después explícame en pocas líneas cómo está organizado el código (precios, despacho, firma, webhook) y guíame paso a paso por la Etapa 1. No despliegues ni cargues secretos sin preguntarme.
