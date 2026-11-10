/**
 * Relevo: cuando una persona toma la conversación, el bot se calla.
 *
 * Brunen mantiene su número de siempre, compartido entre la app WhatsApp Business y el bot ("coexistencia", D46). Con el
 * número compartido Meta le avisa al bot de cada mensaje que una persona envía desde la app o desde un equipo vinculado
 * (el aviso `smb_message_echoes`). Ese aviso es la señal de que alguien está atendiendo a ese cliente:
 *
 *  - durante la pausa (una hora desde el último mensaje de la persona, por defecto) el bot no le responde a ese cliente
 *    ni le anota pedidos: dos voces en la misma conversación confunden, y el bot no conoce lo que se habló a mano;
 *  - lo que el bot le había preguntado a ese cliente se olvida, para que no retome una pregunta vieja después;
 *  - si el cliente escribe algo que necesita respuesta y la pausa termina sin que nadie le conteste, el vigía deja un
 *    aviso en el panel (`vigia.ts`): el silencio del bot no puede convertirse en un cliente olvidado.
 *
 * Esquema: migrations/0006_conversaciones_tomadas.sql.
 */

import type { BaseDatos } from './almacen';
import { interpretar } from './interprete';
import type { EcoDePersona } from './whatsapp';

export const PAUSA_POR_DEFECTO_MINUTOS = 60;
const PAUSA_MAXIMA_MINUTOS = 24 * 60;
/** Un eco no puede venir "del futuro" más que por el desfase normal entre relojes. */
const ADELANTO_TOLERADO_SEGUNDOS = 300;
const MAXIMO_POR_PASADA = 50;
/** Mensajes que no piden respuesta de nadie. */
const SIN_RESPUESTA: ReadonlySet<string> = new Set(['reaction', 'sticker']);

/** Segundos que el bot calla con un cliente después del último mensaje de una persona. 0 = el bot no se calla nunca. */
export function pausaPorPersona(env: { PAUSA_POR_PERSONA_MINUTOS?: string }): number {
  const texto = env.PAUSA_POR_PERSONA_MINUTOS?.trim() ?? '';
  const minutos = /^\d{1,4}$/.test(texto) ? Number(texto) : PAUSA_POR_DEFECTO_MINUTOS;
  return (minutos <= PAUSA_MAXIMA_MINUTOS ? minutos : PAUSA_POR_DEFECTO_MINUTOS) * 60;
}

/**
 * Anota que una persona les escribió a esos clientes y devuelve a cuántos. La pausa corre desde la hora del eco (Meta
 * puede entregarlo con atraso); si esa hora no sirve, desde que llegó. Un mensaje nuevo de la persona alarga la pausa y,
 * como ya le respondió, el cliente deja de estar "esperando".
 */
export async function registrarEcos(db: BaseDatos, ecos: readonly EcoDePersona[], pausaSegundos: number, ahoraSegundos: number): Promise<number> {
  if (pausaSegundos <= 0) return 0;
  const ultimoPorCliente = new Map<string, number>();
  for (const eco of ecos) {
    const horaValida = Number.isFinite(eco.timestamp) && eco.timestamp > 0 && eco.timestamp <= ahoraSegundos + ADELANTO_TOLERADO_SEGUNDOS;
    const hora = horaValida ? eco.timestamp : ahoraSegundos;
    ultimoPorCliente.set(eco.para, Math.max(ultimoPorCliente.get(eco.para) ?? 0, hora));
  }

  let tomadas = 0;
  for (const [telefono, hora] of ultimoPorCliente) {
    const hasta = hora + pausaSegundos;
    if (hasta <= ahoraSegundos) continue; // llegó tan atrasado que su pausa ya terminó
    await db
      .prepare(
        `INSERT INTO conversaciones_tomadas (telefono, hasta, ultimo_eco_en) VALUES (?1, ?2, ?3)
         ON CONFLICT(telefono) DO UPDATE SET
           espera_desde = CASE WHEN espera_desde IS NOT NULL AND espera_desde > excluded.ultimo_eco_en THEN espera_desde ELSE NULL END,
           hasta = MAX(hasta, excluded.hasta),
           ultimo_eco_en = MAX(ultimo_eco_en, excluded.ultimo_eco_en)`,
      )
      .bind(telefono, hasta, hora)
      .run();
    // Lo que el bot le había preguntado ("¿de qué tamaño?") ya no vale: la conversación la lleva una persona.
    await db.prepare('DELETE FROM conversaciones WHERE telefono = ?1').bind(telefono).run();
    tomadas += 1;
  }
  return tomadas;
}

/** true si una persona le escribió a ese cliente y la pausa sigue vigente. */
export async function conversacionTomada(db: BaseDatos, telefono: string, ahoraSegundos: number): Promise<boolean> {
  const fila = (await db.prepare('SELECT hasta FROM conversaciones_tomadas WHERE telefono = ?1').bind(telefono).run()).results?.[0] as { hasta?: unknown } | undefined;
  return typeof fila?.hasta === 'number' && fila.hasta > ahoraSegundos;
}

/** Un "gracias" o una reacción no dejan a nadie esperando; un pedido, una pregunta, un audio o una imagen, sí. */
export function necesitaRespuesta(mensaje: { tipo: string; texto?: string }): boolean {
  if (SIN_RESPUESTA.has(mensaje.tipo)) return false;
  if (mensaje.tipo !== 'text' || !mensaje.texto) return true;
  return interpretar(mensaje.texto).intencion !== 'cierre';
}

/** El cliente escribió algo que necesita respuesta mientras el bot calla: queda anotado desde cuándo espera (el primer momento). */
export async function anotarEsperaDelCliente(db: BaseDatos, telefono: string, ahoraSegundos: number): Promise<void> {
  await db.prepare('UPDATE conversaciones_tomadas SET espera_desde = COALESCE(espera_desde, ?2) WHERE telefono = ?1').bind(telefono, ahoraSegundos).run();
}

export interface ClienteEnEspera {
  telefono: string;
  /** Segundos Unix del primer mensaje que quedó sin respuesta. */
  esperaDesde: number;
}

/** Borra las pausas que ya terminaron y devuelve los clientes que quedaron esperando una respuesta. */
export async function cerrarPausasVencidas(db: BaseDatos, ahoraSegundos: number): Promise<ClienteEnEspera[]> {
  const vencidas = ((await db.prepare(`SELECT telefono, espera_desde FROM conversaciones_tomadas WHERE hasta <= ?1 ORDER BY hasta LIMIT ${MAXIMO_POR_PASADA}`).bind(ahoraSegundos).run()).results ??
    []) as Array<{ telefono?: unknown; espera_desde?: unknown }>;
  const esperando: ClienteEnEspera[] = [];
  for (const fila of vencidas) {
    if (typeof fila.telefono !== 'string') continue;
    // Si justo llegó otro eco, `hasta` creció y la fila ya no se borra: la pausa sigue.
    const borrada = await db.prepare('DELETE FROM conversaciones_tomadas WHERE telefono = ?1 AND hasta <= ?2').bind(fila.telefono, ahoraSegundos).run();
    if ((borrada.meta?.changes ?? 0) > 0 && typeof fila.espera_desde === 'number') esperando.push({ telefono: fila.telefono, esperaDesde: fila.espera_desde });
  }
  return esperando;
}
