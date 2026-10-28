/**
 * Tabla de precios leída de la hoja PRECIOS (columnas Tipo, Desde, Hasta, Precio), para que el dueño
 * pueda cambiar un precio sin tocar código. Las funciones de cálculo están en `precios.ts`.
 *
 * Una tabla con errores (tramos que se pisan o dejan huecos, un precio ilegible) NO se usa a medias:
 * se devuelve la tabla del documento de conocimiento, marcada con origen "respaldo" y con la lista de
 * problemas. Quien cotiza debe tratar el origen "respaldo" como "a revisión": con una hoja rota, el
 * precio de respaldo podría no ser el vigente y no se le debe prometer a un cliente.
 */

import { aEnteroCLP, filasConEncabezado, leerHoja, type EntornoHojas } from './hojas';
import { TABLA_PRECIOS, type TipoBidon, type TramoPrecio } from './precios';
import { normalizar } from './texto';

export interface TablaPrecios {
  tabla: readonly TramoPrecio[];
  /** "hoja": la de PRECIOS, validada. "respaldo": la del documento de conocimiento (hoja ilegible o con errores). */
  origen: 'hoja' | 'respaldo';
  problemas: string[];
}

interface Leida {
  tabla: TramoPrecio[];
  problemas: string[];
}

const LITROS: Readonly<Record<string, TipoBidon>> = { '10': '10L', '12': '12L', '20': '20L' };

/** "20", "20L", "20 l", "20 litros" -> "20L". */
function aTipo(texto: string): TipoBidon | null {
  const litros = /^(10|12|20)\s*(?:l|lt|lts|litros?)?$/.exec(normalizar(texto))?.[1];
  return litros ? (LITROS[litros] ?? null) : null;
}

/** Revisa que, por cada tipo, los tramos empiecen en 1, no se pisen, no dejen huecos y el último sea abierto. */
function revisarTramos(tabla: readonly TramoPrecio[]): string[] {
  const problemas: string[] = [];
  const tipos = [...new Set(tabla.map((t) => t.tipo))];
  for (const tipo of tipos) {
    const tramos = tabla.filter((t) => t.tipo === tipo).sort((a, b) => a.desde - b.desde);
    let siguiente = 1;
    tramos.forEach((tramo, i) => {
      if (tramo.desde !== siguiente) {
        problemas.push(`${tipo}: el tramo que empieza en ${tramo.desde} debería empezar en ${siguiente} (hay un hueco o un tramo que se pisa).`);
      }
      if (tramo.hasta === null && i < tramos.length - 1) problemas.push(`${tipo}: un tramo "o más" no puede estar antes de otros.`);
      siguiente = (tramo.hasta ?? tramo.desde) + 1;
    });
    if (tramos.at(-1)?.hasta !== null) problemas.push(`${tipo}: falta el tramo "o más" (Hasta vacío) para cantidades grandes.`);
  }
  return problemas;
}

export function parsearTablaPrecios(filas: string[][]): Leida {
  const tabla: TramoPrecio[] = [];
  const problemas: string[] = [];
  filasConEncabezado(filas).forEach((fila, i) => {
    const numero = i + 2; // la fila 1 es el encabezado
    if (Object.values(fila).every((v) => v === '')) return; // fila en blanco
    const tipo = aTipo(fila.tipo ?? '');
    const desde = aEnteroCLP(fila.desde);
    const hasta = aEnteroCLP(fila.hasta);
    const precio = aEnteroCLP(fila.precio);
    if (!tipo) problemas.push(`Fila ${numero}: el tipo "${fila.tipo ?? ''}" no es 10, 12 ni 20 litros.`);
    else if (desde === null || desde < 1) problemas.push(`Fila ${numero}: "Desde" debe ser un número desde 1.`);
    else if (hasta !== null && hasta < desde) problemas.push(`Fila ${numero}: "Hasta" es menor que "Desde".`);
    else if (precio === null || precio <= 0) problemas.push(`Fila ${numero}: el precio no es válido.`);
    else tabla.push({ tipo, desde, hasta, precio });
  });
  if (problemas.length === 0) problemas.push(...revisarTramos(tabla));
  return { tabla, problemas };
}

const DURACION_SEGUNDOS = 60;

export async function cargarTablaPrecios(env: EntornoHojas, ahoraSegundos?: number): Promise<TablaPrecios> {
  const leida = await leerHoja(
    env,
    {
      nombre: 'PRECIOS',
      rango: 'PRECIOS!A1:D',
      parsear: parsearTablaPrecios,
      duracionSegundos: DURACION_SEGUNDOS,
      esVacio: (l) => l.tabla.length === 0 || l.problemas.length > 0,
      avisoVacio: () => 'La hoja PRECIOS está vacía o tiene errores: se usan los precios del documento de conocimiento y los pedidos van a revisión.',
    },
    ahoraSegundos,
  );
  if (leida && leida.tabla.length > 0 && leida.problemas.length === 0) return { tabla: leida.tabla, origen: 'hoja', problemas: [] };
  const problemas = leida?.problemas.length ? leida.problemas : [leida ? 'La hoja PRECIOS está vacía.' : 'No se pudo leer la hoja PRECIOS.'];
  return { tabla: TABLA_PRECIOS, origen: 'respaldo', problemas };
}
