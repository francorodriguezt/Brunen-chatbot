/**
 * "¿Cuándo llega?" (D78): el dueño necesita poder responderle a un cliente cuándo llega su pedido (conocimiento §16).
 * Si el cliente tiene un pedido vivo, el bot le dice en qué está: agendado para tal día, por confirmar, en el reparto de
 * hoy (y, si la ruta está publicada, cuántas entregas quedan antes de la suya) o ya entregado. Nunca promete una hora.
 * Sin pedido vivo, sigue la respuesta de siempre (los horarios de despacho).
 */

import type { BaseDatos } from './almacen';
import { armarReparto } from './reparto';
import { RepositorioD1, type EstadoDePedido } from './repositorio';
import { estimarElDia } from './seguimiento';
import { preparar } from './texto';

export type EstadoDeMiPedido =
  | { tipo: 'agendado'; fecha: string }
  | { tipo: 'por_confirmar'; fecha: string }
  /** `antes`: entregas que faltan antes de la suya en la ruta publicada; null si la ruta no está publicada. */
  /**
   * `ventana` (D80): solo cuando su parada es la que sigue (el repartidor va en camino a su dirección) y hay una
   * referencia reciente. Segundos Unix.
   */
  | { tipo: 'en_reparto'; antes: number | null; ventana?: { desde: number; hasta: number } }
  | { tipo: 'entregado' };

// "¿cuándo llega?", "¿a qué hora llegan?", "¿ya viene?", "¿falta mucho?", "¿por dónde va el repartidor?". A propósito
// no incluye "no llegó" / "no ha llegado": eso es un reclamo y lo atiende una persona por el camino de siempre.
const NO_LLEGO = /\b(?:no|nunca|todavia no|aun no) (?:me )?(?:ha |han )?(?:llego|llegaron|llegado|llega|llegan|vino|vinieron|trajeron)\b/;
const PREGUNTA_LLEGADA = new RegExp(
  [
    String.raw`\b(?:cuando|a que hora|que hora) (?:llega|llegan|llegaria|llegarian|viene|vienen|pasa|pasan|me (?:llega|traen|lo traen))\b`,
    String.raw`\bya (?:viene|vienen|salio|salieron|va en camino|vienen en camino)\b`,
    String.raw`\bfalta (?:mucho|poco|harto)\b`,
    String.raw`\b(?:donde|por donde) (?:viene|va|anda|esta) (?:el |mi )?(?:repartidor|pedido|camion|camioneta|furgon)\b`,
    String.raw`\b(?:mi )?pedido (?:llega|viene)\b`,
    String.raw`\ben camino\b`,
  ].join('|'),
);

/** true si el mensaje pregunta por la llegada de su pedido. No mira si tiene uno: eso lo decide quien llama. */
export function preguntaPorLlegada(texto: string): boolean {
  const t = preparar(texto).replace(/[?¿!.,]/g, ' ').replace(/\s+/g, ' ');
  return PREGUNTA_LLEGADA.test(t) && !NO_LLEGO.test(t);
}

const VIVOS: ReadonlySet<EstadoDePedido> = new Set(['Pendiente_Confirmacion', 'Fuera_de_zona', 'Confirmado', 'En_Ruta']);

/** El pedido más próximo de ese teléfono (de hoy en adelante, o entregado hoy) y en qué está. null si no tiene. */
export async function estadoDeMiPedido(
  db: BaseDatos,
  telefono: string,
  hoy: string,
  ahoraSegundos: number = Math.floor(Date.now() / 1000),
): Promise<EstadoDeMiPedido | null> {
  const r = await db
    .prepare(
      `SELECT id, estado, COALESCE(fecha_confirmada, fecha_entrega) AS fecha FROM pedidos
       WHERE telefono = ?1 AND COALESCE(fecha_confirmada, fecha_entrega) >= ?2 AND estado != 'Cancelado'
       ORDER BY COALESCE(fecha_confirmada, fecha_entrega), creado_en LIMIT 10`,
    )
    .bind(telefono, hoy)
    .run();
  const filas = (r.results ?? []) as Array<{ id: string; estado: EstadoDePedido; fecha: string }>;
  // Primero lo que sigue vivo; un pedido de hoy ya entregado solo cuenta si no queda otro.
  const vivo = filas.find((f) => VIVOS.has(f.estado));
  if (!vivo) return filas.some((f) => f.estado === 'Entregado' && f.fecha === hoy) ? { tipo: 'entregado' } : null;
  if (vivo.estado === 'Pendiente_Confirmacion' || vivo.estado === 'Fuera_de_zona') return { tipo: 'por_confirmar', fecha: vivo.fecha };
  if (vivo.fecha !== hoy) return { tipo: 'agendado', fecha: vivo.fecha };

  // Es de hoy y está confirmado o en ruta: cuántas entregas quedan antes, solo si hay una ruta publicada (si no, el
  // orden de la lista es por comuna y no dice nada de cuándo pasa el repartidor).
  const reparto = armarReparto(await new RepositorioD1(db).pedidosDelDia(hoy), hoy);
  const mia = reparto.paradas.find((p) => p.idPedido === vivo.id);
  if (!reparto.publicada || !mia) return { tipo: 'en_reparto', antes: null };
  const antes = reparto.paradas.filter((p) => p.orden < mia.orden && p.estado !== 'Entregado').length;
  if (antes > 0) return { tipo: 'en_reparto', antes };
  // Es la siguiente: va en camino a su dirección. Solo entonces se da una hora (Franco, 2026-11-18), si se puede estimar.
  const estimacion = await estimarElDia(db, hoy, ahoraSegundos);
  const suya = estimacion.siguiente === vivo.id ? estimacion.llegadas.get(vivo.id) : undefined;
  return suya ? { tipo: 'en_reparto', antes, ventana: { desde: suya.desde, hasta: suya.hasta } } : { tipo: 'en_reparto', antes };
}
