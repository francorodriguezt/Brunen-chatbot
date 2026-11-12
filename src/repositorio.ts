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

import { TIPOS_DE_AVISO_DE_PEDIDO, type Alerta, type TipoAlerta } from './alertas';
import type { BaseDatos } from './almacen';
import type { CompletarPedido, DatosPrevios, LineaPedido, PedidoARegistrar } from './pedidos';
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
  /** Lo que escribió el cliente, tomado del aviso del pedido (vacío si ya pasaron 90 días o no hubo texto). */
  mensajeCliente: string;
  /** Vacío = todavía no se sabe. Valores posibles en `OPCIONES_DE_PEDIDO`. */
  formaPago: FormaDePago | '';
  estadoPago: EstadoDePago;
  documento: Documento | '';
  numeroDocumento: string;
  tipoCliente: TipoDeCliente | '';
}

/**
 * Lo que el Excel de control de pedidos guarda y antes no estaba en la base (D52). Listas cerradas, sacadas de los
 * valores que de verdad aparecen en el Excel: allí la forma de pago se escribía de 16 maneras distintas.
 */
export const OPCIONES_DE_PEDIDO = {
  formaPago: ['transferencia', 'efectivo', 'redcompra', 'webpay', 'plan', 'otro'],
  estadoPago: ['pendiente', 'pagado'],
  documento: ['boleta', 'factura'],
  tipoCliente: ['hogar', 'minimarket', 'empresa'],
} as const;
export type FormaDePago = (typeof OPCIONES_DE_PEDIDO.formaPago)[number];
export type EstadoDePago = (typeof OPCIONES_DE_PEDIDO.estadoPago)[number];
export type Documento = (typeof OPCIONES_DE_PEDIDO.documento)[number];
export type TipoDeCliente = (typeof OPCIONES_DE_PEDIDO.tipoCliente)[number];

/** Datos de pago y documento de un pedido; todos opcionales al cambiar o al anotar. */
export interface DatosDePago {
  formaPago?: FormaDePago | '';
  estadoPago?: EstadoDePago;
  documento?: Documento | '';
  numeroDocumento?: string;
  tipoCliente?: TipoDeCliente | '';
}

const DE_LA_LISTA = (lista: readonly string[], valor: unknown, vacioPermitido = true): boolean =>
  typeof valor === 'string' && ((vacioPermitido && valor === '') || lista.includes(valor));

/** null si algún valor no está en su lista o el número de documento es raro. */
function datosDePagoValidos(d: DatosDePago): boolean {
  if (d.formaPago !== undefined && !DE_LA_LISTA(OPCIONES_DE_PEDIDO.formaPago, d.formaPago)) return false;
  if (d.estadoPago !== undefined && !DE_LA_LISTA(OPCIONES_DE_PEDIDO.estadoPago, d.estadoPago, false)) return false;
  if (d.documento !== undefined && !DE_LA_LISTA(OPCIONES_DE_PEDIDO.documento, d.documento)) return false;
  if (d.tipoCliente !== undefined && !DE_LA_LISTA(OPCIONES_DE_PEDIDO.tipoCliente, d.tipoCliente)) return false;
  if (d.numeroDocumento !== undefined && (typeof d.numeroDocumento !== 'string' || !/^[0-9A-Za-z -]{0,20}$/.test(d.numeroDocumento.trim()))) return false;
  return true;
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

export interface CambiosDePedido extends DatosDePago {
  fechaConfirmada?: string | null;
  comuna?: string;
  direccion?: string;
  notasRepartidor?: string;
  envasesARetirar?: number;
  lineas?: LineaEditable[];
}

/** Un pedido que una persona anota en el panel: el que llegó por teléfono, por un audio o de una empresa con plan mensual. */
export interface PedidoManual extends DatosDePago {
  /** Solo dígitos, con código de país, o vacío si todavía no se sabe. */
  telefono: string;
  nombre: string;
  comuna: string;
  direccion: string;
  /** Día de entrega (YYYY-MM-DD). */
  fecha: string;
  lineas: LineaEditable[];
  notasRepartidor: string;
  envasesARetirar: number;
  /** true = queda confirmado de una vez, si todas las líneas tienen precio. */
  confirmar: boolean;
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
/** Hasta cuándo un pedido anterior sirve para reconocer al cliente sin preguntarle sus datos (D40, D55). */
export const VIGENCIA_DEL_PEDIDO_ANTERIOR_SEGUNDOS = 365 * 24 * 3600;
const CLAVES_DE_PAGO: ReadonlySet<string> = new Set(['formaPago', 'estadoPago', 'documento', 'numeroDocumento']);
const MAX_TEXTO = 500;
const MAX_LINEAS = 5;
const INTENTOS_DE_ID = 5;
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

/** Las líneas tal como las manda la pantalla, ya revisadas y con su subtotal; null si alguna no es válida. */
function aLineasValidadas(lineas: readonly LineaEditable[]): LineaPedido[] | null {
  if (lineas.length === 0 || lineas.length > MAX_LINEAS) return null;
  const validas: LineaPedido[] = [];
  for (const l of lineas) {
    if (typeof l !== 'object' || l === null) return null;
    const cantidadOk = Number.isInteger(l.cantidad) && l.cantidad >= 1 && l.cantidad <= 999;
    const precioOk = l.precioUnitario === null || (Number.isInteger(l.precioUnitario) && l.precioUnitario >= 0 && l.precioUnitario <= 1_000_000);
    if (!TIPOS.has(l.tipo) || !cantidadOk || !precioOk) return null;
    validas.push({ tipo: l.tipo, cantidad: l.cantidad, precioUnitario: l.precioUnitario, subtotal: l.precioUnitario === null ? null : l.precioUnitario * l.cantidad });
  }
  return validas;
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
    mensajeCliente: texto(fila.mensaje_cliente),
    formaPago: texto(fila.forma_pago) as FormaDePago | '',
    estadoPago: fila.estado_pago === 'pagado' ? 'pagado' : 'pendiente',
    documento: texto(fila.documento) as Documento | '',
    numeroDocumento: texto(fila.numero_documento),
    tipoCliente: texto(fila.tipo_cliente) as TipoDeCliente | '',
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

/** Los tipos son constantes del código (no vienen del usuario), así que se pueden escribir directo en el SQL. */
const TIPOS_DE_PEDIDO_SQL = TIPOS_DE_AVISO_DE_PEDIDO.map((tipo) => `'${tipo}'`).join(', ');

// `mensaje_cliente`: lo que escribió al hacer el pedido, del aviso que nació con él (no de un reclamo o pago posterior).
const COLUMNAS_PEDIDO = `id, creado_en, telefono, nombre, comuna, direccion, fecha_entrega, fecha_confirmada, estado, lineas, total, notas_repartidor, envases_a_retirar, observaciones, confirmado_por, actualizado_en,
  forma_pago, estado_pago, documento, numero_documento, tipo_cliente,
  (SELECT texto FROM avisos WHERE avisos.id_pedido = pedidos.id AND avisos.tipo IN (${TIPOS_DE_PEDIDO_SQL}) AND avisos.texto != '' ORDER BY avisos.id LIMIT 1) AS mensaje_cliente`;

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

/**
 * Lo que el panel pregunta cada pocos segundos mientras está abierto. D1 gratis permite 5 millones de filas leídas por
 * día y esta consulta se repite miles de veces: cada parte tiene que resolverse con un índice (la prueba lo vigila).
 */
export const SQL_RESUMEN = `SELECT
  (SELECT COUNT(*) FROM pedidos WHERE estado IN ('Pendiente_Confirmacion', 'Fuera_de_zona')) AS por_confirmar,
  (SELECT COUNT(*) FROM avisos WHERE estado = 'abierto' AND tipo NOT IN (${TIPOS_DE_PEDIDO_SQL})) AS avisos_abiertos,
  (SELECT COALESCE(MAX(actualizado_en), 0) FROM pedidos) AS ultima_actualizacion,
  (SELECT COALESCE(MAX(id), 0) FROM avisos) AS ultimo_aviso`;

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

  /**
   * El cliente nuevo dio sus datos (D37). Llena solo lo que está vacío (nunca pisa lo que escribió una persona), suma a
   * las notas y a las observaciones y, si la comuna no se atiende, pasa el pedido a Fuera_de_zona, pero solo si seguía
   * pendiente de confirmar. false si el pedido no existe o ya se entregó o se canceló.
   */
  async completarDatos(c: CompletarPedido, ahoraSegundos: number): Promise<boolean> {
    const hecho = await this.cambios(
      `UPDATE pedidos SET
         nombre = CASE WHEN nombre = '' THEN ?1 ELSE nombre END,
         direccion = CASE WHEN direccion = '' THEN ?2 ELSE direccion END,
         comuna = CASE WHEN comuna = '' THEN ?3 ELSE comuna END,
         notas_repartidor = CASE WHEN ?4 = '' THEN notas_repartidor WHEN notas_repartidor = '' THEN ?4 ELSE substr(notas_repartidor || '. ' || ?4, 1, ${MAX_TEXTO}) END,
         observaciones = CASE WHEN ?5 = '' THEN observaciones WHEN observaciones = '' THEN ?5 ELSE substr(observaciones || ' | ' || ?5, 1, ${MAX_TEXTO}) END,
         estado = CASE WHEN ?6 = 'Fuera_de_zona' AND estado = 'Pendiente_Confirmacion' THEN 'Fuera_de_zona' ELSE estado END,
         actualizado_en = MAX(actualizado_en + 1, ?7)
       WHERE id = ?8 AND estado NOT IN ('Entregado', 'Cancelado')`,
      (c.nombre ?? '').slice(0, 80),
      (c.direccion ?? '').slice(0, 200),
      (c.comuna ?? '').slice(0, 80),
      (c.notasRepartidor ?? '').slice(0, MAX_TEXTO),
      (c.observacion ?? '').slice(0, MAX_TEXTO),
      c.estado ?? '',
      ahoraSegundos,
      c.idPedido,
    );
    if (hecho === 0) return false;
    const partes = [
      c.nombre ? 'nombre' : '',
      c.direccion ? 'dirección' : '',
      c.comuna ? 'comuna' : '',
      c.notasRepartidor ? 'notas' : '',
      c.observacion ? 'observaciones' : '',
      c.estado ? 'zona' : '',
    ].filter(Boolean);
    await this.anotarHistorial(c.idPedido, ahoraSegundos, 'bot', 'datos del cliente', partes.join(', '));
    return true;
  }

  /**
   * Los datos del último pedido de este teléfono que tiene dirección y no se canceló (D40). Sirve para reconocer a un
   * cliente que ya pidió por el bot aunque todavía no esté en la hoja CLIENTES: no se le vuelve a preguntar su dirección.
   */
  async datosDelUltimoPedido(telefono: string, ahoraSegundos: number = Math.floor(Date.now() / 1000)): Promise<DatosPrevios | null> {
    // Solo pedidos del último año: las compañías reasignan los números que dejan de usarse, y con el historial
    // cargado (D54) quien reciba un número reciclado vería la dirección del dueño anterior en "Entrega en" (D55).
    const [fila] = await this.filas(
      `SELECT id, nombre, direccion, comuna, notas_repartidor FROM pedidos
       WHERE telefono = ?1 AND direccion != '' AND estado != 'Cancelado' AND creado_en >= ?2 ORDER BY creado_en DESC, rowid DESC LIMIT 1`,
      telefono,
      ahoraSegundos - VIGENCIA_DEL_PEDIDO_ANTERIOR_SEGUNDOS,
    );
    return fila
      ? { idPedido: texto(fila.id), nombre: texto(fila.nombre), direccion: texto(fila.direccion), comuna: texto(fila.comuna), notasRepartidor: texto(fila.notas_repartidor) }
      : null;
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

  /** Los pedidos de una ficha de cliente (D53), del más nuevo al más antiguo. */
  async pedidosDeCliente(clienteId: number, limite = 30): Promise<PedidoGuardado[]> {
    const tope = Math.min(Math.max(Math.trunc(limite), 1), 100);
    const filas = await this.filas(`SELECT ${COLUMNAS_PEDIDO} FROM pedidos WHERE cliente_id = ?1 ORDER BY creado_en DESC, rowid DESC LIMIT ${tope}`, clienteId);
    return filas.map(aPedido);
  }

  /** Los pedidos de un día (por su fecha confirmada o, si no la hay, la propuesta), sin los cancelados: de aquí sale el reparto. */
  async pedidosDelDia(fecha: string): Promise<PedidoGuardado[]> {
    const filas = await this.filas(
      `SELECT ${COLUMNAS_PEDIDO} FROM pedidos WHERE COALESCE(fecha_confirmada, fecha_entrega) = ?1 AND estado != 'Cancelado' ORDER BY creado_en, rowid LIMIT 500`,
      fecha,
    );
    return filas.map(aPedido);
  }

  /**
   * Busca por parte del nombre, la dirección, el número de pedido o el teléfono, del más nuevo al más antiguo. Recorre
   * la tabla completa, así que solo corre cuando alguien busca (no en la consulta que se repite cada pocos segundos).
   */
  async buscarPedidos(textoBuscado: string, limite = 50): Promise<PedidoGuardado[]> {
    const limpio = textoBuscado.trim().slice(0, 60);
    if (limpio.length < 2) return [];
    // % y _ son comodines de LIKE: se escapan para buscarlos como texto.
    const patron = `%${limpio.replace(/[\\%_]/g, '\\$&')}%`;
    const digitos = limpio.replace(/\D/g, '');
    const patronTelefono = digitos.length >= 3 ? `%${digitos}%` : '';
    const tope = Math.min(Math.max(Math.trunc(limite), 1), 100);
    const filas = await this.filas(
      `SELECT ${COLUMNAS_PEDIDO} FROM pedidos
       WHERE nombre LIKE ?1 ESCAPE '\\' OR direccion LIKE ?1 ESCAPE '\\' OR id LIKE ?1 ESCAPE '\\' OR (?2 != '' AND telefono LIKE ?2)
       ORDER BY creado_en DESC, rowid DESC LIMIT ${tope}`,
      patron,
      patronTelefono,
    );
    return filas.map(aPedido);
  }

  /**
   * Anota un pedido que no llegó por el bot. `hoyLocal` es la fecha de hoy en Santiago (YYYY-MM-DD): con ella se arma el
   * número de pedido, igual que los del bot, y el final se sortea. Con `confirmar` y todos los precios, queda confirmado.
   */
  async crearPedido(p: PedidoManual, quien: string, ahoraSegundos: number, hoyLocal: string): Promise<ResultadoRepo<PedidoGuardado>> {
    if (!fechaValida(p.fecha)) return { ok: false, error: 'fecha_invalida' };
    const lineas = aLineasValidadas(p.lineas);
    const telefonoOk = p.telefono === '' || /^\d{8,15}$/.test(p.telefono);
    const envasesOk = Number.isInteger(p.envasesARetirar) && p.envasesARetirar >= 0 && p.envasesARetirar <= 999;
    if (!lineas || !telefonoOk || !envasesOk || !datosDePagoValidos(p)) return { ok: false, error: 'datos_invalidos' };

    const total = calcularTotal(lineas);
    const prefijo = `P${hoyLocal.slice(2, 4)}${hoyLocal.slice(5, 7)}${hoyLocal.slice(8, 10)}-`;
    for (let intento = 0; intento < INTENTOS_DE_ID; intento++) {
      const id = prefijo + Array.from({ length: 5 }, () => Math.min(35, Math.floor(this.azar() * 36)).toString(36).toUpperCase()).join('');
      const creado = await this.cambios(
        `INSERT INTO pedidos (id, creado_en, telefono, nombre, comuna, direccion, fecha_entrega, estado, lineas, total, notas_repartidor, envases_a_retirar, observaciones, actualizado_en,
                              forma_pago, estado_pago, documento, numero_documento, tipo_cliente)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 'Pendiente_Confirmacion', ?8, ?9, ?10, ?11, 'Anotado a mano en el panel.', ?2, ?12, ?13, ?14, ?15, ?16) ON CONFLICT(id) DO NOTHING`,
        id, ahoraSegundos, p.telefono, p.nombre.trim().slice(0, 80), p.comuna.trim().slice(0, 80), p.direccion.trim().slice(0, 200), p.fecha,
        JSON.stringify(lineas), total, p.notasRepartidor.trim().slice(0, MAX_TEXTO), p.envasesARetirar,
        p.formaPago ?? '', p.estadoPago ?? 'pendiente', p.documento ?? '', (p.numeroDocumento ?? '').trim(), p.tipoCliente ?? '',
      );
      if (creado === 0) continue; // ese número ya existe: se sortea otro
      await this.anotarHistorial(id, ahoraSegundos, quien, 'creado', 'a mano en el panel');
      if (p.confirmar && total !== null) await this.cambiarEstado(id, 'Confirmado', quien, ahoraSegundos);
      return { ok: true, valor: (await this.obtenerPedido(id)) as PedidoGuardado };
    }
    return { ok: false, error: 'conflicto' };
  }

  async historialDe(id: string): Promise<Array<{ en: number; quien: string; accion: string; detalle: string }>> {
    const filas = await this.filas('SELECT en, quien, accion, detalle FROM historial_pedidos WHERE pedido_id = ?1 ORDER BY en, id', id);
    return filas.map((f) => ({ en: numero(f.en), quien: texto(f.quien), accion: texto(f.accion), detalle: texto(f.detalle) }));
  }

  /**
   * Cambia el estado. `confirmado_por` y la fecha confirmada se llenan al confirmar. `versionVista` es el
   * `actualizadoEn` del pedido que la persona tenía en pantalla: si alguien (otra persona o el bot) lo cambió después,
   * devuelve "conflicto" y no toca nada, para que nadie confirme algo distinto de lo que vio. La versión sube con cada
   * cambio, aunque dos caigan en el mismo segundo.
   */
  async cambiarEstado(
    id: string,
    nuevo: EstadoDePedido,
    quien: string,
    ahoraSegundos: number,
    opciones: { fechaConfirmada?: string; motivo?: string; versionVista?: number } = {},
  ): Promise<ResultadoRepo<PedidoGuardado>> {
    if (!ESTADOS_DE_PEDIDO.includes(nuevo)) return { ok: false, error: 'datos_invalidos' };
    const actual = await this.obtenerPedido(id);
    if (!actual) return { ok: false, error: 'no_existe' };
    if (opciones.versionVista !== undefined && opciones.versionVista !== actual.actualizadoEn) return { ok: false, error: 'conflicto' };
    if (!TRANSICIONES[actual.estado]?.includes(nuevo)) return { ok: false, error: 'transicion_invalida' };

    let fechaConfirmada = actual.fechaConfirmada;
    if (nuevo === 'Confirmado') {
      if (actual.total === null) return { ok: false, error: 'falta_precio' };
      fechaConfirmada = opciones.fechaConfirmada ?? actual.fechaConfirmada ?? actual.fechaEntrega;
      if (!fechaValida(fechaConfirmada)) return { ok: false, error: 'fecha_invalida' };
    }
    const cambiado = await this.cambios(
      `UPDATE pedidos SET estado = ?1, actualizado_en = MAX(actualizado_en + 1, ?2), fecha_confirmada = ?3, confirmado_por = CASE WHEN ?1 = 'Confirmado' THEN ?4 ELSE confirmado_por END
       WHERE id = ?5 AND estado = ?6 AND actualizado_en = ?7`,
      nuevo, ahoraSegundos, fechaConfirmada, quien, id, actual.estado, actual.actualizadoEn,
    );
    if (cambiado === 0) return { ok: false, error: 'conflicto' };
    await this.anotarHistorial(id, ahoraSegundos, quien, `estado: ${actual.estado} -> ${nuevo}`, opciones.motivo ?? '');
    return { ok: true, valor: (await this.obtenerPedido(id)) as PedidoGuardado };
  }

  /**
   * Corrige datos del pedido. Las líneas se recalculan: el subtotal de cada una y el total salen de cantidad y precio.
   * `versionVista` funciona igual que en `cambiarEstado`.
   */
  async editarPedido(id: string, cambios: CambiosDePedido, quien: string, ahoraSegundos: number, versionVista?: number): Promise<ResultadoRepo<PedidoGuardado>> {
    const actual = await this.obtenerPedido(id);
    if (!actual) return { ok: false, error: 'no_existe' };
    if (versionVista !== undefined && versionVista !== actual.actualizadoEn) return { ok: false, error: 'conflicto' };
    if (!datosDePagoValidos(cambios)) return { ok: false, error: 'datos_invalidos' };
    // Sin nada que cambiar no se escribe: no sube la versión ni deja un "editado" vacío en el historial.
    if (Object.values(cambios).every((v) => v === undefined)) return { ok: true, valor: actual };
    const soloPago = Object.keys(cambios).every((clave) => CLAVES_DE_PAGO.has(clave));
    // Un pedido entregado todavía se puede marcar pagado o anotarle la factura: eso pasa después de entregar.
    if (actual.estado === 'Cancelado' || (actual.estado === 'Entregado' && !soloPago)) return { ok: false, error: 'pedido_cerrado' };

    const fechaConfirmada = cambios.fechaConfirmada === undefined ? actual.fechaConfirmada : cambios.fechaConfirmada;
    if (fechaConfirmada !== null && !fechaValida(fechaConfirmada)) return { ok: false, error: 'fecha_invalida' };

    let lineas = actual.lineas;
    if (cambios.lineas) {
      const nuevas = aLineasValidadas(cambios.lineas);
      if (!nuevas) return { ok: false, error: 'datos_invalidos' };
      lineas = nuevas;
    }
    const comuna = (cambios.comuna ?? actual.comuna).slice(0, 80);
    const direccion = (cambios.direccion ?? actual.direccion).slice(0, 200);
    const notas = (cambios.notasRepartidor ?? actual.notasRepartidor).slice(0, MAX_TEXTO);
    const envases = cambios.envasesARetirar ?? actual.envasesARetirar;
    if (!Number.isInteger(envases) || envases < 0 || envases > 999) return { ok: false, error: 'datos_invalidos' };

    const hecho = await this.cambios(
      `UPDATE pedidos SET fecha_confirmada = ?1, comuna = ?2, direccion = ?3, notas_repartidor = ?4, lineas = ?5, total = ?6, actualizado_en = MAX(actualizado_en + 1, ?7), envases_a_retirar = ?10,
         forma_pago = ?11, estado_pago = ?12, documento = ?13, numero_documento = ?14, tipo_cliente = ?15
       WHERE id = ?8 AND actualizado_en = ?9`,
      fechaConfirmada, comuna, direccion, notas, JSON.stringify(lineas), calcularTotal(lineas), ahoraSegundos, id, actual.actualizadoEn, envases,
      cambios.formaPago ?? actual.formaPago, cambios.estadoPago ?? actual.estadoPago, cambios.documento ?? actual.documento,
      (cambios.numeroDocumento ?? actual.numeroDocumento).trim(), cambios.tipoCliente ?? actual.tipoCliente,
    );
    if (hecho === 0) return { ok: false, error: 'conflicto' };
    const partes = [
      cambios.lineas ? 'líneas' : '',
      cambios.fechaConfirmada !== undefined ? 'fecha' : '',
      cambios.comuna !== undefined ? 'comuna' : '',
      cambios.direccion !== undefined ? 'dirección' : '',
      cambios.notasRepartidor !== undefined ? 'notas' : '',
      cambios.envasesARetirar !== undefined ? 'envases' : '',
      cambios.formaPago !== undefined ? `forma de pago: ${cambios.formaPago || 'sin definir'}` : '',
      cambios.estadoPago !== undefined ? `pago: ${cambios.estadoPago}` : '',
      cambios.documento !== undefined ? `documento: ${cambios.documento || 'ninguno'}` : '',
      cambios.numeroDocumento !== undefined ? 'número de documento' : '',
      cambios.tipoCliente !== undefined ? `tipo de cliente: ${cambios.tipoCliente || 'sin definir'}` : '',
    ].filter(Boolean);
    await this.anotarHistorial(id, ahoraSegundos, quien, 'editado', partes.join(', '));
    return { ok: true, valor: (await this.obtenerPedido(id)) as PedidoGuardado };
  }

  /** La bandeja de avisos: sin los que nacen con un pedido, que se ven en el pedido (ver `TIPOS_DE_AVISO_DE_PEDIDO`). */
  async listarAvisos(estado: 'abierto' | 'resuelto' = 'abierto', limite = 100): Promise<AvisoGuardado[]> {
    const tope = Math.min(Math.max(Math.trunc(limite), 1), 300);
    const filas = await this.filas(
      `SELECT id, creado_en, tipo, telefono, nombre, resumen, motivos, texto, id_pedido, estado, resuelto_por, resuelto_en FROM avisos
       WHERE estado = ?1 AND tipo NOT IN (${TIPOS_DE_PEDIDO_SQL}) ORDER BY creado_en DESC, id DESC LIMIT ${tope}`,
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
    const [fila] = await this.filas(SQL_RESUMEN);
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
