/**
 * Interruptor del bot (regla 11) en la hoja CONFIGURACION (columnas Variable, Valor, Descripción).
 * Así el dueño o Constanza pueden apagarlo escribiendo NO en la fila BOT_ACTIVO, sin tocar código
 * ni Cloudflare. El valor se guarda en memoria un minuto para no leer la planilla en cada mensaje.
 *
 * Si la hoja no se puede leer, se usa lo último que se leyó; si nunca se leyó, no decide (null) y
 * manda la variable BOT_ACTIVO del Worker: una caída de Google nunca apaga el bot.
 */

import { ClienteSheets, type CuentaServicio } from './google';
import { normalizar } from './texto';

const DURACION_CACHE_SEGUNDOS = 60;

interface EntradaCache {
  botActivo: boolean | null;
  hastaSegundos: number;
}
const cache = new Map<string, EntradaCache>();

/** Solo para pruebas. */
export function olvidarConfiguracion(): void {
  cache.clear();
}

/** true = encendido (SI), false = apagado (NO), null = la hoja no dice nada válido. */
export function parsearBotActivo(filas: ReadonlyArray<ReadonlyArray<string>>): boolean | null {
  for (const fila of filas) {
    // normalizar convierte "_" en espacio: "BOT_ACTIVO" queda "bot activo".
    if (normalizar(fila[0] ?? '').replace(/\s+/g, '') !== 'botactivo') continue;
    const valor = normalizar(fila[1] ?? '').replace(/\s+/g, '');
    if (valor === 'no') return false;
    if (valor === 'si') return true;
  }
  return null;
}

export interface EntornoConfiguracion {
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_SHEET_ID?: string;
}

export async function leerBotActivo(
  env: EntornoConfiguracion,
  ahoraSegundos: number = Math.floor(Date.now() / 1000),
): Promise<boolean | null> {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.GOOGLE_SHEET_ID) return null;
  const guardado = cache.get(env.GOOGLE_SHEET_ID);
  if (guardado && guardado.hastaSegundos > ahoraSegundos) return guardado.botActivo;
  let botActivo = guardado?.botActivo ?? null;
  try {
    const cuenta = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as CuentaServicio;
    const filas = await new ClienteSheets(cuenta, env.GOOGLE_SHEET_ID).leerFilas('CONFIGURACION!A2:B', ahoraSegundos);
    botActivo = parsearBotActivo(filas);
  } catch (error) {
    console.error('No se pudo leer CONFIGURACION:', error instanceof Error ? error.message : error);
  }
  // También se guarda el fallo: si Google está caído, no se reintenta (con espera de hasta 8 s) en cada mensaje.
  cache.set(env.GOOGLE_SHEET_ID, { botActivo, hastaSegundos: ahoraSegundos + DURACION_CACHE_SEGUNDOS });
  return botActivo;
}
