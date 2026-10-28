/**
 * Junta los mensajes seguidos de un mismo cliente para responder una sola vez (D16): quien escribe
 * "2 bidones" y, tres segundos después, "de 20", manda dos mensajes de WhatsApp pero hace un solo pedido.
 * Responder a cada uno gastaría el cupo de mensajes gratis y confundiría al cliente.
 *
 * Funciona sin estado en el Worker, con la tabla `mensajes_pendientes` de D1: cada mensaje se anota, espera
 * unos segundos y, si no llegó otro del mismo número, procesa todos los pendientes juntos. Si llegó otro,
 * se retira y deja que ese (el último) los procese. Esperar no gasta CPU, y `waitUntil` admite hasta 30 s.
 *
 * Importante para quien lo conecte: si el aviso de Meta trae varios mensajes de un número, se anotan todos
 * primero y se espera una sola vez, no una vez por mensaje.
 *
 * El texto del mensaje queda en D1 solo esos segundos: se borra apenas se procesa, y lo que quede huérfano
 * se limpia con `limpiarPendientes`.
 */

import type { BaseDatos } from './almacen';

/** Cuánto se espera a que llegue otro mensaje. PENDIENTE: ajustar con mensajes reales. */
export const ESPERA_POR_DEFECTO_MS = 7000;
const VIGENCIA_PENDIENTES_SEGUNDOS = 3600;

export interface MensajeAgrupable {
  wamid: string;
  telefono: string;
  texto: string;
}

export interface OpcionesAgrupar {
  esperaMs?: number;
  /** Para pruebas: reemplaza la espera real. */
  esperar?: (ms: number) => Promise<void>;
  ahoraSegundos?: number;
}

const dormir = (ms: number) => new Promise<void>((resolver) => setTimeout(resolver, ms));

function primeraFila(resultado: { results?: unknown[] }): Record<string, unknown> | undefined {
  return resultado.results?.[0] as Record<string, unknown> | undefined;
}

/**
 * Devuelve los textos del grupo, en orden, si a este mensaje le toca procesarlos; o null si le toca a otro
 * mensaje más nuevo. Si D1 falla devuelve solo el texto de este mensaje: es mejor responder por separado
 * que no responder.
 */
export async function agruparMensaje(db: BaseDatos, mensaje: MensajeAgrupable, opciones: OpcionesAgrupar = {}): Promise<string[] | null> {
  const ahora = opciones.ahoraSegundos ?? Math.floor(Date.now() / 1000);
  try {
    await db
      .prepare('INSERT OR IGNORE INTO mensajes_pendientes (wamid, telefono, texto, recibido_en) VALUES (?1, ?2, ?3, ?4)')
      .bind(mensaje.wamid, mensaje.telefono, mensaje.texto, ahora)
      .run();
    const propio = primeraFila(await db.prepare('SELECT id FROM mensajes_pendientes WHERE wamid = ?1').bind(mensaje.wamid).run())?.id;
    // Sin fila propia, otro proceso ya se llevó este mensaje junto con los de su grupo.
    if (typeof propio !== 'number') return null;

    await (opciones.esperar ?? dormir)(opciones.esperaMs ?? ESPERA_POR_DEFECTO_MS);

    const ultimo = primeraFila(await db.prepare('SELECT MAX(id) AS ultimo FROM mensajes_pendientes WHERE telefono = ?1').bind(mensaje.telefono).run())?.ultimo;
    if (ultimo !== propio) return null; // llegó uno más nuevo (o ya se procesó): que lo haga el último

    const filas = (await db
      .prepare('SELECT texto FROM mensajes_pendientes WHERE telefono = ?1 AND id <= ?2 ORDER BY id')
      .bind(mensaje.telefono, propio)
      .run()).results as Array<{ texto: string }> | undefined;
    await db.prepare('DELETE FROM mensajes_pendientes WHERE telefono = ?1 AND id <= ?2').bind(mensaje.telefono, propio).run();
    if (!filas) return [mensaje.texto]; // la base no devolvió filas: se atiende este solo
    return filas.length > 0 ? filas.map((fila) => fila.texto) : null; // sin filas: otro proceso ya las procesó
  } catch (error) {
    console.error('No se pudieron agrupar los mensajes; se atiende este solo:', error instanceof Error ? error.message : error);
    return [mensaje.texto];
  }
}

/** Borra los mensajes que quedaron sin procesar (por ejemplo, porque el Worker falló a mitad de camino). */
export async function limpiarPendientes(db: BaseDatos, ahoraSegundos: number = Math.floor(Date.now() / 1000)): Promise<void> {
  try {
    await db.prepare('DELETE FROM mensajes_pendientes WHERE recibido_en < ?1').bind(ahoraSegundos - VIGENCIA_PENDIENTES_SEGUNDOS).run();
  } catch (error) {
    console.error('No se pudieron limpiar los mensajes pendientes:', error instanceof Error ? error.message : error);
  }
}
