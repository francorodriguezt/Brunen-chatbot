/**
 * Cómo se reconoce a un cliente: su teléfono normalizado y la clave de su dirección. Sin dependencias, para que lo
 * usen igual el bot (`whatsapp.ts`), las fichas (`fichas.ts`) y el cargador del historial (`scripts/historial/`), que
 * es JavaScript y lo importa directo gracias a que Node quita los tipos de TypeScript al cargarlo (Node 22.18 o más).
 */

/** Solo dígitos, con código de país: "9 1234 5678" → "56912345678". null si no parece un teléfono. */
export function normalizarTelefono(texto: string): string | null {
  let digitos = texto.replace(/\D/g, '');
  if (digitos.startsWith('00')) digitos = digitos.slice(2);
  if (digitos.length === 9) return `56${digitos}`; // sin código de país: se asume Chile
  if (digitos.length === 11 && digitos.startsWith('56')) return digitos;
  if (digitos.length >= 10 && digitos.length <= 15 && !digitos.startsWith('56')) return digitos; // otro país, tal cual
  return null;
}

/** "Av. Grecia 123, depto 4" y "av grecia 123 depto 4" son la misma dirección. */
export function claveDeDireccion(direccion: string, comuna: string): string {
  const limpiar = (t: string) =>
    t
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${limpiar(direccion)}|${limpiar(comuna)}`;
}
