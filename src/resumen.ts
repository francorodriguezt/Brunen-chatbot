/**
 * Texto con lo que el intérprete entendió. Se usa en modo prueba: el bot responde esto en vez de
 * repetir el mensaje, para poder revisar cómo interpreta mensajes reales antes de armar el flujo
 * de pedido (Etapa 4).
 */

import { diaSemana } from './despacho';
import type { PropuestaEntrega } from './entrega';
import type { Intencion, Interpretacion } from './interprete';

const NOMBRE_INTENCION: Readonly<Record<Intencion, string>> = {
  pedido: 'pedido',
  repetir_pedido: 'repetir pedido',
  pregunta: 'pregunta',
  reclamo: 'reclamo',
  factura: 'factura',
  proveedor: 'proveedor',
  pago: 'aviso de pago',
  envases: 'devolución de envases',
  saludo: 'saludo',
  cierre: 'cierre (no se respondería)',
  desconocido: 'no lo entendí',
};

const NOMBRE_ACCION: Readonly<Record<string, string>> = {
  escalar: 'derivar a una persona',
  preguntar_tipo: 'preguntaría de qué tamaño',
  preguntar_cantidad: 'preguntaría cuántos',
  preguntar_pedido: 'preguntaría qué quiere pedir',
};

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

/** "lunes 2 de noviembre" para una fecha YYYY-MM-DD. */
export function fechaEnPalabras(fecha: string): string {
  const [, mes = 1, dia = 1] = fecha.split('-').map(Number);
  return `${DIAS[diaSemana(fecha)]} ${dia} de ${MESES[mes - 1]}`;
}

/**
 * "entrega propuesta lunes 2 de noviembre". Entre paréntesis dice por qué no es el día pedido y si los
 * feriados no están al día, porque en ese caso la fecha puede fallar.
 */
export function describirEntrega(entrega: PropuestaEntrega): string {
  const avisos: string[] = [];
  if (entrega.motivoAjuste === 'sin_despacho') avisos.push(`pidió ${entrega.pedida}: ese día no hay despacho`);
  if (entrega.motivoAjuste === 'muy_pronto') avisos.push(`pidió ${entrega.pedida}: no alcanza`);
  if (entrega.motivoAjuste === 'no_entendida') avisos.push(`no entendí la fecha "${entrega.pedida}"`);
  if (!entrega.feriadosAlDia) avisos.push('feriados sin cargar');
  const texto = `entrega propuesta ${entrega.mismoDia ? 'hoy ' : ''}${fechaEnPalabras(entrega.fecha)}`;
  return avisos.length > 0 ? `${texto} (${avisos.join('; ')})` : texto;
}

export function describirInterpretacion(interpretacion: Interpretacion, conIa = false, entrega?: PropuestaEntrega): string {
  const partes = [`Modo prueba. Entendí: ${NOMBRE_INTENCION[interpretacion.intencion]}`];
  if (interpretacion.tipo_pregunta) partes.push(`sobre ${interpretacion.tipo_pregunta}`);
  for (const item of interpretacion.items) {
    const tipo = item.tipo === 'no_especificado' ? 'sin tamaño' : item.tipo.replace('L', ' L');
    partes.push(`${item.cantidad ?? '?'} de ${tipo}`);
  }
  if (interpretacion.envases_a_retirar) partes.push(`${interpretacion.envases_a_retirar} envases`);
  if (interpretacion.fecha_texto) partes.push(`para ${interpretacion.fecha_texto}`);
  if (interpretacion.comuna_mencionada) partes.push(`comuna ${interpretacion.comuna_mencionada}`);
  if (interpretacion.accion) partes.push(NOMBRE_ACCION[interpretacion.accion] ?? interpretacion.accion);
  if (entrega) partes.push(describirEntrega(entrega));
  if (conIa) partes.push('(con IA)');
  return partes.join(' · ');
}
