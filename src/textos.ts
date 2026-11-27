/**
 * Textos que el bot le escribe al cliente (Etapa 4). Son BORRADORES para que el dueño los apruebe
 * (docs/PENDIENTES.md): el tono y las frases se ajustan aquí, en un solo lugar.
 *
 * Reglas de redacción: una sola respuesta por mensaje del cliente (el cupo gratis de WhatsApp es de
 * 1.000 al mes), cercana y breve, sin inventar datos: horarios, comunas y precios salen del documento
 * de conocimiento o de las hojas, nunca de la memoria del modelo.
 */

import { COMUNAS_ATENDIDAS, esComunaAtendida } from './comunas';
import { diaSemana, fechaHoraLocal } from './despacho';
import { fechaEnPalabras } from './fechas';
import type { PropuestaEntrega } from './entrega';
import type { EstadoDeMiPedido } from './llegada';
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

/** A un cliente conocido que escribe "quiero pedir" sin detalle (D69): su último pedido, para que conteste solo "sí". */
export const ofrecerLoDeSiempre = (lineas: readonly Pick<LineaTexto, 'tipo' | 'cantidad'>[]): string =>
  `¿Te mandamos lo de siempre: ${resumenLineas(lineas)}? Responde «sí», o dime qué necesitas.`;

export const repetirSinHistorial = (): string =>
  'No tengo anotado tu último pedido. ¿Cuántos bidones necesitas y de cuántos litros (20, 12 o 10)?';

export const imagenRecibida = (): string => 'Recibimos tu imagen. Una persona del equipo la revisará.';

/** "12:05", en la hora de Santiago. */
function horaDeSantiago(segundos: number): string {
  const { hora, minuto } = fechaHoraLocal(new Date(segundos * 1000));
  return `${hora}:${String(minuto).padStart(2, '0')}`;
}

/**
 * "¿Cuándo llega?" de un cliente con pedido (D78). Dice en qué está; una hora solo como ventana aproximada y solo cuando
 * va en camino a su dirección (D80).
 */
export function estadoDeMiPedido(estado: EstadoDeMiPedido): string {
  switch (estado.tipo) {
    case 'agendado':
      return `Tu pedido está agendado para el ${fechaEnPalabras(estado.fecha)}. Si algo cambia, te avisamos por aquí.`;
    case 'por_confirmar':
      return `Tu pedido para el ${fechaEnPalabras(estado.fecha)} está anotado y una persona del equipo lo está confirmando.`;
    case 'entregado':
      return 'Según nuestro registro, tu pedido de hoy ya se entregó. Si no lo recibiste, escríbenos y lo revisamos de inmediato.';
    case 'en_reparto':
      if (estado.antes === null) return 'Tu pedido va en el reparto de hoy. Si algo cambia, te avisamos por aquí.';
      if (estado.antes === 0 && estado.ventana) {
        return `Tu pedido va en camino: eres la próxima entrega y llegaría entre las ${horaDeSantiago(estado.ventana.desde)} y las ${horaDeSantiago(estado.ventana.hasta)}, aprox.`;
      }
      if (estado.antes === 0) return 'Tu pedido va en el reparto de hoy y eres la próxima entrega.';
      return `Tu pedido va en el reparto de hoy: antes del tuyo quedan ${estado.antes} ${estado.antes === 1 ? 'entrega' : 'entregas'}.`;
  }
}

/** La ubicación que compartió el cliente (D77): queda para que el repartidor llegue directo. */
export const ubicacionRecibida = (): string => '¡Gracias! Guardamos tu ubicación para que el repartidor llegue directo.';

/** Un documento: los bancos chilenos suelen compartir el comprobante de transferencia en PDF. */
export const archivoRecibido = (): string => 'Recibimos tu archivo. Una persona del equipo lo revisará.';

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

/**
 * Lo que costaría lo que preguntó (D95): su precio, el de su ficha si tiene uno especial o es mayorista, y una oferta
 * para anotarlo con un "sí". A quien no tiene ficha se le aclara que es el precio de recarga.
 */
export function cotizacion(lineas: readonly LineaTexto[], total: number, recarga: boolean): string {
  const unitario = (l: LineaTexto) => (l.cantidad > 1 && l.subtotal !== null ? ` (${formatearCLP(l.subtotal / l.cantidad)} c/u)` : '');
  const [unica] = lineas;
  const filas =
    lineas.length === 1 && unica
      ? [`${itemTexto(unica)}: ${formatearCLP(unica.subtotal ?? 0)}${unitario(unica)}.`]
      : [...lineas.map((l) => `- ${itemTexto(l)}: ${formatearCLP(l.subtotal ?? 0)}`), `Total: ${formatearCLP(total)}.`];
  if (recarga) filas.push('Es el precio de recarga: si no tienes bidones para cambiar, se cobra la carga inicial y te confirmamos el valor.');
  const uno = lineas.reduce((suma, l) => suma + l.cantidad, 0) === 1;
  filas.push(`El despacho es gratis. ¿Te ${uno ? 'lo' : 'los'} anoto? Responde «sí».`);
  return filas.join('\n');
}

/** Después de contestar una pregunta en la que nombró bidones (D95). */
export const ofrecerAnotar = (lineas: readonly Pick<LineaTexto, 'tipo' | 'cantidad'>[]): string => `¿Te anoto ${resumenLineas(lineas)}? Responde «sí».`;

/** Respuesta corta a "¿a qué hora llegan?" dentro de la respuesta de un pedido (D95). Despacho: conocimiento, sección 6. */
export const horarioDelReparto = (): string => 'Repartimos entre las 10:00 y las 18:00 (los sábados hasta las 15:00); no podemos darte una hora exacta.';

/** "¿Cómo pago?" dentro de la respuesta de un pedido (D95). Pagos: conocimiento, sección 7. Los datos los envía una persona. */
export const comoPagar = (datosDeTransferencia = ''): string =>
  datosDeTransferencia
    ? `Puedes pagar en efectivo al recibir o por transferencia, antes o después de la entrega.\nDatos para transferir:\n${datosDeTransferencia}\nSi transfieres, envíanos el comprobante por aquí.`
    : 'Puedes pagar en efectivo al recibir o por transferencia, antes o después de la entrega. Si quieres transferir, te enviamos los datos.';

/** "¿Hay un mínimo de pedido?" (respuesta 43 de Franco, 2026-11-27: no hay). */
export const sinMinimo = (): string => 'No hay mínimo de pedido: puedes pedir desde 1 bidón. El despacho es gratis.';

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

/** Lo que se le muestra al cliente de su dirección como máximo (D57). */
const MAXIMO_DIRECCION_VISIBLE = 80;

/**
 * "Calle 1" y "Ñuñoa" → "Calle 1, Ñuñoa"; si la comuna ya viene escrita en la dirección, no se repite. Lo que va entre
 * paréntesis no se muestra: en el Excel histórico a veces se anotaban notas internas junto a la dirección (D57).
 */
function lugarDeEntrega(direccion = '', comuna = ''): string {
  const visible = direccion.split('(')[0] ?? '';
  const corta = visible.length > MAXIMO_DIRECCION_VISIBLE ? visible.slice(0, MAXIMO_DIRECCION_VISIBLE).replace(/\s+\S*$/, '') : visible;
  const d = corta.trim().replace(/[\s,.]+$/, '');
  if (!d) return '';
  const c = comuna.trim();
  const sinTildes = (t: string) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  return c && !sinTildes(d).includes(sinTildes(c)) ? `${d}, ${c}` : d;
}

export function pedidoAnotado(datos: {
  lineas: readonly LineaTexto[];
  /** Solo si el precio es seguro; si no, se avisa que lo confirma una persona. */
  total: number | null;
  entrega: PropuestaEntrega;
  /** false si la fecha puede estar mal (feriados sin cargar, fecha pedida que no se entendió). */
  fechaSegura: boolean;
  /**
   * Dónde se va a entregar, cuando el bot ya la conoce (ficha o pedido anterior). Se muestra para que el cliente que
   * se cambió de casa lo note en el mismo mensaje (el 14 % de los clientes del Excel se mudó alguna vez, D55).
   */
  direccion?: string;
  comuna?: string;
  /** La respuesta a lo que además preguntó (D95), antes del cierre. */
  extra?: string;
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
      const { fechaPedida, motivoSinReparto } = datos.entrega;
      // Un día marcado en el panel (D74) lleva su motivo, escrito para el cliente.
      const razon =
        fechaPedida && motivoSinReparto !== undefined
          ? `El ${fechaEnPalabras(fechaPedida)} no hay reparto${motivoSinReparto ? ` (${motivoSinReparto})` : ''}`
          : fechaPedida && diaSemana(fechaPedida) === 0
            ? 'Los domingos no despachamos'
            : 'Ese día es feriado y no despachamos';
      partes.push(`${razon}; la entrega más cercana es el ${fecha}.`);
    }
    else if (datos.entrega.motivoAjuste === 'muy_pronto') partes.push(`Para ese día ya no alcanzamos; la entrega más cercana es ${fecha}.`);
    else partes.push(`Entrega estimada: ${fecha}.`);
  }
  const lugar = lugarDeEntrega(datos.direccion, datos.comuna);
  if (lugar) partes.push(`Entrega en: ${lugar}. Si cambiaste de dirección, escríbenos la nueva.`);
  if (datos.extra) partes.push(datos.extra);
  partes.push('Si algo cambia, te avisamos por aquí.');
  return partes.join('\n');
}

/** Cliente sin ficha: se anota el pedido y, en un solo mensaje, se le pide lo que falta para coordinar la entrega (D37). */
export function pedirDatos(lineas: readonly Pick<LineaTexto, 'tipo' | 'cantidad'>[]): string {
  const pedido = lineas.map(itemTexto).join(' y ');
  return `¡Hola! Anotamos tu pedido de ${pedido}. Para coordinar la entrega, ¿me dices tu nombre y tu dirección con comuna? Si es departamento, también el edificio y el número.`;
}

export const pedirDatosDeNuevo = (): string => 'No alcancé a entender tu dirección. ¿Me la escribes con calle, número y comuna?';

export const datosRecibidos = (): string => 'Gracias, anotamos tu dirección. Una persona del equipo confirmará tu pedido.';

export const datosRecibidosPedirEdificio = (): string =>
  'Gracias, anotamos tu dirección. ¿Cómo se llama el edificio? Una persona del equipo confirmará tu pedido.';

/** Resumen de las líneas para las alertas internas: "2 bidones de 20 L y 1 bidón de 12 L". */
export const resumenLineas = (lineas: readonly Pick<LineaTexto, 'tipo' | 'cantidad'>[]): string => lineas.map(itemTexto).join(' y ');
