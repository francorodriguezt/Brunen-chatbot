/**
 * RUT chileno: se usa como nombre de usuario para entrar a la aplicación (D51).
 *
 * Se guarda y se compara siempre igual: sin puntos ni guion, con el dígito verificador al final y la K en mayúscula
 * ("111111111"). El dígito verificador se calcula con el módulo 11: así un RUT mal tipeado se rechaza antes de
 * consultar la base.
 */

function digitoVerificador(cuerpo: string): string {
  let suma = 0;
  let factor = 2;
  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += Number(cuerpo[i]) * factor;
    factor = factor === 7 ? 2 : factor + 1;
  }
  const resto = 11 - (suma % 11);
  return resto === 11 ? '0' : resto === 10 ? 'K' : String(resto);
}

/** Devuelve el RUT normalizado, o null si no tiene la forma de un RUT o su dígito verificador no calza. */
export function normalizarRut(texto: unknown): string | null {
  if (typeof texto !== 'string' || texto.length > 20) return null;
  const limpio = texto.trim().toUpperCase();
  if (!/^\d{1,2}(\.?\d{3}){2}-?[\dK]$/.test(limpio)) return null;
  const sinSignos = limpio.replace(/[.-]/g, '');
  const cuerpo = sinSignos.slice(0, -1);
  return digitoVerificador(cuerpo) === sinSignos.slice(-1) ? sinSignos : null;
}

/** "111111111" → "11.111.111-1". */
export function formatearRut(rut: string): string {
  const cuerpo = rut.slice(0, -1).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${cuerpo}-${rut.slice(-1)}`;
}
