/**
 * Ficha del cliente, leída de la hoja CLIENTES (Etapa 4). El bot la usa para saber a quién le habla:
 * dirección y comuna de entrega, tipo de cliente (para el precio), envases por retirar.
 *
 * Los datos se buscan por el nombre de cada columna, no por su posición, y se leen con la caché de
 * `hojas.ts` (un minuto). Todo lo que no se entiende de una fila se anota en `avisos` en vez de adivinarlo,
 * para que el flujo de pedido lo mande a revisión (principio 4: ante la duda, escalar).
 */

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

  return {
    telefono,
    nombre: fila.nombre ?? '',
    direccion: fila.direccion ?? '',
    comuna: fila.comuna ?? '',
    tipo,
    precioEspecial20L: aEnteroCLP(fila.precio_especial_20l),
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
