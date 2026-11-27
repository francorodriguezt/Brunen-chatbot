/**
 * Contador de mensajes salientes de WhatsApp (D113, respuesta 9). Meta da 1.000 mensajes de servicio gratis al mes por
 * número y después cobra cada uno (CLAUDE.md, presupuesto de mensajes). Los supuestos de cuántos mensajes salen por pedido
 * eran estimaciones (docs/INVESTIGACION_2026-11-27.md): esto los mide, y avisa al llegar a 800 para que nadie se entere
 * por la factura. Esquema: migrations/0021_uso_mensajes_e_ia.sql.
 *
 * Cuenta solo lo que el bot envía por la Cloud API. Lo que una persona escribe desde la app o abre con "Escribirle" no
 * pasa por aquí y no gasta el cupo.
 */

import type { Alerta } from './alertas';
import type { BaseDatos } from './almacen';
import { RepositorioD1 } from './repositorio';

export const MENSAJES_GRATIS_AL_MES = 1000;
export const MENSAJES_PARA_AVISAR = 800;

/** "2026-11". Mes de UTC: si Meta factura con otro borde, solo cambia a qué mes cae un mensaje de la medianoche. */
export function mesDe(ahoraSegundos: number): string {
  return new Date(ahoraSegundos * 1000).toISOString().slice(0, 7);
}

export type Umbral = 'aviso' | 'tope';

/** Qué umbral cruza el mensaje número `enviados`: el 800 y el 1.001 (el primero que ya se cobra). */
export function umbralQueCruza(enviados: number): Umbral | null {
  if (enviados === MENSAJES_PARA_AVISAR) return 'aviso';
  if (enviados === MENSAJES_GRATIS_AL_MES + 1) return 'tope';
  return null;
}

/** Suma un mensaje al mes y devuelve el total del mes con ese mensaje incluido. Null si no se pudo contar. */
export async function contarMensaje(db: BaseDatos, ahoraSegundos: number): Promise<number | null> {
  const mes = mesDe(ahoraSegundos);
  try {
    const resultado = await db
      .prepare('INSERT INTO uso_mensajes (mes, enviados) VALUES (?1, 1) ON CONFLICT(mes) DO UPDATE SET enviados = enviados + 1 RETURNING enviados')
      .bind(mes)
      .run();
    const fila = (resultado.results?.[0] ?? null) as { enviados?: unknown } | null;
    return typeof fila?.enviados === 'number' ? fila.enviados : null;
  } catch (error) {
    console.error('No se pudo contar el mensaje saliente:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Cuántos mensajes salieron en el mes de `ahoraSegundos` (0 si no hay datos). */
export async function mensajesDelMes(db: BaseDatos, ahoraSegundos: number): Promise<number> {
  try {
    const resultado = await db.prepare('SELECT enviados FROM uso_mensajes WHERE mes = ?1').bind(mesDe(ahoraSegundos)).run();
    const fila = (resultado.results?.[0] ?? null) as { enviados?: unknown } | null;
    return typeof fila?.enviados === 'number' ? fila.enviados : 0;
  } catch {
    return 0;
  }
}

export function alertaDeUmbral(umbral: Umbral, enviados: number): Alerta {
  const resumen =
    umbral === 'aviso'
      ? `El bot ya envió ${enviados} mensajes de WhatsApp este mes. Meta da ${MENSAJES_GRATIS_AL_MES} gratis; pasado ese número cada mensaje cuesta unos USD 0,02.`
      : `El bot pasó los ${MENSAJES_GRATIS_AL_MES} mensajes gratis de WhatsApp de este mes: desde ahora cada mensaje se cobra (unos USD 0,02). Si no lo esperabas, revisa qué está generando tantos mensajes.`;
  return { tipo: 'error', telefono: '', resumen, motivos: [] };
}

/**
 * Cuenta un mensaje que ya salió y, si con él se cruza el 800 o el tope, deja un aviso en el panel (una sola vez por mes:
 * el aviso tiene un origen fijo) y devuelve la alerta nueva para que quien llama la mande también por Telegram.
 * Nunca lanza errores: contar no debe romper la respuesta al cliente.
 */
export async function registrarMensajeEnviado(db: BaseDatos, ahoraSegundos: number): Promise<Alerta | null> {
  try {
    const enviados = await contarMensaje(db, ahoraSegundos);
    if (enviados === null) return null;
    const umbral = umbralQueCruza(enviados);
    if (!umbral) return null;
    const alerta = alertaDeUmbral(umbral, enviados);
    const nuevo = await new RepositorioD1(db).guardarAviso(alerta, `mensajes-${umbral}:${mesDe(ahoraSegundos)}`, ahoraSegundos);
    return nuevo ? alerta : null;
  } catch (error) {
    console.error('No se pudo avisar del contador de mensajes:', error instanceof Error ? error.message : error);
    return null;
  }
}
