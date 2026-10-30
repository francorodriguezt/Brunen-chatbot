/**
 * Lee lo que un cliente nuevo contesta cuando el bot le pide su nombre y su dirección (D37). Sin red y sin IA, a
 * propósito: esa respuesta es justo el nombre y la dirección, que no deben salir hacia Groq.
 *
 * Es cuidadoso con el nombre: solo lo separa cuando hay una señal clara ("me llamo", "soy", o un primer renglón que
 * es solo letras y viene antes de una dirección con número). Si no, lo deja vacío y se guarda todo lo que escribió,
 * para que Constanza lo ordene al confirmar el pedido.
 */

import { detectarComuna, type ComunaDetectada } from './comunas';
import { normalizar } from './texto';

export interface DatosDelCliente {
  /** Vacío si no se pudo separar con seguridad. */
  nombre: string;
  /** Lo que escribió, sin el nombre cuando se pudo separar. */
  direccion: string;
  comuna: ComunaDetectada | null;
  esDepartamento: boolean;
  /** Dijo el nombre de un edificio, una torre o un condominio. */
  tieneEdificio: boolean;
}

const MAX_PALABRAS_DEL_NOMBRE = 4;
const MAX_PALABRAS_DEL_EDIFICIO = 5;
const MAX_LARGO_DEL_EDIFICIO = 40;

// Palabras de un pedido, una pregunta o un reclamo: si están, el texto no es la respuesta a "tu nombre y tu dirección".
const DE_OTRO_TEMA =
  /\b(?:bidon|bidones|botellon|botellones|litro|litros|lts|lt|quiero|necesito|necesitamos|pedir|pedido|precio|cuanto|cuesta|reclamo|factura|boleta)\b/;
// "no sé", "no tiene nombre", "sin nombre", "es una casa": contestó, pero no es el nombre de un edificio.
const NEGATIVA = /^(?:no(?: .*)?|nada|ninguno|ninguna|sin edificio|sin nombre|(?:es )?(?:una )?casa)$/;
// Cortesías y confirmaciones sueltas que acompañan a una respuesta ("Torre Norte, gracias") o la reemplazan ("ok").
const CORTESIAS = /\b(?:muchas|gracias|por favor|porfa|porfavor|ok|okey|listo|dale|perfecto|vale)\b/g;
const GRACIAS_AL_FINAL = /[\s,.;-]*(?:muchas\s+)?gracias[\s.!]*$/i;
const DEPARTAMENTO = /\b(?:depto|dpto|departamento|dept)\b/;
const EDIFICIO = /\b(?:edificio|edif|torre|condominio|cond)\b/;

const SEPARADORES = /[\n;,|]+|\s+[-–—]\s+/;
// Saludos del principio ("Hola, ...", "Buenas tardes, ...") y cortesías sueltas ("gracias", "por favor"): no son datos.
const SALUDO_AL_INICIO = /^(?:(?:hola+|buenas\s+(?:tardes|noches|d[ií]as)|buenos\s+d[ií]as|buen\s+d[ií]a|buenas|saludos|estimad[oa]s?|hey)(?![\p{L}])[\s,.!¡:-]*)+/iu;
const SOLO_CORTESIA = /^(?:(?:muchas\s+)?gracias|por\s+favor|porfa(?:vor)?|saludos|de\s+antemano)$/;
// "Dirección: Pasaje 5", "Comuna: Macul": se quita la etiqueta y se deja el dato.
const ETIQUETA = /^(?:comuna|ciudad|sector|direcci[oó]n|dir|calle)\s*:\s*/iu;

// Estos prefijos son todo ASCII: se buscan sobre el texto original para no perder tildes ni mayúsculas.
const PREFIJO_DE_NOMBRE = /^(?:me llamo|mi nombre es|nombre y apellido|nombre|soy|a nombre de)(?![\p{L}])[\s:.,-]*/iu;
const RELLENO_DE_DIRECCION = /^(?:y\s+)?(?:vivo en|vivimos en|estoy en|mi direcci[oó]n es|mi direcci[oó]n|direcci[oó]n|dir|en)(?![\p{L}])[\s:.,-]*/iu;
const PREFIJO_DE_EDIFICIO = /^(?:(?:el|la)\s+)?(?:edificio|edif)(?![\p{L}])\.?\s*(?:se\s+llama|es)?\s*:?\s*/iu;

/** Palabras (normalizadas) que cortan el nombre: lo que sigue ya es la dirección. */
const CORTAN_EL_NOMBRE: ReadonlySet<string> = new Set(['y', 'vivo', 'vivimos', 'estoy', 'direccion', 'dir', 'calle', 'en', 'av', 'avenida', 'pasaje', 'camino']);
/** Si un primer renglón empieza así, es una dirección y no un nombre. */
const EMPIEZAN_UNA_DIRECCION: ReadonlySet<string> = new Set([
  'calle', 'av', 'avenida', 'avda', 'pasaje', 'psje', 'pje', 'camino', 'ruta', 'diagonal', 'plaza', 'poblacion', 'villa',
  'condominio', 'edificio', 'torre', 'los', 'las', 'el', 'la', 'depto', 'dpto', 'departamento', 'oficina', 'block', 'casa',
]);
const SOLO_LETRAS = /^[\p{L}'’-]{2,}$/u;

/** Las primeras palabras que parecen un nombre, y lo que sobra. */
function tomarNombre(palabras: readonly string[]): { nombre: string; resto: string[] } {
  let largo = 0;
  while (largo < palabras.length && largo < MAX_PALABRAS_DEL_NOMBRE) {
    const palabra = palabras[largo] as string;
    if (!SOLO_LETRAS.test(palabra) || CORTAN_EL_NOMBRE.has(normalizar(palabra))) break;
    largo++;
  }
  return { nombre: palabras.slice(0, largo).join(' '), resto: palabras.slice(largo) };
}

function esNombreSuelto(segmento: string): boolean {
  const palabras = segmento.split(' ');
  return (
    palabras.length <= MAX_PALABRAS_DEL_NOMBRE &&
    palabras.every((palabra) => SOLO_LETRAS.test(palabra)) &&
    !EMPIEZAN_UNA_DIRECCION.has(normalizar(palabras[0] as string)) &&
    detectarComuna(segmento) === null
  );
}

/** null = no parece una dirección (por ejemplo "gracias", "20" o un pedido): sigue el camino normal. */
export function leerDatosDelCliente(texto: string): DatosDelCliente | null {
  const segmentos = texto
    .split(SEPARADORES)
    .map((segmento, i) => {
      const limpio = segmento.replace(/\s+/g, ' ').trim();
      return (i === 0 ? limpio.replace(SALUDO_AL_INICIO, '') : limpio).replace(ETIQUETA, '').trim();
    })
    .filter((segmento) => segmento !== '' && !SOLO_CORTESIA.test(normalizar(segmento)));
  if (segmentos.length === 0) return null;

  const todo = segmentos.join(' ');
  const normalizado = normalizar(todo);
  if (DE_OTRO_TEMA.test(normalizado)) return null;
  const comuna = detectarComuna(todo);
  const tieneNumeroYCalle = /\d/.test(normalizado) && /[a-z]{3,}/.test(normalizado);
  if (comuna === null && !tieneNumeroYCalle) return null;

  let nombre = '';
  let restantes = segmentos;
  const primero = segmentos[0] as string;
  const prefijo = PREFIJO_DE_NOMBRE.exec(primero);
  if (prefijo) {
    const separado = tomarNombre(primero.slice(prefijo[0].length).split(' '));
    // "soy de Providencia" no es un nombre.
    if (separado.nombre !== '' && detectarComuna(separado.nombre) === null) {
      nombre = separado.nombre;
      const sobra = separado.resto.join(' ');
      restantes = [...(sobra ? [sobra] : []), ...segmentos.slice(1)];
    }
  } else if (segmentos.length >= 2 && esNombreSuelto(primero) && segmentos.slice(1).some((segmento) => /\d/.test(segmento))) {
    nombre = primero;
    restantes = segmentos.slice(1);
  }
  const direccion = restantes
    .map((segmento, i) => (i === 0 ? segmento.replace(RELLENO_DE_DIRECCION, '').trim() : segmento))
    .filter(Boolean)
    .join(', ');

  return { nombre, direccion, comuna, esDepartamento: DEPARTAMENTO.test(normalizado), tieneEdificio: EDIFICIO.test(normalizado) };
}

/** La respuesta a "¿Cómo se llama el edificio?": un nombre corto. null = no lo es ("no sé", un pedido...). */
export function leerEdificio(texto: string): string | null {
  const limpio = texto.replace(/\s+/g, ' ').trim().replace(PREFIJO_DE_EDIFICIO, '').replace(GRACIAS_AL_FINAL, '').trim();
  const normalizado = normalizar(limpio);
  if (limpio === '' || limpio.length > MAX_LARGO_DEL_EDIFICIO || limpio.split(' ').length > MAX_PALABRAS_DEL_EDIFICIO) return null;
  if (!/[a-z]/.test(normalizado) || NEGATIVA.test(normalizado) || DE_OTRO_TEMA.test(normalizado)) return null;
  // "ok", "listo": una confirmación, no un nombre.
  if (normalizado.replace(CORTESIAS, ' ').trim() === '') return null;
  return limpio;
}

/** Lo que queda de la respuesta sobre el edificio, sin cortesías ni el "el edificio" del principio. */
function sinAdornos(texto: string): string {
  return normalizar(texto)
    .replace(CORTESIAS, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:(?:el|la) )?(?:edificio|edif)\b ?/, '')
    .trim();
}

/** "No tiene nombre, gracias", "no sé", "es una casa": contestó, pero no hay un nombre que anotar. */
export function diceQueNoHayEdificio(texto: string): boolean {
  return NEGATIVA.test(sinAdornos(texto)) && !DE_OTRO_TEMA.test(normalizar(texto));
}
