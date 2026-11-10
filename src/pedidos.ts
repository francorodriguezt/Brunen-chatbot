/**
 * El pedido tal como lo arma el motor (Etapa 4) para guardarlo en D1 (`repositorio.ts`), donde lo ve el panel.
 * Las notas, los envases por retirar y las observaciones son del pedido completo; cada línea lleva su precio.
 * La fecha que propone el bot va en `fechaEntrega`; la fecha confirmada la pone una persona en el panel.
 */

import type { TipoBidon } from './precios';

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
 * Lo que se sabe de un cliente sin ficha en CLIENTES por su último pedido con dirección (D40): con esto el bot lo
 * reconoce y no le vuelve a preguntar su nombre y su dirección.
 */
export interface DatosPrevios {
  /** El pedido del que salen los datos. */
  idPedido: string;
  nombre: string;
  direccion: string;
  comuna: string;
  notasRepartidor: string;
}

/** Lo que el bot agrega a un pedido ya anotado cuando el cliente le da sus datos (D37). */
export interface CompletarPedido {
  idPedido: string;
  /** El nombre, la dirección y la comuna solo se llenan si el pedido los tiene vacíos: nunca se pisa lo que escribió una persona. */
  nombre?: string;
  direccion?: string;
  comuna?: string;
  /** Se agrega al final de las notas del repartidor. */
  notasRepartidor?: string;
  /** Se agrega al final de las observaciones. */
  observacion?: string;
  /** Solo cambia un pedido que seguía pendiente de confirmar. */
  estado?: 'Fuera_de_zona';
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
