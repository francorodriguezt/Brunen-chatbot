/**
 * Feriados leídos de la hoja FERIADOS (columnas Fecha YYYY-MM-DD y Nombre). Regla del proyecto:
 * los feriados nunca van fijos en el código. El resultado se guarda en memoria unas horas para no
 * leer la planilla en cada mensaje.
 *
 * Si la hoja está vacía o Google falla, devuelve lo último que se leyó (o un conjunto vacío) y lo
 * anota en el log: el llamador debe avisar a una persona cuando no hay feriados cargados.
 */

import { ClienteSheets, type CuentaServicio } from './google';

const DURACION_CACHE_SEGUNDOS = 6 * 3600;
/** Una hoja vacía o ilegible se vuelve a leer pronto: así, al corregirla, el bot lo nota en un minuto y no en 6 horas. */
const DURACION_CACHE_VACIA_SEGUNDOS = 60;

interface EntradaCache {
  feriados: Set<string>;
  hastaSegundos: number;
}
const cache = new Map<string, EntradaCache>();

/** Solo para pruebas. */
export function olvidarFeriados(): void {
  cache.clear();
}

function esFechaValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

/** Toma las filas de la hoja (sin el encabezado) y se queda con las fechas válidas. */
export function parsearFeriados(filas: ReadonlyArray<ReadonlyArray<string>>): Set<string> {
  const feriados = new Set<string>();
  for (const fila of filas) {
    const fecha = (fila[0] ?? '').trim();
    if (esFechaValida(fecha)) feriados.add(fecha);
  }
  return feriados;
}

export interface EntornoFeriados {
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_SHEET_ID?: string;
}

export async function cargarFeriados(env: EntornoFeriados, ahoraSegundos: number = Math.floor(Date.now() / 1000)): Promise<Set<string>> {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.GOOGLE_SHEET_ID) return new Set();
  const guardado = cache.get(env.GOOGLE_SHEET_ID);
  if (guardado && guardado.hastaSegundos > ahoraSegundos) return guardado.feriados;
  try {
    const cuenta = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as CuentaServicio;
    const filas = await new ClienteSheets(cuenta, env.GOOGLE_SHEET_ID).leerFilas('FERIADOS!A2:B', ahoraSegundos);
    const feriados = parsearFeriados(filas);
    if (feriados.size === 0) {
      console.error(
        `La hoja FERIADOS no aporta feriados (${filas.length} filas leídas, ninguna con fecha YYYY-MM-DD en la columna A): el bot no sabe qué días son feriados.`,
      );
    }
    const duracion = feriados.size === 0 ? DURACION_CACHE_VACIA_SEGUNDOS : DURACION_CACHE_SEGUNDOS;
    cache.set(env.GOOGLE_SHEET_ID, { feriados, hastaSegundos: ahoraSegundos + duracion });
    return feriados;
  } catch (error) {
    console.error('No se pudo leer FERIADOS:', error instanceof Error ? error.message : error);
    return guardado?.feriados ?? new Set();
  }
}
