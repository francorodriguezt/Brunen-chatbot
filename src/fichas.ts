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

export interface FichaDeCliente extends ResumenDeCliente {
  notas: string;
  direcciones: DireccionDeCliente[];
  creadoEn: number;
}

export type ErrorDeCliente = 'no_existe' | 'datos_invalidos' | 'telefono_invalido' | 'telefono_de_otro' | 'mismo_cliente';
export type ResultadoCliente<T> = { ok: true; valor: T } | { ok: false; error: ErrorDeCliente; otroId?: number };

/**
 * Pedidos por vincular en cada pasada. Un pedido de un cliente nuevo usa hasta 6 consultas: 4 pedidos son 25 como
 * máximo, la mitad del tope de 50 por invocación del plan gratis, y queda el resto para la sesión, la lista o el vigía.
 * Lo normal es que haya 0 a 2 pendientes, porque la tarea programada pasa cada 5 minutos.
 */
export const VINCULAR_POR_PASADA = 4;

/** "Av. Grecia 123, depto 4" y "av grecia 123 depto 4" son la misma dirección. */
export function claveDeDireccion(direccion: string, comuna: string): string {
  const limpiar = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${limpiar(direccion)}|${limpiar(comuna)}`;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const numero = (v: unknown): number => (typeof v === 'number' ? v : Number(v ?? 0) || 0);

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

  /** Crea la ficha con ese teléfono. Si otro proceso la creó recién, devuelve la de él (el teléfono es único). */
  private async crearConTelefono(nombre: string, telefono: string, desde: number, ahora: number): Promise<number> {
    const [nuevo] = await this.filas('INSERT INTO clientes (nombre, creado_en, actualizado_en) VALUES (?1, ?2, ?3) RETURNING id', nombre, desde, ahora);
    const id = numero(nuevo?.id);
    const puesto = await this.cambios('INSERT INTO telefonos_cliente (telefono, cliente_id, agregado_en) VALUES (?1, ?2, ?3) ON CONFLICT (telefono) DO NOTHING', telefono, id, desde);
    if (puesto > 0) return id;
    await this.cambios('DELETE FROM clientes WHERE id = ?1', id);
    return (await this.clienteDeTelefono(telefono)) ?? id;
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
    const [extra] = await this.filas('SELECT notas, creado_en FROM clientes WHERE id = ?1', id);
    const direcciones = await this.filas('SELECT * FROM direcciones_cliente WHERE cliente_id = ?1 ORDER BY ultimo_uso DESC, id DESC', id);
    return { ...aResumen(fila), notas: texto(extra?.notas), creadoEn: numero(extra?.creado_en), direcciones: direcciones.map(aDireccion) };
  }

  async editar(id: number, datos: { nombre?: unknown; tipoCliente?: unknown; notas?: unknown }, ahora: number): Promise<ResultadoCliente<true>> {
    const actual = await this.ficha(id);
    if (!actual) return { ok: false, error: 'no_existe' };
    const nombre = datos.nombre === undefined ? actual.nombre : typeof datos.nombre === 'string' ? datos.nombre.trim().replace(/\s+/g, ' ') : null;
    const tipo = datos.tipoCliente === undefined ? actual.tipoCliente : datos.tipoCliente;
    const notas = datos.notas === undefined ? actual.notas : typeof datos.notas === 'string' ? datos.notas.trim() : null;
    const tipoOk = tipo === '' || (typeof tipo === 'string' && (OPCIONES_DE_PEDIDO.tipoCliente as readonly string[]).includes(tipo));
    if (nombre === null || nombre.length > 80 || notas === null || notas.length > 500 || !tipoOk) return { ok: false, error: 'datos_invalidos' };
    await this.cambios('UPDATE clientes SET nombre = ?2, tipo_cliente = ?3, notas = ?4, actualizado_en = ?5 WHERE id = ?1', id, nombre, tipo, notas, ahora);
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
   * `destino`, y `origen` se borra. Las direcciones repetidas se suman. El nombre y las notas de `destino` mandan.
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
    await this.cambios('DELETE FROM clientes WHERE id = ?1', origen);
    return { ok: true, valor: true };
  }
}
