/**
 * Textos que el bot le escribe al cliente (Etapa 4). Son BORRADORES para que el dueño los apruebe
 * (docs/PENDIENTES.md): el tono y las frases se ajustan aquí, en un solo lugar.
 *
 * Reglas de redacción: una sola respuesta por mensaje del cliente (el cupo gratis de WhatsApp es de
 * 1.000 al mes), cercana y breve, sin inventar datos: horarios, comunas y precios salen del documento
 * de conocimiento o de las hojas, nunca de la memoria del modelo.
 */

import { COMUNAS_ATENDIDAS, esComunaAtendida } from './comunas';
import { diaSemana } from './despacho';
import { fechaEnPalabras } from './fechas';
import type { PropuestaEntrega } from './entrega';
import type { ItemInterpretado } from './interprete';
import { formatearCLP, type TipoBidon, type TramoPrecio } from './precios';

const litros = (tipo: TipoBidon): string => tipo.replace('L', ' L');
const bidones = (cantidad: number): string => (cantidad === 1 ? 'bidón' : 'bidones');
const primerNombre = (nombre: string): string => nombre.trim().split(/\s+/)[0] ?? '';

const LISTA_COMUNAS = COMUNAS_ATENDIDAS.join(', ');

export const saludo = (nombre?: string): string =>
  `¡Hola${nombre && primerNombre(nombre) ? ` ${primerNombre(nombre)}` : ''}! Soy el asistente de Brunen. Cuéntame qué necesitas: ¿cuántos bidones y de cuántos litros (20, 12 o 10)?`;

export const preguntarTipo = (): string => '¿De cuántos litros son los bidones: 20, 12 o 10?';

export function preguntarCantidad(items: readonly ItemInterpretado[]): string {
  const falta = items.find((item) => item.cantidad === null && item.tipo !== 'no_especificado');
  return falta && falta.tipo !== 'no_especificado' ? `¿Cuántos bidones de ${litros(falta.tipo)} necesitas?` : '¿Cuántos bidones necesitas?';
}

export const preguntarPedido = (): string => '¿Qué necesitas? Dime cuántos bidones y de cuántos litros (20, 12 o 10).';

export const repetirSinHistorial = (): string =>
  'No tengo anotado tu último pedido. ¿Cuántos bidones necesitas y de cuántos litros (20, 12 o 10)?';

export const pedirTexto = (): string => 'Por ahora no puedo escuchar audios. ¿Me lo escribes, por favor?';

export const imagenRecibida = (): string => 'Recibimos tu imagen. Una persona del equipo la revisará.';

export const cancelado = (): string => 'Listo, no anoté nada. Cuando quieras, escríbeme.';

/** El mensaje se recibió pero lo debe ver una persona. */
export const recibidoEscalar = (): string => 'Recibimos tu mensaje. Una persona del equipo te responderá en breve.';

export const reclamo = (): string =>
  'Lamentamos el inconveniente. Ya avisamos al equipo: te contactarán a la brevedad y lo resolvemos a más tardar mañana.';

export const pagoRecibido = (): string => 'Recibimos tu aviso de pago, gracias. Lo revisamos y, si falta algo, te escribimos.';

export function envasesAnotados(cantidad?: number): string {
  if (!cantidad) return 'Anotado: retiramos tus envases vacíos en la próxima entrega.';
  return `Anotado: retiramos ${cantidad} ${cantidad === 1 ? 'envase vacío' : 'envases vacíos'} en tu próxima entrega.`;
}

export const fueraDeHorario = (): string =>
  'Nuestro horario de atención es de 8:00 a 21:00: te respondemos apenas abramos.';

/** Despacho: docs/conocimiento_brunen.md, sección 6. */
export const horarios = (): string =>
  'Despachamos de lunes a viernes de 10:00 a 18:00 y los sábados de 10:00 a 15:00. No despachamos domingos ni festivos. Los pedidos hechos hasta las 9:00 salen el mismo día; los posteriores, el siguiente día de despacho.';

export function zona(comuna?: string): string {
  if (comuna && esComunaAtendida(comuna)) return `Sí, despachamos a ${comuna}. Atendemos: ${LISTA_COMUNAS}.`;
  if (comuna) return `Por ahora no despachamos a ${comuna}. Atendemos: ${LISTA_COMUNAS}.`;
  return `Atendemos estas comunas: ${LISTA_COMUNAS}. El despacho es gratis.`;
}

export function fueraDeZona(comuna: string): string {
  return `Por ahora no despachamos a ${comuna}. Atendemos: ${LISTA_COMUNAS}. Dejamos anotado tu pedido por si más adelante llegamos a tu comuna.`;
}

function tramo(t: TramoPrecio): string {
  if (t.desde === 1 && t.hasta === null) return `${formatearCLP(t.precio)} c/u`;
  if (t.hasta === null) return `${t.desde} o más: ${formatearCLP(t.precio)} c/u`;
  if (t.desde === t.hasta) return `${t.desde}: ${formatearCLP(t.precio)}`;
  return `${t.desde} a ${t.hasta}: ${formatearCLP(t.precio)} c/u`;
}

/** Los valores de la hoja PRECIOS, por tipo de bidón. */
export function precios(tabla: readonly TramoPrecio[]): string {
  const lineas = (['20L', '12L', '10L'] as const)
    .map((tipo) => ({ tipo, tramos: tabla.filter((t) => t.tipo === tipo).sort((a, b) => a.desde - b.desde) }))
    .filter(({ tramos }) => tramos.length > 0)
    .map(({ tipo, tramos }) => `- Bidón ${litros(tipo)}: ${tramos.map(tramo).join(' · ')}`);
  return `Estos son nuestros valores:\n${lineas.join('\n')}\nEl despacho es gratis.`;
}

export interface LineaTexto {
  tipo: TipoBidon;
  cantidad: number;
  subtotal: number | null;
}

const itemTexto = (l: Pick<LineaTexto, 'tipo' | 'cantidad'>): string => `${l.cantidad} ${bidones(l.cantidad)} de ${litros(l.tipo)}`;

export function pedidoAnotado(datos: {
  lineas: readonly LineaTexto[];
  /** Solo si el precio es seguro; si no, se avisa que lo confirma una persona. */
  total: number | null;
  entrega: PropuestaEntrega;
  /** false si la fecha puede estar mal (feriados sin cargar, fecha pedida que no se entendió). */
  fechaSegura: boolean;
}): string {
  const conPrecio = datos.total !== null;
  const filas = datos.lineas.map((l) => `- ${itemTexto(l)}${conPrecio && l.subtotal !== null ? `: ${formatearCLP(l.subtotal)}` : ''}`);
  const partes = ['Anotamos tu pedido:', ...filas];
  if (datos.total !== null && datos.lineas.length > 1) partes.push(`Total: ${formatearCLP(datos.total)}`);
  if (!conPrecio) partes.push('El valor te lo confirmamos a la brevedad.');

  if (!datos.fechaSegura) {
    partes.push('La fecha de entrega te la confirmamos a la brevedad.');
  } else {
    const fecha = `${datos.entrega.mismoDia ? 'hoy, ' : ''}${fechaEnPalabras(datos.entrega.fecha)}`;
    if (datos.entrega.motivoAjuste === 'sin_despacho') {
      // Brunen despacha los sábados: si el día pedido no es domingo, es un feriado.
      const razon = datos.entrega.fechaPedida && diaSemana(datos.entrega.fechaPedida) === 0 ? 'Los domingos no despachamos' : 'Ese día es feriado y no despachamos';
      partes.push(`${razon}; la entrega más cercana es el ${fecha}.`);
    }
    else if (datos.entrega.motivoAjuste === 'muy_pronto') partes.push(`Para ese día ya no alcanzamos; la entrega más cercana es ${fecha}.`);
    else partes.push(`Entrega estimada: ${fecha}.`);
  }
  partes.push('Si algo cambia, te avisamos por aquí.');
  return partes.join('\n');
}

/** Cliente sin ficha: se anota el pedido y una persona termina de coordinar dirección y envases. */
export function clienteNuevo(lineas: readonly Pick<LineaTexto, 'tipo' | 'cantidad'>[]): string {
  const pedido = lineas.map(itemTexto).join(' y ');
  return `¡Hola! Anotamos tu pedido de ${pedido}. Como es tu primer pedido, una persona del equipo te escribirá para confirmar tu dirección y los detalles.`;
}

/** Resumen de las líneas para las alertas internas: "2 bidones de 20 L y 1 bidón de 12 L". */
export const resumenLineas = (lineas: readonly Pick<LineaTexto, 'tipo' | 'cantidad'>[]): string => lineas.map(itemTexto).join(' y ');
