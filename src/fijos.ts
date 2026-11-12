/**
 * Pedidos fijos (D59). Casi todos los clientes piden lo mismo, y unas 20 empresas tienen plan mensual: en vez de que
 * alguien se acuerde de anotarlos, la ficha del cliente guarda "10 bidones de 20 L cada 7 días, el próximo el lunes" y
 * la tarea programada crea el pedido unos días antes, pendiente de confirmar (principio 2: una persona confirma).
 *
 * El pedido creado lleva la dirección vigente de la ficha y el precio en blanco: lo completa la operadora, porque las
 * empresas tienen condiciones propias (regla 7). Nunca se le escribe al cliente: no gasta mensajes de WhatsApp.
 * Esquema: migrations/0010_pedidos_fijos.sql.
 */

import type { BaseDatos } from './almacen';
import { diaSemana, sumarDias } from './despacho';
import type { PedidoARegistrar } from './pedidos';
import type { ItemPedido, TipoBidon } from './precios';
import { RepositorioD1 } from './repositorio';

export interface PedidoFijo {
  id: number;
  clienteId: number;
  telefono: string;
  lineas: ItemPedido[];
  cadaDias: number;
  /** YYYY-MM-DD de la próxima entrega. */
  proximaFecha: string;
  activo: boolean;
  notas: string;
}

/** Se crea con esta anticipación, para que aparezca en la lista de mañana y de pasado. */
export const DIAS_DE_ANTICIPACION = 2;
/** Cada pasada crea pocos: el plan gratis permite 50 consultas por invocación y la tarea programada hace más cosas. */
export const FIJOS_POR_PASADA = 3;

const TIPOS: ReadonlySet<string> = new Set<TipoBidon>(['20L', '12L', '10L']);
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export type ErrorDeFijo = 'datos_invalidos' | 'sin_telefono';

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const numero = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

function lineasDe(json: string): ItemPedido[] {
  try {
    const lista = JSON.parse(json) as unknown;
    return (Array.isArray(lista) ? lista : [])
      .map((l) => l as { tipo?: unknown; cantidad?: unknown })
      .filter((l): l is ItemPedido => typeof l.tipo === 'string' && TIPOS.has(l.tipo) && Number.isInteger(l.cantidad) && (l.cantidad as number) > 0)
      .map((l) => ({ tipo: l.tipo, cantidad: l.cantidad }));
  } catch {
    return [];
  }
}

function aFijo(f: Record<string, unknown>): PedidoFijo {
  return {
    id: numero(f.id),
    clienteId: numero(f.cliente_id),
    telefono: texto(f.telefono),
    lineas: lineasDe(texto(f.lineas)),
    cadaDias: numero(f.cada_dias),
    proximaFecha: texto(f.proxima_fecha),
    activo: numero(f.activo) === 1,
    notas: texto(f.notas),
  };
}

/** Los domingos no hay despacho: un pedido fijo que cae en domingo pasa al lunes. Los feriados los ajusta una persona. */
function sinDomingo(fecha: string): string {
  return diaSemana(fecha) === 0 ? sumarDias(fecha, 1) : fecha;
}

/** "F" + fecha de entrega + el número del pedido fijo: el mismo día no se crea dos veces. */
export function idDePedidoFijo(fijoId: number, fecha: string): string {
  return `F${fecha.slice(2, 4)}${fecha.slice(5, 7)}${fecha.slice(8, 10)}-${fijoId.toString(36).toUpperCase().padStart(5, '0')}`;
}

export class RepositorioFijos {
  constructor(private readonly db: BaseDatos) {}

  private async filas(sql: string, ...valores: unknown[]): Promise<Array<Record<string, unknown>>> {
    return ((await this.db.prepare(sql).bind(...valores).run()).results ?? []) as Array<Record<string, unknown>>;
  }

  async deCliente(clienteId: number): Promise<PedidoFijo | null> {
    const [fila] = await this.filas('SELECT * FROM pedidos_fijos WHERE cliente_id = ?1', clienteId);
    return fila ? aFijo(fila) : null;
  }

  /**
   * Crea o cambia el pedido fijo del cliente. `datos` viene de la pantalla: se valida todo aquí. El teléfono, si no se
   * indica, es el primero de la ficha.
   */
  async guardar(clienteId: number, datos: Record<string, unknown>, ahora: number): Promise<{ ok: true; fijo: PedidoFijo } | { ok: false; error: ErrorDeFijo }> {
    const tipo = texto(datos.tipo);
    const cantidad = datos.cantidad;
    const cadaDias = datos.cadaDias;
    const proximaFecha = texto(datos.proximaFecha);
    const notas = texto(datos.notas).trim().slice(0, 200);
    if (
      !TIPOS.has(tipo) ||
      !Number.isInteger(cantidad) || (cantidad as number) < 1 || (cantidad as number) > 200 ||
      !Number.isInteger(cadaDias) || (cadaDias as number) < 1 || (cadaDias as number) > 60 ||
      !FECHA.test(proximaFecha) || Number.isNaN(Date.parse(`${proximaFecha}T00:00:00Z`)) ||
      typeof datos.activo !== 'boolean'
    ) {
      return { ok: false, error: 'datos_invalidos' };
    }
    const telefonos = (await this.filas('SELECT telefono FROM telefonos_cliente WHERE cliente_id = ?1 ORDER BY agregado_en, telefono', clienteId)).map((f) => texto(f.telefono));
    const pedido = texto(datos.telefono);
    const telefono = pedido && telefonos.includes(pedido) ? pedido : telefonos[0];
    if (!telefono) return { ok: false, error: 'sin_telefono' };
    const lineas = JSON.stringify([{ tipo, cantidad }]);
    await this.db
      .prepare(
        `INSERT INTO pedidos_fijos (cliente_id, telefono, lineas, cada_dias, proxima_fecha, activo, notas, creado_en, actualizado_en)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
         ON CONFLICT (cliente_id) DO UPDATE SET telefono = excluded.telefono, lineas = excluded.lineas, cada_dias = excluded.cada_dias,
           proxima_fecha = excluded.proxima_fecha, activo = excluded.activo, notas = excluded.notas, actualizado_en = excluded.actualizado_en`,
      )
      .bind(clienteId, telefono, lineas, cadaDias, proximaFecha, datos.activo ? 1 : 0, notas, ahora)
      .run();
    return { ok: true, fijo: (await this.deCliente(clienteId)) as PedidoFijo };
  }

  /**
   * Crea los pedidos de los fijos cuya próxima entrega cae hasta `DIAS_DE_ANTICIPACION` días después de `hoy`, y corre
   * su próxima fecha. Si la tarea programada estuvo detenida, no crea pedidos del pasado: salta a la siguiente fecha
   * futura. Devuelve cuántos pedidos creó. Correrla dos veces no duplica nada.
   */
  async crearLosQueTocan(hoy: string, ahora: number, limite = FIJOS_POR_PASADA): Promise<number> {
    const hasta = sumarDias(hoy, DIAS_DE_ANTICIPACION);
    const fijos = await this.filas(
      `SELECT f.*, c.nombre AS nombre, d.direccion AS direccion, d.comuna AS comuna, d.notas_repartidor AS notas_repartidor
       FROM pedidos_fijos f
       JOIN clientes c ON c.id = f.cliente_id
       LEFT JOIN direcciones_cliente d ON d.id = (
         SELECT x.id FROM direcciones_cliente x WHERE x.cliente_id = f.cliente_id ORDER BY x.ultimo_uso DESC, x.id DESC LIMIT 1)
       WHERE f.activo = 1 AND f.proxima_fecha <= ?1 ORDER BY f.proxima_fecha, f.id LIMIT ?2`,
      hasta,
      Math.max(1, Math.min(limite, 20)),
    );
    const repositorio = new RepositorioD1(this.db);
    let creados = 0;
    for (const fila of fijos) {
      const fijo = aFijo(fila);
      if (fijo.cadaDias < 1 || fijo.lineas.length === 0) continue;
      let fecha = fijo.proximaFecha;
      while (fecha < hoy) fecha = sumarDias(fecha, fijo.cadaDias);
      if (fecha <= hasta) {
        const entrega = sinDomingo(fecha);
        const pedido: PedidoARegistrar = {
          idPedido: idDePedidoFijo(fijo.id, entrega),
          telefono: fijo.telefono,
          nombre: texto(fila.nombre),
          lineas: fijo.lineas.map((l) => ({ ...l, precioUnitario: null, subtotal: null })),
          fechaEntrega: entrega,
          estado: 'Pendiente_Confirmacion',
          comuna: texto(fila.comuna),
          direccion: texto(fila.direccion),
          notasRepartidor: texto(fila.notas_repartidor),
          envasesARetirar: 0,
          observaciones: `Pedido fijo (cada ${fijo.cadaDias} días): lo creó el sistema. Confirmar el precio y la entrega.${fijo.notas ? ` ${fijo.notas}` : ''}`,
        };
        if (await repositorio.guardarPedido(pedido, ahora)) creados += 1;
        fecha = sumarDias(fecha, fijo.cadaDias);
      }
      // Solo si nadie la cambió mientras tanto (una persona editando el fijo desde el panel).
      await this.db
        .prepare('UPDATE pedidos_fijos SET proxima_fecha = ?3, actualizado_en = ?4 WHERE id = ?1 AND proxima_fecha = ?2')
        .bind(fijo.id, fijo.proximaFecha, fecha, ahora)
        .run();
    }
    return creados;
  }
}
