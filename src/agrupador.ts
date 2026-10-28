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

/** Espera que llegue otro mensaje del mismo cliente. Separada para que un aviso de Meta con varios mensajes espere una sola vez. */
export const esperarGrupo = dormir;

/**
 * Paso 1: anota el mensaje y devuelve su número de orden (o null si otro proceso ya se lo llevó junto con los de
 * su grupo). Puede lanzar errores de D1: quien lo llama decide qué hacer.
 */
export async function anotarMensaje(db: BaseDatos, mensaje: MensajeAgrupable, ahoraSegundos: number = Math.floor(Date.now() / 1000)): Promise<number | null> {
  await db
    .prepare('INSERT OR IGNORE INTO mensajes_pendientes (wamid, telefono, texto, recibido_en) VALUES (?1, ?2, ?3, ?4)')
    .bind(mensaje.wamid, mensaje.telefono, mensaje.texto, ahoraSegundos)
    .run();
  const propio = primeraFila(await db.prepare('SELECT id FROM mensajes_pendientes WHERE wamid = ?1').bind(mensaje.wamid).run())?.id;
  return typeof propio === 'number' ? propio : null;
}

/**
 * Paso 2, después de esperar: si este mensaje sigue siendo el último de su número, se lleva todo el grupo (en el
 * orden en que llegó); si llegó uno más nuevo, o ya lo procesó otro, devuelve null.
 */
export async function reclamarGrupo(db: BaseDatos, mensaje: MensajeAgrupable, propio: number): Promise<string[] | null> {
  const ultimo = primeraFila(await db.prepare('SELECT MAX(id) AS ultimo FROM mensajes_pendientes WHERE telefono = ?1').bind(mensaje.telefono).run())?.ultimo;
  if (ultimo !== propio) return null; // llegó uno más nuevo (o ya se procesó): que lo haga el último

  const filas = (await db
    .prepare('SELECT texto FROM mensajes_pendientes WHERE telefono = ?1 AND id <= ?2 ORDER BY id')
    .bind(mensaje.telefono, propio)
    .run()).results as Array<{ texto: string }> | undefined;
  await db.prepare('DELETE FROM mensajes_pendientes WHERE telefono = ?1 AND id <= ?2').bind(mensaje.telefono, propio).run();
  if (!filas) return [mensaje.texto]; // la base no devolvió filas: se atiende este solo
  return filas.length > 0 ? filas.map((fila) => fila.texto) : null; // sin filas: otro proceso ya las procesó
}

/**
 * Devuelve los textos del grupo, en orden, si a este mensaje le toca procesarlos; o null si le toca a otro
 * mensaje más nuevo. Si D1 falla devuelve solo el texto de este mensaje: es mejor responder por separado
 * que no responder.
 */
export async function agruparMensaje(db: BaseDatos, mensaje: MensajeAgrupable, opciones: OpcionesAgrupar = {}): Promise<string[] | null> {
  try {
    const propio = await anotarMensaje(db, mensaje, opciones.ahoraSegundos);
    if (propio === null) return null;
    await (opciones.esperar ?? dormir)(opciones.esperaMs ?? ESPERA_POR_DEFECTO_MS);
    return await reclamarGrupo(db, mensaje, propio);
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
