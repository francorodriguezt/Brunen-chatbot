/**
 * Lista del día para el repartidor (Etapa 6; prioridad 2 del dueño: "la lista del día en formato copiable
 * a la app de rutas"). Parte de las filas de PEDIDOS, junta las líneas de cada pedido y las ordena por
 * comuna y dirección, para que los vecinos queden juntos. La app de rutas (PENDIENTE: confirmar si es
 * OptimoRoute y su formato de importación) hace la optimización final.
 *
 * FORMATO PROVISIONAL: las columnas de la hoja RUTA_DEL_DIA y el texto copiable cambian cuando se conozca el
 * archivo de importación de la app. Solo arma datos; leer PEDIDOS y escribir RUTA_DEL_DIA queda para conectarlo.
 */

import { filasConEncabezado } from './hojas';

export const COLUMNAS_RUTA = ['Orden', 'Telefono', 'Nombre', 'Direccion', 'Comuna', 'Productos', 'Notas_Repartidor'] as const;

export interface ParadaDeRuta {
  orden: number;
  idPedido: string;
  telefono: string;
  nombre: string;
  direccion: string;
  comuna: string;
  /** "2x20 L, 1x12 L". */
  productos: string;
  /** Notas de la ficha, más los envases por retirar. */
  notas: string;
}

export interface OpcionesRuta {
  /** Estados que salen a reparto. La operadora confirma los pedidos: por defecto solo los confirmados. */
  estados?: readonly string[];
}

const ESTADOS_POR_DEFECTO = ['Confirmado'] as const;

/** "Bidón 20 L" -> "20 L". */
const litros = (producto: string): string => producto.replace(/^bid[oó]n\s*/i, '').trim();

/**
 * Filas de la hoja PEDIDOS (con encabezado) -> paradas de un día. La fecha que cuenta es la confirmada;
 * si todavía no se confirmó una fecha, la que propuso el bot.
 */
export function armarRuta(filasPedidos: string[][], fecha: string, opciones: OpcionesRuta = {}): ParadaDeRuta[] {
  const estados = new Set(opciones.estados ?? ESTADOS_POR_DEFECTO);
  const porPedido = new Map<string, ParadaDeRuta>();
  for (const fila of filasConEncabezado(filasPedidos)) {
    const dia = fila.fecha_entrega_confirmada || fila.fecha_entrega_solicitada;
    if (dia !== fecha || !estados.has(fila.estado ?? '') || !fila.id_pedido) continue;
    const producto = `${fila.cantidad ?? ''}x${litros(fila.producto ?? '')}`;
    const existente = porPedido.get(fila.id_pedido);
    if (existente) {
      existente.productos += `, ${producto}`;
      continue;
    }
    const envases = Number(fila.envases_a_retirar) > 0 ? `Retirar ${Number(fila.envases_a_retirar)} envase(s) vacío(s)` : '';
    porPedido.set(fila.id_pedido, {
      orden: 0,
      idPedido: fila.id_pedido,
      telefono: fila.telefono ?? '',
      nombre: fila.nombre ?? '',
      direccion: fila.direccion ?? '',
      comuna: fila.comuna ?? '',
      productos: producto,
      notas: [fila.notas_repartidor, envases].filter(Boolean).join('. '),
    });
  }
  const paradas = [...porPedido.values()].sort(
    (a, b) => a.comuna.localeCompare(b.comuna, 'es') || a.direccion.localeCompare(b.direccion, 'es') || a.idPedido.localeCompare(b.idPedido),
  );
  paradas.forEach((parada, i) => (parada.orden = i + 1));
  return paradas;
}

/** Filas para la hoja RUTA_DEL_DIA, en el orden de sus columnas. */
export function filasDeRuta(paradas: readonly ParadaDeRuta[]): Array<Array<string | number>> {
  return paradas.map((p) => [p.orden, p.telefono, p.nombre, p.direccion, p.comuna, p.productos, p.notas]);
}

/** Una línea por parada, lista para copiar y pegar: "1. Calle 123, Ñuñoa · Ana · 2x20 L · +56... · nota". */
export function textoDeRuta(paradas: readonly ParadaDeRuta[]): string {
  return paradas
    .map((p) => [`${p.orden}. ${p.direccion}, ${p.comuna}`, p.nombre, p.productos, `+${p.telefono}`, p.notas].filter(Boolean).join(' · '))
    .join('\n');
}
