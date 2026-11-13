/**
 * Lo que anota el repartidor en cada parada (fase D, D61): "Entregado", con los vacíos que retiró y si cobró, y
 * "No se pudo", con el motivo. Una parada es un pedido del día; los datos viven en el pedido (migración 0011).
 *
 * "No se pudo" no cambia el estado del pedido (no hay "Reprogramado"): queda abierto con su motivo y un aviso para
 * que una persona lo reagende o llame al cliente. Solo se aceptan pedidos de ese día: el repartidor no puede tocar
 * pedidos de otros días ni los que nadie confirmó.
 */

import type { BaseDatos } from './almacen';
import { fechaHoraLocal } from './despacho';
import { RepositorioD1, type EstadoDePedido, type PedidoGuardado } from './repositorio';

/** Motivos de "No se pudo", con el texto que ve el repartidor y que llega en el aviso. */
export const MOTIVOS_NO_ENTREGA = {
  no_estaba: 'No estaba o no contestó',
  direccion: 'No encontré la dirección',
  cerrado: 'Estaba cerrado',
  no_quiso: 'No quiso recibir',
  otro: 'Otro motivo',
} as const;

export type MotivoNoEntrega = keyof typeof MOTIVOS_NO_ENTREGA;

export type ErrorDeEntrega = 'no_existe' | 'no_es_de_hoy' | 'no_disponible' | 'datos_invalidos';
export type ResultadoDeEntrega = { ok: true } | { ok: false; error: ErrorDeEntrega };

export interface EstadoDeEntrega {
  vaciosRetirados: number | null;
  /** Lo que cobró al entregar; null si no cobró. */
  cobrado: number | null;
  entregadoEn: number | null;
  /** El último "No se pudo" de ese día, si lo hubo y el pedido no se entregó después. */
  noEntregado: { motivo: string; en: number } | null;
}

interface Opciones {
  /** El día de la ruta (YYYY-MM-DD, hora de Santiago). */
  fecha: string;
  /** Quién lo marcó, para el historial del pedido. */
  quien: string;
  ahora: number;
}

const ESTADOS_EN_RUTA: ReadonlySet<EstadoDePedido> = new Set<EstadoDePedido>(['Confirmado', 'En_Ruta']);
const MAXIMO_VACIOS = 200;
const MAXIMO_DETALLE = 200;

const numeroONulo = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export class RepositorioEntregas {
  private readonly repositorio: RepositorioD1;

  constructor(private readonly db: BaseDatos) {
    this.repositorio = new RepositorioD1(db);
  }

  private async cambios(sql: string, ...valores: unknown[]): Promise<number> {
    return (await this.db.prepare(sql).bind(...valores).run()).meta?.changes ?? 0;
  }

  private async historial(id: string, o: Opciones, accion: string, detalle: string): Promise<void> {
    await this.cambios('INSERT INTO historial_pedidos (pedido_id, en, quien, accion, detalle) VALUES (?1, ?2, ?3, ?4, ?5)', id, o.ahora, o.quien, accion, detalle);
  }

  /** El pedido, si es de ese día y está en uno de los estados aceptados. */
  private async pedidoDelDia(id: string, fecha: string, estados: ReadonlySet<EstadoDePedido>): Promise<{ pedido: PedidoGuardado } | { error: ErrorDeEntrega }> {
    const pedido = await this.repositorio.obtenerPedido(id);
    if (!pedido) return { error: 'no_existe' };
    if ((pedido.fechaConfirmada ?? pedido.fechaEntrega) !== fecha) return { error: 'no_es_de_hoy' };
    if (!estados.has(pedido.estado)) return { error: 'no_disponible' };
    return { pedido };
  }

  /** "Entregado". Se puede volver a marcar el mismo día para corregir los vacíos o el cobro. */
  async entregar(id: string, datos: { vacios: number; cobrado: boolean }, o: Opciones): Promise<ResultadoDeEntrega> {
    if (!Number.isInteger(datos.vacios) || datos.vacios < 0 || datos.vacios > MAXIMO_VACIOS || typeof datos.cobrado !== 'boolean') {
      return { ok: false, error: 'datos_invalidos' };
    }
    const encontrado = await this.pedidoDelDia(id, o.fecha, new Set<EstadoDePedido>([...ESTADOS_EN_RUTA, 'Entregado']));
    if (!('pedido' in encontrado)) return { ok: false, error: encontrado.error };
    const { pedido } = encontrado;
    if (pedido.estado !== 'Entregado') {
      const cambio = await this.repositorio.cambiarEstado(id, 'Entregado', o.quien, o.ahora);
      if (!cambio.ok) return { ok: false, error: 'no_disponible' };
    }
    // El pago vuelve a pendiente solo si lo había marcado pagado una entrega anterior (no si lo marcó una persona).
    await this.cambios(
      `UPDATE pedidos SET
         vacios_retirados = ?2,
         entregado_en = COALESCE(entregado_en, ?3),
         estado_pago = CASE WHEN ?4 = 1 THEN 'pagado' WHEN cobrado_en_entrega IS NOT NULL THEN 'pendiente' ELSE estado_pago END,
         cobrado_en_entrega = CASE WHEN ?4 = 1 THEN total ELSE NULL END,
         no_entregado_en = NULL,
         no_entregado_motivo = '',
         actualizado_en = ?3
       WHERE id = ?1`,
      id,
      datos.vacios,
      o.ahora,
      datos.cobrado ? 1 : 0,
    );
    const vacios = `Retiró ${datos.vacios} ${datos.vacios === 1 ? 'vacío' : 'vacíos'}`;
    await this.historial(id, o, 'entrega', datos.cobrado ? `${vacios}; cobró${pedido.total !== null ? ` $${pedido.total.toLocaleString('es-CL')}` : ''}.` : `${vacios}.`);
    return { ok: true };
  }

  /** "No se pudo": el pedido sigue abierto y una persona lo reagenda. El aviso sale una vez por pedido y día. */
  async noEntregado(id: string, datos: { motivo: string; detalle: string }, o: Opciones): Promise<ResultadoDeEntrega> {
    if (!(datos.motivo in MOTIVOS_NO_ENTREGA) || typeof datos.detalle !== 'string') return { ok: false, error: 'datos_invalidos' };
    const motivo = datos.motivo as MotivoNoEntrega;
    const detalle = datos.detalle.trim().slice(0, MAXIMO_DETALLE);
    const encontrado = await this.pedidoDelDia(id, o.fecha, ESTADOS_EN_RUTA);
    if (!('pedido' in encontrado)) return { ok: false, error: encontrado.error };
    const { pedido } = encontrado;

    await this.cambios('UPDATE pedidos SET no_entregado_en = ?2, no_entregado_motivo = ?3, actualizado_en = ?2 WHERE id = ?1', id, o.ahora, motivo);
    const texto = `${MOTIVOS_NO_ENTREGA[motivo]}${detalle ? ` (${detalle})` : ''}`;
    await this.historial(id, o, 'no_entregado', texto);
    const resumen = `No se pudo entregar: ${texto}. Reagenda el pedido o llama al cliente.`;
    const origen = `no-entregado:${id}:${o.fecha}`;
    const nuevo = await this.repositorio.guardarAviso({ tipo: 'escalamiento', telefono: pedido.telefono, nombre: pedido.nombre, resumen, motivos: [], idPedido: id }, origen, o.ahora);
    // Si corrigió el motivo el mismo día, el aviso que ya existe dice el motivo nuevo (y se reabre si alguien lo cerró).
    if (!nuevo) await this.cambios("UPDATE avisos SET resumen = ?2, estado = 'abierto', resuelto_por = NULL, resuelto_en = NULL WHERE origen = ?1", origen, resumen);
    return { ok: true };
  }

  /** Lo anotado en las paradas de ese día, por pedido. */
  async deDia(fecha: string): Promise<Map<string, EstadoDeEntrega>> {
    const filas = ((
      await this.db
        .prepare(
          `SELECT id, vacios_retirados, cobrado_en_entrega, entregado_en, no_entregado_en, no_entregado_motivo FROM pedidos
           WHERE COALESCE(fecha_confirmada, fecha_entrega) = ?1 AND estado != 'Cancelado' LIMIT 500`,
        )
        .bind(fecha)
        .run()
    ).results ?? []) as Array<Record<string, unknown>>;
    return new Map(
      filas.map((f) => {
        // Un "No se pudo" de otro día (el pedido se reagendó) no cuenta para la ruta de este día.
        const noEnBruto = numeroONulo(f.no_entregado_en);
        const noEn = noEnBruto !== null && fechaHoraLocal(new Date(noEnBruto * 1000)).fecha === fecha ? noEnBruto : null;
        return [
          String(f.id),
          {
            vaciosRetirados: numeroONulo(f.vacios_retirados),
            cobrado: numeroONulo(f.cobrado_en_entrega),
            entregadoEn: numeroONulo(f.entregado_en),
            noEntregado: noEn !== null && typeof f.no_entregado_motivo === 'string' && f.no_entregado_motivo ? { motivo: f.no_entregado_motivo, en: noEn } : null,
          },
        ];
      }),
    );
  }
}
