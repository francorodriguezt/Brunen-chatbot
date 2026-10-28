/**
 * Fecha de entrega que el bot propone, usando los feriados de la hoja FERIADOS (D25).
 *
 * Une `cargarFeriados` (lee la hoja, con caché) con las reglas de despacho (`despacho.ts`) y, si el
 * cliente pidió un día, con `resolverFechaTexto`. Constanza confirma: esto es una propuesta. El flujo
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
}

export interface OpcionesEntrega {
  /** Día que pidió el cliente ("viernes", "15 de noviembre"), tal como lo devuelve `extraerFecha`. */
  solicitada?: string;
  /** Para pruebas: reemplaza la lectura de la hoja FERIADOS. */
  cargar?: (env: EntornoHojas, ahoraSegundos: number) => Promise<ReadonlySet<string>>;
}

export async function proponerEntrega(
  env: EntornoHojas,
  instante: Date = new Date(),
  opciones: OpcionesEntrega = {},
): Promise<PropuestaEntrega> {
  const cargar = opciones.cargar ?? cargarFeriados;
  const feriados = await cargar(env, Math.floor(instante.getTime() / 1000));
  const hoy = fechaHoraLocal(instante).fecha;
  const masTemprana = calcularFechaEntrega(instante, { feriados }).fecha;

  let fecha = masTemprana;
  let motivoAjuste: MotivoAjuste | undefined;
  let fechaPedida: string | undefined;
  if (opciones.solicitada) {
    const pedida = resolverFechaTexto(opciones.solicitada, hoy);
    if (!pedida) {
      motivoAjuste = 'no_entendida';
    } else if (pedida < masTemprana) {
      motivoAjuste = 'muy_pronto';
    } else if (esDiaDespacho(pedida, feriados)) {
      fecha = pedida;
    } else {
      fecha = siguienteDiaDespacho(pedida, feriados);
      motivoAjuste = 'sin_despacho';
      fechaPedida = pedida;
    }
  }

  const ano = fecha.slice(0, 4);
  return {
    fecha,
    mismoDia: fecha === hoy,
    feriadosAlDia: [...feriados].some((feriado) => feriado.startsWith(ano)),
    ...(opciones.solicitada && { pedida: opciones.solicitada }),
    ...(motivoAjuste && { motivoAjuste }),
    ...(fechaPedida && { fechaPedida }),
  };
}
