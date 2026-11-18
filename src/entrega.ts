/**
 * Fecha de entrega que el bot propone, usando los feriados de la hoja FERIADOS (D25).
 *
 * Une `cargarFeriados` (lee la hoja, con caché) con las reglas de despacho (`despacho.ts`) y, si el
 * cliente pidió un día, con `resolverFechaTexto`. La operadora confirma: esto es una propuesta. El flujo
 * de pedido (Etapa 4) debe avisar a una persona cuando `feriadosAlDia` es false, porque la fecha pudo
 * calcularse sin conocer todos los feriados.
 *
 * Regla 7 del bot: si el día pedido no se puede (ya pasó el corte, es domingo o feriado), se propone
 * el siguiente día de despacho y se explica por qué en `motivoAjuste`.
 */

import { calcularFechaEntrega, esDiaDespacho, fechaHoraLocal, siguienteDiaDespacho, type FechaEntrega } from './despacho';
import { cargarFeriados } from './feriados';
import { resolverFechaTexto } from './fechas';
import type { EntornoHojas } from './hojas';

export type MotivoAjuste =
  /** El día pedido es anterior al primero posible (por ejemplo "hoy" después de las 9:00). */
  | 'muy_pronto'
  /** El día pedido es domingo o feriado: no se despacha. */
  | 'sin_despacho'
  /** No se entendió qué día pidió el cliente. */
  | 'no_entendida';

export interface PropuestaEntrega extends FechaEntrega {
  /**
   * false si la hoja está vacía o no tiene ningún feriado del año de la entrega propuesta:
   * hay que cargar los del año nuevo (con la lista de 2027 cargada, esto ocurre desde el 31 de diciembre de 2027).
   */
  feriadosAlDia: boolean;
  /** Lo que pidió el cliente, tal como lo dijo, cuando pidió un día. */
  pedida?: string;
  /** Presente cuando la fecha propuesta no es la que pidió el cliente. */
  motivoAjuste?: MotivoAjuste;
  /** Con `sin_despacho`: el día que pidió, ya como fecha, para poder decir si es domingo o feriado. */
  fechaPedida?: string;
  /**
   * Con `sin_despacho`: el día que se saltó es uno de los marcados en el panel (D74), con este motivo para el cliente
   * (puede venir vacío). Sin pedir día también se avisa, si el primer día posible estaba cerrado.
   */
  motivoSinReparto?: string;
}

export interface OpcionesEntrega {
  /** Día que pidió el cliente ("viernes", "15 de noviembre"), tal como lo devuelve `extraerFecha`. */
  solicitada?: string;
  /** Para pruebas: reemplaza la lectura de la hoja FERIADOS. */
  cargar?: (env: EntornoHojas, ahoraSegundos: number) => Promise<ReadonlySet<string>>;
  /** Los días que se marcaron sin reparto en el panel (D74): fecha -> motivo. */
  diasSinReparto?: ReadonlyMap<string, string>;
}

export async function proponerEntrega(
  env: EntornoHojas,
  instante: Date = new Date(),
  opciones: OpcionesEntrega = {},
): Promise<PropuestaEntrega> {
  const cargar = opciones.cargar ?? cargarFeriados;
  const feriadosDeLaHoja = await cargar(env, Math.floor(instante.getTime() / 1000));
  const cerrados = opciones.diasSinReparto ?? new Map<string, string>();
  // Un día sin reparto se salta igual que un feriado; la hoja sigue siendo la que dice si los feriados están al día.
  const feriados: ReadonlySet<string> = cerrados.size > 0 ? new Set([...feriadosDeLaHoja, ...cerrados.keys()]) : feriadosDeLaHoja;
  const hoy = fechaHoraLocal(instante).fecha;
  const masTemprana = calcularFechaEntrega(instante, { feriados }).fecha;
  // El primer día posible si no hubiera días cerrados: pedir antes de este es "ya no alcanzamos"; pedir un día cerrado
  // que viene después es "ese día no hay reparto" (si no, el cliente oiría que no alcanza, cuando el día está cerrado).
  const sinCerrar = cerrados.size > 0 ? calcularFechaEntrega(instante, { feriados: feriadosDeLaHoja }).fecha : masTemprana;

  let fecha = masTemprana;
  let motivoAjuste: MotivoAjuste | undefined;
  let fechaPedida: string | undefined;
  if (opciones.solicitada) {
    const pedida = resolverFechaTexto(opciones.solicitada, hoy);
    if (!pedida) {
      motivoAjuste = 'no_entendida';
    } else if (pedida < sinCerrar) {
      motivoAjuste = 'muy_pronto';
    } else if (esDiaDespacho(pedida, feriados)) {
      fecha = pedida;
    } else {
      const siguiente = siguienteDiaDespacho(pedida, feriados);
      fecha = siguiente > masTemprana ? siguiente : masTemprana;
      motivoAjuste = 'sin_despacho';
      fechaPedida = pedida;
    }
  } else if (cerrados.size > 0) {
    // Sin pedir día: si el primer día posible estaba cerrado, se le dice por qué la entrega es más tarde.
    if (sinCerrar !== masTemprana && cerrados.has(sinCerrar)) {
      motivoAjuste = 'sin_despacho';
      fechaPedida = sinCerrar;
    }
  }
  const motivoSinReparto = fechaPedida !== undefined && cerrados.has(fechaPedida) ? (cerrados.get(fechaPedida) ?? '') : undefined;

  const ano = fecha.slice(0, 4);
  return {
    fecha,
    mismoDia: fecha === hoy,
    feriadosAlDia: [...feriadosDeLaHoja].some((feriado) => feriado.startsWith(ano)),
    ...(opciones.solicitada && { pedida: opciones.solicitada }),
    ...(motivoAjuste && { motivoAjuste }),
    ...(fechaPedida && { fechaPedida }),
    ...(motivoSinReparto !== undefined && { motivoSinReparto }),
  };
}
