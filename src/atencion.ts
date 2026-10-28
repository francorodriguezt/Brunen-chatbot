/**
 * Conecta el flujo de pedido (`flujo.ts`) con el mundo real: la planilla, D1, WhatsApp, Groq y Telegram.
 * Se activa con `FLUJO_PEDIDO = "SI"` (y D1 disponible); sin eso el bot sigue en modo prueba (index.ts).
 *
 * Orden de lo que pasa con cada mensaje de un cliente, pensado para que nunca quede sin respuesta ni se le
 * prometa lo que no quedó anotado:
 *   1. el flujo decide (respuesta, pedido, aviso);
 *   2. se guarda el pedido y el aviso en D1 (fuente de verdad que ve el panel, D32). Si D1 falla, al cliente NO se le
 *      dice "anotamos tu pedido": se le avisa que una persona lo atenderá y la falla sale por Telegram;
 *   3. si el aviso es urgente (reclamo o falla del sistema), va por Telegram;
 *   4. recién entonces se responde por WhatsApp.
 * Un reintento de Meta no duplica nada: el ID del pedido sale del mensaje y el aviso se guarda una vez por mensaje.
 */

import { ESPERA_POR_DEFECTO_MS, agruparMensaje, limpiarPendientes } from './agrupador';
import type { Alerta } from './alertas';
import type { BaseDatos } from './almacen';
import { buscarCliente } from './clientes';
import { leerServicio } from './configuracion';
import { MemoriaConversaciones } from './conversacion';
import { proponerEntrega } from './entrega';
import { atenderTexto, type Puertos } from './flujo';
import type { EntornoHojas } from './hojas';
import { interpretarConRespaldo, type EntornoLlm } from './llm';
import type { PedidoARegistrar } from './pedidos';
import type { Resultado } from './planilla';
import { cargarTablaPrecios } from './preciosHoja';
import { RepositorioD1 } from './repositorio';
import { configTelegram, enviarAlerta, esUrgente, type EntornoTelegram } from './telegram';
import * as textos from './textos';
import { enviarTexto, type ConfigWhatsApp, type MensajeEntrante } from './whatsapp';

export interface EntornoAtencion extends EntornoHojas, EntornoLlm, EntornoTelegram {
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  GRAPH_API_VERSION: string;
  DB?: BaseDatos;
  /** "SI" conecta el flujo de pedido; cualquier otro valor deja el modo prueba. */
  FLUJO_PEDIDO?: string;
  /** Milisegundos que se espera a que llegue otro mensaje seguido del mismo cliente. */
  ESPERA_AGRUPADOR_MS?: string;
}

export interface ResultadoMensaje {
  resultado: Resultado;
  /** Qué entendió el bot (pedido, pregunta, reclamo...), para la columna Intencion de la hoja de mensajes. */
  intencion?: string;
}

export function flujoActivo(env: Pick<EntornoAtencion, 'FLUJO_PEDIDO' | 'DB'>): boolean {
  return env.FLUJO_PEDIDO?.trim().toUpperCase() === 'SI' && Boolean(env.DB);
}

/** Tope de 20 s: `waitUntil` da 30 s en total y después hay que leer hojas y responder. */
export function esperaDeAgrupador(env: Pick<EntornoAtencion, 'ESPERA_AGRUPADOR_MS'>): number {
  const ms = Number(env.ESPERA_AGRUPADOR_MS);
  return env.ESPERA_AGRUPADOR_MS !== undefined && Number.isFinite(ms) && ms >= 0 && ms <= 20_000 ? ms : ESPERA_POR_DEFECTO_MS;
}

const configWhatsApp = (env: EntornoAtencion): ConfigWhatsApp => ({
  token: env.WHATSAPP_TOKEN,
  phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID,
  graphApiVersion: env.GRAPH_API_VERSION,
});

function puertosReales(env: EntornoAtencion, ahora: Date): Puertos {
  return {
    memoria: env.DB ? new MemoriaConversaciones(env.DB) : null,
    buscarCliente: (telefono) => buscarCliente(env, telefono),
    cargarPrecios: () => cargarTablaPrecios(env),
    proponerEntrega: (solicitada) => proponerEntrega(env, ahora, { solicitada }),
    servicio: () => leerServicio(env),
    interpretar: (texto) => interpretarConRespaldo(texto, env),
  };
}

interface Efectos {
  respuesta: string | null;
  pedido?: PedidoARegistrar;
  alerta?: Alerta;
  /** Lo que escribió el cliente: contexto para el aviso de error si D1 falla. */
  textoDelCliente: string;
}

/** Guarda, avisa y devuelve lo que finalmente se le debe responder al cliente (null = nada). */
async function aplicarEfectos(env: EntornoAtencion, mensaje: MensajeEntrante, efectos: Efectos, ahora: Date): Promise<string | null> {
  const ahoraSegundos = Math.floor(ahora.getTime() / 1000);
  let { respuesta, alerta } = efectos;
  if (env.DB) {
    const repositorio = new RepositorioD1(env.DB);
    try {
      if (efectos.pedido) await repositorio.guardarPedido(efectos.pedido, ahoraSegundos);
      if (alerta) await repositorio.guardarAviso(alerta, mensaje.id, ahoraSegundos);
    } catch (error) {
      const detalle = error instanceof Error ? error.message : String(error);
      console.error('No se pudo guardar el pedido o el aviso en D1:', detalle);
      // No se le promete al cliente lo que no quedó anotado: una persona lo atiende.
      if (respuesta !== null) respuesta = textos.recibidoEscalar();
      alerta = { tipo: 'error', telefono: mensaje.de, resumen: `No se pudo guardar en D1: ${detalle}`, motivos: [], texto: efectos.textoDelCliente };
    }
    try {
      await repositorio.limpiar(ahoraSegundos);
    } catch (error) {
      console.error('No se pudo limpiar los avisos viejos:', error instanceof Error ? error.message : error);
    }
  }
  if (alerta && esUrgente(alerta)) await enviarAlerta(configTelegram(env), alerta);
  return respuesta;
}

/** Texto del cliente (si mandó varios mensajes seguidos, ya juntos): decide, guarda, avisa y responde. */
export async function atenderTextoConFlujo(
  mensaje: MensajeEntrante,
  textosDelGrupo: readonly string[],
  env: EntornoAtencion,
  ahora: Date = new Date(),
): Promise<ResultadoMensaje> {
  const texto = textosDelGrupo.join(' ');
  const { decision } = await atenderTexto({ texto, telefono: mensaje.de, wamid: mensaje.id, ahora }, puertosReales(env, ahora));
  const respuesta = await aplicarEfectos(env, mensaje, { respuesta: decision.respuesta, pedido: decision.pedido, alerta: decision.alerta, textoDelCliente: texto }, ahora);
  if (respuesta !== null) await enviarTexto(configWhatsApp(env), mensaje.de, respuesta);
  return { resultado: respuesta === null ? 'sin_respuesta' : 'respondido', intencion: decision.intencion };
}

/** Las reacciones y los stickers se tratan como un "ok": ni respuesta ni aviso. */
const SIN_RESPUESTA_NI_AVISO: ReadonlySet<string> = new Set(['reaction', 'sticker']);

/** Audios (regla 8: se pide que escriban), imágenes (posible comprobante) y el resto (los ve una persona). */
export async function atenderNoTexto(mensaje: MensajeEntrante, env: EntornoAtencion, ahora: Date = new Date()): Promise<ResultadoMensaje> {
  if (SIN_RESPUESTA_NI_AVISO.has(mensaje.tipo)) return { resultado: 'sin_respuesta', intencion: mensaje.tipo };
  const aviso = (tipo: Alerta['tipo'], resumen: string): Alerta => ({ tipo, telefono: mensaje.de, resumen, motivos: [] });
  let efectos: Efectos;
  if (mensaje.tipo === 'audio') {
    efectos = { respuesta: textos.pedirTexto(), textoDelCliente: '' };
  } else if (mensaje.tipo === 'image') {
    // PENDIENTE (D30): guardar la imagen en D1 para verla en el panel; hoy solo se avisa que llegó.
    efectos = {
      respuesta: textos.imagenRecibida(),
      alerta: aviso('pago', 'Envió una imagen (posible comprobante de pago). Todavía no se guarda en el panel.'),
      textoDelCliente: '',
    };
  } else {
    efectos = { respuesta: textos.recibidoEscalar(), alerta: aviso('escalamiento', `Envió un mensaje de tipo "${mensaje.tipo}"`), textoDelCliente: '' };
  }
  const respuesta = await aplicarEfectos(env, mensaje, efectos, ahora);
  if (respuesta !== null) await enviarTexto(configWhatsApp(env), mensaje.de, respuesta);
  return { resultado: 'respondido', intencion: mensaje.tipo };
}

/**
 * Atiende un mensaje con el flujo de pedido. `agrupado` son los textos ya juntos (los reclama el lote); sin él, el
 * mensaje espera por su cuenta a ver si llega otro seguido. `null` = otro mensaje del mismo cliente se llevó el grupo.
 */
export async function atenderConFlujo(
  mensaje: MensajeEntrante,
  env: EntornoAtencion,
  agrupado?: readonly string[] | null,
  ahora: Date = new Date(),
): Promise<ResultadoMensaje> {
  if (mensaje.tipo !== 'text' || !mensaje.texto) return atenderNoTexto(mensaje, env, ahora);
  let textosDelGrupo = agrupado;
  if (textosDelGrupo === undefined) {
    textosDelGrupo = env.DB
      ? await agruparMensaje(env.DB, { wamid: mensaje.id, telefono: mensaje.de, texto: mensaje.texto }, { esperaMs: esperaDeAgrupador(env) })
      : [mensaje.texto];
  }
  if (textosDelGrupo === null) return { resultado: 'agrupado' };
  return atenderTextoConFlujo(mensaje, textosDelGrupo, env, ahora);
}

/** Casi nunca limpia: los mensajes pendientes que quedaron huérfanos duran, como mucho, una hora. */
export async function limpiezasDelLote(env: Pick<EntornoAtencion, 'DB'>, azar: () => number = Math.random): Promise<void> {
  if (env.DB && azar() < 0.02) await limpiarPendientes(env.DB);
}

const ultimosAvisos = new Map<string, number>();
const UNA_HORA_MS = 3_600_000;

/** Solo para pruebas. */
export function olvidarFallas(): void {
  ultimosAvisos.clear();
}

/**
 * Falla del sistema (el token de WhatsApp venció, por ejemplo): se guarda como aviso y sale por Telegram, pero no más
 * de una vez por hora por tipo de falla, para no llenar el chat si cada mensaje falla igual.
 */
export async function avisarFalla(env: EntornoAtencion, clave: string, resumen: string, ahora: Date = new Date()): Promise<void> {
  const t = ahora.getTime();
  if (t - (ultimosAvisos.get(clave) ?? Number.NEGATIVE_INFINITY) < UNA_HORA_MS) return;
  ultimosAvisos.set(clave, t);
  const alerta: Alerta = { tipo: 'error', telefono: '', resumen, motivos: [] };
  if (flujoActivo(env) && env.DB) {
    try {
      await new RepositorioD1(env.DB).guardarAviso(alerta, null, Math.floor(t / 1000));
    } catch (error) {
      console.error('No se pudo guardar el aviso de falla:', error instanceof Error ? error.message : error);
    }
  }
  await enviarAlerta(configTelegram(env), alerta);
}
