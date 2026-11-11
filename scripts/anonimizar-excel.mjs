/**
 * Hace una copia anonimizada de un Excel (.xlsx) o CSV con datos de clientes y un informe de su estructura y patrones.
 * Sirve para analizar el historial de pedidos y las planillas de la plataforma de rutas SIN que nombres, teléfonos ni
 * direcciones reales salgan del computador.
 *
 * Uso:
 *   npm run anonimizar -- "datos/historial.xlsx"
 *   npm run anonimizar -- "datos/historial.xlsx" --salida datos-anonimos --hoja "Pedidos"
 *   npm run anonimizar -- "datos/historial.xlsx" --fila-encabezado 3 --col "Apodo=nombre" --col "Vendedor=omitir"
 *
 * Sale en la carpeta `datos-anonimos/` (ignorada por git):
 *   - un .csv por hoja, con nombres, teléfonos y direcciones cambiados por códigos;
 *   - informe.md, con las columnas, los totales y los patrones.
 *
 * No guarda en ningún lado qué código es quién: sin el archivo original no se puede deshacer.
 * Antes de escribir, revisa que no se haya colado ningún dato original; si encuentra uno, no escribe nada.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { leerArchivo } from './anonimizar/lector.mjs';
import { anonimizarHoja, buscarFiltraciones, crearEstado, normalizar, ROLES } from './anonimizar/nucleo.mjs';
import { construirInforme } from './anonimizar/informe.mjs';

function celdaCsv(valor) {
  let texto = String(valor ?? '');
  // Una celda que empieza con = + @ puede ejecutarse como fórmula si alguien abre el CSV en Excel.
  if (/^[=+@]/.test(texto)) texto = `'${texto}`;
  return /[",\n\r]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

export function aCsv(encabezados, filas) {
  return `${[encabezados, ...filas].map((fila) => fila.map(celdaCsv).join(',')).join('\n')}\n`;
}

const nombreSeguro = (texto) =>
  normalizar(texto)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'hoja';

/** Todo el proceso en memoria, sin tocar el disco: lee, anonimiza, arma el informe y revisa que no haya fugas. */
export function anonimizarArchivo({ buffer, nombreArchivo, hoja, filaEncabezado, sobrescrituras }) {
  const leidas = leerArchivo(buffer, nombreArchivo).filter((h) => !hoja || normalizar(h.nombre) === normalizar(hoja));
  if (leidas.length === 0) throw new Error(`No encontré la hoja "${hoja}" en el archivo.`);

  const estado = crearEstado();
  const hojas = [];
  const omitidas = [];
  for (const h of leidas) {
    if (h.filas.filter((f) => f.some((v) => String(v).trim() !== '')).length < 2) {
      omitidas.push(`${h.nombre} (vacía)`);
      continue;
    }
    try {
      hojas.push({ nombre: h.nombre, ...anonimizarHoja(h.filas, { filaEncabezado, sobrescrituras, estado }) });
    } catch (error) {
      omitidas.push(`${h.nombre} (${error.message})`);
    }
  }
  if (hojas.length === 0) throw new Error(`No pude anonimizar ninguna hoja. ${omitidas.join('; ')}`);

  const base = nombreSeguro(basename(nombreArchivo).replace(/\.[^.]+$/, ''));
  const informe = construirInforme({ archivo: basename(nombreArchivo), hojas });
  const archivos = hojas.map((h) => ({ nombre: `${base}__${nombreSeguro(h.nombre)}.csv`, contenido: aCsv(h.encabezados, h.filas) }));

  const aRevisar = [...hojas.flatMap((h) => [h.nombre, ...h.encabezados, ...h.filas.flat()]), ...informe.split('\n')];
  const problemas = buscarFiltraciones(aRevisar, estado.sensibles);

  return { hojas, omitidas, informe, archivos, problemas };
}

function leerArgumentos(argv) {
  const opciones = { archivo: null, salida: 'datos-anonimos', hoja: null, filaEncabezado: undefined, sobrescrituras: new Map(), ayuda: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--ayuda' || a === '-h') opciones.ayuda = true;
    else if (a === '--salida') opciones.salida = argv[++i];
    else if (a === '--hoja') opciones.hoja = argv[++i];
    else if (a === '--fila-encabezado') {
      const fila = Number(argv[++i]);
      if (!Number.isInteger(fila) || fila < 1) throw new Error('--fila-encabezado necesita un número de fila (1 es la primera).');
      opciones.filaEncabezado = fila - 1;
    } else if (a === '--col') {
      const [encabezado, rol] = String(argv[++i]).split(/=(?=[^=]*$)/);
      if (!encabezado || !ROLES.includes(rol)) throw new Error(`--col usa "Encabezado=rol". Roles posibles: ${ROLES.join(', ')}.`);
      opciones.sobrescrituras.set(normalizar(encabezado), rol);
    } else if (!a.startsWith('--') && !opciones.archivo) opciones.archivo = a;
    else throw new Error(`No entiendo "${a}". Usa --ayuda.`);
  }
  return opciones;
}

const AYUDA = `Uso: npm run anonimizar -- <archivo.xlsx|.csv> [opciones]

  --salida <carpeta>         dónde dejar la copia (por defecto datos-anonimos)
  --hoja <nombre>            procesar solo esa hoja
  --fila-encabezado <n>      fila donde están los encabezados (1 = primera), si no se detecta sola
  --col "Encabezado=rol"     fuerza el rol de una columna; se puede repetir
Roles: ${ROLES.join(', ')}  (omitir quita la columna)`;

function descripcionDe(tratamiento) {
  return (
    {
      'codigo-nombre': 'se cambia por un código',
      'codigo-telefono': 'se cambia por un código (queda el formato y los dígitos)',
      'codigo-direccion': 'se cambia por un código (queda el largo y si trae número)',
      ocultar: 'se oculta',
      'texto-libre': 'NO se copia: solo largo y palabras clave',
      fecha: 'se deja (fecha)',
      numero: 'se deja (número)',
      categoria: 'se deja tal cual (pocas opciones)',
      omitir: 'se quita',
    }[tratamiento] ?? tratamiento
  );
}

function main() {
  const opciones = leerArgumentos(process.argv.slice(2));
  if (opciones.ayuda || !opciones.archivo) {
    console.log(AYUDA);
    return opciones.ayuda ? 0 : 1;
  }

  const carpeta = resolve(opciones.salida);
  const relativa = relative(resolve('datos'), carpeta);
  if (relativa === '' || (!relativa.startsWith('..') && !isAbsolute(relativa))) {
    throw new Error('La salida no puede quedar dentro de datos/. Usa otra carpeta (por defecto datos-anonimos).');
  }

  const resultado = anonimizarArchivo({
    buffer: readFileSync(opciones.archivo),
    nombreArchivo: opciones.archivo,
    hoja: opciones.hoja,
    filaEncabezado: opciones.filaEncabezado,
    sobrescrituras: opciones.sobrescrituras,
  });

  console.log(`\nArchivo: ${basename(opciones.archivo)}`);
  for (const hoja of resultado.hojas) {
    console.log(`\nHoja "${hoja.nombre}": ${hoja.filas.length} filas. Encabezado en la fila ${hoja.filaEncabezado + 1}.`);
    for (const [n, c] of hoja.columnas.entries()) console.log(`  ${String(n + 1).padStart(2)}. ${c.nombre}  →  rol ${c.rol}: ${descripcionDe(c.tratamiento)}`);
    for (const aviso of hoja.avisos) console.log(`  ! ${aviso}`);
  }
  if (resultado.omitidas.length > 0) console.log(`\nHojas que no se procesaron: ${resultado.omitidas.join('; ')}`);

  if (resultado.problemas.length > 0) {
    console.error('\nNO escribí nada: la revisión final encontró algo que parece un dato personal:');
    for (const problema of resultado.problemas) console.error(`  - ${problema}`);
    console.error('Corrige el rol de la columna con --col "Encabezado=rol" (por ejemplo =omitir) y vuelve a correrlo.');
    return 1;
  }

  mkdirSync(carpeta, { recursive: true });
  for (const archivo of resultado.archivos) writeFileSync(join(carpeta, archivo.nombre), archivo.contenido, 'utf8');
  writeFileSync(join(carpeta, 'informe.md'), resultado.informe, 'utf8');

  console.log(`\nListo. Quedó en ${carpeta}:`);
  for (const archivo of resultado.archivos) console.log(`  - ${archivo.nombre}`);
  console.log('  - informe.md');
  console.log('\nAntes de compartirlo, abre un .csv y revisa que ninguna columna deje ver nombres, teléfonos ni direcciones.');
  console.log('Si alguna columna quedó mal clasificada, corre de nuevo con --col "Encabezado=rol" (o =omitir para quitarla).');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    process.exitCode = main();
  } catch (error) {
    console.error(`\nError: ${error.message}`);
    process.exitCode = 1;
  }
}
