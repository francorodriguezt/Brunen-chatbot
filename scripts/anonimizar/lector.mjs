/**
 * Lector de planillas sin dependencias: .xlsx (un zip con XML adentro) y .csv.
 *
 * Por qué sin librerías: el script corre en el computador de Franco con los datos reales de los clientes, y mientras
 * menos código de terceros toque esos archivos, mejor. Un .xlsx es un zip con unos pocos XML; leerlo toma ~150 líneas.
 *
 * Todas las funciones devuelven hojas con la forma `{ nombre, filas }`, donde `filas` es una lista de listas de
 * texto. Los números salen como texto sin notación científica; las fechas, en formato ISO (2025-01-31).
 */

import { inflateRawSync } from 'node:zlib';

const LIMITE_DESCOMPRIMIDO = 256 * 1024 * 1024;
const ENTIDADES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };

export function desescapar(texto) {
  return texto
    .replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e) => {
      if (e[0] === '#') {
        const codigo = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
        return Number.isFinite(codigo) && codigo > 0 && codigo <= 0x10ffff ? String.fromCodePoint(codigo) : '';
      }
      return ENTIDADES[e.toLowerCase()] ?? '';
    })
    .replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

function atributo(texto, nombre) {
  const m = new RegExp(`(?:^|\\s)${nombre}="([^"]*)"`).exec(texto);
  return m ? m[1] : undefined;
}

/** "B12" → 1 (columna, desde 0). */
export function columnaDe(referencia) {
  const letras = /^[A-Za-z]+/.exec(referencia)?.[0] ?? '';
  let n = 0;
  for (const letra of letras.toUpperCase()) n = n * 26 + (letra.charCodeAt(0) - 64);
  return Math.max(0, n - 1);
}

// ---------------------------------------------------------------- zip

function leerZip(b) {
  let fin = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 65557); i--) {
    if (b.readUInt32LE(i) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error('El archivo no parece un .xlsx (no es un zip). Si es un .xls antiguo, guárdalo como .xlsx o .csv.');

  const total = b.readUInt16LE(fin + 10);
  let pos = b.readUInt32LE(fin + 16);
  const archivos = new Map();
  for (let n = 0; n < total; n++) {
    if (pos + 46 > b.length || b.readUInt32LE(pos) !== 0x02014b50) throw new Error('El zip está dañado (directorio central).');
    const metodo = b.readUInt16LE(pos + 10);
    const comprimido = b.readUInt32LE(pos + 20);
    const largoNombre = b.readUInt16LE(pos + 28);
    const extra = b.readUInt16LE(pos + 30);
    const comentario = b.readUInt16LE(pos + 32);
    const local = b.readUInt32LE(pos + 42);
    const nombre = b.toString('utf8', pos + 46, pos + 46 + largoNombre);
    if (comprimido === 0xffffffff || local === 0xffffffff) throw new Error('Zip64 no está soportado: exporta la hoja a .csv.');
    archivos.set(nombre, { metodo, comprimido, local });
    pos += 46 + largoNombre + extra + comentario;
  }

  return {
    existe: (nombre) => archivos.has(nombre),
    texto(nombre) {
      const e = archivos.get(nombre);
      if (!e) return null;
      const inicio = e.local + 30 + b.readUInt16LE(e.local + 26) + b.readUInt16LE(e.local + 28);
      const datos = b.subarray(inicio, inicio + e.comprimido);
      if (e.metodo === 0) return datos.toString('utf8');
      if (e.metodo === 8) return inflateRawSync(datos, { maxOutputLength: LIMITE_DESCOMPRIMIDO }).toString('utf8');
      throw new Error(`Método de compresión ${e.metodo} no soportado en ${nombre}.`);
    },
  };
}

// ---------------------------------------------------------------- xlsx

function textoDeSi(contenido) {
  const limpio = contenido.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '');
  let texto = '';
  for (const m of limpio.matchAll(/<t\b[^>]*?(?:\/>|>([\s\S]*?)<\/t>)/g)) texto += m[1] ?? '';
  return desescapar(texto);
}

function leerCompartidas(xml) {
  if (!xml) return [];
  const lista = [];
  for (const m of xml.matchAll(/<si\b[^>]*?(?:\/>|>([\s\S]*?)<\/si>)/g)) lista.push(textoDeSi(m[1] ?? ''));
  return lista;
}

/** 'fecha' | 'fechahora' | 'hora' | undefined, según el formato de número de la celda. */
function claseDeFormato(id, codigo) {
  if (codigo === undefined) {
    if ((id >= 14 && id <= 17) || (id >= 27 && id <= 31) || (id >= 34 && id <= 36) || (id >= 50 && id <= 58)) return 'fecha';
    if (id === 22) return 'fechahora';
    if ((id >= 18 && id <= 21) || (id >= 32 && id <= 33) || (id >= 45 && id <= 47)) return 'hora';
    return undefined;
  }
  const limpio = codigo
    .replace(/"[^"]*"/g, '')
    .replace(/\\./g, '')
    .replace(/\[[^\]]*\]/g, '')
    .replace(/[_*]./g, '');
  const fecha = /[dy]/i.test(limpio);
  const hora = /[hs]/i.test(limpio);
  if (fecha && hora) return 'fechahora';
  if (fecha) return 'fecha';
  if (hora) return 'hora';
  return undefined;
}

function leerEstilos(xml) {
  if (!xml) return [];
  const personalizados = new Map();
  for (const m of xml.matchAll(/<numFmt\b([^>]*)>/g)) {
    const id = Number(atributo(m[1], 'numFmtId'));
    personalizados.set(id, desescapar(atributo(m[1], 'formatCode') ?? ''));
  }
  const bloque = /<cellXfs\b[^>]*>([\s\S]*?)<\/cellXfs>/.exec(xml)?.[1] ?? '';
  const clases = [];
  for (const m of bloque.matchAll(/<xf\b([^>]*?)(?:\/>|>[\s\S]*?<\/xf>)/g)) {
    const id = Number(atributo(m[1], 'numFmtId') ?? 0);
    clases.push(claseDeFormato(id, personalizados.get(id)));
  }
  return clases;
}

function numeroATexto(n) {
  if (Number.isInteger(n)) return String(n);
  return String(Number(n.toPrecision(12)));
}

/** Número de serie de Excel → texto ISO. El 1900 de Excel cuenta el 29-feb-1900 que no existió: desde marzo de 1900 la base es el 30-dic-1899. */
export function serialAFecha(n, clase, es1904 = false) {
  if (!(n >= 0 && n < 2958466)) return numeroATexto(n);
  const base = es1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const iso = new Date(base + Math.round(n * 86400000)).toISOString();
  if (clase === 'hora') return iso.slice(11, 16);
  if (clase === 'fechahora' && n % 1 !== 0) return `${iso.slice(0, 10)} ${iso.slice(11, 16)}`;
  return iso.slice(0, 10);
}

function valorDeCelda(atributos, contenido, compartidas, estilos, es1904) {
  const tipo = atributo(atributos, 't');
  if (tipo === 'inlineStr') return textoDeSi(contenido);
  const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(contenido)?.[1];
  if (v === undefined) return '';
  if (tipo === 's') return compartidas[Number(v)] ?? '';
  if (tipo === 'str' || tipo === 'd') return desescapar(v);
  if (tipo === 'b') return v === '1' ? 'VERDADERO' : 'FALSO';
  if (tipo === 'e') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return desescapar(v);
  const clase = estilos[Number(atributo(atributos, 's') ?? 0)];
  return clase ? serialAFecha(n, clase, es1904) : numeroATexto(n);
}

function leerHoja(xml, compartidas, estilos, es1904) {
  // Una hoja de Excel suele arrastrar cientos de miles de filas vacías con formato (la de pedidos pesa 46 MB de XML
  // y casi todo es eso). Las primeras se conservan en su posición, para que el número de fila del encabezado calce
  // con el de Excel; de ahí en adelante solo se guardan las que tienen algún valor.
  const FILAS_CON_POSICION = 30;
  const completas = [];
  let siguiente = 0;
  for (const fila of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const declarada = Number(atributo(fila[1], 'r')) - 1;
    const indice = Number.isInteger(declarada) && declarada >= 0 ? declarada : siguiente;
    siguiente = indice + 1;
    const celdas = [];
    let siguienteColumna = 0;
    for (const c of (fila[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const referencia = atributo(c[1], 'r');
      const columna = referencia ? columnaDe(referencia) : siguienteColumna;
      siguienteColumna = columna + 1;
      celdas[columna] = valorDeCelda(c[1], c[2] ?? '', compartidas, estilos, es1904);
    }
    const dense = Array.from(celdas, (v) => v ?? '');
    if (indice < FILAS_CON_POSICION) {
      while (completas.length < indice) completas.push([]);
      completas.push(dense);
    } else if (dense.some((v) => v !== '')) completas.push(dense);
  }
  while (completas.length > 0 && completas[completas.length - 1].every((v) => v === '')) completas.pop();
  return completas;
}

export function leerXlsx(buffer) {
  const zip = leerZip(buffer);
  const libro = zip.texto('xl/workbook.xml');
  if (!libro) throw new Error('El archivo no tiene xl/workbook.xml: no es un .xlsx válido.');
  const es1904 = /<workbookPr\b[^>]*date1904="(?:1|true)"/i.test(libro);

  const destinos = new Map();
  for (const m of (zip.texto('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b([^>]*)>/g)) {
    const id = atributo(m[1], 'Id');
    const destino = atributo(m[1], 'Target');
    if (id && destino) destinos.set(id, destino);
  }

  const compartidas = leerCompartidas(zip.texto('xl/sharedStrings.xml'));
  const estilos = leerEstilos(zip.texto('xl/styles.xml'));

  const hojas = [];
  for (const m of libro.matchAll(/<sheet\b([^>]*)>/g)) {
    const nombre = desescapar(atributo(m[1], 'name') ?? 'Hoja');
    const destino = destinos.get(atributo(m[1], 'r:id') ?? '');
    if (!destino) continue;
    const ruta = destino.startsWith('/') ? destino.slice(1) : `xl/${destino.replace(/^\.\//, '')}`;
    const xml = zip.texto(ruta);
    if (xml) hojas.push({ nombre, filas: leerHoja(xml, compartidas, estilos, es1904) });
  }
  if (hojas.length === 0) throw new Error('No encontré hojas dentro del archivo.');
  return hojas;
}

// ---------------------------------------------------------------- csv

function detectarDelimitador(texto) {
  const primera = texto.split(/\r?\n/).find((linea) => linea.trim() !== '') ?? '';
  const cuenta = (c) => primera.split(c).length - 1;
  const candidatos = [';', '\t', ','];
  return candidatos.reduce((mejor, c) => (cuenta(c) > cuenta(mejor) ? c : mejor), ',');
}

export function leerCsv(buffer) {
  let texto;
  try {
    texto = new TextDecoder('utf-8', { fatal: true }).decode(buffer);
  } catch {
    texto = new TextDecoder('windows-1252').decode(buffer);
  }
  if (texto.charCodeAt(0) === 0xfeff) texto = texto.slice(1);

  const delimitador = detectarDelimitador(texto);
  const filas = [];
  let fila = [];
  let campo = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else entreComillas = false;
      } else campo += c;
    } else if (c === '"' && campo === '') entreComillas = true;
    else if (c === delimitador) {
      fila.push(campo);
      campo = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else campo += c;
  }
  if (campo !== '' || fila.length > 0) {
    fila.push(campo);
    filas.push(fila);
  }
  return [{ nombre: 'csv', filas }];
}

/** Elige el lector por la extensión del archivo. */
export function leerArchivo(buffer, nombreArchivo) {
  const extension = /\.([^.]+)$/.exec(nombreArchivo)?.[1]?.toLowerCase() ?? '';
  if (extension === 'xlsx' || extension === 'xlsm') return leerXlsx(buffer);
  if (extension === 'csv' || extension === 'txt' || extension === 'tsv') return leerCsv(buffer);
  if (extension === 'xls') throw new Error('Los .xls antiguos no se pueden leer: ábrelo en Excel y guárdalo como .xlsx o .csv.');
  throw new Error(`No sé leer archivos .${extension}. Usa .xlsx o .csv.`);
}
