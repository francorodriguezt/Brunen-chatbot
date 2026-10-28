/**
 * Entiende la respuesta del cliente a una pregunta del bot ("¿de qué tamaño?" -> "de 20") a partir del
 * pedido a medias que quedó guardado (conversacion.ts). Sin red y sin IA: solo reconoce respuestas
 * cortas y claras. Todo lo demás devuelve null y sigue el camino normal (reglas y, si hace falta, la IA),
 * que es lo correcto cuando el cliente cambia de tema o manda un pedido completo.
 *
 * Es estricto a propósito: "para mañana a las 10" no debe leerse como un bidón de 10 litros.
 */

import type { EstadoConversacion } from './conversacion';
import { accionDePedido, enteroValido, validarItems, type Interpretacion, type ItemInterpretado } from './interprete';
import { preparar } from './texto';

export type RespuestaContextual =
  /** El cliente desistió: hay que borrar el pedido a medias. */
  | { tipo: 'cancelar' }
  | { tipo: 'interpretacion'; interpretacion: Interpretacion };

const RELLENO = /\b(?:por favor|porfa|porfis|gracias|dale|ok|okey|si)\b/g;
const CANCELAR = /^(?:no|nada|nada mas|ya no|no gracias|no quiero|no necesito|mejor no|cancela|cancelar|cancelalo|olvidalo|olvida|dejalo|dejalo asi|no importa)$/;
// "20", "de 20", "los de 20 litros", "quiero 12"...
const SOLO_TIPO = /^(?:(?:los|las|el|la|del|es|son|seria|serian|quiero|necesito|bidones|bidon|botellones|botellon|de) )*(10|12|20)(?: (?:l|lt|lts|ltr|ltrs|litros|litro))?$/;
// "2", "son 3", "necesito 4 bidones"...
const SOLO_CANTIDAD = /^(?:(?:son|seria|serian|necesito|quiero|dame|ponme|nomas|solo|solamente|y|de) )*(\d{1,3})(?: (?:bidones|bidon|botellones|botellon|unidades|unidad))?$/;

function comoPedido(estado: EstadoConversacion, items: ItemInterpretado[]): Interpretacion {
  const accion = accionDePedido(items);
  return {
    intencion: 'pedido',
    items,
    ...(estado.fecha_texto && { fecha_texto: estado.fecha_texto }),
    ...(estado.comuna_mencionada && { comuna_mencionada: estado.comuna_mencionada }),
    ...(accion && { accion }),
  };
}

export function responderEnContexto(texto: string, estado: EstadoConversacion): RespuestaContextual | null {
  const t = preparar(texto).replace(RELLENO, ' ').replace(/[?/]/g, ' ').replace(/\s+/g, ' ').trim();
  if (CANCELAR.test(t)) return { tipo: 'cancelar' };

  if (estado.espera === 'tipo') {
    const litros = SOLO_TIPO.exec(t)?.[1];
    if (!litros) return null;
    const items = validarItems(estado.items.map((item) => (item.tipo === 'no_especificado' ? { ...item, tipo: `${litros}L` } : item)));
    return items ? { tipo: 'interpretacion', interpretacion: comoPedido(estado, items) } : null;
  }

  if (estado.espera === 'cantidad') {
    const sinCantidad = estado.items.filter((item) => item.cantidad === null);
    const cantidad = enteroValido(Number(SOLO_CANTIDAD.exec(t)?.[1]));
    // Con más de un ítem sin cantidad no se sabe a cuál se refiere: que lo resuelva el camino normal.
    if (sinCantidad.length !== 1 || cantidad === null) return null;
    const items = estado.items.map((item) => (item.cantidad === null ? { ...item, cantidad } : item));
    return { tipo: 'interpretacion', interpretacion: comoPedido(estado, items) };
  }

  return null;
}

/**
 * Cuando el cliente manda un pedido completo en vez de contestar la pregunta, el pedido nuevo reemplaza
 * al viejo, pero conserva lo que ya había dicho y no repite: la fecha y la comuna.
 */
export function fusionarConEstado(interpretacion: Interpretacion, estado: EstadoConversacion | null): Interpretacion {
  if (!estado || interpretacion.intencion !== 'pedido') return interpretacion;
  return {
    ...interpretacion,
    ...(interpretacion.fecha_texto === undefined && estado.fecha_texto && { fecha_texto: estado.fecha_texto }),
    ...(interpretacion.comuna_mencionada === undefined && estado.comuna_mencionada && { comuna_mencionada: estado.comuna_mencionada }),
  };
}
