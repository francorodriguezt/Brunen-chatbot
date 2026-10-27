# brunen-chatbot

Bot de WhatsApp para recibir pedidos de bidones de Brunen SpA. Cloudflare Workers + TypeScript, costo objetivo USD 0/mes.

## Requisitos (Windows)
- Node.js 22.12 o superior (`node -v`); wrangler y vitest no funcionan con Node 20. Recomendado: versión LTS desde nodejs.org.
- Git for Windows (`git --version`). Claude Code lo usa para su terminal Bash.
- Claude Code (plan Pro o superior): en PowerShell, `irm https://claude.ai/install.ps1 | iex`, luego abre una terminal nueva y verifica con `claude --version`.

## Empezar
```powershell
cd brunen-chatbot
npm install
npm run check      # typecheck + pruebas: deben pasar todas
claude             # abre Claude Code en esta carpeta
```
El primer mensaje sugerido para Claude Code está al final de `docs/ETAPAS.md`.

## Estructura
```
src/
  index.ts      Worker: webhook de Meta (GET verificación, POST mensajes), /salud
  firma.ts      Verificación X-Hub-Signature-256
  whatsapp.ts   Parseo del webhook y envío de mensajes
  precios.ts    Cálculo de precios (tramos, especial, mayorista, carga inicial)
  despacho.ts   Fecha de entrega (corte 9:00, sábados, domingos, feriados)
tests/          Pruebas Vitest + mensajes.json (casos para el intérprete)
scripts/        verificar-config y simular-mensaje (ayudas para probar en local)
.github/        CI: corre npm run check en cada push
docs/           Conocimiento del negocio, decisiones, pendientes, etapas
.claude/        settings.json: permisos de Claude Code para este proyecto
```

## Comandos
| Comando | Qué hace |
|---|---|
| `npm run check` | Typecheck + pruebas |
| `npm test` | Solo pruebas |
| `npm run dev` | Worker local en http://localhost:8787 (lee `.dev.vars`) |
| `npm run deploy` | Publica en Cloudflare (pide `npx wrangler login` la primera vez) |
| `npm run verificar-config` | Revisa `.dev.vars` y `wrangler.toml` sin mostrar valores |
| `npm run simular-mensaje -- "texto"` | Envía al Worker local un mensaje firmado como Meta |

## Secretos
Nunca en el código. Local: copia `.dev.vars.example` a `.dev.vars`. Producción: `npx wrangler secret put NOMBRE`.
