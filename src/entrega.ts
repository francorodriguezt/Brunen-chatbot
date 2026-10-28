/**
 * Fecha de entrega que el bot propone, usando los feriados de la hoja FERIADOS (D25).
 *
 * Une `cargarFeriados` (lee la hoja, con caché) con `calcularFechaEntrega` (reglas de despacho).
 * Constanza confirma: esto es una propuesta. El flujo de pedido (Etapa 4) debe avisar a una persona
 * cuando `feriadosAlDia` es false, porque la fecha pudo calcularse sin conocer todos los feriados.
 */

import { calcularFechaEntrega, type FechaEntrega } from './despacho';
import { cargarFeriados, type EntornoFeriados } from './feriados';

export interface PropuestaEntrega extends FechaEntrega {
  /**
   * false si la hoja está vacía o no tiene ningún feriado del año de la entrega propuesta:
   * hay que cargar los del año nuevo (con la lista de 2027 cargada, esto ocurre desde el 31 de diciembre de 2027).
   */
  feriadosAlDia: boolean;
}

export async function proponerEntrega(
  env: EntornoFeriados,
  instante: Date = new Date(),
  cargar: (env: EntornoFeriados, ahoraSegundos: number) => Promise<ReadonlySet<string>> = cargarFeriados,
): Promise<PropuestaEntrega> {
  const feriados = await cargar(env, Math.floor(instante.getTime() / 1000));
  const entrega = calcularFechaEntrega(instante, { feriados });
  const ano = entrega.fecha.slice(0, 4);
  return { ...entrega, feriadosAlDia: [...feriados].some((feriado) => feriado.startsWith(ano)) };
}
