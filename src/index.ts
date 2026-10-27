/**
 * Worker de Cloudflare que recibe el webhook de WhatsApp.
 *
 * ETAPA 1 (esqueleto de punta a punta):
 *   - GET  /webhook  -> verificación de Meta (hub.challenge).
 *   - POST /webhook  -> valida la firma, responde 200 de inmediato y procesa en segundo plano.
 *   - GET  /salud    -> para el monitoreo (UptimeRobot).
 *   - Procesamiento: responde "Recibí: <texto>" SOLO a números de prueba (modo prueba).
 *
 * Las etapas siguientes reemplazan `procesarMensaje` por el flujo real
 * (deduplicación, interpretación, cotización, registro en Sheets, alerta a Constanza).
 */

import { verificarFirma } from './firma';
import { enmascararTelefono, enviarTexto, extraerMensajes, type MensajeEntrante } from './whatsapp';

export interface Env {
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_APP_SECRET: string;
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  GRAPH_API_VERSION: string;
  /** Teléfonos de prueba separados por coma (formato 569XXXXXXXX). Vacío = no responde a nadie. */
  NUMEROS_PERMITIDOS?: string;
  /** "NO" apaga el bot (regla 11). */
  BOT_ACTIVO?: string;
}

/** Subconjunto de ExecutionContext que usamos; facilita las pruebas. */
export interface Contexto {
  waitUntil(promesa: Promise<unknown>): void;
}

export function numerosPermitidos(env: Env): Set<string> {
  return new Set(
    (env.NUMEROS_PERMITIDOS ?? '')
      .split(',')
      .map((n) => n.trim().replace(/^\+/, ''))
      .filter(Boolean),
  );
}

export async function procesarMensaje(mensaje: MensajeEntrante, env: Env): Promise<void> {
  if ((env.BOT_ACTIVO ?? 'SI').toUpperCase() === 'NO') {
    console.log(`Bot apagado; mensaje de ${enmascararTelefono(mensaje.de)} ignorado`);
    return;
  }
  if (!numerosPermitidos(env).has(mensaje.de)) {
    console.log(`Modo prueba: ${enmascararTelefono(mensaje.de)} no está en NUMEROS_PERMITIDOS`);
    return;
  }
  const respuesta =
    mensaje.tipo === 'text' && mensaje.texto
      ? `Recibí: ${mensaje.texto}`
      : `Recibí un mensaje de tipo "${mensaje.tipo}".`;
  await enviarTexto(
    {
      token: env.WHATSAPP_TOKEN,
      phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
      graphApiVersion: env.GRAPH_API_VERSION,
    },
    mensaje.de,
    respuesta,
  );
}

async function procesarLote(mensajes: MensajeEntrante[], env: Env): Promise<void> {
  for (const mensaje of mensajes) {
    try {
      await procesarMensaje(mensaje, env);
    } catch (error) {
      // Etapa posterior: escribir en la hoja ERRORES y avisar a Constanza.
      console.error(`Error procesando ${mensaje.id}:`, error instanceof Error ? error.message : error);
    }
  }
}

function verificarSuscripcion(url: URL, env: Env): Response {
  const modo = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const desafio = url.searchParams.get('hub.challenge');
  if (modo === 'subscribe' && token && token === env.WHATSAPP_VERIFY_TOKEN && desafio) {
    return new Response(desafio, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

export default {
  async fetch(request: Request, env: Env, ctx: Contexto): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/salud' && request.method === 'GET') {
      return new Response('ok', { status: 200 });
    }

    if (url.pathname !== '/webhook') {
      return new Response('Not found', { status: 404 });
    }

    if (request.method === 'GET') {
      return verificarSuscripcion(url, env);
    }

    if (request.method === 'POST') {
      const cuerpo = await request.text();
      const firmaValida = await verificarFirma(cuerpo, request.headers.get('x-hub-signature-256'), env.WHATSAPP_APP_SECRET);
      if (!firmaValida) {
        return new Response('Invalid signature', { status: 401 });
      }
      let payload: unknown;
      try {
        payload = JSON.parse(cuerpo);
      } catch {
        return new Response('Bad request', { status: 400 });
      }
      // Responder rápido: Meta reintenta si no recibe 200 a tiempo, y eso genera duplicados.
      ctx.waitUntil(procesarLote(extraerMensajes(payload), env));
      return new Response('OK', { status: 200 });
    }

    return new Response('Method not allowed', { status: 405 });
  },
};
