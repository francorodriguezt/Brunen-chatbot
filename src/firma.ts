/**
 * Verificación de la firma de Meta (cabecera X-Hub-Signature-256).
 *
 * Meta firma el cuerpo crudo del webhook con HMAC-SHA256 usando el App Secret.
 * Sin esta verificación, cualquiera que conozca la URL podría inyectar pedidos falsos.
 * Usa WebCrypto, disponible tanto en Cloudflare Workers como en Node 20+.
 */

const codificador = new TextEncoder();

export async function firmarHmacSha256(cuerpo: string, secreto: string): Promise<string> {
  const clave = await crypto.subtle.importKey(
    'raw',
    codificador.encode(secreto),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const firma = await crypto.subtle.sign('HMAC', clave, codificador.encode(cuerpo));
  return Array.from(new Uint8Array(firma), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Comparación en tiempo constante para no filtrar información por tiempos de respuesta. */
function igualesTiempoConstante(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) {
    diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diferencia === 0;
}

export async function verificarFirma(
  cuerpoCrudo: string,
  cabecera: string | null,
  appSecret: string,
): Promise<boolean> {
  if (!cabecera || !appSecret) return false;
  const prefijo = 'sha256=';
  if (!cabecera.startsWith(prefijo)) return false;
  const recibida = cabecera.slice(prefijo.length).toLowerCase();
  const esperada = await firmarHmacSha256(cuerpoCrudo, appSecret);
  return igualesTiempoConstante(recibida, esperada);
}
