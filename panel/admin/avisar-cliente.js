/**
 * "Avisar al cliente" (D99): cuando la oficina cancela o cambia un pedido en el panel, el bot no le escribe al cliente
 * (un mensaje más por pedido y, fuera de las 24 horas, una plantilla pagada). En su lugar, el panel arma el texto y abre
 * el chat de ese cliente en WhatsApp con el texto listo: la persona lo revisa, lo cambia si quiere y lo envía desde la
 * app del negocio, sin costo.
 *
 * Solo funciones puras (texto y enlace), para probarlas sin navegador. Las fechas y los bidones llegan ya en palabras.
 */

/** "Ana Pérez" -> "Ana". Sin nombre, se saluda sin nombre. */
function primerNombre(nombre) {
  const primero = String(nombre ?? '').trim().split(/\s+/)[0] ?? '';
  return primero ? ` ${primero}` : '';
}

/** El texto para avisar que se canceló el pedido. No dice el motivo: el motivo es una nota interna. */
export function textoDeCancelacion({ nombre, bidones, fecha }) {
  return `Hola${primerNombre(nombre)}, te escribimos de Brunen. Tu pedido${bidones ? ` de ${bidones}` : ''} para el ${fecha} quedó cancelado. Si quieres volver a pedir, escríbenos por aquí.`;
}

/**
 * El texto para avisar un cambio. Solo nombra lo que el cliente nota: el día, los bidones y el total. Si no cambió
 * ninguno de ellos (una nota para el repartidor, el pago), devuelve '' y no se ofrece avisar.
 */
export function textoDeCambio({ nombre, antes, despues }) {
  const partes = [];
  if (despues.bidones !== antes.bidones) partes.push(`ahora es de ${despues.bidones}`);
  if (despues.fecha !== antes.fecha) partes.push(`se entrega el ${despues.fecha}`);
  if (despues.total !== antes.total && despues.total) partes.push(`el total queda en ${despues.total}`);
  if (partes.length === 0) return '';
  const lista = partes.length === 1 ? partes[0] : `${partes.slice(0, -1).join(', ')} y ${partes.at(-1)}`;
  return `Hola${primerNombre(nombre)}, te escribimos de Brunen. Cambiamos tu pedido: ${lista}. Si algo no te calza, respóndenos por aquí.`;
}

/** El chat del cliente con el texto listo, o null si no hay un teléfono que sirva. */
export function enlaceParaAvisar(telefono, texto) {
  const digitos = String(telefono ?? '').replace(/\D/g, '');
  if (digitos.length < 8 || !texto) return null;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}
