/**
 * Respaldo de la base en Google Sheets (D66). Franco pidió no depender solo de la base: si D1 fallara, los pedidos y
 * los clientes siguen en la planilla de Brunen, legibles por una persona y suficientes para reconstruir la base
 * (`scripts/restaurar-respaldo.mjs`).
 *
 * - RESPALDO_PEDIDOS: cada 30 minutos se agregan al final los pedidos nuevos o que cambiaron, con todos sus datos.
 *   Nunca se borra ni se reescribe nada: es un registro. El estado vigente de un pedido es su última fila.
 * - RESPALDO_CLIENTES: cada noche, una copia completa de las fichas (teléfonos y dirección vigente).
 *
 * Las celdas se escriben "tal cual" (RAW): un nombre que empieza con "=" queda como texto, no como fórmula. No se
 * respaldan las cuentas del panel ni sus claves. Si Google falla, se reintenta en la vuelta siguiente desde el mismo
 * punto, y si pasa un día sin respaldo con cambios pendientes, la revisión diaria deja un aviso.
 */

import type { BaseDatos } from './almacen';
import { fechaHoraLocal } from './despacho';
import { ClienteSheets, type CuentaServicio } from './google';

/** La planilla de Brunen como destino del respaldo, o null si no está configurada. */
export function hojasDeRespaldo(env: { GOOGLE_SERVICE_ACCOUNT_JSON?: string; GOOGLE_SHEET_ID?: string }): HojasDeRespaldo | null {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.GOOGLE_SHEET_ID) return null;
  try {
    const cuenta = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as Partial<CuentaServicio>;
    if (!cuenta.client_email || !cuenta.private_key) return null;
    const cliente = new ClienteSheets({ client_email: cuenta.client_email, private_key: cuenta.private_key }, env.GOOGLE_SHEET_ID);
    return {
      titulosDeHojas: () => cliente.titulosDeHojas(),
      crearHoja: (titulo) => cliente.crearHoja(titulo),
      agregarFilas: (hoja, filas) => cliente.agregarFilas(hoja, filas),
      escribirRango: (rango, filas) => cliente.escribirRango(rango, filas),
      limpiarRango: (rango) => cliente.limpiarRango(rango),
    };
  } catch {
    return null;
  }
}

export const HOJA_PEDIDOS = 'RESPALDO_PEDIDOS';
export const HOJA_CLIENTES = 'RESPALDO_CLIENTES';
/** Pedidos por vuelta (cada 30 minutos): con el historial cargado (unos 7.000), la primera copia completa toma unas 12 horas. */
export const PEDIDOS_POR_VUELTA = 300;
/** Más de esto sin respaldar, con cambios pendientes, deja un aviso. */
export const ATRASO_PARA_AVISAR_S = 26 * 3600;

export const ENCABEZADO_PEDIDOS = [
  'Respaldado_En', 'ID_Pedido', 'Creado', 'Fecha_Entrega', 'Fecha_Confirmada', 'Estado', 'Nombre', 'Telefono', 'Direccion',
  'Comuna', 'Bidones', 'Total', 'Forma_Pago', 'Estado_Pago', 'Documento', 'Numero_Documento', 'Tipo_Cliente',
  'Notas_Repartidor', 'Envases_A_Retirar', 'Vacios_Retirados', 'Cobrado_En_Entrega', 'Entregado', 'No_Entregado_Motivo',
  'Observaciones', 'Confirmado_Por', 'Lineas_JSON', 'Creado_Unix', 'Actualizado_Unix', 'Entregado_Unix', 'No_Entregado_Unix',
  'Cliente_Id',
] as const;

export const ENCABEZADO_CLIENTES = [
  'Cliente_Id', 'Nombre', 'Tipo_Cliente', 'Telefonos', 'Direccion_Vigente', 'Comuna', 'Notas_Repartidor', 'Direcciones_Usadas', 'Notas',
  'Actualizado',
] as const;

/** Lo que el respaldo necesita de la planilla (en las pruebas, un doble en memoria). */
export interface HojasDeRespaldo {
  titulosDeHojas(): Promise<string[]>;
  crearHoja(titulo: string): Promise<void>;
  agregarFilas(hoja: string, filas: ReadonlyArray<ReadonlyArray<string | number>>): Promise<void>;
  escribirRango(rango: string, filas: ReadonlyArray<ReadonlyArray<string | number>>): Promise<void>;
  limpiarRango(rango: string): Promise<void>;
}

type Celda = string | number;
type Fila = Record<string, unknown>;

const COLUMNAS_SQL = `id, creado_en, telefono, nombre, comuna, direccion, fecha_entrega, fecha_confirmada, estado, lineas, total,
  notas_repartidor, envases_a_retirar, observaciones, confirmado_por, actualizado_en, forma_pago, estado_pago, documento,
  numero_documento, tipo_cliente, cliente_id, entregado_en, vacios_retirados, cobrado_en_entrega, no_entregado_en, no_entregado_motivo`;

const texto = (valor: unknown): string => (valor === null || valor === undefined ? '' : String(valor));
const numero = (valor: unknown): Celda => (typeof valor === 'number' && Number.isFinite(valor) ? valor : '');

/** "2026-11-14 10:32", en hora de Santiago. */
export function fechaHoraLegible(segundos: unknown): string {
  if (typeof segundos !== 'number' || !Number.isFinite(segundos) || segundos <= 0) return '';
  const desfase = desfaseDelDia(segundos);
  if (desfase === null) {
    const local = fechaHoraLocal(new Date(segundos * 1000));
    return `${local.fecha} ${String(local.hora).padStart(2, '0')}:${String(local.minuto).padStart(2, '0')}`;
  }
  return new Date((segundos + desfase) * 1000).toISOString().slice(0, 16).replace('T', ' ');
}

/**
 * Cuántos segundos hay que sumarle a la hora UTC para tener la de Santiago, por día UTC. Convertir cada fecha con Intl
 * gasta CPU (500 pedidos son 1.500 fechas, unos 10 ms: todo el plan gratis), y el desfase solo cambia dos veces al año.
 * null = ese día cambia el horario (verano o invierno): esas fechas se convierten una por una.
 */
const desfasesPorDia = new Map<number, number | null>();

function desfaseDelDia(segundos: number): number | null {
  const dia = Math.floor(segundos / 86_400);
  let desfase = desfasesPorDia.get(dia);
  if (desfase === undefined) {
    const inicio = desfaseEn(dia * 86_400);
    desfase = inicio === desfaseEn(dia * 86_400 + 86_399) ? inicio : null;
    if (desfasesPorDia.size > 5000) desfasesPorDia.clear();
    desfasesPorDia.set(dia, desfase);
  }
  return desfase;
}

function desfaseEn(segundos: number): number {
  const local = fechaHoraLocal(new Date(segundos * 1000));
  const [ano, mes, dia] = local.fecha.split('-').map(Number) as [number, number, number];
  const comoUtc = Date.UTC(ano, mes - 1, dia, local.hora, local.minuto) / 1000;
  return comoUtc - (segundos - (segundos % 60));
}

/** "3 × 20 L, 1 × 12 L" a partir de las líneas guardadas. */
export function bidonesEnTexto(lineasJson: unknown): string {
  try {
    const lineas = JSON.parse(texto(lineasJson)) as Array<{ tipo?: unknown; cantidad?: unknown }>;
    return Array.isArray(lineas)
      ? lineas.map((l) => `${texto(l.cantidad)} × ${texto(l.tipo).replace('L', ' L')}`).join(', ')
      : '';
  } catch {
    return '';
  }
}

/** Una fila de RESPALDO_PEDIDOS, en el orden de `ENCABEZADO_PEDIDOS`. */
export function filaDePedido(p: Fila, respaldadoEn: number): Celda[] {
  return [
    fechaHoraLegible(respaldadoEn),
    texto(p.id),
    fechaHoraLegible(p.creado_en),
    texto(p.fecha_entrega),
    texto(p.fecha_confirmada),
    texto(p.estado),
    texto(p.nombre),
    texto(p.telefono),
    texto(p.direccion),
    texto(p.comuna),
    bidonesEnTexto(p.lineas),
    numero(p.total),
    texto(p.forma_pago),
    texto(p.estado_pago),
    texto(p.documento),
    texto(p.numero_documento),
    texto(p.tipo_cliente),
    texto(p.notas_repartidor),
    numero(p.envases_a_retirar),
    numero(p.vacios_retirados),
    numero(p.cobrado_en_entrega),
    fechaHoraLegible(p.entregado_en),
    texto(p.no_entregado_motivo),
    texto(p.observaciones),
    texto(p.confirmado_por),
    texto(p.lineas),
    numero(p.creado_en),
    numero(p.actualizado_en),
    numero(p.entregado_en),
    numero(p.no_entregado_en),
    numero(p.cliente_id),
  ];
}

interface Marca {
  hasta: number;
  ultimoId: string;
  filas: number;
  ultimoOk: number | null;
}

export class RepositorioRespaldo {
  constructor(private readonly db: BaseDatos) {}

  async marca(hoja: string): Promise<Marca> {
    const [fila] = ((await this.db.prepare('SELECT hasta, ultimo_id, filas, ultimo_ok FROM respaldos WHERE hoja = ?1').bind(hoja).run()).results ?? []) as Fila[];
    return {
      hasta: Number(fila?.hasta ?? 0),
      ultimoId: texto(fila?.ultimo_id),
      filas: Number(fila?.filas ?? 0),
      ultimoOk: typeof fila?.ultimo_ok === 'number' ? fila.ultimo_ok : null,
    };
  }

  async avanzar(hoja: string, hasta: number, ultimoId: string, filasNuevas: number, ahora: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO respaldos (hoja, hasta, ultimo_id, filas, ultimo_ok, ultimo_error) VALUES (?1, ?2, ?3, ?4, ?5, '')
         ON CONFLICT (hoja) DO UPDATE SET hasta = ?2, ultimo_id = ?3, filas = respaldos.filas + ?4, ultimo_ok = ?5, ultimo_error = ''`,
      )
      .bind(hoja, hasta, ultimoId, filasNuevas, ahora)
      .run();
  }

  async anotarError(hoja: string, error: string): Promise<void> {
    await this.db
      .prepare(`INSERT INTO respaldos (hoja, ultimo_error) VALUES (?1, ?2) ON CONFLICT (hoja) DO UPDATE SET ultimo_error = ?2`)
      .bind(hoja, error.slice(0, 300))
      .run();
  }

  /** Los pedidos que cambiaron después de la marca, del más antiguo al más nuevo. */
  async pedidosDesde(hasta: number, ultimoId: string, limite: number): Promise<Fila[]> {
    const r = await this.db
      .prepare(
        `SELECT ${COLUMNAS_SQL} FROM pedidos WHERE actualizado_en > ?1 OR (actualizado_en = ?1 AND id > ?2)
         ORDER BY actualizado_en, id LIMIT ?3`,
      )
      .bind(hasta, ultimoId, limite)
      .run();
    return (r.results ?? []) as Fila[];
  }

  /** ¿Hay pedidos sin respaldar? (Para no avisar de un atraso cuando no hubo nada que copiar.) */
  async hayPendientes(hasta: number, ultimoId: string): Promise<boolean> {
    return (await this.pedidosDesde(hasta, ultimoId, 1)).length > 0;
  }

  /** Una página de todos los pedidos, por número, para la descarga en Excel del panel. */
  async pagina(despuesDe: string, limite: number): Promise<Fila[]> {
    const r = await this.db.prepare(`SELECT ${COLUMNAS_SQL} FROM pedidos WHERE id > ?1 ORDER BY id LIMIT ?2`).bind(despuesDe, limite).run();
    return (r.results ?? []) as Fila[];
  }

  /** Cómo va el respaldo de cada hoja, para mostrarlo en el panel. */
  async estado(): Promise<Array<{ hoja: string; filas: number; ultimoOk: number | null; ultimoError: string }>> {
    const r = await this.db.prepare('SELECT hoja, filas, ultimo_ok, ultimo_error FROM respaldos ORDER BY hoja').bind().run();
    return ((r.results ?? []) as Fila[]).map((f) => ({
      hoja: texto(f.hoja),
      filas: Number(f.filas ?? 0),
      ultimoOk: typeof f.ultimo_ok === 'number' ? f.ultimo_ok : null,
      ultimoError: texto(f.ultimo_error),
    }));
  }

  async clientes(): Promise<Fila[]> {
    const r = await this.db
      .prepare(
        `SELECT c.id, c.nombre, c.tipo_cliente, c.notas, c.actualizado_en,
           (SELECT group_concat(t.telefono, ' ') FROM telefonos_cliente t WHERE t.cliente_id = c.id) AS telefonos,
           d.direccion, d.comuna, d.notas_repartidor,
           (SELECT COUNT(*) FROM direcciones_cliente x WHERE x.cliente_id = c.id) AS direcciones
         FROM clientes c
         LEFT JOIN direcciones_cliente d ON d.id = (
           SELECT id FROM direcciones_cliente WHERE cliente_id = c.id ORDER BY ultimo_uso DESC, id DESC LIMIT 1)
         ORDER BY c.id LIMIT 20000`,
      )
      .bind()
      .run();
    return (r.results ?? []) as Fila[];
  }
}

/** Crea la hoja con su encabezado si todavía no existe. */
async function asegurarHoja(hojas: HojasDeRespaldo, titulo: string, encabezado: readonly string[]): Promise<void> {
  if (!(await hojas.titulosDeHojas()).includes(titulo)) await hojas.crearHoja(titulo);
  await hojas.escribirRango(`${titulo}!A1`, [encabezado]);
}

/** Una vuelta del respaldo de pedidos. Devuelve cuántos pedidos copió. */
export async function respaldarPedidos(db: BaseDatos, hojas: HojasDeRespaldo, ahora: number): Promise<number> {
  const repo = new RepositorioRespaldo(db);
  const marca = await repo.marca(HOJA_PEDIDOS);
  const pedidos = await repo.pedidosDesde(marca.hasta, marca.ultimoId, PEDIDOS_POR_VUELTA);
  if (pedidos.length === 0) return 0;
  try {
    if (marca.filas === 0) await asegurarHoja(hojas, HOJA_PEDIDOS, ENCABEZADO_PEDIDOS);
    await hojas.agregarFilas(HOJA_PEDIDOS, pedidos.map((p) => filaDePedido(p, ahora)));
  } catch (falla) {
    await repo.anotarError(HOJA_PEDIDOS, falla instanceof Error ? falla.message : String(falla));
    throw falla;
  }
  const ultimo = pedidos[pedidos.length - 1] as Fila;
  await repo.avanzar(HOJA_PEDIDOS, Number(ultimo.actualizado_en), texto(ultimo.id), pedidos.length, ahora);
  return pedidos.length;
}

/** La copia completa de las fichas de clientes. Devuelve cuántas fichas escribió. */
export async function respaldarClientes(db: BaseDatos, hojas: HojasDeRespaldo, ahora: number): Promise<number> {
  const repo = new RepositorioRespaldo(db);
  const clientes = await repo.clientes();
  const filas: Celda[][] = clientes.map((c) => [
    numero(c.id),
    texto(c.nombre),
    texto(c.tipo_cliente),
    texto(c.telefonos),
    texto(c.direccion),
    texto(c.comuna),
    texto(c.notas_repartidor),
    numero(c.direcciones),
    texto(c.notas),
    fechaHoraLegible(c.actualizado_en),
  ]);
  try {
    if (!(await hojas.titulosDeHojas()).includes(HOJA_CLIENTES)) await hojas.crearHoja(HOJA_CLIENTES);
    // Primero se escribe lo nuevo y después se borra lo que sobra abajo: si algo falla, queda la copia anterior.
    await hojas.escribirRango(`${HOJA_CLIENTES}!A1`, [ENCABEZADO_CLIENTES, ...filas]);
    await hojas.limpiarRango(`${HOJA_CLIENTES}!A${filas.length + 2}:Z`);
  } catch (falla) {
    await repo.anotarError(HOJA_CLIENTES, falla instanceof Error ? falla.message : String(falla));
    throw falla;
  }
  const marca = await repo.marca(HOJA_CLIENTES);
  await repo.avanzar(HOJA_CLIENTES, marca.hasta, marca.ultimoId, 0, ahora);
  return filas.length;
}

/**
 * Segundos desde el último respaldo de pedidos que salió bien, si hay pedidos esperando y pasó más de
 * `ATRASO_PARA_AVISAR_S`; si no, null. Lo usa la revisión diaria para avisar.
 */
export async function respaldoAtrasado(db: BaseDatos, ahora: number): Promise<{ segundos: number; error: string } | null> {
  const repo = new RepositorioRespaldo(db);
  const marca = await repo.marca(HOJA_PEDIDOS);
  if (!(await repo.hayPendientes(marca.hasta, marca.ultimoId))) return null;
  const desde = marca.ultimoOk ?? 0;
  if (marca.ultimoOk !== null && ahora - desde < ATRASO_PARA_AVISAR_S) return null;
  const [fila] = ((await db.prepare('SELECT ultimo_error FROM respaldos WHERE hoja = ?1').bind(HOJA_PEDIDOS).run()).results ?? []) as Fila[];
  // Nunca respaldado y sin error: todavía no corrió la primera vuelta (recién publicado). No se avisa.
  if (marca.ultimoOk === null && !texto(fila?.ultimo_error)) return null;
  return { segundos: ahora - desde, error: texto(fila?.ultimo_error) };
}
