/**
 * Avisos a la operadora por Telegram (D7, Etapa 5): gratis, sin la ventana de 24 horas de WhatsApp y sin
 * gastar el cupo de mensajes. Aquí está el envío, el formato del aviso y la lectura de los botones
 * Confirmar / Cambiar. Falta conectarlo: crear el bot (con @BotFather) y cargar TELEGRAM_BOT_TOKEN y
 * TELEGRAM_CHAT_ID como secretos. Sin ellos, `enviarAlerta` no hace nada y devuelve false.
 *
 * Privacidad: el aviso lleva el teléfono completo y lo que escribió el cliente, porque la operadora los necesita
 * para responderle; nunca la dirección. En los logs solo va el estado de la respuesta de Telegram.
 */

import type { Alerta, TipoAlerta } from './alertas';
import { igualesTiempoConstante } from './firma';

export interface ConfigTelegram {
  token: string;
  /** Chat de la operadora (o del grupo): solo los botones que se toquen ahí se obedecen. */
  chatId: string;
}

export interface EntornoTelegram {
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_CHAT_ID?: string;
}

export function configTelegram(env: EntornoTelegram): ConfigTelegram | null {
  return env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID ? { token: env.TELEGRAM_BOT_TOKEN, chatId: env.TELEGRAM_CHAT_ID } : null;
}

const TIEMPO_MAXIMO_MS = 8000;
// Cada parte del aviso tiene su tope, y los topes suman bastante menos que los 4.096 caracteres de Telegram.
// Se recorta cada parte ANTES de darle formato: recortar el HTML ya armado podría cortar una etiqueta por la
// mitad y Telegram rechazaría el aviso entero.
const MAX_TEXTO_CLIENTE = 500;
const MAX_RESUMEN = 300;
const MAX_MOTIVO = 300;
const MAX_MOTIVOS = 10;
const MAX_NOMBRE = 80;

const recortar = (texto: string, maximo: number): string => (texto.length > maximo ? `${texto.slice(0, maximo)}…` : texto);

const ETIQUETAS: Readonly<Record<TipoAlerta, string>> = {
  pedido: '🟢 Pedido nuevo',
  pedido_revision: '🟡 Pedido para revisar',
  cliente_nuevo: '🆕 Cliente nuevo',
  fuera_de_zona: '📍 Fuera de zona',
  reclamo: '🔴 Reclamo',
  factura: '🧾 Factura',
  proveedor: '📦 Proveedor o cobranza',
  pago: '💳 Pago',
  envases: '♻️ Envases',
  no_entendido: '❓ No entendí el mensaje',
  escalamiento: '⚠️ Revisar',
  error: '🛠 Error del sistema',
};

/** Los tipos de aviso que traen un pedido registrado para confirmar. */
const CON_BOTONES: ReadonlySet<TipoAlerta> = new Set<TipoAlerta>(['pedido', 'pedido_revision', 'cliente_nuevo']);

/**
 * Telegram es solo para lo muy urgente (D32): reclamos y fallas del sistema. Todo lo demás se ve en el panel, con
 * sonido y notificación mientras está abierto.
 */
export const esUrgente = (alerta: Alerta): boolean => alerta.tipo === 'reclamo' || alerta.tipo === 'error';

/** Telegram con parse_mode HTML exige escapar estos tres caracteres en todo texto que no sea una etiqueta. */
export function escaparHtml(texto: string): string {
  return texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** "56987654321" -> "+56 9 8765 4321" (los números de otros países se muestran con su "+"). */
export function telefonoLegible(telefono: string): string {
  const m = /^56(\d)(\d{4})(\d{4})$/.exec(telefono);
  return m ? `+56 ${m[1]} ${m[2]} ${m[3]}` : `+${telefono}`;
}

export interface Boton {
  text: string;
  callback_data: string;
}

export type AccionBotonTipo = 'confirmar' | 'cambiar';
const PREFIJO: Readonly<Record<AccionBotonTipo, string>> = { confirmar: 'c:', cambiar: 'x:' };

export interface AvisoFormateado {
  /** HTML de Telegram. */
  texto: string;
  botones: Boton[][];
}

export function formatearAlerta(alerta: Alerta): AvisoFormateado {
  const telefono = alerta.telefono.replace(/\D/g, '');
  // Un aviso del sistema (una falla) no viene de ningún cliente: no lleva nombre ni enlace.
  const contacto = telefono ? `<a href="https://wa.me/${telefono}">${escaparHtml(telefonoLegible(telefono))}</a>` : '';
  const quien = [alerta.nombre ? escaparHtml(recortar(alerta.nombre, MAX_NOMBRE)) : '', contacto].filter(Boolean).join(' · ');
  const lineas = [
    `<b>${ETIQUETAS[alerta.tipo]}</b>${alerta.idPedido ? ` · <code>${escaparHtml(alerta.idPedido)}</code>` : ''}`,
    ...(quien ? [quien] : []),
    escaparHtml(recortar(alerta.resumen, MAX_RESUMEN)),
    ...alerta.motivos.slice(0, MAX_MOTIVOS).map((motivo) => `⚠ ${escaparHtml(recortar(motivo, MAX_MOTIVO))}`),
  ];
  if (alerta.motivos.length > MAX_MOTIVOS) lineas.push(`… y ${alerta.motivos.length - MAX_MOTIVOS} motivo(s) más`);
  if (alerta.texto) lineas.push(`<i>“${escaparHtml(recortar(alerta.texto, MAX_TEXTO_CLIENTE))}”</i>`);
  const texto = lineas.join('\n');
  const botones: Boton[][] =
    alerta.idPedido && CON_BOTONES.has(alerta.tipo)
      ? [[{ text: '✅ Confirmar', callback_data: `${PREFIJO.confirmar}${alerta.idPedido}` }, { text: '✏️ Cambiar', callback_data: `${PREFIJO.cambiar}${alerta.idPedido}` }]]
      : [];
  return { texto, botones };
}

async function llamarApi(config: ConfigTelegram, metodo: string, cuerpo: Record<string, unknown>): Promise<boolean> {
  try {
    const respuesta = await fetch(`https://api.telegram.org/bot${config.token}/${metodo}`, {
      method: 'POST',
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
    // Solo el estado: la dirección de la llamada lleva el token y el cuerpo, datos del cliente.
    if (!respuesta.ok) console.error(`Telegram ${metodo} respondió ${respuesta.status}`);
    return respuesta.ok;
  } catch (error) {
    console.error(`Telegram ${metodo} falló:`, error instanceof Error ? error.name : 'error');
    return false;
  }
}

/** Envía el aviso. Nunca lanza errores: un aviso que no sale no debe romper la atención al cliente. */
export async function enviarAlerta(config: ConfigTelegram | null, alerta: Alerta): Promise<boolean> {
  if (!config) return false;
  const { texto, botones } = formatearAlerta(alerta);
  return llamarApi(config, 'sendMessage', {
    chat_id: config.chatId,
    text: texto,
    parse_mode: 'HTML',
    disable_web_page_preview: true,
    ...(botones.length > 0 && { reply_markup: { inline_keyboard: botones } }),
  });
}

export interface AccionBoton {
  accion: AccionBotonTipo;
  idPedido: string;
  /** Quién tocó el botón, para "Confirmado_Por". */
  quien: string;
  chatId: string;
  mensajeId: number;
  callbackId: string;
}

/** Lee un aviso de Telegram (`update`) y devuelve el botón que se tocó, o null si es otra cosa. */
export function extraerAccionBoton(update: unknown): AccionBoton | null {
  const consulta = (update as { callback_query?: Record<string, unknown> } | null)?.callback_query;
  if (!consulta || typeof consulta.data !== 'string' || typeof consulta.id !== 'string') return null;
  const accion = (Object.keys(PREFIJO) as AccionBotonTipo[]).find((a) => (consulta.data as string).startsWith(PREFIJO[a]));
  const idPedido = accion ? (consulta.data as string).slice(PREFIJO[accion].length) : '';
  const mensaje = consulta.message as { message_id?: unknown; chat?: { id?: unknown } } | undefined;
  const usuario = consulta.from as { first_name?: unknown; username?: unknown } | undefined;
  if (!accion || !/^P\d{6}-[0-9A-Z]{5}$/.test(idPedido)) return null;
  if (typeof mensaje?.message_id !== 'number' || typeof mensaje.chat?.id !== 'number') return null;
  const quien = String(usuario?.first_name ?? usuario?.username ?? 'operadora').slice(0, 40);
  return { accion, idPedido, quien, chatId: String(mensaje.chat.id), mensajeId: mensaje.message_id, callbackId: consulta.id };
}

/** Solo se obedecen los botones tocados en el chat de la operadora. */
export const esChatAutorizado = (accion: AccionBoton, config: ConfigTelegram): boolean => accion.chatId === config.chatId;

/**
 * Telegram manda el secreto del webhook (el que se da al registrarlo con setWebhook) en la cabecera
 * X-Telegram-Bot-Api-Secret-Token: sin él cualquiera podría simular un botón.
 */
export function secretoValido(cabecera: string | null, secreto: string): boolean {
  return Boolean(secreto) && cabecera !== null && igualesTiempoConstante(cabecera, secreto);
}

/** Avisa a Telegram que el botón se recibió (quita el "cargando" del botón) y muestra un mensaje breve. */
export function responderBoton(config: ConfigTelegram, accion: AccionBoton, texto: string): Promise<boolean> {
  return llamarApi(config, 'answerCallbackQuery', { callback_query_id: accion.callbackId, text: texto.slice(0, 200) });
}

/** Quita los botones de un aviso ya resuelto, para que no se toquen dos veces. */
export function quitarBotones(config: ConfigTelegram, accion: AccionBoton): Promise<boolean> {
  return llamarApi(config, 'editMessageReplyMarkup', {
    chat_id: accion.chatId,
    message_id: accion.mensajeId,
    reply_markup: { inline_keyboard: [] },
  });
}
