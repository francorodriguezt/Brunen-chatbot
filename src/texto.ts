/**
 * Utilidades de texto para el intérprete (Etapa 3).
 *
 * Los clientes escriben como quieren: "Dos BIDONES de 20LTS!", "2 de veinte lts", "un par de bidones".
 * Antes de buscar nada, el texto se reduce a una sola forma: minúsculas, sin tildes (la ñ pasa a n),
 * sin signos (salvo "?" y "/", que sirven para detectar preguntas y fechas) y con los números en cifras.
 */

const PALABRAS_NUMERO: Readonly<Record<string, number>> = {
  un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintiuna: 21,
  veintidos: 22, veintitres: 23, veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27,
  veintiocho: 28, veintinueve: 29, treinta: 30, cuarenta: 40, cincuenta: 50,
};

// Las palabras largas primero, para que "veintiuno" no se confunda con un prefijo más corto.
const PATRON_PALABRAS = new RegExp(
  String.raw`\b(${Object.keys(PALABRAS_NUMERO).sort((a, b) => b.length - a.length).join('|')})\b`,
  'g',
);

/** "Dos BIDÓNES de 20LTS!" -> "dos bidones de 20 lts". */
export function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '') // quita tildes (y la tilde de la ñ)
    .toLowerCase()
    .replace(/(\d)([a-z])/g, '$1 $2') // "20lts" -> "20 lts"
    .replace(/([a-z])(\d)/g, '$1 $2') // "x2" -> "x 2"
    .replace(/[^a-z0-9/?]+/g, ' ') // signos, emojis y saltos de línea
    .replace(/\s+/g, ' ')
    .trim();
}

/** Pasa a cifras los números escritos con letras. Recibe texto ya normalizado. */
export function numerosACifras(textoNormalizado: string): string {
  return textoNormalizado
    .replace(/\bun par de\b/g, '2')
    .replace(PATRON_PALABRAS, (palabra) => String(PALABRAS_NUMERO[palabra] ?? palabra));
}

/** Normaliza y pasa los números a cifras: la forma sobre la que trabajan las reglas. */
export function preparar(texto: string): string {
  return numerosACifras(normalizar(texto));
}
