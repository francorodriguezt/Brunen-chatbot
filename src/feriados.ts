/**
 * Feriados leídos de la hoja FERIADOS (columnas Fecha YYYY-MM-DD y Nombre). Regla del proyecto:
 * los feriados nunca van fijos en el código. La lectura y su caché están en `hojas.ts`.
 *
 * Si la hoja está vacía o Google falla, devuelve lo último que se leyó (o un conjunto vacío) y lo
 * anota en el log: el llamador debe avisar a una persona cuando no hay feriados cargados.
 */

import { leerHoja, type EntornoHojas } from './hojas';

const DURACION_SEGUNDOS = 6 * 3600;

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

export async function cargarFeriados(env: EntornoHojas, ahoraSegundos?: number): Promise<Set<string>> {
  const feriados = await leerHoja(
    env,
    {
      nombre: 'FERIADOS',
      rango: 'FERIADOS!A2:B',
      parsear: parsearFeriados,
      duracionSegundos: DURACION_SEGUNDOS,
      esVacio: (f) => f.size === 0,
      avisoVacio: (filas) =>
        `La hoja FERIADOS no aporta feriados (${filas.length} filas leídas, ninguna con fecha YYYY-MM-DD en la columna A): el bot no sabe qué días son feriados.`,
    },
    ahoraSegundos,
  );
  return feriados ?? new Set();
}
