/**
 * Worker de Cloudflare que recibe el webhook de WhatsApp.
 *
 *   - GET  /webhook  -> verificación de Meta (hub.challenge).
 *   - POST /webhook  -> valida la firma, responde 200 de inmediato y procesa en segundo plano.
 *   - GET  /salud    -> para el monitoreo (UptimeRobot).
 *
 * Procesamiento de cada mensaje (solo de los números de `NUMEROS_PERMITIDOS` mientras dure la prueba):
 *   - Con `FLUJO_PEDIDO = "SI"` y D1: el flujo de pedido completo (atencion.ts): ficha del cliente, precio, entrega,
 *     respuesta única, pedido y aviso guardados en D1 para el panel.
 *   - Sin eso: modo prueba. Responde lo que entendió el intérprete, sin tomar pedidos.
 */

import {
  atenderConFlujo,
  avisarFalla,
  esperaDeAgrupador,
  flujoActivo,
  limpiezasDelLote,
  type EntornoAtencion,
  type ResultadoMensaje,
} from './atencion';
import { anotarMensaje, esperarGrupo, reclamarGrupo } from './agrupador';
import { leerBotActivo } from './configuracion';
import { proponerEntrega, type PropuestaEntrega } from './entrega';
import { almacenDe, esMensajeNuevo, liberarMensaje, limpiarAlmacen } from './almacen';
import { igualesTiempoConstante, verificarFirma } from './firma';
import type { Intencion } from './interprete';
import { interpretarConRespaldo } from './llm';
import { planillaDe, type RegistroMensaje } from './planilla';
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

export type { ResultadoMensaje } from './atencion';

export interface Env extends EntornoAtencion {
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_APP_SECRET: string;
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

/** La fecha es una ayuda: si no se puede calcular (por ejemplo, Google caído), el pedido se atiende igual sin ella. */
async function entregaPropuesta(env: Env, solicitada?: string): Promise<PropuestaEntrega | undefined> {
  try {
    return await proponerEntrega(env, new Date(), { solicitada });
  } catch (error) {
    console.error('No se pudo calcular la entrega:', error instanceof Error ? error.message : error);
    return undefined;
  }
}

/** Si el mensaje no se debe atender (bot apagado o número fuera de la prueba) dice por qué; si se atiende, devuelve null. */
async function motivoParaIgnorar(mensaje: MensajeEntrante, env: Env): Promise<ResultadoMensaje | null> {
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
  return null;
}

/**
 * Atiende un mensaje. `agrupado` solo lo usa el flujo de pedido: son los textos que el lote ya juntó para este cliente
 * (`null` = otro mensaje seguido se llevó el grupo; sin valor, el mensaje espera por su cuenta).
 */
export async function procesarMensaje(mensaje: MensajeEntrante, env: Env, agrupado?: readonly string[] | null): Promise<ResultadoMensaje> {
  const ignorado = await motivoParaIgnorar(mensaje, env);
  if (ignorado) return ignorado;
  if (flujoActivo(env)) return atenderConFlujo(mensaje, env, agrupado);

  // Modo prueba: responde lo que entendió el intérprete (reglas y, si no alcanzan, la IA de respaldo).
  const entendido = mensaje.tipo === 'text' && mensaje.texto ? await interpretarConRespaldo(mensaje.texto, env) : null;
  const interpretacion = entendido?.interpretacion ?? null;
  const entrega = interpretacion?.intencion === 'pedido' ? await entregaPropuesta(env, interpretacion.fecha_texto) : undefined;
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
  return { resultado: 'respondido', intencion: interpretacion?.intencion as Intencion | undefined };
}

async function procesarLote(mensajes: MensajeEntrante[], env: Env): Promise<void> {
  const almacen = almacenDe(env);
  const registros: RegistroMensaje[] = [];
  const base = (m: MensajeEntrante) => ({ wamid: m.id, telefonoEnmascarado: enmascararTelefono(m.de), tipo: m.tipo });

  // 1. Sin repetidos: Meta reintenta si tarda, y el mismo mensaje no se atiende dos veces.
  const nuevos: MensajeEntrante[] = [];
  for (const mensaje of mensajes) {
    if (almacen && !(await esMensajeNuevo(almacen, mensaje.id))) {
      console.log(`Mensaje repetido ignorado (${mensaje.id})`);
      continue;
    }
    nuevos.push(mensaje);
  }

  // 2. Con el flujo de pedido, los textos de este aviso se anotan todos primero y se espera UNA sola vez a que lleguen
  //    más mensajes seguidos del mismo cliente (D27): así "2 bidones" y "de 20" reciben una sola respuesta.
  const anotados = new Map<string, number>();
  if (flujoActivo(env) && env.DB) {
    for (const mensaje of nuevos) {
      if (mensaje.tipo !== 'text' || !mensaje.texto || (await motivoParaIgnorar(mensaje, env))) continue;
      try {
        const id = await anotarMensaje(env.DB, { wamid: mensaje.id, telefono: mensaje.de, texto: mensaje.texto });
        if (id !== null) anotados.set(mensaje.id, id);
      } catch (error) {
        console.error('No se pudo anotar el mensaje para agruparlo; se atiende solo:', error instanceof Error ? error.message : error);
      }
    }
    if (anotados.size > 0) await esperarGrupo(esperaDeAgrupador(env));
  }

  // 3. Cada mensaje.
  for (const mensaje of nuevos) {
    try {
      let agrupado: readonly string[] | null | undefined;
      const id = anotados.get(mensaje.id);
      if (id !== undefined && env.DB) {
        try {
          agrupado = await reclamarGrupo(env.DB, { wamid: mensaje.id, telefono: mensaje.de, texto: mensaje.texto ?? '' }, id);
        } catch (error) {
          console.error('No se pudo reclamar el grupo de mensajes; se atiende solo:', error instanceof Error ? error.message : error);
          agrupado = [mensaje.texto ?? ''];
        }
      }
      registros.push({ ...base(mensaje), ...(await procesarMensaje(mensaje, env, agrupado)) });
    } catch (error) {
      // Si falló, se suelta el mensaje para que un reintento de Meta sí lo procese.
      if (almacen) await liberarMensaje(almacen, mensaje.id);
      if (esErrorDeToken(error)) {
        console.error(
          'TOKEN DE WHATSAPP VENCIDO O INVÁLIDO: genera uno nuevo en API Setup y cárgalo con "npx wrangler secret put WHATSAPP_TOKEN".',
        );
        await avisarFalla(env, 'token-whatsapp', 'El token de WhatsApp venció o no es válido: el bot no puede responder. Genera uno nuevo y cárgalo con "npx wrangler secret put WHATSAPP_TOKEN".');
      }
      const detalle = error instanceof Error ? error.message : String(error);
      console.error(`Error procesando ${mensaje.id}:`, detalle);
      registros.push({ ...base(mensaje), resultado: 'error', error: detalle });
    }
  }
  await guardarEnPlanilla(env, registros);
  if (almacen) await limpiarAlmacen(almacen);
  await limpiezasDelLote(env);
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
