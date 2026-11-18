/**
 * Fotos, archivos y audios de los clientes (D68).
 *
 * - Comprobantes: la foto o el PDF de una transferencia se reenvía al grupo de Telegram, con el nombre y el teléfono del
 *   cliente, para que Constanza o el dueño revisen que sea real. El aviso queda igual en el panel.
 * - Audios: se transcriben con Whisper en Cloudflare (Workers AI, el mismo proveedor de la base; no guarda los datos) y
 *   el texto va en el aviso, para que Constanza sepa qué dijo sin escucharlo. El bot sigue sin responder audios: es una
 *   regla del dueño (D36). Si el audio parece un pedido, el aviso lo dice.
 * Todo es una ayuda: si algo falla, el aviso queda igual y nada se pierde.
 */

import { interpretar } from './interprete';
import { enviarArchivo, escaparHtml, telefonoLegible, type ConfigTelegram } from './telegram';
import * as textos from './textos';

/** Workers AI: solo lo que se usa. */
export interface IA {
  run(modelo: string, entrada: Record<string, unknown>): Promise<unknown>;
}

export const MODELO_DE_VOZ = '@cf/openai/whisper-large-v3-turbo';
/** Una nota de voz de unos 2 minutos. Más larga, la escucha una persona (y no gasta el cupo gratis del día). */
export const MAXIMO_AUDIO_BYTES = 2 * 1024 * 1024;

function aBase64(datos: ArrayBuffer): string {
  const bytes = new Uint8Array(datos);
  let binario = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binario);
}

/** Lo que dijo el cliente en el audio, o null si no se pudo transcribir. */
export async function transcribir(ia: IA | undefined, audio: ArrayBuffer): Promise<string | null> {
  if (!ia || audio.byteLength === 0 || audio.byteLength > MAXIMO_AUDIO_BYTES) return null;
  try {
    const salida = (await ia.run(MODELO_DE_VOZ, { audio: aBase64(audio), language: 'es' })) as { text?: unknown };
    const texto = typeof salida?.text === 'string' ? salida.text.trim() : '';
    return texto ? texto.slice(0, 1000) : null;
  } catch (error) {
    console.error('No se pudo transcribir el audio:', error instanceof Error ? error.message : error);
    return null;
  }
}

/** Una línea para el aviso si lo transcrito parece un pedido ("Parece un pedido: 3 bidones de 20 L"). */
export function pistaDePedido(transcripcion: string): string | null {
  const i = interpretar(transcripcion);
  if (i.intencion !== 'pedido' || i.items.length === 0) return null;
  const lineas = i.items.flatMap((item) => (item.cantidad !== null && item.tipo !== 'no_especificado' ? [{ tipo: item.tipo, cantidad: item.cantidad }] : []));
  if (lineas.length === 0) return 'Parece un pedido: revisa el detalle en el audio.';
  const detalle = textos.resumenLineas(lineas);
  return `Parece un pedido: ${detalle}${i.fecha_texto ? `, para ${i.fecha_texto}` : ''}.`;
}

/** Reenvía el comprobante al grupo de Telegram. Devuelve true si llegó. */
export async function reenviarComprobante(
  telegram: ConfigTelegram | null,
  archivo: { datos: ArrayBuffer; mime: string; nombre?: string },
  cliente: { telefono: string; nombre?: string; pie?: string },
): Promise<boolean> {
  const extension = archivo.mime === 'application/pdf' ? 'pdf' : (archivo.mime.split('/')[1] ?? 'jpg');
  const quien = [cliente.nombre?.trim(), telefonoLegible(cliente.telefono)].filter(Boolean).join(' · ');
  const pie = [
    `🧾 <b>Comprobante de pago</b> de ${escaparHtml(quien)}`,
    'Revisa que la transferencia sea real y márcalo en el panel.',
    cliente.pie ? `<i>“${escaparHtml(cliente.pie.slice(0, 300))}”</i>` : '',
  ]
    .filter(Boolean)
    .join('\n');
  return enviarArchivo(telegram, { datos: archivo.datos, mime: archivo.mime, nombre: archivo.nombre ?? `comprobante.${extension}` }, pie);
}
