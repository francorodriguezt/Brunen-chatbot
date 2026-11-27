/**
 * Ficha del cliente, leída de la hoja CLIENTES (Etapa 4). El bot la usa para saber a quién le habla:
 * dirección y comuna de entrega, tipo de cliente (para el precio), envases por retirar.
 *
 * Los datos se buscan por el nombre de cada columna, no por su posición, y se leen con la caché de
 * `hojas.ts` (un minuto). Todo lo que no se entiende de una fila se anota en `avisos` en vez de adivinarlo,
 * para que el flujo de pedido lo mande a revisión (principio 4: ante la duda, escalar).
 */

import type { FichaParaBot } from './fichas';
import { aEnteroCLP, filasConEncabezado, leerHoja, type EntornoHojas } from './hojas';
import type { TipoCliente } from './precios';
import { normalizar } from './texto';
import { normalizarTelefono } from './whatsapp';

export interface Cliente {
  /** En el formato de WhatsApp: 569XXXXXXXX. */
  telefono: string;
  nombre: string;
  direccion: string;
  comuna: string;
  tipo: TipoCliente;
  precioEspecial20L: number | null;
  envasesPendientes: number;
  /** Quiere que le avisen una hora aproximada de entrega. */
  avisoHora: boolean;
  /** Se guarda tal cual: PENDIENTE saber qué significa (docs/PENDIENTES.md). */
  credito: string;
  notas: string;
  estado: 'activo' | 'bloqueado';
  /** Cosas de la fila que no se entendieron (un tipo mal escrito, un teléfono repetido...). */
  avisos: string[];
}

const TIPOS: ReadonlySet<string> = new Set<TipoCliente>(['normal', 'mayorista', 'empresa', 'especial']);
const AFIRMATIVO: ReadonlySet<string> = new Set(['si', 's', 'x', '1', 'true', 'verdadero', 'yes']);

function aCliente(fila: Record<string, string>, telefono: string): Cliente {
  const avisos: string[] = [];

  const tipoTexto = normalizar(fila.tipo ?? '');
  let tipo: TipoCliente = 'normal';
  if (TIPOS.has(tipoTexto)) tipo = tipoTexto as TipoCliente;
  else if (tipoTexto !== '') avisos.push(`Tipo de cliente "${fila.tipo}" no reconocido; se trató como normal.`);

  const estadoTexto = normalizar(fila.estado ?? '');
  let estado: Cliente['estado'] = 'activo';
  if (estadoTexto.includes('bloque')) estado = 'bloqueado';
  else if (estadoTexto !== '' && estadoTexto !== 'activo') avisos.push(`Estado "${fila.estado}" no reconocido; se trató como activo.`);

  // El precio especial solo se aplica a un cliente de tipo "especial" (precios.ts): si la fila lo tiene con otro tipo, el
  // bot cotizaría con tramos sin que nadie lo note, así que se anota para que una persona revise el pedido.
  const precioEspecial20L = aEnteroCLP(fila.precio_especial_20l);
  if (precioEspecial20L !== null && tipo !== 'especial') {
    avisos.push(`Tiene Precio_Especial_20L (${precioEspecial20L}) pero su tipo es "${tipo}": ese precio no se aplica; confirmar cuál corresponde.`);
  }

  return {
    telefono,
    nombre: fila.nombre ?? '',
    direccion: fila.direccion ?? '',
    comuna: fila.comuna ?? '',
    tipo,
    precioEspecial20L,
    envasesPendientes: aEnteroCLP(fila.envases_pendientes) ?? 0,
    avisoHora: AFIRMATIVO.has(normalizar(fila.aviso_hora ?? '')),
    credito: fila.credito ?? '',
    notas: fila.notas ?? '',
    estado,
    avisos,
  };
}

/** Filas de la hoja (con encabezado) -> clientes por teléfono. Las filas sin teléfono válido se descartan. */
export function parsearClientes(filas: string[][]): Map<string, Cliente> {
  const clientes = new Map<string, Cliente>();
  let repetidos = 0;
  for (const fila of filasConEncabezado(filas)) {
    const telefono = normalizarTelefono(fila.telefono ?? '');
    if (!telefono) continue;
    if (clientes.has(telefono)) {
      repetidos++;
      continue;
    }
    clientes.set(telefono, aCliente(fila, telefono));
  }
  // Solo la cantidad: el log no lleva teléfonos ni nombres.
  if (repetidos > 0) console.error(`La hoja CLIENTES tiene ${repetidos} teléfono(s) repetido(s): se usa la primera fila de cada uno.`);
  return clientes;
}

export type BusquedaCliente =
  | { estado: 'encontrado'; cliente: Cliente }
  /** El teléfono no está en la hoja: cliente nuevo. */
  | { estado: 'nuevo' }
  /** No se pudo leer la hoja: no se sabe si es nuevo; el flujo debe escalar a una persona. */
  | { estado: 'no_disponible' };

const DURACION_SEGUNDOS = 60;

export async function buscarCliente(env: EntornoHojas, telefono: string, ahoraSegundos?: number): Promise<BusquedaCliente> {
  const clientes = await leerHoja(
    env,
    {
      nombre: 'CLIENTES',
      rango: 'CLIENTES!A1:Z',
      parsear: parsearClientes,
      duracionSegundos: DURACION_SEGUNDOS,
      esVacio: (mapa) => mapa.size === 0,
      avisoVacio: (filas) => `La hoja CLIENTES no tiene clientes con teléfono válido (${filas.length} filas leídas).`,
    },
    ahoraSegundos,
  );
  if (!clientes) return { estado: 'no_disponible' };
  const normalizado = normalizarTelefono(telefono);
  const cliente = normalizado ? clientes.get(normalizado) : undefined;
  return cliente ? { estado: 'encontrado', cliente } : { estado: 'nuevo' };
}

/** El tipo de la ficha (como lo escribe la oficina en el panel) en el tipo con que cotiza el bot. */
const TIPO_DE_FICHA: Readonly<Record<string, TipoCliente>> = { hogar: 'normal', minimarket: 'mayorista', empresa: 'empresa' };

/** Si la ficha dice algo sobre cómo atender al cliente: un tipo, un precio especial o un bloqueo. */
function fichaTieneCondiciones(ficha: FichaParaBot): boolean {
  return ficha.tipoCliente !== '' || ficha.precioEspecial20L !== null || ficha.bloqueado;
}

function describir(tipo: TipoCliente, precio: number | null): string {
  if (tipo === 'especial') return precio === null ? '"especial" sin precio' : `precio especial de $${precio.toLocaleString('es-CL')}`;
  return `"${tipo}"`;
}

/**
 * Clientes en un solo lugar (D104): junta lo que dice la ficha de la base con lo que dice la hoja CLIENTES.
 *
 *  - La ficha manda cuando tiene condiciones (un tipo, un precio especial o un bloqueo). Todo minimarket es mayorista y un
 *    precio especial vale aunque sea minimarket (Franco, 2026-11-27): con precio especial, el bot cotiza como "especial".
 *  - Si la hoja dice otra cosa, se usa la ficha y queda un aviso para que una persona revise (y corrija o borre la fila).
 *    Una fila "normal" o con el tipo vacío es lo que vale por defecto: no es un desacuerdo.
 *  - Sin la hoja, o con un teléfono que no está en ella, la ficha basta si tiene dirección: ya no hace falta la fila.
 *  - Una ficha sin condiciones no cambia nada: la hoja sigue siendo el respaldo, como antes.
 */
export function combinarConFicha(hoja: BusquedaCliente, ficha: FichaParaBot | null): BusquedaCliente {
  if (!ficha || !fichaTieneCondiciones(ficha)) return hoja;
  const tipoFicha: TipoCliente = ficha.precioEspecial20L !== null ? 'especial' : (TIPO_DE_FICHA[ficha.tipoCliente] ?? 'normal');

  if (hoja.estado === 'encontrado') {
    const deHoja = hoja.cliente;
    // El aviso de la hoja sobre un precio especial con otro tipo ya no aplica: decide la ficha.
    const avisos = deHoja.avisos.filter((aviso) => !aviso.startsWith('Tiene Precio_Especial_20L'));
    const precioHoja = deHoja.tipo === 'especial' ? deHoja.precioEspecial20L : null;
    const hojaDiceAlgo = deHoja.tipo !== 'normal' || deHoja.precioEspecial20L !== null;
    if (hojaDiceAlgo && (deHoja.tipo !== tipoFicha || precioHoja !== ficha.precioEspecial20L)) {
      avisos.push(
        `La ficha del panel dice ${describir(tipoFicha, ficha.precioEspecial20L)} y la hoja CLIENTES, ${describir(deHoja.tipo, deHoja.precioEspecial20L)}: se usó la ficha. Corrige o borra la fila de la hoja.`,
      );
    }
    return {
      estado: 'encontrado',
      cliente: {
        ...deHoja,
        tipo: tipoFicha,
        precioEspecial20L: ficha.precioEspecial20L,
        envasesPendientes: ficha.vaciosPendientes > 0 ? ficha.vaciosPendientes : deHoja.envasesPendientes,
        estado: ficha.bloqueado || deHoja.estado === 'bloqueado' ? 'bloqueado' : 'activo',
        avisos,
      },
    };
  }

  // Sin fila en la hoja (o sin hoja): la ficha sirve si sabe dónde entregar. Un bloqueo vale siempre.
  if (ficha.direccion.trim() === '' && !ficha.bloqueado) return hoja;
  return {
    estado: 'encontrado',
    cliente: {
      telefono: '',
      nombre: ficha.nombre,
      direccion: ficha.direccion,
      comuna: ficha.comuna,
      tipo: tipoFicha,
      precioEspecial20L: ficha.precioEspecial20L,
      envasesPendientes: ficha.vaciosPendientes,
      avisoHora: false,
      credito: '',
      notas: '',
      estado: ficha.bloqueado ? 'bloqueado' : 'activo',
      avisos: [],
    },
  };
}

/**
 * Lo que usa el bot (D104): la hoja y la ficha a la vez. Si la ficha no se puede leer (la base caída), queda lo de la
 * hoja, como antes.
 */
export async function buscarClienteConFicha(
  env: EntornoHojas,
  leerFicha: ((telefono: string) => Promise<FichaParaBot | null>) | null,
  telefono: string,
): Promise<BusquedaCliente> {
  const normalizado = normalizarTelefono(telefono) ?? telefono;
  const ficha = leerFicha
    ? leerFicha(normalizado).catch((falla: unknown) => {
        console.error('No se pudo leer la ficha del cliente; se usa la hoja CLIENTES:', falla instanceof Error ? falla.message : falla);
        return null;
      })
    : Promise.resolve(null);
  const combinado = combinarConFicha(await buscarCliente(env, telefono), await ficha);
  // Una ficha armada sin la hoja lleva el teléfono del mensaje.
  if (combinado.estado === 'encontrado' && combinado.cliente.telefono === '') return { estado: 'encontrado', cliente: { ...combinado.cliente, telefono: normalizado } };
  return combinado;
}
