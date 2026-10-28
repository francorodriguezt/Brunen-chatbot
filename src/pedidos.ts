/**
 * Pedido listo para anotar en la hoja PEDIDOS (Etapa 4). Aquí solo se arma la fila; escribirla en la
 * planilla es `ClienteSheets.agregarFilas('PEDIDOS', ...)`.
 *
 * Decisiones (D26): una fila por producto, todas con el mismo ID_Pedido, y la columna Total lleva el
 * subtotal de esa línea (el total del pedido se suma por ID). Las notas, los envases por retirar y las
 * observaciones van solo en la primera fila, para que no se cuenten dos veces. La fecha que propone
 * el bot va en Fecha_Entrega_Solicitada; Fecha_Entrega_Confirmada la llena la operadora.
 */

import type { TipoBidon } from './precios';

export const COLUMNAS_PEDIDOS = [
  'ID_Pedido', 'Fecha_Hora', 'Telefono', 'Nombre', 'Producto', 'Cantidad', 'Precio_Unitario', 'Total',
  'Fecha_Entrega_Solicitada', 'Fecha_Entrega_Confirmada', 'Estado', 'Comuna', 'Direccion', 'Notas_Repartidor',
  'Envases_A_Retirar', 'Confirmado_Por', 'Observaciones',
] as const;

export type EstadoPedido = 'Pendiente_Confirmacion' | 'Fuera_de_zona';

export interface LineaPedido {
  tipo: TipoBidon;
  cantidad: number;
  /** null cuando el precio no se pudo calcular con seguridad: lo completa la operadora. */
  precioUnitario: number | null;
  subtotal: number | null;
}

export interface PedidoARegistrar {
  idPedido: string;
  /** "YYYY-MM-DD HH:MM" en la hora de Santiago. */
  fechaHora: string;
  telefono: string;
  nombre: string;
  lineas: readonly LineaPedido[];
  /** Fecha de entrega que propone el bot (YYYY-MM-DD). */
  fechaEntrega: string;
  estado: EstadoPedido;
  comuna: string;
  direccion: string;
  notasRepartidor: string;
  envasesARetirar: number;
  observaciones: string;
}

/**
 * ID legible y estable: "P261028-3K7Q9" (año, mes y día del pedido, y 5 caracteres sacados del wamid).
 * Como sale del wamid, si Meta reintenta el mismo mensaje se genera el mismo ID y se nota el duplicado.
 */
export function generarIdPedido(wamid: string, fechaLocal: string): string {
  let hash = 0x811c9dc5; // FNV-1a de 32 bits
  for (let i = 0; i < wamid.length; i++) {
    hash ^= wamid.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  const sufijo = (hash >>> 0).toString(36).toUpperCase().padStart(7, '0').slice(-5);
  return `P${fechaLocal.slice(2, 4)}${fechaLocal.slice(5, 7)}${fechaLocal.slice(8, 10)}-${sufijo}`;
}

const nombreProducto = (tipo: TipoBidon): string => `Bidón ${tipo.replace('L', ' L')}`;

/** Una fila por producto, en el orden de las columnas de la hoja. */
export function filasDePedido(pedido: PedidoARegistrar): Array<Array<string | number>> {
  return pedido.lineas.map((linea, i) => {
    const primera = i === 0;
    return [
      pedido.idPedido,
      pedido.fechaHora,
      pedido.telefono,
      pedido.nombre,
      nombreProducto(linea.tipo),
      linea.cantidad,
      linea.precioUnitario ?? '',
      linea.subtotal ?? '',
      pedido.fechaEntrega,
      '', // Fecha_Entrega_Confirmada: la llena la operadora
      pedido.estado,
      pedido.comuna,
      pedido.direccion,
      primera ? pedido.notasRepartidor : '',
      primera && pedido.envasesARetirar > 0 ? pedido.envasesARetirar : '',
      '', // Confirmado_Por
      primera ? pedido.observaciones : '',
    ];
  });
}
