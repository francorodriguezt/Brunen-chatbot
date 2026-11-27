/**
 * Configuración que el dueño o la operadora cambian en la hoja CONFIGURACION (columnas Variable, Valor,
 * Descripción), sin tocar código ni Cloudflare:
 *
 *  - BOT_ACTIVO: SI o NO. Con NO el bot deja de responder (regla 11).
 *  - ESTADO_SERVICIO: normal o reducido. Con reducido el bot agrega MENSAJE_EXCEPCION a sus respuestas
 *    (regla 11: por ejemplo, cuando hay una falla operativa).
 *  - MENSAJE_EXCEPCION: el texto de ese aviso.
 *  - DATOS_TRANSFERENCIA: el texto con los datos para transferir (banco, tipo y número de cuenta, titular, RUT, correo).
 *    El bot lo entrega tal cual cuando el cliente pregunta cómo pagar (D109). Si está vacío, lo atiende una persona.
 *  - ALERTA_SIN_SENAL_MINUTOS y ALERTA_RUTA_NO_INICIADA: cuándo avisa el panel del reparto (D98, `alertasReparto.ts`).
 *    Por defecto 20 minutos y 10:30; con NO se apaga cada una.
 *
 * Se lee cada minuto (la caché está en `hojas.ts`). Si la hoja no se puede leer, se usa lo último que se
 * leyó; si nunca se leyó, `leerBotActivo` no decide (null) y manda la variable BOT_ACTIVO del Worker:
 * una caída de Google nunca apaga el bot.
 */

import { parsearRutaNoIniciada, parsearSinSenal, type UmbralesReparto } from './alertasReparto';
import { leerHoja, type EntornoHojas } from './hojas';
import { normalizar } from './texto';

const DURACION_SEGUNDOS = 60;

export interface Servicio {
  /** ESTADO_SERVICIO = reducido. */
  reducido: boolean;
  mensajeExcepcion: string;
  /** DATOS_TRANSFERENCIA, tal cual está en la hoja; ausente si no hay (D109). */
  datosDeTransferencia?: string;
}

/** Lo más largo que se acepta de DATOS_TRANSFERENCIA: es un mensaje de WhatsApp, no un documento. */
const MAXIMO_DATOS_TRANSFERENCIA = 500;

export interface Configuracion {
  /** true = SI, false = NO, null = la hoja no dice nada válido. */
  botActivo: boolean | null;
  servicio: Servicio;
  /** Umbrales de las alertas del reparto (D98). */
  reparto: UmbralesReparto;
}

/** Valor de una variable de la hoja (nombre sin importar mayúsculas, tildes ni guiones bajos). */
function valorDe(filas: ReadonlyArray<ReadonlyArray<string>>, variable: string): string | undefined {
  // normalizar convierte "_" en espacio: "BOT_ACTIVO" queda "bot activo".
  const buscada = normalizar(variable).replace(/\s+/g, '');
  return filas.find((fila) => normalizar(fila[0] ?? '').replace(/\s+/g, '') === buscada)?.[1];
}

/** true = encendido (SI), false = apagado (NO), null = la hoja no dice nada válido. */
export function parsearBotActivo(filas: ReadonlyArray<ReadonlyArray<string>>): boolean | null {
  for (const fila of filas) {
    if (normalizar(fila[0] ?? '').replace(/\s+/g, '') !== 'botactivo') continue;
    const valor = normalizar(fila[1] ?? '').replace(/\s+/g, '');
    if (valor === 'no') return false;
    if (valor === 'si') return true;
  }
  return null;
}

/** Los datos de pago que escribió la persona, sin espacios de más y sin pasarse del largo de un mensaje. */
function datosDeTransferencia(valor: string | undefined): { datosDeTransferencia?: string } {
  const texto = (valor ?? '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n').slice(0, MAXIMO_DATOS_TRANSFERENCIA);
  return texto ? { datosDeTransferencia: texto } : {};
}

export function parsearConfiguracion(filas: ReadonlyArray<ReadonlyArray<string>>): Configuracion {
  return {
    botActivo: parsearBotActivo(filas),
    servicio: {
      reducido: normalizar(valorDe(filas, 'ESTADO_SERVICIO') ?? '') === 'reducido',
      mensajeExcepcion: (valorDe(filas, 'MENSAJE_EXCEPCION') ?? '').trim(),
      ...datosDeTransferencia(valorDe(filas, 'DATOS_TRANSFERENCIA')),
    },
    reparto: {
      sinSenalMinutos: parsearSinSenal(valorDe(filas, 'ALERTA_SIN_SENAL_MINUTOS')),
      rutaNoIniciada: parsearRutaNoIniciada(valorDe(filas, 'ALERTA_RUTA_NO_INICIADA')),
    },
  };
}

/** undefined = no se pudo leer la hoja ni hay nada guardado. */
export function leerConfiguracion(env: EntornoHojas, ahoraSegundos?: number): Promise<Configuracion | undefined> {
  return leerHoja(
    env,
    { nombre: 'CONFIGURACION', rango: 'CONFIGURACION!A2:C', parsear: parsearConfiguracion, duracionSegundos: DURACION_SEGUNDOS },
    ahoraSegundos,
  );
}

export async function leerBotActivo(env: EntornoHojas, ahoraSegundos?: number): Promise<boolean | null> {
  return (await leerConfiguracion(env, ahoraSegundos))?.botActivo ?? null;
}

/** Sin hoja legible se asume el servicio normal: no se agrega ningún aviso. */
export async function leerServicio(env: EntornoHojas, ahoraSegundos?: number): Promise<Servicio> {
  return (await leerConfiguracion(env, ahoraSegundos))?.servicio ?? { reducido: false, mensajeExcepcion: '' };
}
