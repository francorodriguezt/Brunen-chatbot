/**
 * Intérprete de mensajes por reglas (Etapa 3). Sin red, sin secretos y sin LLM: texto -> datos.
 *
 * Principio 1: el intérprete solo EXTRAE lo que dijo el cliente (tipo, cantidad, fecha como texto,
 * comuna). No calcula precios ni fechas de entrega: eso es de precios.ts y despacho.ts.
 * Lo que no entiende queda como "desconocido" para que el LLM de respaldo lo intente después.
 */

import type { TipoBidon } from './precios';
import { preparar } from './texto';

/** "no_especificado": el cliente pidió bidones sin decir de cuántos litros. */
export type TipoBidonPedido = TipoBidon | 'no_especificado';

export interface ItemInterpretado {
  tipo: TipoBidonPedido;
  /** null = el cliente nombró el tipo pero no dijo cuántos. */
  cantidad: number | null;
}

const NOMBRE = /(?:[bv]idon(?:es|ez)?|botellon(?:es)?|garrafon(?:es)?)/.source;
const TIPO = /(?:10|12|20)/.source;
const UNIDAD = /(?:\s+(?:l|lt|lts|ltr|ltrs|litros?))?/.source;

// "2 bidones de 20", "2 de 20", "2 bidones de 20 litros"
const CANTIDAD_Y_TIPO = new RegExp(String.raw`\b(\d{1,3})\s+(?:${NOMBRE}\s+(?:de\s+)?|de\s+)(${TIPO})${UNIDAD}\b`, 'g');
// "bidon de 20 x 3"
const TIPO_POR_CANTIDAD = new RegExp(String.raw`\b(?:${NOMBRE}\s+(?:de\s+)?|de\s+)(${TIPO})${UNIDAD}\s+x\s+(\d{1,3})\b`, 'g');
// "4 bidones" (sin tipo)
const SOLO_CANTIDAD = new RegExp(String.raw`\b(\d{1,3})\s+${NOMBRE}\b`, 'g');
// "bidon de 20", "bidones de 12 litros" (sin cantidad)
const NOMBRE_Y_TIPO = new RegExp(String.raw`\b(${NOMBRE})\s+(?:de\s+)?(${TIPO})${UNIDAD}\b`, 'g');
// "20 litros" (sin cantidad ni nombre)
const SOLO_TIPO_CON_UNIDAD = new RegExp(String.raw`\b(${TIPO})\s+(?:l|lt|lts|ltr|ltrs|litros?)\b`, 'g');

interface Hallazgo {
  posicion: number;
  largo: number;
  item: ItemInterpretado;
}

function aTipo(litros: string): TipoBidon {
  return `${litros}L` as TipoBidon;
}

function conCantidad(tipo: TipoBidonPedido, cantidad: string): ItemInterpretado | null {
  const n = Number(cantidad);
  return n > 0 ? { tipo, cantidad: n } : null;
}

function buscar(texto: string, patron: RegExp, aItem: (grupos: string[]) => ItemInterpretado | null): Hallazgo[] {
  const hallazgos: Hallazgo[] = [];
  for (const m of texto.matchAll(patron)) {
    const item = aItem(m.slice(1).map((grupo) => grupo ?? ''));
    if (item) hallazgos.push({ posicion: m.index ?? 0, largo: m[0].length, item });
  }
  return hallazgos;
}

/** Tapa con espacios los tramos ya usados, para que otra regla no los lea dos veces. */
function tapar(texto: string, hallazgos: readonly Hallazgo[]): string {
  let resultado = texto;
  for (const { posicion, largo } of hallazgos) {
    resultado = resultado.slice(0, posicion) + ' '.repeat(largo) + resultado.slice(posicion + largo);
  }
  return resultado;
}

/**
 * Bidones que pidió el cliente, en el orden en que los nombró. Si repite un tipo, suma
 * ("2 de 20 y 1 de 20" -> 3 de 20): Constanza confirma igual (el bot registra y propone).
 */
export function extraerItems(texto: string): ItemInterpretado[] {
  let restante = preparar(texto);
  const hallazgos: Hallazgo[] = [];

  const aplicar = (patron: RegExp, aItem: (grupos: string[]) => ItemInterpretado | null) => {
    const nuevos = buscar(restante, patron, aItem);
    restante = tapar(restante, nuevos);
    hallazgos.push(...nuevos);
  };

  aplicar(CANTIDAD_Y_TIPO, ([cantidad = '', litros = '']) => conCantidad(aTipo(litros), cantidad));
  aplicar(TIPO_POR_CANTIDAD, ([litros = '', cantidad = '']) => conCantidad(aTipo(litros), cantidad));
  aplicar(SOLO_CANTIDAD, ([cantidad = '']) => conCantidad('no_especificado', cantidad));
  aplicar(NOMBRE_Y_TIPO, ([nombre = '', litros = '']) => ({
    tipo: aTipo(litros),
    // "bidon de 20" es uno; "bidones de 20" no dice cuántos.
    cantidad: /[sz]$/.test(nombre) ? null : 1,
  }));
  aplicar(SOLO_TIPO_CON_UNIDAD, ([litros = '']) => ({ tipo: aTipo(litros), cantidad: null }));

  const porTipo = new Map<TipoBidonPedido, ItemInterpretado>();
  for (const { item } of hallazgos.sort((a, b) => a.posicion - b.posicion)) {
    const previo = porTipo.get(item.tipo);
    if (!previo) {
      porTipo.set(item.tipo, { ...item });
    } else if (previo.cantidad !== null || item.cantidad !== null) {
      previo.cantidad = (previo.cantidad ?? 0) + (item.cantidad ?? 0);
    }
  }
  return [...porTipo.values()];
}

const DIAS_SEMANA: Readonly<Record<string, string>> = {
  lunes: 'lunes',
  martes: 'martes',
  miercoles: 'miércoles',
  jueves: 'jueves',
  viernes: 'viernes',
  sabado: 'sábado',
  domingo: 'domingo',
};

const MESES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const DIA_Y_MES = new RegExp(String.raw`\b\d{1,2} de (?:${MESES})\b`, 'g');
// "para el 20", "el dia 15"; no cuando es parte de "15/11" o "15 de noviembre".
const DIA_SUELTO = new RegExp(
  String.raw`\b(?:para el dia|para el|el dia)\s+(\d{1,2})(?![/\d])(?!\s+de \s*(?:${MESES}))\b`,
  'g',
);

/**
 * Cuándo quiere el pedido, como texto ("mañana", "viernes", "15 de noviembre"). No calcula la
 * fecha de entrega. "en la mañana" es una hora del día, no el día siguiente.
 */
export function extraerFecha(texto: string): string | undefined {
  const t = preparar(texto);
  const candidatos: Array<{ posicion: number; fecha: string }> = [];

  // Toma la primera coincidencia válida de cada patrón; después gana la que aparece antes en el texto.
  const agregar = (patron: RegExp, aFecha: (m: RegExpMatchArray) => string | null) => {
    for (const m of t.matchAll(patron)) {
      const fecha = aFecha(m);
      if (fecha) {
        candidatos.push({ posicion: m.index ?? 0, fecha });
        return;
      }
    }
  };

  agregar(/\bpasado manana\b/g, () => 'pasado mañana');
  agregar(/\bmanana\b/g, (m) => (/\b(?:la|esta)\s$/.test(t.slice(0, m.index ?? 0)) ? null : 'mañana'));
  agregar(/\bhoy\b/g, () => 'hoy');
  agregar(/\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b/g, (m) => DIAS_SEMANA[m[1] ?? ''] ?? null);
  agregar(DIA_Y_MES, (m) => m[0]);
  agregar(/\b\d{1,2}\/\d{1,2}(?:\/\d{2,4})?\b/g, (m) => m[0]);
  agregar(DIA_SUELTO, (m) => `el ${Number(m[1])}`);

  return candidatos.sort((a, b) => a.posicion - b.posicion)[0]?.fecha;
}
