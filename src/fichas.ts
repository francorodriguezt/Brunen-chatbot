/**
 * Fichas de clientes en la base (fase B, D53; no confundir con `clientes.ts`, que lee la hoja CLIENTES para el bot): una ficha por cliente, con varios teléfonos y su historial de direcciones.
 *
 * Por qué una ficha y no "el teléfono es el cliente": en el Excel real hay teléfonos con varios nombres (una oficina,
 * una familia) y clientes con varios teléfonos. El teléfono sirve para reconocerlo; la ficha es la persona o la empresa.
 *
 * Cómo se llenan: el bot no cambia, sigue anotando pedidos. `vincularPendientes` toma los pedidos que todavía no tienen
 * cliente y los asocia por su teléfono (si el teléfono no es de nadie, crea la ficha). Corre en pocos pasos cada vez,
 * porque el plan gratis de Cloudflare permite 50 consultas a la base por invocación.
 *
 * Las direcciones no se pisan: cada una queda con cuántas veces se usó y cuándo. La vigente es la última usada.
 */

import type { BaseDatos } from './almacen';
import { claveDeDireccion } from './identidad';
import { OPCIONES_DE_PEDIDO, type TipoDeCliente } from './repositorio';

export interface DireccionDeCliente {
  id: number;
  direccion: string;
  comuna: string;
  notasRepartidor: string;
  usos: number;
  primerUso: number;
  ultimoUso: number;
}

export interface ResumenDeCliente {
  id: number;
  nombre: string;
  tipoCliente: TipoDeCliente | '';
  telefonos: string[];
  /** La última dirección usada, o null si no tiene. */
  direccion: DireccionDeCliente | null;
  pedidos: number;
  /** Fecha de entrega del último pedido (YYYY-MM-DD), o null. */
  ultimoPedido: string | null;
}

export interface FichaDeCliente extends ResumenDeCliente, CondicionesDeFicha {
  notas: string;
  direcciones: DireccionDeCliente[];
  creadoEn: number;
}

/**
 * Lo que decide el precio y la atención del bot (D104): antes vivía solo en la hoja CLIENTES. Antes de la migración 0018
 * las columnas no existen y todo vale por defecto (sin precio especial, sin vacíos, no bloqueado).
 */
export interface CondicionesDeFicha {
  /** Pesos por bidón de 20 L, o null. Vale para cualquier tipo de cliente (un minimarket con precio propio). */
  precioEspecial20L: number | null;
  /** Vacíos que debe de antes (regla 5). */
  vaciosPendientes: number;
  /** Lo atiende una persona y el bot no anota sus pedidos (regla 14). */
  bloqueado: boolean;
}

/** Lo que el bot lee de la ficha de un teléfono: sus condiciones, su tipo y su dirección vigente. */
export interface FichaParaBot extends CondicionesDeFicha {
  id: number;
  nombre: string;
  tipoCliente: TipoDeCliente | '';
  direccion: string;
  comuna: string;
}

export type ErrorDeCliente = 'no_existe' | 'datos_invalidos' | 'telefono_invalido' | 'telefono_de_otro' | 'mismo_cliente' | 'pedidos_vivos';

/** Lo que quedó después de borrar los datos de un cliente (D87). */
export interface ResultadoDeOlvido {
  /** Pedidos que quedaron sin datos personales (se conservan para la contabilidad). */
  pedidos: number;
  avisos: number;
  telefonos: number;
  direcciones: number;
  /** Lo que vive fuera de la base y tiene que hacer una persona. */
  aMano: string[];
  /** Lo que se borra solo, más adelante. */
  seBorraSolo: string;
}

/** Las tareas a mano después de borrar a un cliente: la planilla guarda su historial y Telegram, sus comprobantes. */
function tareasAMano(telefonos: readonly string[]): string[] {
  const buscar = telefonos.join(' o ');
  return [
    `En la planilla, hoja RESPALDO_PEDIDOS: busca ${buscar || 'su nombre'} y borra esas filas. Esa hoja guarda todo el historial y no se borra sola.`,
    'Si el cliente está en la hoja CLIENTES de la planilla, borra su fila.',
    'En el grupo de Telegram, borra sus comprobantes y los avisos con sus datos.',
  ];
}
export type ResultadoCliente<T> = { ok: true; valor: T } | { ok: false; error: ErrorDeCliente; otroId?: number };

/**
 * Pedidos por vincular en cada pasada. Un pedido de un cliente nuevo usa hasta 6 consultas: 4 pedidos son 25 como
 * máximo, la mitad del tope de 50 por invocación del plan gratis, y queda el resto para la sesión, la lista o el vigía.
 * Lo normal es que haya 0 a 2 pendientes, porque la tarea programada pasa cada 5 minutos.
 */
export const VINCULAR_POR_PASADA = 4;

export { claveDeDireccion };

/** Un cliente que, por su ritmo de pedidos, ya debería haber pedido (D58). */
export interface ClientePorPedir {
  id: number;
  nombre: string;
  telefonos: string[];
  /** Cada cuántos días pide, normalmente (la mediana de sus últimos pedidos). */
  cadaDias: number;
  /** Fecha de entrega de su último pedido (YYYY-MM-DD). */
  ultimo: string;
  diasSinPedir: number;
}

/** Con menos pedidos no hay un ritmo confiable; los últimos 6 pesan más que los de hace un año. */
const MINIMO_DE_PEDIDOS = 4;
const PEDIDOS_QUE_CUENTAN = 6;
/** Se avisa cuando lleva una vez y media su ritmo sin pedir (y al menos dos días de atraso). */
const ATRASO_PARA_AVISAR = 1.5;
/** Más de esto sin pedir ya no es "le toca": es un cliente inactivo, que se cuenta aparte. */
const DIAS_PARA_INACTIVO = 120;
const MAXIMO_EN_LA_LISTA = 30;

const diasEntre = (desde: string, hasta: string): number => Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

function mediana(valores: number[]): number {
  const orden = [...valores].sort((a, b) => a - b);
  const medio = Math.floor(orden.length / 2);
  return orden.length % 2 === 1 ? (orden[medio] as number) : Math.round(((orden[medio - 1] as number) + (orden[medio] as number)) / 2);
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const numero = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

/** Las columnas de la migración 0018 en una fila de `clientes` leída con `SELECT *` (sin la migración, no vienen). */
function aCondiciones(f: Record<string, unknown> | undefined): CondicionesDeFicha {
  const precio = f?.precio_especial_20l;
  return {
    precioEspecial20L: precio === null || precio === undefined || precio === '' ? null : numero(precio) || null,
    vaciosPendientes: Math.max(0, numero(f?.vacios_pendientes)),
    bloqueado: numero(f?.bloqueado) === 1,
  };
}

/** Un precio por bidón razonable: entero, entre $100 y $20.000. Vacío o null lo quita. */
function precioValido(v: unknown): number | null | undefined {
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/[$.\s]/g, '')) : NaN;
  return Number.isInteger(n) && n >= 100 && n <= 20_000 ? n : undefined;
}

function aDireccion(f: Record<string, unknown>): DireccionDeCliente {
  return {
    id: numero(f.id),
    direccion: texto(f.direccion),
    comuna: texto(f.comuna),
    notasRepartidor: texto(f.notas_repartidor),
    usos: numero(f.usos),
    primerUso: numero(f.primer_uso),
    ultimoUso: numero(f.ultimo_uso),
  };
}

const SQL_RESUMEN = `SELECT c.id, c.nombre, c.tipo_cliente,
  (SELECT GROUP_CONCAT(telefono, ',') FROM (SELECT telefono FROM telefonos_cliente t WHERE t.cliente_id = c.id ORDER BY agregado_en)) AS telefonos,
  (SELECT COUNT(*) FROM pedidos p WHERE p.cliente_id = c.id) AS pedidos,
  (SELECT MAX(COALESCE(p.fecha_confirmada, p.fecha_entrega)) FROM pedidos p WHERE p.cliente_id = c.id) AS ultimo_pedido,
  d.id AS d_id, d.direccion AS d_direccion, d.comuna AS d_comuna, d.notas_repartidor AS d_notas, d.usos AS d_usos, d.primer_uso AS d_primer, d.ultimo_uso AS d_ultimo
FROM clientes c
LEFT JOIN direcciones_cliente d ON d.id = (SELECT id FROM direcciones_cliente x WHERE x.cliente_id = c.id ORDER BY x.ultimo_uso DESC, x.id DESC LIMIT 1)`;

function aResumen(f: Record<string, unknown>): ResumenDeCliente {
  return {
    id: numero(f.id),
    nombre: texto(f.nombre),
    tipoCliente: texto(f.tipo_cliente) as TipoDeCliente | '',
    telefonos: texto(f.telefonos).split(',').filter(Boolean),
    direccion:
      f.d_id === null || f.d_id === undefined
        ? null
        : aDireccion({ id: f.d_id, direccion: f.d_direccion, comuna: f.d_comuna, notas_repartidor: f.d_notas, usos: f.d_usos, primer_uso: f.d_primer, ultimo_uso: f.d_ultimo }),
    pedidos: numero(f.pedidos),
    ultimoPedido: typeof f.ultimo_pedido === 'string' ? f.ultimo_pedido : null,
  };
}

export class RepositorioClientes {
  constructor(private readonly db: BaseDatos) {}

  private async filas(sql: string, ...valores: unknown[]): Promise<Array<Record<string, unknown>>> {
    return ((await this.db.prepare(sql).bind(...valores).run()).results ?? []) as Array<Record<string, unknown>>;
  }

  private async cambios(sql: string, ...valores: unknown[]): Promise<number> {
    return (await this.db.prepare(sql).bind(...valores).run()).meta?.changes ?? 0;
  }

  async clienteDeTelefono(telefono: string): Promise<number | null> {
    const [fila] = await this.filas('SELECT cliente_id FROM telefonos_cliente WHERE telefono = ?1', telefono);
    return fila ? numero(fila.cliente_id) : null;
  }

  /** Suma una dirección al historial del cliente, o actualiza la que ya tenía escrita igual. */
  async registrarDireccion(clienteId: number, direccion: string, comuna: string, notas: string, usadaEn: number): Promise<void> {
    const limpia = direccion.trim().slice(0, 200);
    if (limpia === '') return;
    await this.cambios(
      `INSERT INTO direcciones_cliente (cliente_id, clave, direccion, comuna, notas_repartidor, usos, primer_uso, ultimo_uso)
       VALUES (?1, ?2, ?3, ?4, ?5, 1, ?6, ?6)
       ON CONFLICT (cliente_id, clave) DO UPDATE SET usos = usos + 1,
         primer_uso = MIN(primer_uso, excluded.primer_uso),
         direccion = CASE WHEN excluded.ultimo_uso >= ultimo_uso THEN excluded.direccion ELSE direccion END,
         comuna = CASE WHEN excluded.ultimo_uso >= ultimo_uso THEN excluded.comuna ELSE comuna END,
         notas_repartidor = CASE WHEN excluded.ultimo_uso >= ultimo_uso AND excluded.notas_repartidor != '' THEN excluded.notas_repartidor ELSE notas_repartidor END,
         ultimo_uso = MAX(ultimo_uso, excluded.ultimo_uso)`,
      clienteId, claveDeDireccion(limpia, comuna), limpia, comuna.trim().slice(0, 80), notas.trim().slice(0, 500), usadaEn,
    );
  }

  /** Después de corregir la dirección de un pedido en el panel: la nueva entra al historial de su cliente. */
  async registrarDireccionDePedido(pedidoId: string, ahora: number): Promise<void> {
    const [p] = await this.filas('SELECT cliente_id, direccion, comuna, notas_repartidor FROM pedidos WHERE id = ?1', pedidoId);
    if (!p || p.cliente_id === null || p.cliente_id === undefined) return;
    await this.registrarDireccion(numero(p.cliente_id), texto(p.direccion), texto(p.comuna), texto(p.notas_repartidor), ahora);
  }

  /**
   * Asocia a su cliente los pedidos que todavía no tienen uno, de los más antiguos a los más nuevos. Un pedido sin
   * teléfono (anotado a mano) no se asocia solo: lo hace una persona. Devuelve cuántos asoció.
   */
  async vincularPendientes(ahora: number, limite = VINCULAR_POR_PASADA): Promise<number> {
    const pendientes = await this.filas(
      `SELECT id, creado_en, telefono, nombre, comuna, direccion, notas_repartidor, tipo_cliente FROM pedidos
       WHERE cliente_id IS NULL AND telefono != '' ORDER BY creado_en, id LIMIT ?1`,
      Math.max(1, Math.min(limite, 50)),
    );
    let vinculados = 0;
    for (const p of pendientes) {
      const telefono = texto(p.telefono);
      let clienteId = await this.clienteDeTelefono(telefono);
      if (clienteId === null) {
        clienteId = await this.crearConTelefono(texto(p.nombre).trim().slice(0, 80), telefono, numero(p.creado_en), ahora);
      } else if (texto(p.nombre).trim() !== '') {
        // Una ficha que nació sin nombre toma el primero que aparezca.
        await this.cambios(`UPDATE clientes SET nombre = ?2 WHERE id = ?1 AND nombre = ''`, clienteId, texto(p.nombre).trim().slice(0, 80));
      }
      const tipo = texto(p.tipo_cliente);
      if (tipo !== '') await this.cambios(`UPDATE clientes SET tipo_cliente = ?2 WHERE id = ?1 AND tipo_cliente = ''`, clienteId, tipo);
      if ((await this.cambios('UPDATE pedidos SET cliente_id = ?2 WHERE id = ?1 AND cliente_id IS NULL', texto(p.id), clienteId)) === 0) continue;
      await this.registrarDireccion(clienteId, texto(p.direccion), texto(p.comuna), texto(p.notas_repartidor), numero(p.creado_en));
      vinculados += 1;
    }
    return vinculados;
  }

  /**
   * A quién le toca pedir (D58): clientes con al menos 4 pedidos que llevan una vez y media su ritmo sin pedir, y sin un
   * pedido para hoy o adelante. Los que llevan más de 4 meses solo se cuentan (`inactivos`). Lee los pedidos una vez.
   */
  async porPedir(hoy: string): Promise<{ clientes: ClientePorPedir[]; inactivos: number }> {
    const filas = await this.filas(
      `SELECT cliente_id, fecha FROM (
         SELECT cliente_id, fecha, ROW_NUMBER() OVER (PARTITION BY cliente_id ORDER BY fecha DESC) AS n FROM (
           SELECT DISTINCT cliente_id, COALESCE(NULLIF(fecha_confirmada, ''), fecha_entrega) AS fecha FROM pedidos
           WHERE cliente_id IS NOT NULL AND estado NOT IN ('Cancelado', 'Fuera_de_zona'))
         WHERE fecha IS NOT NULL AND fecha != '')
       WHERE n <= ?1 ORDER BY cliente_id, fecha DESC`,
      PEDIDOS_QUE_CUENTAN,
    );
    const fechasPorCliente = new Map<number, string[]>();
    for (const f of filas) fechasPorCliente.set(numero(f.cliente_id), [...(fechasPorCliente.get(numero(f.cliente_id)) ?? []), texto(f.fecha)]);

    let inactivos = 0;
    const atrasados: Array<Omit<ClientePorPedir, 'nombre' | 'telefonos'>> = [];
    for (const [id, fechas] of fechasPorCliente) {
      const ultimo = fechas[0] as string;
      if (fechas.length < MINIMO_DE_PEDIDOS || ultimo >= hoy) continue;
      const cadaDias = mediana(fechas.slice(1).map((fecha, i) => diasEntre(fecha, fechas[i] as string)));
      const diasSinPedir = diasEntre(ultimo, hoy);
      if (diasSinPedir > DIAS_PARA_INACTIVO) inactivos += 1;
      else if (cadaDias >= 2 && diasSinPedir >= Math.max(cadaDias * ATRASO_PARA_AVISAR, cadaDias + 2)) atrasados.push({ id, cadaDias, ultimo, diasSinPedir });
    }
    atrasados.sort((a, b) => b.diasSinPedir / b.cadaDias - a.diasSinPedir / a.cadaDias);
    const elegidos = atrasados.slice(0, MAXIMO_EN_LA_LISTA);
    if (elegidos.length === 0) return { clientes: [], inactivos };

    const datos = await this.filas(
      `SELECT c.id, c.nombre, (SELECT GROUP_CONCAT(t.telefono) FROM telefonos_cliente t WHERE t.cliente_id = c.id) AS telefonos
       FROM clientes c WHERE c.id IN (${elegidos.map((_, i) => `?${i + 1}`).join(', ')})`,
      ...elegidos.map((e) => e.id),
    );
    const porId = new Map(datos.map((d) => [numero(d.id), d]));
    return {
      clientes: elegidos.map((e) => ({
        ...e,
        nombre: texto(porId.get(e.id)?.nombre),
        telefonos: texto(porId.get(e.id)?.telefonos).split(',').filter(Boolean),
      })),
      inactivos,
    };
  }

  /** Crea la ficha con ese teléfono. Si otro proceso la creó recién, devuelve la de él (el teléfono es único). */
  private async crearConTelefono(nombre: string, telefono: string, desde: number, ahora: number): Promise<number> {
    const [nuevo] = await this.filas('INSERT INTO clientes (nombre, creado_en, actualizado_en) VALUES (?1, ?2, ?3) RETURNING id', nombre, desde, ahora);
    const id = numero(nuevo?.id);
    const puesto = await this.cambios('INSERT INTO telefonos_cliente (telefono, cliente_id, agregado_en) VALUES (?1, ?2, ?3) ON CONFLICT (telefono) DO NOTHING', telefono, id, desde);
    if (puesto > 0) return id;
    await this.cambios('DELETE FROM clientes WHERE id = ?1', id);
    return (await this.clienteDeTelefono(telefono)) ?? id;
  }

  /**
   * Para el mapa de clientes (D75): cada cliente con su dirección vigente. Los que no tienen dirección quedan fuera. Sin
   * teléfonos: el mapa solo necesita dónde y cuántos.
   */
  async paraMapa(limite = 3000): Promise<Array<{ id: number; nombre: string; direccion: string; comuna: string }>> {
    const filas = await this.filas(
      `SELECT c.id, c.nombre, d.direccion, d.comuna FROM clientes c
       JOIN direcciones_cliente d ON d.id = (
         SELECT x.id FROM direcciones_cliente x WHERE x.cliente_id = c.id ORDER BY x.ultimo_uso DESC, x.id DESC LIMIT 1)
       LIMIT ?1`,
      Math.max(1, Math.min(Math.trunc(limite), 5000)),
    );
    return filas.map((f) => ({ id: Number(f.id), nombre: String(f.nombre ?? ''), direccion: String(f.direccion ?? ''), comuna: String(f.comuna ?? '') }));
  }

  /** Los clientes con su dirección vigente. Con `buscar`, por nombre, teléfono o dirección; si no, los que pidieron hace menos. */
  async listar(buscar = '', limite = 50): Promise<ResumenDeCliente[]> {
    const tope = Math.max(1, Math.min(Math.trunc(limite), 100));
    const limpio = buscar.trim().slice(0, 60);
    if (limpio.length >= 2) {
      const patron = `%${limpio.replace(/[\\%_]/g, '\\$&')}%`;
      const digitos = limpio.replace(/\D/g, '');
      const filas = await this.filas(
        `${SQL_RESUMEN}
         WHERE c.nombre LIKE ?1 ESCAPE '\\'
            OR (?2 != '' AND EXISTS (SELECT 1 FROM telefonos_cliente t WHERE t.cliente_id = c.id AND t.telefono LIKE ?2))
            OR EXISTS (SELECT 1 FROM direcciones_cliente x WHERE x.cliente_id = c.id AND (x.direccion LIKE ?1 ESCAPE '\\' OR x.comuna LIKE ?1 ESCAPE '\\'))
         ORDER BY c.nombre COLLATE NOCASE LIMIT ${tope}`,
        patron,
        digitos.length >= 3 ? `%${digitos}%` : '',
      );
      return filas.map(aResumen);
    }
    const filas = await this.filas(`${SQL_RESUMEN} ORDER BY ultimo_pedido IS NULL, ultimo_pedido DESC, c.id DESC LIMIT ${tope}`);
    return filas.map(aResumen);
  }

  async ficha(id: number): Promise<FichaDeCliente | null> {
    const [fila] = await this.filas(`${SQL_RESUMEN} WHERE c.id = ?1`, id);
    if (!fila) return null;
    // `SELECT *`: así se lee igual antes y después de la migración 0018 (D104).
    const [extra] = await this.filas('SELECT * FROM clientes WHERE id = ?1', id);
    const direcciones = await this.filas('SELECT * FROM direcciones_cliente WHERE cliente_id = ?1 ORDER BY ultimo_uso DESC, id DESC', id);
    return { ...aResumen(fila), ...aCondiciones(extra), notas: texto(extra?.notas), creadoEn: numero(extra?.creado_en), direcciones: direcciones.map(aDireccion) };
  }

  /**
   * La ficha de un teléfono para el bot (D104), en una sola consulta: su tipo, sus condiciones y su dirección vigente.
   * null si el teléfono no es de ninguna ficha.
   */
  async paraBot(telefono: string): Promise<FichaParaBot | null> {
    const [f] = await this.filas(
      `SELECT c.*, d.direccion AS d_direccion, d.comuna AS d_comuna FROM telefonos_cliente t
       JOIN clientes c ON c.id = t.cliente_id
       LEFT JOIN direcciones_cliente d ON d.id = (SELECT x.id FROM direcciones_cliente x WHERE x.cliente_id = c.id ORDER BY x.ultimo_uso DESC, x.id DESC LIMIT 1)
       WHERE t.telefono = ?1`,
      telefono,
    );
    if (!f) return null;
    return {
      id: numero(f.id),
      nombre: texto(f.nombre),
      tipoCliente: texto(f.tipo_cliente) as TipoDeCliente | '',
      direccion: texto(f.d_direccion),
      comuna: texto(f.d_comuna),
      ...aCondiciones(f),
    };
  }

  async editar(
    id: number,
    datos: { nombre?: unknown; tipoCliente?: unknown; notas?: unknown; precioEspecial20L?: unknown; vaciosPendientes?: unknown; bloqueado?: unknown },
    ahora: number,
  ): Promise<ResultadoCliente<true>> {
    const actual = await this.ficha(id);
    if (!actual) return { ok: false, error: 'no_existe' };
    const nombre = datos.nombre === undefined ? actual.nombre : typeof datos.nombre === 'string' ? datos.nombre.trim().replace(/\s+/g, ' ') : null;
    const tipo = datos.tipoCliente === undefined ? actual.tipoCliente : datos.tipoCliente;
    const notas = datos.notas === undefined ? actual.notas : typeof datos.notas === 'string' ? datos.notas.trim() : null;
    const tipoOk = tipo === '' || (typeof tipo === 'string' && (OPCIONES_DE_PEDIDO.tipoCliente as readonly string[]).includes(tipo));
    if (nombre === null || nombre.length > 80 || notas === null || notas.length > 500 || !tipoOk) return { ok: false, error: 'datos_invalidos' };

    // Las condiciones (D104) solo se escriben si cambian: así se sigue guardando el nombre en una base sin la migración 0018.
    const precio = datos.precioEspecial20L === undefined ? actual.precioEspecial20L : precioValido(datos.precioEspecial20L);
    const vacios = datos.vaciosPendientes === undefined ? actual.vaciosPendientes : datos.vaciosPendientes === '' ? 0 : Number(datos.vaciosPendientes);
    const bloqueado = datos.bloqueado === undefined ? actual.bloqueado : datos.bloqueado;
    if (precio === undefined || !Number.isInteger(vacios) || vacios < 0 || vacios > 500 || typeof bloqueado !== 'boolean') return { ok: false, error: 'datos_invalidos' };

    await this.cambios('UPDATE clientes SET nombre = ?2, tipo_cliente = ?3, notas = ?4, actualizado_en = ?5 WHERE id = ?1', id, nombre, tipo, notas, ahora);
    if (precio !== actual.precioEspecial20L || vacios !== actual.vaciosPendientes || bloqueado !== actual.bloqueado) {
      await this.cambios('UPDATE clientes SET precio_especial_20l = ?2, vacios_pendientes = ?3, bloqueado = ?4 WHERE id = ?1', id, precio, vacios, bloqueado ? 1 : 0);
    }
    return { ok: true, valor: true };
  }

  /** `telefono` ya normalizado (solo dígitos). Si es de otro cliente, lo dice: para eso está "unir". */
  async agregarTelefono(id: number, telefono: string, ahora: number): Promise<ResultadoCliente<true>> {
    if (!/^\d{8,15}$/.test(telefono)) return { ok: false, error: 'telefono_invalido' };
    if (!(await this.ficha(id))) return { ok: false, error: 'no_existe' };
    const dueno = await this.clienteDeTelefono(telefono);
    if (dueno === id) return { ok: true, valor: true };
    if (dueno !== null) return { ok: false, error: 'telefono_de_otro', otroId: dueno };
    await this.cambios('INSERT INTO telefonos_cliente (telefono, cliente_id, agregado_en) VALUES (?1, ?2, ?3) ON CONFLICT (telefono) DO NOTHING', telefono, id, ahora);
    await this.vincularDeTelefono(telefono, id);
    return { ok: true, valor: true };
  }

  /** Pedidos sin cliente de ese teléfono: pasan al cliente. */
  private async vincularDeTelefono(telefono: string, id: number): Promise<void> {
    await this.cambios('UPDATE pedidos SET cliente_id = ?2 WHERE telefono = ?1 AND cliente_id IS NULL', telefono, id);
  }

  /**
   * Junta dos fichas que son el mismo cliente: los teléfonos, las direcciones y los pedidos de `origen` pasan a
   * `destino`, y `origen` se borra. Las direcciones repetidas se suman. El nombre, las notas y el precio especial de
   * `destino` mandan; los vacíos pendientes se suman.
   */
  async unir(destino: number, origen: number, ahora: number): Promise<ResultadoCliente<true>> {
    if (destino === origen) return { ok: false, error: 'mismo_cliente' };
    const [a, b] = await Promise.all([this.ficha(destino), this.ficha(origen)]);
    if (!a || !b) return { ok: false, error: 'no_existe' };
    await this.cambios('UPDATE telefonos_cliente SET cliente_id = ?1 WHERE cliente_id = ?2', destino, origen);
    await this.cambios('UPDATE pedidos SET cliente_id = ?1 WHERE cliente_id = ?2', destino, origen);
    await this.cambios(
      `INSERT INTO direcciones_cliente (cliente_id, clave, direccion, comuna, notas_repartidor, usos, primer_uso, ultimo_uso)
       SELECT ?1, clave, direccion, comuna, notas_repartidor, usos, primer_uso, ultimo_uso FROM direcciones_cliente WHERE cliente_id = ?2 AND true
       ON CONFLICT (cliente_id, clave) DO UPDATE SET usos = usos + excluded.usos, primer_uso = MIN(primer_uso, excluded.primer_uso),
         direccion = CASE WHEN excluded.ultimo_uso > ultimo_uso THEN excluded.direccion ELSE direccion END,
         ultimo_uso = MAX(ultimo_uso, excluded.ultimo_uso)`,
      destino, origen,
    );
    await this.cambios('DELETE FROM direcciones_cliente WHERE cliente_id = ?1', origen);
    await this.cambios(
      `UPDATE clientes SET
         nombre = CASE WHEN nombre = '' THEN ?2 ELSE nombre END,
         tipo_cliente = CASE WHEN tipo_cliente = '' THEN ?3 ELSE tipo_cliente END,
         notas = CASE WHEN ?4 = '' THEN notas WHEN notas = '' THEN ?4 ELSE notas || ' · ' || ?4 END,
         creado_en = MIN(creado_en, ?5), actualizado_en = ?6
       WHERE id = ?1`,
      destino, b.nombre, b.tipoCliente, b.notas, b.creadoEn, ahora,
    );
    // Condiciones (D104): el precio especial de `destino` manda (si no tiene, toma el de `origen`), los vacíos se suman y
    // basta con que una de las dos esté bloqueada. Solo si alguna tiene algo, para no tocar una base sin la migración 0018.
    if (b.precioEspecial20L !== null || b.vaciosPendientes > 0 || b.bloqueado) {
      await this.cambios(
        'UPDATE clientes SET precio_especial_20l = COALESCE(precio_especial_20l, ?2), vacios_pendientes = vacios_pendientes + ?3, bloqueado = MAX(bloqueado, ?4) WHERE id = ?1',
        destino, b.precioEspecial20L, b.vaciosPendientes, b.bloqueado ? 1 : 0,
      );
    }
    await this.cambios('DELETE FROM clientes WHERE id = ?1', origen);
    return { ok: true, valor: true };
  }

  /**
   * Borra los datos personales de un cliente que lo pide (D87; ver docs/AVISO_PRIVACIDAD.md). Sus pedidos se conservan
   * para la contabilidad (cantidades, montos, fechas, boleta o factura) pero sin nombre, teléfono, dirección ni notas, y
   * con `cliente_id = 0`: así no se vuelven a asociar a nadie. Se borran su ficha, sus teléfonos y direcciones, su pedido
   * fijo, lo que escribió en los avisos, la memoria del bot con su teléfono y el punto del mapa de sus direcciones (si
   * ningún otro cliente usa la misma). No se puede si tiene un pedido sin entregar. El historial de cada pedido dice
   * quién lo hizo y cuándo.
   *
   * Lo que identifica al cliente (sus teléfonos y su ficha) se borra al final: si algo falla a mitad de camino, repetirlo
   * termina el trabajo. Lo que vive fuera de la base (la planilla y Telegram) lo hace una persona: `aMano` dice qué.
   * Son unas 20 consultas, bajo el tope de 50 por invocación del plan gratis.
   */
  async olvidar(id: number, quien: string, ahora: number): Promise<ResultadoCliente<ResultadoDeOlvido>> {
    const ficha = await this.ficha(id);
    if (!ficha) return { ok: false, error: 'no_existe' };
    const telefonosDe = 'SELECT telefono FROM telefonos_cliente WHERE cliente_id = ?1';
    const suyos = `(cliente_id = ?1 OR (cliente_id IS NULL AND telefono IN (${telefonosDe})))`;
    const [vivos] = await this.filas(`SELECT COUNT(*) AS n FROM pedidos WHERE ${suyos} AND estado IN ('Pendiente_Confirmacion', 'Confirmado', 'En_Ruta')`, id);
    if (numero(vivos?.n) > 0) return { ok: false, error: 'pedidos_vivos' };

    await this.cambios(
      `INSERT INTO historial_pedidos (pedido_id, en, quien, accion, detalle)
       SELECT id, ?2, ?3, 'datos borrados', 'El cliente pidió borrar sus datos: se quitaron su nombre, teléfono, dirección y notas.'
       FROM pedidos WHERE ${suyos}`,
      id,
      ahora,
      quien,
    );
    // El detalle de un "No se pudo", la nota de una entrega (D91) y el motivo de un cambio de estado (una cancelación,
    // D97) se escriben a mano y pueden nombrar a alguien: se borran. El resto del historial solo dice qué campos cambiaron.
    await this.cambios(
      `UPDATE historial_pedidos SET detalle = 'Detalle borrado a pedido del cliente.' WHERE (accion IN ('no_entregado', 'entrega') OR accion LIKE 'estado:%') AND detalle != '' AND pedido_id IN (SELECT id FROM pedidos WHERE ${suyos})`,
      id,
    );
    const avisos = await this.cambios(
      `UPDATE avisos SET telefono = '', nombre = '', texto = '', motivos = '[]', resumen = 'Datos del cliente borrados a su pedido.'
       WHERE telefono IN (${telefonosDe}) OR id_pedido IN (SELECT id FROM pedidos WHERE ${suyos})`,
      id,
    );
    // La memoria del bot con sus teléfonos. Los mensajes ya procesados quedan sin el teléfono: evitan responder dos veces.
    for (const tabla of ['conversaciones', 'ultimos_pedidos', 'mensajes_pendientes', 'conversaciones_tomadas']) {
      await this.cambios(`DELETE FROM ${tabla} WHERE telefono IN (${telefonosDe})`, id);
    }
    await this.cambios(`UPDATE mensajes_procesados SET telefono = '' WHERE telefono IN (${telefonosDe})`, id);
    await this.cambios('DELETE FROM pedidos_fijos WHERE cliente_id = ?1', id);
    // El punto del mapa de cada dirección suya, si ningún otro cliente usa la misma (un edificio, una oficina).
    await this.cambios(
      'DELETE FROM puntos WHERE clave IN (SELECT clave FROM direcciones_cliente WHERE cliente_id = ?1) AND clave NOT IN (SELECT clave FROM direcciones_cliente WHERE cliente_id != ?1)',
      id,
    );
    const pedidos = await this.cambios(
      `UPDATE pedidos SET nombre = '', telefono = '', direccion = '', notas_repartidor = '', observaciones = '', cliente_id = 0, actualizado_en = ?2
       WHERE ${suyos}`,
      id,
      ahora,
    );
    const direcciones = await this.cambios('DELETE FROM direcciones_cliente WHERE cliente_id = ?1', id);
    await this.cambios('DELETE FROM telefonos_cliente WHERE cliente_id = ?1', id);
    await this.cambios('DELETE FROM clientes WHERE id = ?1', id);
    return {
      ok: true,
      valor: {
        pedidos,
        avisos,
        telefonos: ficha.telefonos.length,
        direcciones,
        aMano: tareasAMano(ficha.telefonos),
        seBorraSolo: 'La hoja RESPALDO_CLIENTES se actualiza sola esta noche y la copia de seguridad de la base se borra sola en 7 días.',
      },
    };
  }
}
