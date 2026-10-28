/**
 * Texto con lo que el intérprete entendió. Se usa en modo prueba: el bot responde esto en vez de
 * repetir el mensaje, para poder revisar cómo interpreta mensajes reales antes de armar el flujo
 * de pedido (Etapa 4).
 */

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

export function describirInterpretacion(interpretacion: Interpretacion): string {
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
  return partes.join(' · ');
}
