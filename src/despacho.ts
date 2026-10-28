/**
 * Fecha de entrega propuesta (determinista).
 *
 * Fuente: docs/conocimiento_brunen.md, sección 6.
 *   - Se despacha de lunes a sábado. Domingos y festivos no.
 *   - Pedidos hasta las 9:00 se entregan el mismo día (si ese día hay despacho).
 *   - Pedidos posteriores: siguiente "día de despacho" (lunes a sábado, sin festivos).
 *
 * Interpretación de "hasta las 9:00": 09:00 inclusive, 09:01 ya pasa al siguiente día.
 * Los feriados NO están en el código: llegan desde la hoja FERIADOS como 'YYYY-MM-DD'.
 * Zona horaria: America/Santiago (maneja horario de verano/invierno).
 */

export const ZONA_HORARIA = 'America/Santiago';

export interface HoraCorte {
  hora: number;
  minuto: number;
}

export const CORTE_POR_DEFECTO: HoraCorte = { hora: 9, minuto: 0 };

export interface FechaHoraLocal {
  fecha: string; // YYYY-MM-DD
  hora: number;
  minuto: number;
}

export interface OpcionesEntrega {
  feriados: ReadonlySet<string>;
  corte?: HoraCorte;
  zona?: string;
}

export interface FechaEntrega {
  fecha: string; // YYYY-MM-DD
  mismoDia: boolean;
}

/** Convierte un instante a fecha y hora locales de la zona indicada. */
export function fechaHoraLocal(instante: Date, zona: string = ZONA_HORARIA): FechaHoraLocal {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: zona,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instante);
  const valor = (tipo: string): string => {
    const parte = partes.find((p) => p.type === tipo);
    if (!parte) throw new Error(`No se pudo obtener ${tipo} de la fecha`);
    return parte.value;
  };
  return {
    fecha: `${valor('year')}-${valor('month')}-${valor('day')}`,
    hora: Number(valor('hour')),
    minuto: Number(valor('minute')),
  };
}

/** "2026-10-28 14:05", en la hora de Santiago. */
export function textoFechaHora(ahora: Date): string {
  const local = fechaHoraLocal(ahora);
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return `${local.fecha} ${dosDigitos(local.hora)}:${dosDigitos(local.minuto)}`;
}

function aUTC(fecha: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(fecha);
  if (!m) throw new Error(`Fecha inválida: ${fecha}`);
  return new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
}

function aTexto(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** 0 = domingo ... 6 = sábado, para una fecha de calendario. */
export function diaSemana(fecha: string): number {
  return aUTC(fecha).getUTCDay();
}

export function sumarDias(fecha: string, dias: number): string {
  const d = aUTC(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return aTexto(d);
}

export function esDiaDespacho(fecha: string, feriados: ReadonlySet<string>): boolean {
  return diaSemana(fecha) !== 0 && !feriados.has(fecha);
}

/** Primer día de despacho estrictamente posterior a `fecha`. */
export function siguienteDiaDespacho(fecha: string, feriados: ReadonlySet<string>): string {
  let candidata = sumarDias(fecha, 1);
  // Tope de seguridad: si alguien carga una racha absurda de feriados, fallar en vez de colgarse.
  for (let i = 0; i < 31; i++) {
    if (esDiaDespacho(candidata, feriados)) return candidata;
    candidata = sumarDias(candidata, 1);
  }
  throw new Error('No hay día de despacho en los próximos 31 días: revisa la hoja FERIADOS.');
}

export function antesDelCorte(local: FechaHoraLocal, corte: HoraCorte = CORTE_POR_DEFECTO): boolean {
  return local.hora < corte.hora || (local.hora === corte.hora && local.minuto <= corte.minuto);
}

/** Fecha de entrega que el bot PROPONE (Constanza confirma). */
export function calcularFechaEntrega(instante: Date, opciones: OpcionesEntrega): FechaEntrega {
  const local = fechaHoraLocal(instante, opciones.zona ?? ZONA_HORARIA);
  const corte = opciones.corte ?? CORTE_POR_DEFECTO;
  if (antesDelCorte(local, corte) && esDiaDespacho(local.fecha, opciones.feriados)) {
    return { fecha: local.fecha, mismoDia: true };
  }
  return { fecha: siguienteDiaDespacho(local.fecha, opciones.feriados), mismoDia: false };
}
