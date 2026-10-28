/**
 * Convierte la fecha que dijo el cliente ("mañana", "el viernes", "15 de noviembre", "15/11", "el 20")
 * en una fecha de calendario. `extraerFecha` (interprete.ts) solo devuelve el texto; aquí se resuelve,
 * sin red y a partir de la fecha de hoy, que se recibe como parámetro (siempre la de Santiago).
 *
 * Criterios, para que no haya sorpresas:
 *  - Un día de la semana es el próximo que viene, nunca hoy: "el miércoles" dicho un miércoles es en 7 días
 *    (quien lo quiere hoy dice "hoy").
 *  - Día y mes sin año: la próxima vez que cae esa fecha (hoy incluido); si ya pasó este año, el año que viene.
 *  - "El 20" a secas: el próximo día 20 desde mañana.
 *  - Las fechas con formato día/mes (como se escribe en Chile), no mes/día.
 *  - Lo que no se entiende o no existe en el calendario ("31 de abril") da null: el flujo lo pregunta o lo deja a revisión.
 */

import { diaSemana, sumarDias } from './despacho';
import { normalizar } from './texto';

const DIAS: Readonly<Record<string, number>> = { domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6 };
const MESES: Readonly<Record<string, number>> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7,
  agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

/** Fecha de calendario como YYYY-MM-DD, o null si no existe (31 de abril, 30 de febrero...). */
function armarFecha(ano: number, mes: number, dia: number): string | null {
  const fecha = new Date(Date.UTC(ano, mes - 1, dia));
  if (fecha.getUTCFullYear() !== ano || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
  return fecha.toISOString().slice(0, 10);
}

/** Día y mes sin año: esta fecha si todavía no pasó (o es hoy); si no, la del año siguiente. */
function proximaFecha(hoy: string, mes: number, dia: number): string | null {
  const ano = Number(hoy.slice(0, 4));
  const esteAno = armarFecha(ano, mes, dia);
  if (esteAno && esteAno >= hoy) return esteAno;
  return armarFecha(ano + 1, mes, dia);
}

export function resolverFechaTexto(texto: string, hoy: string): string | null {
  // Se quitan los artículos del principio: "el viernes", "para el 15 de noviembre", "el dia 20".
  const t = normalizar(texto).replace(/^(?:para )?(?:(?:el|este|proximo) )+(?:dia )?/, '');
  if (t === 'hoy') return hoy;
  if (t === 'manana') return sumarDias(hoy, 1);
  if (t === 'pasado manana') return sumarDias(hoy, 2);

  const dia = DIAS[t];
  if (dia !== undefined) return sumarDias(hoy, (dia - diaSemana(hoy) + 7) % 7 || 7);

  const conMes = /^(\d{1,2}) de ([a-z]+)$/.exec(t);
  if (conMes) {
    const mes = MESES[conMes[2] ?? ''];
    return mes ? proximaFecha(hoy, mes, Number(conMes[1])) : null;
  }

  const barras = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{2}|\d{4}))?$/.exec(t);
  if (barras) {
    const dd = Number(barras[1]);
    const mm = Number(barras[2]);
    const aa = barras[3];
    if (aa === undefined) return proximaFecha(hoy, mm, dd);
    const fecha = armarFecha(aa.length === 2 ? 2000 + Number(aa) : Number(aa), mm, dd);
    return fecha && fecha >= hoy ? fecha : null;
  }

  // "el 20" (el "el " ya se quitó): el próximo día 20 desde mañana. Se prueban hasta 3 meses por si el mes no tiene ese día (el 31).
  const soloDia = /^(\d{1,2})$/.exec(t);
  if (soloDia) {
    const numero = Number(soloDia[1]);
    const [ano, mes, hoyDia] = hoy.split('-').map(Number) as [number, number, number];
    for (let sumaMeses = numero > hoyDia ? 0 : 1; sumaMeses < 4; sumaMeses++) {
      const indice = mes - 1 + sumaMeses;
      const fecha = armarFecha(ano + Math.floor(indice / 12), (indice % 12) + 1, numero);
      if (fecha) return fecha;
    }
  }
  return null;
}
