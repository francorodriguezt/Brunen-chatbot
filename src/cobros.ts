/**
 * Cobros (D107): pendiente → informado → verificado, con abonos, la rendición diaria del efectivo y el saldo por cliente.
 *
 * Cómo lo hace el negocio (Franco, 2026-11-27, respuesta 45): los cobros se revisan al terminar la planificación del
 * día; el repartidor rinde todo el efectivo cada día y a veces carga bencina con él; hay abonos y transferencias; y
 * debería haber clientes a crédito.
 *
 *  - Un pago lo **informa** el repartidor (al entregar, "Cobré") o una persona en el panel (un comprobante, un abono).
 *  - Lo **verifica** una persona: el efectivo, al guardar la rendición del día; una transferencia, al verla en el banco.
 *  - Un pago **rechazado** (la transferencia no llegó) deja de contar.
 *
 * El pedido guarda la suma de sus pagos (`monto_pagado`, `monto_verificado`) y su estado de pago: así las listas y la
 * app del repartidor no tienen que sumar. Las sumas se recalculan después de cada cambio, desde la tabla `pagos`.
 */

import type { BaseDatos } from './almacen';
import { fechaHoraLocal } from './despacho';

export type EstadoDeCobro = 'pendiente' | 'abonado' | 'informado' | 'pagado';
export type EstadoDeUnPago = 'informado' | 'verificado' | 'rechazado';
export type OrigenDePago = 'repartidor' | 'panel';

export const FORMAS_DE_PAGO = ['efectivo', 'transferencia', 'redcompra', 'webpay', 'otro'] as const;
export type FormaDeUnPago = (typeof FORMAS_DE_PAGO)[number];

/** Un pago por encima de esto es casi seguro un error de tipeo (el pedido más grande del Excel ronda los $200.000). */
export const MAXIMO_POR_PAGO = 2_000_000;
const MAXIMO_NOTA = 200;

/**
 * El estado de pago de un pedido a partir de lo pagado. Sin total (un pedido sin precio) no se puede comparar: cualquier
 * pago verificado lo deja pagado y uno informado, informado.
 */
export function estadoDeCobro(total: number | null, pagado: number, verificado: number): EstadoDeCobro {
  if (pagado <= 0) return 'pendiente';
  if (total === null || total <= 0) return verificado > 0 ? 'pagado' : 'informado';
  if (verificado >= total) return 'pagado';
  if (pagado >= total) return 'informado';
  return 'abonado';
}

/** Lo que falta por pagar; null si el pedido no tiene precio. */
export function saldoDe(total: number | null, pagado: number): number | null {
  return total === null ? null : Math.max(0, total - pagado);
}

export interface Pago {
  id: number;
  pedidoId: string;
  monto: number;
  forma: FormaDeUnPago;
  origen: OrigenDePago;
  fecha: string;
  estado: EstadoDeUnPago;
  nota: string;
  informadoPor: string;
  informadoEn: number;
  verificadoPor: string | null;
  verificadoEn: number | null;
}

/** Un pago por verificar, con lo justo del pedido para reconocerlo. */
export interface PagoPorVerificar extends Pago {
  nombre: string;
  telefono: string;
  totalPedido: number | null;
}

export interface Rendicion {
  fecha: string;
  /** Lo que suma el efectivo cobrado ese día (sin los rechazados). */
  efectivoCobrado: number;
  /** Cuántos cobros en efectivo hay ese día y cuántos faltan por verificar. */
  cobros: number;
  porVerificar: number;
  /** La rendición guardada, si ya se rindió. */
  guardada: {
    efectivoCobrado: number;
    bencina: number;
    entregado: number;
    /** Lo cobrado menos la bencina menos lo entregado: positivo = falta plata; negativo = sobra. */
    diferencia: number;
    nota: string;
    registradoPor: string;
    registradoEn: number;
  } | null;
}

export interface SaldoDeCliente {
  /** La ficha del cliente, o null si el pedido todavía no se vincula a una. */
  clienteId: number | null;
  nombre: string;
  telefono: string;
  saldo: number;
  pedidos: number;
  /** La entrega más antigua que debe (YYYY-MM-DD). */
  desde: string;
  credito: boolean;
}

export type ErrorDeCobro = 'no_existe' | 'datos_invalidos' | 'ya_decidido';
export type ResultadoDeCobro<T = true> = { ok: true; valor: T } | { ok: false; error: ErrorDeCobro };

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const numero = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);
const pesos = (n: number): string => `$${n.toLocaleString('es-CL')}`;

function aPago(f: Record<string, unknown>): Pago {
  return {
    id: numero(f.id),
    pedidoId: texto(f.pedido_id),
    monto: numero(f.monto),
    forma: texto(f.forma) as FormaDeUnPago,
    origen: texto(f.origen) === 'repartidor' ? 'repartidor' : 'panel',
    fecha: texto(f.fecha),
    estado: (['informado', 'verificado', 'rechazado'].includes(texto(f.estado)) ? texto(f.estado) : 'informado') as EstadoDeUnPago,
    nota: texto(f.nota),
    informadoPor: texto(f.informado_por),
    informadoEn: numero(f.informado_en),
    verificadoPor: typeof f.verificado_por === 'string' ? f.verificado_por : null,
    verificadoEn: typeof f.verificado_en === 'number' ? f.verificado_en : null,
  };
}

/** Un monto en pesos: entero entre 1 y el máximo. Acepta "$4.500". */
export function montoValido(v: unknown): number | null {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$.\s]/g, '')) : NaN;
  return Number.isInteger(n) && n > 0 && n <= MAXIMO_POR_PAGO ? n : null;
}

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;

export class RepositorioCobros {
  constructor(private readonly db: BaseDatos) {}

  private async filas(sql: string, ...valores: unknown[]): Promise<Array<Record<string, unknown>>> {
    return ((await this.db.prepare(sql).bind(...valores).run()).results ?? []) as Array<Record<string, unknown>>;
  }

  private async cambios(sql: string, ...valores: unknown[]): Promise<number> {
    return (await this.db.prepare(sql).bind(...valores).run()).meta?.changes ?? 0;
  }

  private async historial(pedidoId: string, en: number, quien: string, detalle: string): Promise<void> {
    await this.cambios("INSERT INTO historial_pedidos (pedido_id, en, quien, accion, detalle) VALUES (?1, ?2, ?3, 'pago', ?4)", pedidoId, en, quien, detalle);
  }

  /**
   * Suma de nuevo los pagos del pedido y deja su estado de pago al día. Un pedido sin ningún pago anotado conserva el
   * estado que le puso una persona a mano (los pedidos de antes de D107 y los del historial del Excel).
   */
  async recalcular(pedidoId: string): Promise<void> {
    const [suma] = await this.filas(
      `SELECT COUNT(*) AS n,
              COALESCE(SUM(CASE WHEN estado != 'rechazado' THEN monto END), 0) AS pagado,
              COALESCE(SUM(CASE WHEN estado = 'verificado' THEN monto END), 0) AS verificado
       FROM pagos WHERE pedido_id = ?1`,
      pedidoId,
    );
    const [pedido] = await this.filas('SELECT total FROM pedidos WHERE id = ?1', pedidoId);
    if (!pedido) return;
    const pagado = numero(suma?.pagado);
    const verificado = numero(suma?.verificado);
    if (numero(suma?.n) === 0) {
      // Sin ningún pago anotado: un "abonado" o "informado" que quedó sin sus pagos vuelve a pendiente; "pagado" lo puso una persona.
      await this.cambios("UPDATE pedidos SET monto_pagado = 0, monto_verificado = 0, estado_pago = CASE WHEN estado_pago IN ('abonado', 'informado') THEN 'pendiente' ELSE estado_pago END WHERE id = ?1", pedidoId);
      return;
    }
    const total = typeof pedido.total === 'number' ? pedido.total : null;
    await this.cambios(
      'UPDATE pedidos SET monto_pagado = ?2, monto_verificado = ?3, estado_pago = ?4 WHERE id = ?1',
      pedidoId,
      pagado,
      verificado,
      estadoDeCobro(total, pagado, verificado),
    );
  }

  /**
   * Anota un pago. `verificado`: quien lo anota ya vio el dinero (lo recibió en la mano o lo vio en el banco).
   * Devuelve el id del pago.
   */
  async registrar(
    pedidoId: string,
    datos: { monto: unknown; forma: unknown; verificado?: unknown; nota?: unknown },
    o: { quien: string; ahora: number; origen: OrigenDePago; fecha?: string },
  ): Promise<ResultadoDeCobro<number>> {
    const monto = montoValido(datos.monto);
    const forma = typeof datos.forma === 'string' && (FORMAS_DE_PAGO as readonly string[]).includes(datos.forma) ? (datos.forma as FormaDeUnPago) : null;
    const nota = datos.nota === undefined ? '' : typeof datos.nota === 'string' ? datos.nota.trim().replace(/\s+/g, ' ') : null;
    const verificado = datos.verificado === undefined ? false : datos.verificado;
    const fecha = o.fecha ?? fechaHoraLocal(new Date(o.ahora * 1000)).fecha;
    if (monto === null || forma === null || nota === null || nota.length > MAXIMO_NOTA || typeof verificado !== 'boolean' || !ES_FECHA.test(fecha)) {
      return { ok: false, error: 'datos_invalidos' };
    }
    const [pedido] = await this.filas("SELECT id FROM pedidos WHERE id = ?1 AND estado != 'Cancelado'", pedidoId);
    if (!pedido) return { ok: false, error: 'no_existe' };
    const [nuevo] = await this.filas(
      `INSERT INTO pagos (pedido_id, monto, forma, origen, fecha, estado, nota, informado_por, informado_en, verificado_por, verificado_en)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) RETURNING id`,
      pedidoId,
      monto,
      forma,
      o.origen,
      fecha,
      verificado ? 'verificado' : 'informado',
      nota,
      o.quien,
      o.ahora,
      verificado ? o.quien : null,
      verificado ? o.ahora : null,
    );
    await this.recalcular(pedidoId);
    await this.historial(pedidoId, o.ahora, o.quien, `Pago de ${pesos(monto)} (${forma}), ${verificado ? 'verificado' : 'por verificar'}.${nota ? ` Nota: ${nota}` : ''}`);
    return { ok: true, valor: numero(nuevo?.id) };
  }

  /**
   * El cobro en efectivo que anota el repartidor al entregar (D61): lo que falta del pedido, no el total, porque puede
   * haber un abono. Reemplaza el que él mismo anotó ese día para ese pedido si todavía nadie lo verificó, así
   * "Corregir" la entrega no duplica el cobro. Devuelve cuánto suman sus cobros de ese día (null si ninguno).
   */
  async cobroDeEntrega(pedidoId: string, cobro: boolean, o: { quien: string; ahora: number; fecha: string }): Promise<number | null> {
    // Quita su cobro anterior de ese día (solo si nadie lo verificó todavía): la corrección lo vuelve a anotar.
    await this.cambios("DELETE FROM pagos WHERE pedido_id = ?1 AND origen = 'repartidor' AND fecha = ?2 AND estado = 'informado'", pedidoId, o.fecha);
    if (cobro) {
      const [pedido] = await this.filas('SELECT total FROM pedidos WHERE id = ?1', pedidoId);
      const [suma] = await this.filas("SELECT COALESCE(SUM(monto), 0) AS pagado FROM pagos WHERE pedido_id = ?1 AND estado != 'rechazado'", pedidoId);
      const total = typeof pedido?.total === 'number' ? pedido.total : null;
      const falta = total === null ? 0 : total - numero(suma?.pagado);
      if (falta > 0) {
        await this.cambios(
          `INSERT INTO pagos (pedido_id, monto, forma, origen, fecha, estado, informado_por, informado_en)
           VALUES (?1, ?2, 'efectivo', 'repartidor', ?3, 'informado', ?4, ?5)`,
          pedidoId,
          falta,
          o.fecha,
          o.quien,
          o.ahora,
        );
      }
    }
    await this.recalcular(pedidoId);
    const [propio] = await this.filas("SELECT COALESCE(SUM(monto), 0) AS monto FROM pagos WHERE pedido_id = ?1 AND origen = 'repartidor' AND fecha = ?2 AND estado != 'rechazado'", pedidoId, o.fecha);
    return numero(propio?.monto) > 0 ? numero(propio?.monto) : null;
  }

  /**
   * Una persona cambió el estado de pago a mano en el editor del pedido (el que ya existía antes de D107):
   *  - "pagado": se anota un pago verificado por lo que falta, para que las sumas y el estado cuadren;
   *  - "pendiente": los pagos anotados dejan de contar (quedan rechazados, con su historia).
   */
  async alinearConEstadoManual(pedidoId: string, estado: 'pendiente' | 'pagado', formaDelPedido: string, quien: string, ahora: number): Promise<void> {
    if (estado === 'pagado') {
      const [pedido] = await this.filas('SELECT total, monto_pagado FROM pedidos WHERE id = ?1', pedidoId);
      const total = typeof pedido?.total === 'number' ? pedido.total : null;
      const falta = total === null ? 0 : total - numero(pedido?.monto_pagado);
      const forma = (FORMAS_DE_PAGO as readonly string[]).includes(formaDelPedido) ? formaDelPedido : 'otro';
      if (falta > 0) await this.registrar(pedidoId, { monto: falta, forma, verificado: true, nota: 'Marcado como pagado en el editor' }, { quien, ahora, origen: 'panel' });
      else await this.cambios("UPDATE pedidos SET estado_pago = 'pagado' WHERE id = ?1", pedidoId);
      return;
    }
    const n = await this.cambios(
      "UPDATE pagos SET estado = 'rechazado', verificado_por = ?2, verificado_en = ?3 WHERE pedido_id = ?1 AND estado != 'rechazado'",
      pedidoId,
      quien,
      ahora,
    );
    if (n > 0) await this.historial(pedidoId, ahora, quien, `Marcado como pendiente: ${n === 1 ? 'el pago anotado dejó' : `los ${n} pagos anotados dejaron`} de contar.`);
    await this.recalcular(pedidoId);
    await this.cambios("UPDATE pedidos SET estado_pago = 'pendiente' WHERE id = ?1", pedidoId);
  }

  async pagosDe(pedidoId: string): Promise<Pago[]> {
    return (await this.filas('SELECT * FROM pagos WHERE pedido_id = ?1 ORDER BY informado_en, id', pedidoId)).map(aPago);
  }

  /** Verifica o rechaza un pago informado. Un pago ya decidido no cambia (para corregirlo, se anota otro). */
  async decidir(pagoId: number, decision: 'verificado' | 'rechazado', quien: string, ahora: number): Promise<ResultadoDeCobro> {
    const [pago] = await this.filas('SELECT * FROM pagos WHERE id = ?1', pagoId);
    if (!pago) return { ok: false, error: 'no_existe' };
    const cambiados = await this.cambios(
      "UPDATE pagos SET estado = ?2, verificado_por = ?3, verificado_en = ?4 WHERE id = ?1 AND estado = 'informado'",
      pagoId,
      decision,
      quien,
      ahora,
    );
    if (cambiados === 0) return { ok: false, error: 'ya_decidido' };
    const p = aPago(pago);
    await this.recalcular(p.pedidoId);
    await this.historial(p.pedidoId, ahora, quien, `Pago de ${pesos(p.monto)} (${p.forma}) ${decision === 'verificado' ? 'verificado' : 'rechazado: no llegó'}.`);
    return { ok: true, valor: true };
  }

  /**
   * Los pagos que una persona tiene que mirar: las transferencias y lo anotado en el panel sin verificar. El efectivo
   * del repartidor no va aquí: se verifica todo junto al guardar la rendición del día.
   */
  async porVerificar(limite = 50): Promise<PagoPorVerificar[]> {
    const filas = await this.filas(
      `SELECT g.*, p.nombre, p.telefono, p.total AS total_pedido FROM pagos g JOIN pedidos p ON p.id = g.pedido_id
       WHERE g.estado = 'informado' AND NOT (g.origen = 'repartidor' AND g.forma = 'efectivo')
       ORDER BY g.informado_en, g.id LIMIT ?1`,
      Math.max(1, Math.min(Math.trunc(limite), 100)),
    );
    return filas.map((f) => ({ ...aPago(f), nombre: texto(f.nombre), telefono: texto(f.telefono), totalPedido: typeof f.total_pedido === 'number' ? f.total_pedido : null }));
  }

  /** El efectivo de un día (lo cobrado al entregar y lo anotado en efectivo en el panel) y su rendición. */
  async rendicionDe(fecha: string): Promise<Rendicion> {
    const [suma] = await this.filas(
      `SELECT COUNT(*) AS cobros, COALESCE(SUM(monto), 0) AS total, COALESCE(SUM(CASE WHEN estado = 'informado' THEN 1 ELSE 0 END), 0) AS por_verificar
       FROM pagos WHERE fecha = ?1 AND forma = 'efectivo' AND estado != 'rechazado'`,
      fecha,
    );
    const [r] = await this.filas('SELECT * FROM rendiciones WHERE fecha = ?1', fecha);
    return {
      fecha,
      efectivoCobrado: numero(suma?.total),
      cobros: numero(suma?.cobros),
      porVerificar: numero(suma?.por_verificar),
      guardada: r
        ? {
            efectivoCobrado: numero(r.efectivo_cobrado),
            bencina: numero(r.bencina),
            entregado: numero(r.entregado),
            diferencia: numero(r.efectivo_cobrado) - numero(r.bencina) - numero(r.entregado),
            nota: texto(r.nota),
            registradoPor: texto(r.registrado_por),
            registradoEn: numero(r.registrado_en),
          }
        : null,
    };
  }

  /**
   * Guarda la rendición del día y verifica el efectivo de ese día. Se puede volver a guardar (por ejemplo, si llegó un
   * cobro atrasado): la rendición se reemplaza y lo nuevo también queda verificado.
   */
  async guardarRendicion(fecha: string, datos: { bencina?: unknown; entregado: unknown; nota?: unknown }, quien: string, ahora: number): Promise<ResultadoDeCobro<Rendicion>> {
    const entero = (v: unknown): number | null => {
      if (v === undefined || v === '' || v === null) return 0;
      const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$.\s]/g, '')) : NaN;
      return Number.isInteger(n) && n >= 0 && n <= 10 * MAXIMO_POR_PAGO ? n : null;
    };
    const bencina = entero(datos.bencina);
    const entregado = datos.entregado === undefined || datos.entregado === '' ? null : entero(datos.entregado);
    const nota = datos.nota === undefined ? '' : typeof datos.nota === 'string' ? datos.nota.trim().replace(/\s+/g, ' ') : null;
    if (!ES_FECHA.test(fecha) || bencina === null || entregado === null || nota === null || nota.length > MAXIMO_NOTA) return { ok: false, error: 'datos_invalidos' };

    const antes = await this.rendicionDe(fecha);
    await this.cambios(
      `INSERT INTO rendiciones (fecha, efectivo_cobrado, bencina, entregado, nota, registrado_por, registrado_en) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
       ON CONFLICT (fecha) DO UPDATE SET efectivo_cobrado = excluded.efectivo_cobrado, bencina = excluded.bencina, entregado = excluded.entregado,
         nota = excluded.nota, registrado_por = excluded.registrado_por, registrado_en = excluded.registrado_en`,
      fecha,
      antes.efectivoCobrado,
      bencina,
      entregado,
      nota,
      quien,
      ahora,
    );
    const pedidos = await this.filas("SELECT DISTINCT pedido_id FROM pagos WHERE fecha = ?1 AND forma = 'efectivo' AND estado = 'informado'", fecha);
    await this.cambios(
      "UPDATE pagos SET estado = 'verificado', verificado_por = ?2, verificado_en = ?3 WHERE fecha = ?1 AND forma = 'efectivo' AND estado = 'informado'",
      fecha,
      quien,
      ahora,
    );
    for (const p of pedidos) {
      await this.recalcular(texto(p.pedido_id));
      await this.historial(texto(p.pedido_id), ahora, quien, `Efectivo verificado en la rendición del ${fecha}.`);
    }
    return { ok: true, valor: await this.rendicionDe(fecha) };
  }

  /**
   * Lo que debe cada cliente: pedidos entregados con precio que no están pagados del todo. Los clientes a crédito
   * aparecen marcados (su saldo no es un atraso). De mayor a menor saldo.
   */
  async saldos(limite = 50): Promise<SaldoDeCliente[]> {
    const filas = await this.filas(
      `SELECT p.cliente_id, MAX(p.nombre) AS nombre, MAX(p.telefono) AS telefono, SUM(p.total - p.monto_pagado) AS saldo, COUNT(*) AS pedidos,
              MIN(COALESCE(p.fecha_confirmada, p.fecha_entrega)) AS desde, MAX(c.nombre) AS nombre_ficha, MAX(COALESCE(c.credito, 0)) AS credito
       FROM pedidos p LEFT JOIN clientes c ON c.id = p.cliente_id
       WHERE p.estado = 'Entregado' AND p.total IS NOT NULL AND p.estado_pago != 'pagado' AND p.monto_pagado < p.total
         AND (p.cliente_id IS NULL OR p.cliente_id != 0)
       GROUP BY COALESCE(CAST(p.cliente_id AS TEXT), 't' || p.telefono)
       ORDER BY saldo DESC LIMIT ?1`,
      Math.max(1, Math.min(Math.trunc(limite), 200)),
    );
    return filas.map((f) => ({
      clienteId: f.cliente_id === null || f.cliente_id === undefined ? null : numero(f.cliente_id),
      nombre: texto(f.nombre_ficha) || texto(f.nombre),
      telefono: texto(f.telefono),
      saldo: numero(f.saldo),
      pedidos: numero(f.pedidos),
      desde: texto(f.desde),
      credito: numero(f.credito) === 1,
    }));
  }
}
