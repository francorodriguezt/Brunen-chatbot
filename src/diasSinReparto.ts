/**
 * Días sin reparto (D74): los que una persona marca en el panel (un feriado que falta en la hoja FERIADOS, un cierre,
 * una falla del furgón). El bot los salta igual que un feriado y le explica al cliente el motivo, que se escribe para
 * que lo lea él ("mantención del furgón"). Viven en D1 (migración 0014), no en la planilla: el panel no tiene acceso
 * a Google.
 *
 * Es una ayuda para el bot: si D1 falla, se registra y el bot sigue con los feriados de la hoja.
 */

import type { BaseDatos } from './almacen';
import { sumarDias } from './despacho';

export interface DiaSinReparto {
  fecha: string;
  motivo: string;
  creadoPor: string;
  creadoEn: number;
}

/** Cuántos días hacia adelante mira el bot: más que suficiente para cualquier fecha que pida un cliente. */
const DIAS_HACIA_ADELANTE = 120;
export const MAX_MOTIVO = 80;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

export function fechaValida(fecha: unknown): fecha is string {
  if (typeof fecha !== 'string' || !FECHA.test(fecha)) return false;
  const d = new Date(`${fecha}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === fecha;
}

/** El motivo en una línea corta, sin saltos ni espacios de más: va dentro del mensaje al cliente. */
export function limpiarMotivo(motivo: unknown): string {
  return typeof motivo === 'string' ? motivo.replace(/\s+/g, ' ').trim().slice(0, MAX_MOTIVO) : '';
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : '');
const numero = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);

export class RepositorioDiasSinReparto {
  constructor(private readonly db: BaseDatos) {}

  /** Desde `desde` (incluido) en adelante, en orden. */
  async listar(desde: string): Promise<DiaSinReparto[]> {
    const r = await this.db.prepare('SELECT fecha, motivo, creado_por, creado_en FROM dias_sin_reparto WHERE fecha >= ?1 ORDER BY fecha LIMIT 200').bind(desde).run();
    return ((r.results ?? []) as Record<string, unknown>[]).map((f) => ({ fecha: texto(f.fecha), motivo: texto(f.motivo), creadoPor: texto(f.creado_por), creadoEn: numero(f.creado_en) }));
  }

  /** Lo que mira el bot: fecha -> motivo, desde hoy hasta unos meses adelante. */
  async proximos(hoy: string): Promise<Map<string, string>> {
    const r = await this.db
      .prepare('SELECT fecha, motivo FROM dias_sin_reparto WHERE fecha >= ?1 AND fecha <= ?2')
      .bind(hoy, sumarDias(hoy, DIAS_HACIA_ADELANTE))
      .run();
    return new Map(((r.results ?? []) as Record<string, unknown>[]).map((f) => [texto(f.fecha), texto(f.motivo)]));
  }

  /** Anota el día, o le cambia el motivo si ya estaba. */
  async marcar(fecha: string, motivo: string, quien: string, ahoraSegundos: number): Promise<void> {
    await this.db
      .prepare('INSERT INTO dias_sin_reparto (fecha, motivo, creado_por, creado_en) VALUES (?1, ?2, ?3, ?4) ON CONFLICT(fecha) DO UPDATE SET motivo = ?2, creado_por = ?3, creado_en = ?4')
      .bind(fecha, limpiarMotivo(motivo), quien.slice(0, 120), ahoraSegundos)
      .run();
  }

  /** true si estaba marcado. */
  async quitar(fecha: string): Promise<boolean> {
    const r = await this.db.prepare('DELETE FROM dias_sin_reparto WHERE fecha = ?1').bind(fecha).run();
    return (r.meta?.changes ?? 0) > 0;
  }

  /** Pedidos vivos de ese día (por confirmar, confirmados o en ruta): hay que moverlos si el día se cierra. */
  async pedidosDelDia(fecha: string): Promise<number> {
    const r = await this.db
      .prepare(
        `SELECT COUNT(*) AS n FROM pedidos
         WHERE COALESCE(fecha_confirmada, fecha_entrega) = ?1 AND estado IN ('Pendiente_Confirmacion', 'Fuera_de_zona', 'Confirmado', 'En_Ruta')`,
      )
      .bind(fecha)
      .run();
    return numero((r.results?.[0] as Record<string, unknown> | undefined)?.n);
  }
}

/** Para el bot: nunca lanza. Sin base o con la base caída, no hay días cerrados que saltar. */
export async function cargarDiasSinReparto(db: BaseDatos | undefined, hoy: string): Promise<ReadonlyMap<string, string>> {
  if (!db) return new Map();
  try {
    return await new RepositorioDiasSinReparto(db).proximos(hoy);
  } catch (falla) {
    console.error('No se pudieron leer los días sin reparto:', falla instanceof Error ? falla.message : falla);
    return new Map();
  }
}
