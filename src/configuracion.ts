/**
 * Interruptor del bot (regla 11) en la hoja CONFIGURACION (columnas Variable, Valor, Descripción).
 * Así el dueño o Constanza pueden apagarlo escribiendo NO en la fila BOT_ACTIVO, sin tocar código
 * ni Cloudflare. Se lee cada minuto (la caché está en `hojas.ts`).
 *
 * Si la hoja no se puede leer, se usa lo último que se leyó; si nunca se leyó, no decide (null) y
 * manda la variable BOT_ACTIVO del Worker: una caída de Google nunca apaga el bot.
 */

import { leerHoja, type EntornoHojas } from './hojas';
import { normalizar } from './texto';

const DURACION_SEGUNDOS = 60;

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

export async function leerBotActivo(env: EntornoHojas, ahoraSegundos?: number): Promise<boolean | null> {
  const valor = await leerHoja(
    env,
    { nombre: 'CONFIGURACION', rango: 'CONFIGURACION!A2:B', parsear: parsearBotActivo, duracionSegundos: DURACION_SEGUNDOS },
    ahoraSegundos,
  );
  return valor ?? null;
}
