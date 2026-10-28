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

import { leerBotActivo } from './configuracion';
import { proponerEntrega, type PropuestaEntrega } from './entrega';
import { almacenDe, esMensajeNuevo, liberarMensaje, limpiarAlmacen, type BaseDatos } from './almacen';
import { igualesTiempoConstante, verificarFirma } from './firma';
import type { Intencion } from './interprete';
import { interpretarConRespaldo } from './llm';
import { planillaDe, type RegistroMensaje, type Resultado } from './planilla';
import { describirInterpretacion } from './resumen';
import {
  enmascararTelefono,
  enviarTexto,
  esErrorDeToken,
  extraerEstados,
  extraerMensajes,
  type EstadoMensaje,
  type MensajeEntrante,
} from './whatsapp';

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
  /** Base D1 para deduplicar mensajes por wamid. Sin ella no se deduplica. */
  DB?: BaseDatos;
  /** Clave JSON de la cuenta de servicio de Google (secreto). Sin ella no se registra en la planilla. */
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_SHEET_ID?: string;
  /** Clave de Groq (secreto) para el respaldo con IA. Sin ella el bot usa solo las reglas. */
  GROQ_API_KEY?: string;
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

export interface ResultadoMensaje {
  resultado: Resultado;
  /** Lo que entendió el intérprete, solo para mensajes de texto atendidos. */
  intencion?: Intencion;
}

/** La fecha es una ayuda: si no se puede calcular (por ejemplo, Google caído), el pedido se atiende igual sin ella. */
async function entregaPropuesta(env: Env): Promise<PropuestaEntrega | undefined> {
  try {
    return await proponerEntrega(env);
  } catch (error) {
    console.error('No se pudo calcular la entrega:', error instanceof Error ? error.message : error);
    return undefined;
  }
}

export async function procesarMensaje(mensaje: MensajeEntrante, env: Env): Promise<ResultadoMensaje> {
  const botApagado = (): ResultadoMensaje => {
    console.log(`Bot apagado; mensaje de ${enmascararTelefono(mensaje.de)} ignorado`);
    return { resultado: 'ignorado_bot_apagado' };
  };
  if ((env.BOT_ACTIVO ?? 'SI').toUpperCase() === 'NO') return botApagado();
  if (!numerosPermitidos(env).has(mensaje.de)) {
    console.log(`Modo prueba: ${enmascararTelefono(mensaje.de)} no está en NUMEROS_PERMITIDOS`);
    return { resultado: 'ignorado_modo_prueba' };
  }
  // También se apaga con NO en la hoja CONFIGURACION; se lee después de filtrar para no gastar Google en números ajenos.
  if ((await leerBotActivo(env)) === false) return botApagado();
  // Modo prueba: responde lo que entendió el intérprete (reglas y, si no alcanzan, la IA de respaldo).
  // El flujo de pedido real llega en la Etapa 4.
  const entendido = mensaje.tipo === 'text' && mensaje.texto ? await interpretarConRespaldo(mensaje.texto, env) : null;
  const interpretacion = entendido?.interpretacion ?? null;
  const entrega = interpretacion?.intencion === 'pedido' ? await entregaPropuesta(env) : undefined;
  const respuesta = interpretacion
    ? describirInterpretacion(interpretacion, entendido?.conIa, entrega)
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
  return { resultado: 'respondido', intencion: interpretacion?.intencion };
}

async function procesarLote(mensajes: MensajeEntrante[], env: Env): Promise<void> {
  const almacen = almacenDe(env);
  const registros: RegistroMensaje[] = [];
  for (const mensaje of mensajes) {
    const base = { wamid: mensaje.id, telefonoEnmascarado: enmascararTelefono(mensaje.de), tipo: mensaje.tipo };
    let reclamado = false;
    try {
      if (almacen && !(await esMensajeNuevo(almacen, mensaje.id))) {
        console.log(`Mensaje repetido ignorado (${mensaje.id})`);
        continue;
      }
      reclamado = almacen !== null;
      registros.push({ ...base, ...(await procesarMensaje(mensaje, env)) });
    } catch (error) {
      // Si falló, se suelta el mensaje para que un reintento de Meta sí lo procese.
      if (almacen && reclamado) await liberarMensaje(almacen, mensaje.id);
      if (esErrorDeToken(error)) {
        console.error(
          'TOKEN DE WHATSAPP VENCIDO O INVÁLIDO: genera uno nuevo en API Setup y cárgalo con "npx wrangler secret put WHATSAPP_TOKEN".',
        );
      }
      // Etapa posterior: escribir en la hoja ERRORES y avisar a Constanza.
      const detalle = error instanceof Error ? error.message : String(error);
      console.error(`Error procesando ${mensaje.id}:`, detalle);
      registros.push({ ...base, resultado: 'error', error: detalle });
    }
  }
  await guardarEnPlanilla(env, registros);
  if (almacen) await limpiarAlmacen(almacen);
}

/** La planilla es una vista para Constanza: si Google falla, solo se anota en el log. */
async function guardarEnPlanilla(env: Env, registros: readonly RegistroMensaje[]): Promise<void> {
  const planilla = planillaDe(env);
  if (!planilla || registros.length === 0) return;
  try {
    await planilla.guardar(registros);
  } catch (error) {
    console.error('No se pudo registrar en la planilla:', error instanceof Error ? error.message : error);
  }
}

/** Solo deja registro de los envíos que fallaron; enviado, entregado y leído no necesitan acción. */
export function registrarEstados(estados: EstadoMensaje[]): void {
  for (const estado of estados) {
    if (estado.estado !== 'failed') continue;
    console.error(
      `Entrega fallida a ${enmascararTelefono(estado.para)}: código ${estado.codigoError ?? '?'} ${estado.tituloError ?? ''}`.trim(),
    );
  }
}

function verificarSuscripcion(url: URL, env: Env): Response {
  const modo = url.searchParams.get('hub.mode');
  const token = url.searchParams.get('hub.verify_token');
  const desafio = url.searchParams.get('hub.challenge');
  if (modo === 'subscribe' && token && igualesTiempoConstante(token, env.WHATSAPP_VERIFY_TOKEN ?? '') && desafio) {
    return new Response(desafio, { status: 200 });
  }
  return new Response('Forbidden', { status: 403 });
}

/** Los webhooks de Meta pesan pocos KB; un tope generoso corta el tráfico basura. */
const MAX_CUERPO_BYTES = 256 * 1024;

export default {
  async fetch(request: Request, env: Env, ctx: Contexto): Promise<Response> {
    const url = new URL(request.url);

    // HEAD también: los monitores gratuitos (UptimeRobot) suelen consultar con HEAD.
    if (url.pathname === '/salud' && (request.method === 'GET' || request.method === 'HEAD')) {
      return new Response(request.method === 'HEAD' ? null : 'ok', { status: 200 });
    }

    if (url.pathname !== '/webhook') {
      return new Response('Not found', { status: 404 });
    }

    if (request.method === 'GET') {
      return verificarSuscripcion(url, env);
    }

    if (request.method === 'POST') {
      // Descartar lo evidentemente inválido antes de gastar CPU leyendo el cuerpo y calculando el HMAC.
      if (!request.headers.get('x-hub-signature-256')) {
        return new Response('Invalid signature', { status: 401 });
      }
      if (Number(request.headers.get('content-length') ?? 0) > MAX_CUERPO_BYTES) {
        return new Response('Payload too large', { status: 413 });
      }
      const cuerpo = await request.text();
      if (cuerpo.length > MAX_CUERPO_BYTES) {
        return new Response('Payload too large', { status: 413 });
      }
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
      try {
        registrarEstados(extraerEstados(payload));
      } catch (error) {
        // Un aviso de estado raro nunca debe romper el 200 a Meta.
        console.error('No se pudieron registrar los estados:', error instanceof Error ? error.message : error);
      }
      ctx.waitUntil(procesarLote(extraerMensajes(payload), env));
      return new Response('OK', { status: 200 });
    }

    return new Response('Method not allowed', { status: 405 });
  },
};
