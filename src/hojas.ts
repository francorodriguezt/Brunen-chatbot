/**
 * Lectura de hojas de la planilla con caché en memoria. Todas las lecturas del bot (feriados,
 * configuración, clientes, precios) pasan por aquí, para que compartan las mismas reglas:
 *
 *  - Un resultado se recuerda `duracionSegundos`; así no se lee la planilla en cada mensaje
 *    (Sheets permite 60 lecturas por minuto y cada espera cuesta tiempo de respuesta).
 *  - Si la lectura falla, se devuelve lo último que se leyó y el fallo también se recuerda un
 *    minuto: con Google caído no se pierden hasta 8 s de espera en cada mensaje.
 *  - Un resultado "vacío" (por ejemplo, la hoja sin datos o con un formato que no se entiende) se
 *    recuerda solo un minuto, para notar rápido que se corrigió.
 *
 * Devuelve `undefined` cuando no hay credenciales o no se pudo leer nada: el llamador decide qué hacer.
 */

import { ClienteSheets, type CuentaServicio } from './google';

export interface EntornoHojas {
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_SHEET_ID?: string;
}

interface EntradaCache {
  valor: unknown;
  hastaSegundos: number;
}
const cache = new Map<string, EntradaCache>();
/** Lecturas en curso: si dos partes piden la misma hoja a la vez, se lee una sola vez. */
const enVuelo = new Map<string, Promise<unknown>>();

/** Un fallo o un resultado vacío se vuelven a leer a los 60 s. */
const DURACION_CORTA_SEGUNDOS = 60;

/** Solo para pruebas. */
export function olvidarHojas(): void {
  cache.clear();
  enVuelo.clear();
}

export interface OpcionesLectura<T> {
  /** Nombre de la hoja, para los avisos del log. */
  nombre: string;
  /** Rango en notación A1, por ejemplo "FERIADOS!A2:B". */
  rango: string;
  /** Convierte las filas leídas en el dato que se necesita. No debe devolver `undefined`. */
  parsear(filas: string[][]): T;
  duracionSegundos: number;
  /** Si devuelve true, el resultado se recuerda solo un minuto y se avisa en el log. */
  esVacio?(valor: T): boolean;
  /** Texto del aviso cuando el resultado está vacío; recibe las filas leídas para poder decir qué pasó. */
  avisoVacio?(filas: string[][]): string;
}

export async function leerHoja<T>(
  env: EntornoHojas,
  opciones: OpcionesLectura<T>,
  ahoraSegundos: number = Math.floor(Date.now() / 1000),
): Promise<T | undefined> {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.GOOGLE_SHEET_ID) return undefined;
  const clave = `${env.GOOGLE_SHEET_ID}|${opciones.rango}`;
  const guardado = cache.get(clave);
  if (guardado && guardado.hastaSegundos > ahoraSegundos) return guardado.valor as T | undefined;

  const enCurso = enVuelo.get(clave);
  if (enCurso) return enCurso as Promise<T | undefined>;

  const sheetId = env.GOOGLE_SHEET_ID;
  const claveJson = env.GOOGLE_SERVICE_ACCOUNT_JSON;
  const lectura = (async (): Promise<T | undefined> => {
    let valor = guardado?.valor as T | undefined;
    let duracion = DURACION_CORTA_SEGUNDOS;
    try {
      const cuenta = JSON.parse(claveJson) as CuentaServicio;
      const filas = await new ClienteSheets(cuenta, sheetId).leerFilas(opciones.rango, ahoraSegundos);
      valor = opciones.parsear(filas);
      if (opciones.esVacio?.(valor)) {
        console.error(opciones.avisoVacio?.(filas) ?? `La hoja ${opciones.nombre} no aporta datos (${filas.length} filas leídas).`);
      } else {
        duracion = opciones.duracionSegundos;
      }
    } catch (error) {
      console.error(`No se pudo leer ${opciones.nombre}:`, error instanceof Error ? error.message : error);
    }
    cache.set(clave, { valor, hastaSegundos: ahoraSegundos + duracion });
    return valor;
  })().finally(() => enVuelo.delete(clave));
  enVuelo.set(clave, lectura);
  return lectura;
}

/** "Precio_Especial_20L" -> "precio_especial_20l": sin tildes ni mayúsculas, para no depender de cómo se escriba el encabezado. */
export function claveDeColumna(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Una hoja con encabezado en la primera fila -> una lista de filas con el nombre de cada columna.
 * Se busca cada dato por el nombre de su columna y no por su posición: si alguien agrega o mueve una
 * columna, el bot sigue leyendo lo correcto.
 */
export function filasConEncabezado(filas: readonly (readonly string[])[]): Array<Record<string, string>> {
  const [encabezado, ...datos] = filas;
  if (!encabezado) return [];
  const claves = encabezado.map(claveDeColumna);
  return datos.map((fila) => {
    const registro: Record<string, string> = {};
    claves.forEach((clave, i) => {
      if (clave) registro[clave] = (fila[i] ?? '').trim();
    });
    return registro;
  });
}

/** "$4.500", "4.500", "4500" -> 4500; vacío o sin dígitos -> null. Los montos en pesos chilenos no llevan decimales. */
export function aEnteroCLP(texto: string | undefined): number | null {
  const digitos = (texto ?? '').replace(/[^\d]/g, '');
  return digitos === '' ? null : Number(digitos);
}
