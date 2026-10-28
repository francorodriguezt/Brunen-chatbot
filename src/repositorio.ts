/**
 * Pedidos y avisos en D1 (migrations/0004_pedidos_y_avisos.sql). Lo usan el bot, que escribe lo que decide
 * el motor (`motor.ts`), y el panel, que muestra, confirma y cambia (D32).
 *
 * Reglas que protegen al negocio:
 *  - Anotar es idempotente: un reintento de Meta no duplica el pedido ni el aviso.
 *  - Un pedido sin precio completo no se puede confirmar: la operadora lo completa con "cambiar" y recién ahí confirma.
 *  - Un pedido no salta de estado como sea (una entrega no se "des-entrega"), y cambiar el estado compara el
 *    estado que se vio, para que dos personas no se pisen.
 *  - Todo cambio queda en el historial con quién lo hizo.
 */

import type { Alerta, TipoAlerta } from './alertas';
import type { BaseDatos } from './almacen';
import type { LineaPedido, PedidoARegistrar } from './pedidos';
import type { TipoBidon } from './precios';

export type EstadoDePedido = 'Pendiente_Confirmacion' | 'Fuera_de_zona' | 'Confirmado' | 'En_Ruta' | 'Entregado' | 'Cancelado';

export const ESTADOS_DE_PEDIDO: readonly EstadoDePedido[] = ['Pendiente_Confirmacion', 'Fuera_de_zona', 'Confirmado', 'En_Ruta', 'Entregado', 'Cancelado'];

/** A qué estados se puede pasar desde cada uno. "Cancelado" se puede reabrir por si fue un error. */
const TRANSICIONES: Readonly<Record<EstadoDePedido, readonly EstadoDePedido[]>> = {
  Pendiente_Confirmacion: ['Confirmado', 'Cancelado'],
  Fuera_de_zona: ['Pendiente_Confirmacion', 'Confirmado', 'Cancelado'],
  Confirmado: ['En_Ruta', 'Entregado', 'Cancelado'],
  En_Ruta: ['Entregado', 'Cancelado'],
  Entregado: [],
  Cancelado: ['Pendiente_Confirmacion'],
};

export interface PedidoGuardado {
  id: string;
  creadoEn: number;
  telefono: string;
  nombre: string;
  comuna: string;
  direccion: string;
  fechaEntrega: string;
  fechaConfirmada: string | null;
  estado: EstadoDePedido;
  lineas: LineaPedido[];
  total: number | null;
  notasRepartidor: string;
  envasesARetirar: number;
  observaciones: string;
  confirmadoPor: string | null;
  actualizadoEn: number;
}

export interface AvisoGuardado {
  id: number;
  creadoEn: number;
  tipo: TipoAlerta;
  telefono: string;
  nombre: string;
  resumen: string;
  motivos: string[];
  texto: string;
  idPedido: string | null;
  estado: 'abierto' | 'resuelto';
  resueltoPor: string | null;
  resueltoEn: number | null;
}

export interface LineaEditable {
  tipo: TipoBidon;
  cantidad: number;
  /** null = todavía sin precio. */
  precioUnitario: number | null;
}

export interface CambiosDePedido {
  fechaConfirmada?: string | null;
  comuna?: string;
  direccion?: string;
  notasRepartidor?: string;
  lineas?: LineaEditable[];
}

export type ErrorDeRepositorio =
  | 'no_existe'
  | 'transicion_invalida'
  | 'falta_precio'
  | 'conflicto'
  | 'fecha_invalida'
  | 'datos_invalidos'
  | 'pedido_cerrado';

export type ResultadoRepo<T> = { ok: true; valor: T } | { ok: false; error: ErrorDeRepositorio };

const TIPOS: ReadonlySet<string> = new Set<TipoBidon>(['10L', '12L', '20L']);
const MAX_TEXTO = 500;
const RETENCION_TEXTO_SEGUNDOS = 90 * 24 * 3600;
const PROBABILIDAD_LIMPIEZA = 0.02;

/** El total solo existe si todas las líneas tienen precio. */
export function calcularTotal(lineas: readonly LineaPedido[]): number | null {
  if (lineas.length === 0) return null;
  let suma = 0;
  for (const linea of lineas) {
    if (linea.subtotal === null) return null;
    suma += linea.subtotal;
  }
  return suma;
}

function fechaValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

function jsonODefecto<T>(texto: unknown, defecto: T): T {
  if (typeof texto !== 'string') return defecto;
  try {
    return JSON.parse(texto) as T;
  } catch {
    return defecto;
  }
}

function aLineas(texto: unknown): LineaPedido[] {
  const crudo = jsonODefecto<unknown>(texto, []);
  if (!Array.isArray(crudo)) return [];
  return crudo.flatMap((l): LineaPedido[] => {
    const { tipo, cantidad, precioUnitario, subtotal } = (l ?? {}) as Record<string, unknown>;
    if (typeof tipo !== 'string' || !TIPOS.has(tipo) || typeof cantidad !== 'number') return [];
    return [
      {
        tipo: tipo as TipoBidon,
        cantidad,
        precioUnitario: typeof precioUnitario === 'number' ? precioUnitario : null,
        subtotal: typeof subtotal === 'number' ? subtotal : null,
      },
    ];
  });
}

const texto = (valor: unknown): string => (typeof valor === 'string' ? valor : '');
const numero = (valor: unknown): number => (typeof valor === 'number' ? valor : 0);

function aPedido(fila: Record<string, unknown>): PedidoGuardado {
  return {
    id: texto(fila.id),
    creadoEn: numero(fila.creado_en),
    telefono: texto(fila.telefono),
    nombre: texto(fila.nombre),
    comuna: texto(fila.comuna),
    direccion: texto(fila.direccion),
    fechaEntrega: texto(fila.fecha_entrega),
    fechaConfirmada: typeof fila.fecha_confirmada === 'string' ? fila.fecha_confirmada : null,
    estado: texto(fila.estado) as EstadoDePedido,
    lineas: aLineas(fila.lineas),
    total: typeof fila.total === 'number' ? fila.total : null,
    notasRepartidor: texto(fila.notas_repartidor),
    envasesARetirar: numero(fila.envases_a_retirar),
    observaciones: texto(fila.observaciones),
    confirmadoPor: typeof fila.confirmado_por === 'string' ? fila.confirmado_por : null,
    actualizadoEn: numero(fila.actualizado_en),
  };
}

function aAviso(fila: Record<string, unknown>): AvisoGuardado {
  const motivos = jsonODefecto<unknown>(fila.motivos, []);
  return {
    id: numero(fila.id),
    creadoEn: numero(fila.creado_en),
    tipo: texto(fila.tipo) as TipoAlerta,
    telefono: texto(fila.telefono),
    nombre: texto(fila.nombre),
    resumen: texto(fila.resumen),
    motivos: Array.isArray(motivos) ? motivos.filter((m): m is string => typeof m === 'string') : [],
    texto: texto(fila.texto),
    idPedido: typeof fila.id_pedido === 'string' ? fila.id_pedido : null,
    estado: fila.estado === 'resuelto' ? 'resuelto' : 'abierto',
    resueltoPor: typeof fila.resuelto_por === 'string' ? fila.resuelto_por : null,
    resueltoEn: typeof fila.resuelto_en === 'number' ? fila.resuelto_en : null,
  };
}

const COLUMNAS_PEDIDO =
  'id, creado_en, telefono, nombre, comuna, direccion, fecha_entrega, fecha_confirmada, estado, lineas, total, notas_repartidor, envases_a_retirar, observaciones, confirmado_por, actualizado_en';

export interface FiltroDePedidos {
  estados?: readonly EstadoDePedido[];
  /** Entrega propuesta o confirmada para ese día (YYYY-MM-DD). */
  fecha?: string;
  limite?: number;
}

export interface ResumenDelPanel {
  porConfirmar: number;
  avisosAbiertos: number;
  /** Para que la pantalla note que llegó algo nuevo sin traer las listas. */
  ultimaActualizacionDePedidos: number;
  ultimoAviso: number;
}

export class RepositorioD1 {
  constructor(
    private readonly db: BaseDatos,
    private readonly azar: () => number = Math.random,
  ) {}

  private async filas(sql: string, ...valores: unknown[]): Promise<Array<Record<string, unknown>>> {
    const r = await this.db.prepare(sql).bind(...valores).run();
    return (r.results ?? []) as Array<Record<string, unknown>>;
  }

  private async cambios(sql: string, ...valores: unknown[]): Promise<number> {
    const r = await this.db.prepare(sql).bind(...valores).run();
    return r.meta?.changes ?? 0;
  }

  private async anotarHistorial(pedidoId: string, en: number, quien: string, accion: string, detalle = ''): Promise<void> {
    await this.cambios('INSERT INTO historial_pedidos (pedido_id, en, quien, accion, detalle) VALUES (?1, ?2, ?3, ?4, ?5)', pedidoId, en, quien, accion, detalle.slice(0, MAX_TEXTO));
  }

  // ---- Lo que escribe el bot ----

  /** true si el pedido era nuevo; false si ya estaba (un reintento del mismo mensaje). */
  async guardarPedido(p: PedidoARegistrar, ahoraSegundos: number): Promise<boolean> {
    const total = calcularTotal(p.lineas);
    const nuevo =
      (await this.cambios(
        `INSERT INTO pedidos (id, creado_en, telefono, nombre, comuna, direccion, fecha_entrega, estado, lineas, total, notas_repartidor, envases_a_retirar, observaciones, actualizado_en)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?2) ON CONFLICT(id) DO NOTHING`,
        p.idPedido, ahoraSegundos, p.telefono, p.nombre, p.comuna, p.direccion, p.fechaEntrega, p.estado,
        JSON.stringify(p.lineas), total, p.notasRepartidor, p.envasesARetirar, p.observaciones,
      )) > 0;
    if (nuevo) await this.anotarHistorial(p.idPedido, ahoraSegundos, 'bot', 'creado');
    return nuevo;
  }

  /** true si el aviso era nuevo. `origen` es el wamid del mensaje: el mismo mensaje no genera dos avisos del mismo tipo. */
  async guardarAviso(a: Alerta, origen: string | null, ahoraSegundos: number): Promise<boolean> {
    return (
      (await this.cambios(
        'INSERT OR IGNORE INTO avisos (creado_en, tipo, telefono, nombre, resumen, motivos, texto, id_pedido, origen) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)',
        ahoraSegundos, a.tipo, a.telefono, a.nombre ?? '', a.resumen.slice(0, MAX_TEXTO), JSON.stringify(a.motivos), (a.texto ?? '').slice(0, MAX_TEXTO), a.idPedido ?? null, origen,
      )) > 0
    );
  }

  // ---- Lo que lee y cambia el panel ----

  async obtenerPedido(id: string): Promise<PedidoGuardado | null> {
    const [fila] = await this.filas(`SELECT ${COLUMNAS_PEDIDO} FROM pedidos WHERE id = ?1`, id);
    return fila ? aPedido(fila) : null;
  }

  async listarPedidos(filtro: FiltroDePedidos = {}): Promise<PedidoGuardado[]> {
    const condiciones: string[] = [];
    const valores: unknown[] = [];
    if (filtro.estados && filtro.estados.length > 0) {
      condiciones.push(`estado IN (${filtro.estados.map(() => '?').join(', ')})`);
      valores.push(...filtro.estados);
    }
    if (filtro.fecha) {
      condiciones.push('COALESCE(fecha_confirmada, fecha_entrega) = ?');
      valores.push(filtro.fecha);
    }
    const limite = Math.min(Math.max(Math.trunc(filtro.limite ?? 100), 1), 300);
    const sql = `SELECT ${COLUMNAS_PEDIDO} FROM pedidos ${condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : ''}
      ORDER BY CASE estado WHEN 'Pendiente_Confirmacion' THEN 0 WHEN 'Fuera_de_zona' THEN 1 ELSE 2 END, creado_en DESC LIMIT ${limite}`;
    return (await this.filas(sql, ...valores)).map(aPedido);
  }

  async historialDe(id: string): Promise<Array<{ en: number; quien: string; accion: string; detalle: string }>> {
    const filas = await this.filas('SELECT en, quien, accion, detalle FROM historial_pedidos WHERE pedido_id = ?1 ORDER BY en, id', id);
    return filas.map((f) => ({ en: numero(f.en), quien: texto(f.quien), accion: texto(f.accion), detalle: texto(f.detalle) }));
  }

  /**
   * Cambia el estado. `confirmado_por` y la fecha confirmada se llenan al confirmar. La actualización exige que el
   * estado siga siendo el que se leyó: si otra persona lo cambió en el medio, devuelve "conflicto".
   */
  async cambiarEstado(
    id: string,
    nuevo: EstadoDePedido,
    quien: string,
    ahoraSegundos: number,
    opciones: { fechaConfirmada?: string; motivo?: string } = {},
  ): Promise<ResultadoRepo<PedidoGuardado>> {
    if (!ESTADOS_DE_PEDIDO.includes(nuevo)) return { ok: false, error: 'datos_invalidos' };
    const actual = await this.obtenerPedido(id);
    if (!actual) return { ok: false, error: 'no_existe' };
    if (!TRANSICIONES[actual.estado]?.includes(nuevo)) return { ok: false, error: 'transicion_invalida' };

    let fechaConfirmada = actual.fechaConfirmada;
    if (nuevo === 'Confirmado') {
      if (actual.total === null) return { ok: false, error: 'falta_precio' };
      fechaConfirmada = opciones.fechaConfirmada ?? actual.fechaConfirmada ?? actual.fechaEntrega;
      if (!fechaValida(fechaConfirmada)) return { ok: false, error: 'fecha_invalida' };
    }
    const cambiado = await this.cambios(
      `UPDATE pedidos SET estado = ?1, actualizado_en = ?2, fecha_confirmada = ?3, confirmado_por = CASE WHEN ?1 = 'Confirmado' THEN ?4 ELSE confirmado_por END
       WHERE id = ?5 AND estado = ?6`,
      nuevo, ahoraSegundos, fechaConfirmada, quien, id, actual.estado,
    );
    if (cambiado === 0) return { ok: false, error: 'conflicto' };
    await this.anotarHistorial(id, ahoraSegundos, quien, `estado: ${actual.estado} -> ${nuevo}`, opciones.motivo ?? '');
    return { ok: true, valor: (await this.obtenerPedido(id)) as PedidoGuardado };
  }

  /** Corrige datos del pedido. Las líneas se recalculan: el subtotal de cada una y el total salen de cantidad y precio. */
  async editarPedido(id: string, cambios: CambiosDePedido, quien: string, ahoraSegundos: number): Promise<ResultadoRepo<PedidoGuardado>> {
    const actual = await this.obtenerPedido(id);
    if (!actual) return { ok: false, error: 'no_existe' };
    if (actual.estado === 'Entregado' || actual.estado === 'Cancelado') return { ok: false, error: 'pedido_cerrado' };

    const fechaConfirmada = cambios.fechaConfirmada === undefined ? actual.fechaConfirmada : cambios.fechaConfirmada;
    if (fechaConfirmada !== null && !fechaValida(fechaConfirmada)) return { ok: false, error: 'fecha_invalida' };

    let lineas = actual.lineas;
    if (cambios.lineas) {
      if (cambios.lineas.length === 0 || cambios.lineas.length > 5) return { ok: false, error: 'datos_invalidos' };
      const nuevas: LineaPedido[] = [];
      for (const l of cambios.lineas) {
        const cantidadOk = Number.isInteger(l.cantidad) && l.cantidad >= 1 && l.cantidad <= 999;
        const precioOk = l.precioUnitario === null || (Number.isInteger(l.precioUnitario) && l.precioUnitario >= 0 && l.precioUnitario <= 1_000_000);
        if (!TIPOS.has(l.tipo) || !cantidadOk || !precioOk) return { ok: false, error: 'datos_invalidos' };
        nuevas.push({ tipo: l.tipo, cantidad: l.cantidad, precioUnitario: l.precioUnitario, subtotal: l.precioUnitario === null ? null : l.precioUnitario * l.cantidad });
      }
      lineas = nuevas;
    }
    const comuna = (cambios.comuna ?? actual.comuna).slice(0, 80);
    const direccion = (cambios.direccion ?? actual.direccion).slice(0, 200);
    const notas = (cambios.notasRepartidor ?? actual.notasRepartidor).slice(0, MAX_TEXTO);

    const hecho = await this.cambios(
      `UPDATE pedidos SET fecha_confirmada = ?1, comuna = ?2, direccion = ?3, notas_repartidor = ?4, lineas = ?5, total = ?6, actualizado_en = ?7
       WHERE id = ?8 AND actualizado_en = ?9`,
      fechaConfirmada, comuna, direccion, notas, JSON.stringify(lineas), calcularTotal(lineas), ahoraSegundos, id, actual.actualizadoEn,
    );
    if (hecho === 0) return { ok: false, error: 'conflicto' };
    const partes = [
      cambios.lineas ? 'líneas' : '',
      cambios.fechaConfirmada !== undefined ? 'fecha' : '',
      cambios.comuna !== undefined ? 'comuna' : '',
      cambios.direccion !== undefined ? 'dirección' : '',
      cambios.notasRepartidor !== undefined ? 'notas' : '',
    ].filter(Boolean);
    await this.anotarHistorial(id, ahoraSegundos, quien, 'editado', partes.join(', '));
    return { ok: true, valor: (await this.obtenerPedido(id)) as PedidoGuardado };
  }

  async listarAvisos(estado: 'abierto' | 'resuelto' = 'abierto', limite = 100): Promise<AvisoGuardado[]> {
    const tope = Math.min(Math.max(Math.trunc(limite), 1), 300);
    const filas = await this.filas(
      `SELECT id, creado_en, tipo, telefono, nombre, resumen, motivos, texto, id_pedido, estado, resuelto_por, resuelto_en FROM avisos WHERE estado = ?1 ORDER BY creado_en DESC, id DESC LIMIT ${tope}`,
      estado,
    );
    return filas.map(aAviso);
  }

  /** false si el aviso no existe o ya estaba resuelto. */
  async resolverAviso(id: number, quien: string, ahoraSegundos: number): Promise<boolean> {
    return (
      (await this.cambios("UPDATE avisos SET estado = 'resuelto', resuelto_por = ?1, resuelto_en = ?2 WHERE id = ?3 AND estado = 'abierto'", quien, ahoraSegundos, id)) > 0
    );
  }

  async resumen(): Promise<ResumenDelPanel> {
    const [fila] = await this.filas(
      `SELECT
        (SELECT COUNT(*) FROM pedidos WHERE estado = 'Pendiente_Confirmacion') AS por_confirmar,
        (SELECT COUNT(*) FROM avisos WHERE estado = 'abierto') AS avisos_abiertos,
        (SELECT COALESCE(MAX(actualizado_en), 0) FROM pedidos) AS ultima_actualizacion,
        (SELECT COALESCE(MAX(id), 0) FROM avisos) AS ultimo_aviso`,
    );
    return {
      porConfirmar: numero(fila?.por_confirmar),
      avisosAbiertos: numero(fila?.avisos_abiertos),
      ultimaActualizacionDePedidos: numero(fila?.ultima_actualizacion),
      ultimoAviso: numero(fila?.ultimo_aviso),
    };
  }

  /** Borra lo que el cliente escribió en los avisos de hace más de 90 días (el aviso queda, sin el texto). */
  async limpiar(ahoraSegundos: number): Promise<void> {
    if (this.azar() >= PROBABILIDAD_LIMPIEZA) return;
    await this.cambios("UPDATE avisos SET texto = '' WHERE creado_en < ?1 AND texto != ''", ahoraSegundos - RETENCION_TEXTO_SEGUNDOS);
  }
}
