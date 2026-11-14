/**
 * Cierre del día (fase G, D64): lo que el repartidor debería traer y lo que trae, a partir de lo que marcó en su teléfono.
 * Hoy esto se cuadra a mano al final del turno; aquí queda listo en la pestaña Reparto.
 *
 * Solo suma lo que ya está en la base: lo que cobró en efectivo al entregar (D61), los vacíos que retiró y los pedidos que
 * no se pudieron entregar. No decide nada: si algo no cuadra, lo mira una persona.
 */

import type { EstadoDeEntrega } from './entregas';
import type { TipoBidon } from './precios';
import type { ParadaDeReparto, RepartoDelDia } from './reparto';
import type { PedidoGuardado } from './repositorio';

export interface CierreDelDia {
  paradas: number;
  entregadas: number;
  noSePudo: number;
  pendientes: number;
  /** Bidones dejados en las paradas ya entregadas, por tamaño. */
  bidonesEntregados: Record<TipoBidon, number>;
  efectivo: {
    /** Lo que suman los pedidos en efectivo de ese día que tienen precio. */
    esperado: number;
    /** Lo que el repartidor marcó como cobrado. */
    cobrado: number;
    /** Entregados en efectivo que no marcó como cobrados: hay que preguntarle. */
    entregadosSinCobrar: number;
    /** Pedidos en efectivo sin precio: el esperado no los incluye. */
    sinPrecio: number;
  };
  vacios: {
    esperados: number;
    retirados: number;
    /** Paradas entregadas donde retiró menos vacíos de los que había que retirar. */
    paradasConFaltante: number;
  };
}

const VACIO: Record<TipoBidon, number> = { '10L': 0, '12L': 0, '20L': 0 };

export function cierreDelDia(reparto: RepartoDelDia, pedidos: readonly PedidoGuardado[], entregas: ReadonlyMap<string, EstadoDeEntrega>): CierreDelDia {
  const pedidoDe = new Map(pedidos.map((p) => [p.id, p]));
  const cierre: CierreDelDia = {
    paradas: reparto.paradas.length,
    entregadas: 0,
    noSePudo: 0,
    pendientes: 0,
    bidonesEntregados: { ...VACIO },
    efectivo: { esperado: 0, cobrado: 0, entregadosSinCobrar: 0, sinPrecio: 0 },
    vacios: { esperados: 0, retirados: 0, paradasConFaltante: 0 },
  };
  for (const parada of reparto.paradas) {
    const entrega = entregas.get(parada.idPedido);
    const entregada = parada.estado === 'Entregado';
    if (entregada) cierre.entregadas++;
    else if (entrega?.noEntregado) cierre.noSePudo++;
    else cierre.pendientes++;

    if (entregada) sumarBidones(cierre.bidonesEntregados, parada);
    cierre.vacios.esperados += parada.envasesARetirar;
    if (entrega?.vaciosRetirados !== null && entrega?.vaciosRetirados !== undefined) {
      cierre.vacios.retirados += entrega.vaciosRetirados;
      if (entregada && entrega.vaciosRetirados < parada.envasesARetirar) cierre.vacios.paradasConFaltante++;
    }

    if (entrega?.cobrado) cierre.efectivo.cobrado += entrega.cobrado;
    if (pedidoDe.get(parada.idPedido)?.formaPago !== 'efectivo') continue;
    if (parada.total === null) cierre.efectivo.sinPrecio++;
    else cierre.efectivo.esperado += parada.total;
    if (entregada && !entrega?.cobrado && pedidoDe.get(parada.idPedido)?.estadoPago !== 'pagado') cierre.efectivo.entregadosSinCobrar++;
  }
  return cierre;
}

function sumarBidones(suma: Record<TipoBidon, number>, parada: ParadaDeReparto): void {
  for (const tipo of Object.keys(suma) as TipoBidon[]) suma[tipo] += parada.bidones[tipo] ?? 0;
}
