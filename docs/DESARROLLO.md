# Guía de desarrollo

Cómo correr, probar y desplegar el bot. Para qué es el proyecto y cómo funciona, ver el [README](../README.md).

## Requisitos (Windows)
- Node.js 22.13 o superior (`node -v`). Wrangler y Vitest no funcionan con Node 20, y las pruebas de la base de datos usan `node:sqlite`, que viene con Node desde la 22.13. Recomendado: la versión LTS desde nodejs.org.
- Git for Windows (`git --version`).

## Primeros pasos
```powershell
npm install
npm run check      # typecheck + pruebas: deben pasar todas
```

## Probar en local
1. Copia `.dev.vars.example` a `.dev.vars` y completa las 5 variables: `WHATSAPP_VERIFY_TOKEN` (la inventas tú), `WHATSAPP_APP_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID` y `NUMEROS_PERMITIDOS` (tu celular, `569XXXXXXXX`). El archivo está en `.gitignore`.
2. `npm run verificar-config`: revisa el formato sin mostrar ningún valor.
3. `npm run dev` en una terminal y, en otra, `npm run simular-mensaje -- "hola 2 bidones de 20"`.

Con un token real y tu número permitido, la respuesta llega de verdad a tu WhatsApp. WhatsApp solo entrega texto libre si el destinatario le escribió al número en las últimas 24 horas: antes de probar, escríbele "hola" al número de prueba desde tu celular.

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run check` | Typecheck + pruebas |
| `npm test` | Solo pruebas |
| `npm run dev` | Worker local en http://localhost:8787 (lee `.dev.vars`) |
| `npm run deploy` | Publica en Cloudflare |
| `npm run verificar-config` | Revisa `.dev.vars` y `wrangler.toml` sin mostrar valores |
| `npm run simular-mensaje -- "texto"` | Envía al Worker un mensaje firmado como Meta (`--url` para apuntar a producción) |
| `npm run preparar-planilla -- CLAVE.json ID_PLANILLA` | Crea las hojas y columnas de la planilla de Google (no pisa datos) |

## Desplegar
1. `npx wrangler login` (una vez) y `npm run deploy`. La cuenta de Cloudflare debe tener el correo verificado y un subdominio `workers.dev`.
2. Secretos en producción: `npx wrangler secret bulk .dev.vars`, o uno a uno con `npx wrangler secret put NOMBRE`. Nunca van en el código.
3. En Meta: URL del webhook `https://<worker>.workers.dev/webhook`, el mismo verify token, y suscribir el campo `messages`.
4. Suscribir la app a la cuenta de WhatsApp (`POST /{WABA_ID}/subscribed_apps`); sin esto el webhook no recibe nada (ver D19 en `docs/DECISIONES.md`).
5. Registro en Google Sheets y deduplicación (opcionales, ya activos en producción): `npx wrangler secret put GOOGLE_SERVICE_ACCOUNT_JSON < CLAVE.json`, `GOOGLE_SHEET_ID` con su `secret put`, y la base D1 con `npx wrangler d1 migrations apply brunen-chatbot --remote`. La planilla se prepara con `npm run preparar-planilla`.
6. Ver los registros: `npx wrangler tail`.
7. Respaldo con IA (opcional, activo en producción): cuenta de Groq con retención de datos cero, y la clave con `npx wrangler secret put GROQ_API_KEY` (D23, D24). Sin la clave el bot usa solo las reglas.

## Pruebas
- `npm test` corre todo en un par de segundos. Las pruebas de la base de datos usan SQLite real con el esquema de `migrations/` (`tests/ayudas.ts`), así que cada migración nueva se prueba sola.
- Los mensajes que el bot entiende mal se agregan, anonimizados, a `tests/mensajes.json`.
- `docs/CONVERSACIONES.md` muestra cómo conversa el bot; si cambias los textos (`src/textos.ts`) o el motor, regenera esos ejemplos.

## Problemas conocidos en Windows
- PowerShell puede bloquear `npx` ("la ejecución de scripts está deshabilitada"): usa `npx.cmd` (por ejemplo, `npx.cmd wrangler secret put NOMBRE`).
- `wrangler login` abre el navegador y espera la autorización un par de minutos: si tardas, falla con "no se puede acceder a este sitio web" y hay que repetirlo.
- Para cargar datos en la planilla desde el navegador no teclees tabuladores dentro de una celda: Google los guarda como parte del texto y la fecha o el nombre queda pegado a lo demás (D25). Escribe columna por columna o pega los datos.
