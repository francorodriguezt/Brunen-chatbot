/**
 * Simula un mensaje entrante de WhatsApp contra el Worker local (npm run dev), firmado
 * igual que Meta (X-Hub-Signature-256), para probar sin depender de Meta.
 *
 * Uso: npm run simular-mensaje -- "hola 2 bidones de 20" --de 56900000001
 * Opciones: --url http://localhost:8787/webhook   --vars .dev.vars
 *
 * OJO: si .dev.vars tiene un token real y el número está en NUMEROS_PERMITIDOS,
 * el Worker SÍ envía la respuesta por WhatsApp (cuenta para el cupo gratis del mes).
 */

import { createHmac, randomUUID } from 'node:crypto';
import { argumento, leerVars } from './vars.mjs';

const texto = process.argv.slice(2).find((a, i, todos) => !a.startsWith('--') && !todos[i - 1]?.startsWith('--'));
if (!texto) {
  console.log('Uso: npm run simular-mensaje -- "texto del mensaje" --de 569XXXXXXXX');
  process.exit(1);
}

const vars = leerVars(argumento('vars', '.dev.vars'));
if (!vars.WHATSAPP_APP_SECRET) {
  console.log('✗  Falta WHATSAPP_APP_SECRET en el archivo de variables.');
  process.exit(1);
}
const de = argumento('de', (vars.NUMEROS_PERMITIDOS ?? '').split(',')[0]?.trim().replace(/^\+/, ''));
if (!de) {
  console.log('✗  Indica el número con --de 569XXXXXXXX (o completa NUMEROS_PERMITIDOS).');
  process.exit(1);
}
const url = argumento('url', 'http://localhost:8787/webhook');

// Misma forma que el webhook real de la Cloud API (solo los campos que usa el bot).
const cuerpo = JSON.stringify({
  object: 'whatsapp_business_account',
  entry: [
    {
      id: 'WABA_SIMULADA',
      changes: [
        {
          field: 'messages',
          value: {
            messaging_product: 'whatsapp',
            messages: [
              {
                id: `wamid.SIMULADO.${randomUUID()}`,
                from: de,
                timestamp: String(Math.floor(Date.now() / 1000)),
                type: 'text',
                text: { body: texto },
              },
            ],
          },
        },
      ],
    },
  ],
});
const firma = createHmac('sha256', vars.WHATSAPP_APP_SECRET).update(cuerpo).digest('hex');

try {
  const respuesta = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${firma}` },
    body: cuerpo,
  });
  console.log(`Webhook respondió ${respuesta.status} ${await respuesta.text()}`);
  console.log('La respuesta del bot (o el error al enviarla) aparece en la terminal de npm run dev.');
  process.exit(respuesta.status === 200 ? 0 : 1);
} catch {
  console.log(`✗  No se pudo conectar a ${url}. ¿Está corriendo npm run dev en otra terminal?`);
  process.exit(1);
}
