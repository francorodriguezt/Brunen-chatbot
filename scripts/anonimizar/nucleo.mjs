/**
 * Núcleo del anonimizador: decide qué es cada columna y reemplaza lo que identifica a una persona.
 *
 * Qué hace con cada columna (según lo que dice su encabezado y, si no se entiende, según lo que contiene):
 *  - nombre, teléfono, dirección: se cambian por códigos ("Cliente-0007"). El mismo valor siempre da el mismo código,
 *    así se pueden contar duplicados, mudanzas y teléfonos compartidos sin saber quién es quién.
 *  - correo y RUT: se ocultan.
 *  - notas y cualquier texto libre: no se copian. Solo queda si está vacío, cuánto mide y cuáles de una lista cerrada
 *    de palabras aparecen ("depto", "llamar", "efectivo"...).
 *  - comuna, tamaño, tipo de cliente, tipo y estado de pago, factura y demás columnas con pocas opciones: se dejan tal cual.
 *  - cantidades, precios y fechas: se dejan tal cual.
 *
 * Es seudonimización, no anonimato total: quien tenga el archivo original podría reconstruir los códigos. Por eso la
 * clave (qué código es quién) NUNCA se guarda en ningún archivo.
 */

export const ROLES = [
  'nombre',
  'telefono',
  'direccion',
  'comuna',
  'email',
  'rut',
  'coordenadas',
  'notas',
  'fecha',
  'cantidad',
  'tamano',
  'precio',
  'tipo_cliente',
  'tipo_pago',
  'estado_pago',
  'factura',
  'otro',
  'omitir',
];

const REGLAS = [
  ['email', /\bmail\b|correo/],
  ['rut', /\brut\b|\brun\b|identificacion|\bdni\b/],
  ['coordenadas', /latitud|longitud|\blat\b|\blng\b|\blon\b|\blong\b|coordenad|\bgps\b|geolocaliz/],
  ['tipo_cliente', /tipo.{0,12}cliente|categoria|segmento|clasificacion/],
  ['tipo_pago', /(tipo|forma|medio|metodo|modo).{0,12}pago|metodo/],
  ['estado_pago', /estado.{0,12}pago|pagado|pagada|pago.{0,12}(estado|pendiente)/],
  ['factura', /factura|boleta|\bdte\b|documento/],
  ['tamano', /tamano|litro|capacidad|formato|\blts?\b/],
  ['cantidad', /cantidad|\bcant\b|bidon|unidades/],
  ['precio', /precio|monto|total|valor|importe|cobrar|pagar/],
  ['telefono', /telefono|\btel\b|fono|celular|movil|whatsapp|\bcel\b/],
  ['direccion', /direccion|domicilio|\bcalle\b|\bdir\b|ubicacion/],
  ['comuna', /comuna/],
  ['fecha', /fecha|\bdia\b/],
  ['nombre', /nombre|cliente|razon social|\bcontacto\b|destinatario/],
  ['notas', /nota|observ|comentario|detalle|referencia|indicacion|instruccion|\bobs\b/],
];

/** Palabras que sí pueden quedar de un texto libre: ninguna identifica a nadie. */
const PALABRAS_CLAVE = [
  'depto',
  'departamento',
  'oficina',
  'edificio',
  'torre',
  'block',
  'piso',
  'condominio',
  'conserje',
  'porteria',
  'porton',
  'timbre',
  'reja',
  'llamar',
  'avisar',
  'whatsapp',
  'efectivo',
  'transferencia',
  'factura',
  'boleta',
  'envase',
  'envases',
  'vacio',
  'vacios',
  'retirar',
  'devolver',
  'urgente',
  'horario',
  'manana',
  'tarde',
  'cambio',
  'pendiente',
  'pagado',
  'deuda',
];

const PALABRAS_DE_COMPLEMENTO = ['depto', 'dpto', 'departamento', 'oficina', 'torre', 'block', 'edificio', 'edif', 'piso', 'casa', 'condominio', 'parcela'];

/** Palabras que pueden quedar visibles dentro de una columna numérica con texto ("2 x 20 L"). Todo lo demás se tapa. */
const PALABRAS_DE_CANTIDAD = new Set(['x', 'l', 'lt', 'lts', 'lit', 'litro', 'litros', 'de', 'y', 'c', 'u', 'cu', 'mas', 'bidon', 'bidones', 'unidad', 'unidades', 'un', 'una', 'dos', 'tres', 'cuatro', 'cinco']);

export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

const ES_NUMERO = /^[-+]?\$?\s*\d[\d.,\s]*$/;
const ES_FECHA_ISO = /^\d{4}-\d{2}-\d{2}(?: \d{2}:\d{2})?$/;
const ES_HORA = /^\d{1,2}:\d{2}$/;
const CORREO = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g;
const RUT = /\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g;
const NUMERO_LARGO = /\d{7,}/g;

function tienePII(valor) {
  if (/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.test(valor)) return true;
  if (/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/.test(valor)) return true;
  // Una fecha ISO tiene 8 dígitos si se le quitan los guiones: no es un teléfono.
  return !ES_FECHA_ISO.test(valor) && /\d{7,}/.test(valor.replace(/[\s.()-]/g, ''));
}

function enmascarar(valor) {
  return valor.replace(CORREO, '[correo]').replace(RUT, '[rut]').replace(NUMERO_LARGO, '[numero]');
}

// ---------------------------------------------------------------- encabezados y roles

function esEtiqueta(valor) {
  const t = String(valor ?? '').trim();
  return t !== '' && t.length <= 50 && !ES_NUMERO.test(t) && !ES_FECHA_ISO.test(t);
}

/** Índice (desde 0) de la fila que parece el encabezado: la que tiene más etiquetas de texto entre las primeras 15. -1 si ninguna. */
export function detectarEncabezado(filas, maximo = 15) {
  let mejor = -1;
  let puntaje = 0;
  for (let i = 0; i < Math.min(filas.length, maximo); i++) {
    const etiquetas = (filas[i] ?? []).filter(esEtiqueta).length;
    if (etiquetas > puntaje) {
      mejor = i;
      puntaje = etiquetas;
    }
  }
  return mejor;
}

/** Rol de cada columna según su encabezado. `sobrescrituras`: Map(encabezado normalizado → rol) que manda sobre lo automático. */
export function clasificarColumnas(encabezados, sobrescrituras = new Map()) {
  return encabezados.map((encabezado) => {
    const n = normalizar(encabezado);
    const forzado = sobrescrituras.get(n);
    if (forzado) return forzado;
    for (const [rol, regla] of REGLAS) if (regla.test(n)) return rol;
    return 'otro';
  });
}

// ---------------------------------------------------------------- estado compartido entre hojas

export function crearEstado() {
  return { nombres: new Map(), telefonos: new Map(), direcciones: new Map(), sensibles: new Set() };
}

function codigoDe(mapa, clave, prefijo) {
  let codigo = mapa.get(clave);
  if (!codigo) {
    codigo = `${prefijo}-${String(mapa.size + 1).padStart(4, '0')}`;
    mapa.set(clave, codigo);
  }
  return codigo;
}

// ---------------------------------------------------------------- tratamientos

function digitosDeTelefono(valor) {
  const digitos = valor.replace(/\D/g, '');
  const sin56 = digitos.length >= 11 && digitos.startsWith('56') ? digitos.slice(2) : digitos;
  return { digitos, nacional: sin56 };
}

function clasificarTelefono({ digitos, nacional }) {
  if (digitos.length > 12) return 'varios';
  if (nacional.length === 9 && nacional.startsWith('9')) return 'movil';
  if (nacional.length === 9 && nacional.startsWith('2')) return 'fijo';
  return 'invalido';
}

function formaDe(valor) {
  return valor.replace(/\d/g, '#').replace(/[A-Za-zÁÉÍÓÚáéíóúÑñ]/g, 'A');
}

function complementosDe(normalizado) {
  const palabras = new Set(normalizado.split(/[^a-z0-9]+/));
  return PALABRAS_DE_COMPLEMENTO.filter((p) => palabras.has(p)).join('|');
}

function palabrasClaveDe(texto) {
  const palabras = new Set(normalizar(texto).split(/[^a-z0-9]+/));
  return PALABRAS_CLAVE.filter((p) => palabras.has(p)).sort().join('|');
}

function aFechaIso(valor) {
  const v = valor.trim();
  if (ES_FECHA_ISO.test(v)) return v;
  const m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?:\s+(\d{1,2}:\d{2}))?$/.exec(v);
  if (!m) return null;
  const dia = Number(m[1]);
  const mes = Number(m[2]);
  const anio = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
  if (dia < 1 || dia > 31 || mes < 1 || mes > 12) return null;
  const fecha = `${anio}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
  return m[4] ? `${fecha} ${m[4].padStart(5, '0')}` : fecha;
}

function textoNumerico(valor) {
  const t = valor.trim();
  if (ES_NUMERO.test(t)) return t.replace(/\d{8,}/g, '[numero]');
  return enmascarar(t.replace(/[A-Za-zÁÉÍÓÚáéíóúÑñ]+/g, (palabra) => (PALABRAS_DE_CANTIDAD.has(normalizar(palabra)) ? palabra : '?'))).slice(0, 40);
}

const ROLES_CATEGORICOS = new Set(['comuna', 'tipo_cliente', 'tamano', 'tipo_pago', 'estado_pago', 'factura']);

function esCategoria(valores, rol) {
  const distintos = new Set(valores);
  const limite = rol === 'comuna' ? 80 : 40;
  if (distintos.size > limite) return false;
  for (const v of distintos) {
    if (v.length > 40 || tienePII(v)) return false;
    if (rol === 'comuna' && /\d/.test(v)) return false;
  }
  return true;
}

/** Cómo se trata una columna, mirando su rol y lo que contiene. */
function decidirTratamiento(rol, valores) {
  if (rol === 'omitir') return 'omitir';
  if (rol === 'nombre') return 'codigo-nombre';
  if (rol === 'telefono') return 'codigo-telefono';
  if (rol === 'direccion') return 'codigo-direccion';
  if (rol === 'email' || rol === 'rut' || rol === 'coordenadas') return 'ocultar';
  if (rol === 'notas') return 'texto-libre';
  if (rol === 'fecha') return 'fecha';
  if (rol === 'cantidad' || rol === 'precio') return 'numero';
  // "Cant bidones y tamaño" puede traer muchas combinaciones ("15 de 20lts"): se conservan los números y las
  // palabras de una lista cerrada, y cualquier otra palabra se tapa.
  if (rol === 'tamano' && !esCategoria(valores, rol)) return 'numero';
  if (ROLES_CATEGORICOS.has(rol)) return esCategoria(valores, rol) ? 'categoria' : 'texto-libre';
  // rol "otro": se mira el contenido
  if (valores.length === 0) return 'categoria';
  if (valores.every((v) => ES_NUMERO.test(v))) return 'numero';
  if (valores.every((v) => ES_FECHA_ISO.test(v) || ES_HORA.test(v))) return 'fecha';
  if (valores.length > 0 && new Set(valores).size <= 20 && valores.every((v) => v.length <= 25 && !tienePII(v))) return 'categoria';
  return 'texto-libre';
}

// ---------------------------------------------------------------- hoja completa

function encabezadosUnicos(fila, ancho) {
  const vistos = new Map();
  return Array.from({ length: ancho }, (_, i) => {
    let base = String(fila[i] ?? '').trim();
    // Si la "fila de encabezados" es en realidad una fila de datos, no se copian sus valores como si fueran títulos.
    if (base === '' || base.length > 60 || tienePII(base)) base = `columna_${i + 1}`;
    const n = (vistos.get(base) ?? 0) + 1;
    vistos.set(base, n);
    return n === 1 ? base : `${base}_${n}`;
  });
}

/**
 * Anonimiza una hoja. Devuelve las filas ya anonimizadas, una descripción de cómo se trató cada columna y avisos.
 * @param {string[][]} filas  filas tal como las leyó el lector (incluye encabezado).
 * @param {{ filaEncabezado?: number, sobrescrituras?: Map<string,string>, estado?: ReturnType<typeof crearEstado> }} opciones
 */
export function anonimizarHoja(filas, opciones = {}) {
  const estado = opciones.estado ?? crearEstado();
  const indiceEncabezado = opciones.filaEncabezado ?? detectarEncabezado(filas);
  if (indiceEncabezado < 0 || !filas[indiceEncabezado]) {
    throw new Error('No encontré la fila de encabezados. Indica el número de fila con --fila-encabezado.');
  }

  const datos = filas.slice(indiceEncabezado + 1).filter((f) => f.some((v) => String(v ?? '').trim() !== ''));
  const ancho = Math.max(filas[indiceEncabezado].length, ...datos.map((f) => f.length), 0);
  const encabezados = encabezadosUnicos(filas[indiceEncabezado], ancho);
  const roles = clasificarColumnas(encabezados, opciones.sobrescrituras);
  const valor = (fila, i) => String(fila[i] ?? '').trim();

  const avisos = [];
  const columnas = encabezados.map((nombre, i) => {
    const valores = datos.map((f) => valor(f, i)).filter((v) => v !== '');
    const tratamiento = decidirTratamiento(roles[i], valores);
    if (roles[i] === 'otro' && tratamiento === 'texto-libre') {
      avisos.push(`La columna "${nombre}" no se reconoció y tiene texto variado: solo se conservan su largo y palabras clave.`);
    }
    if (roles[i] === 'otro' && tratamiento === 'categoria' && valores.length > 0) {
      avisos.push(`La columna "${nombre}" no se reconoció y se dejó visible (${new Set(valores).size} valores distintos). Si tiene nombres de personas, quítala con --col "${nombre}=omitir".`);
    }
    if (ROLES_CATEGORICOS.has(roles[i]) && tratamiento === 'texto-libre') {
      avisos.push(`La columna "${nombre}" parece de categorías pero tiene demasiados valores distintos o datos personales: se trató como texto libre.`);
    }
    return { nombre, rol: roles[i], tratamiento, vacias: datos.length - valores.length, distintos: new Set(valores).size };
  });

  // Encabezados de salida: cada columna puede producir varias.
  const salida = [];
  const indices = {};
  const agregar = (nombre, clave) => {
    salida.push(nombre);
    if (clave && indices[clave] === undefined) indices[clave] = salida.length - 1;
    return salida.length - 1;
  };
  const plan = columnas.map((c, i) => {
    switch (c.tratamiento) {
      case 'omitir':
        return [];
      case 'codigo-telefono':
        return [
          agregar(c.nombre, c.rol),
          agregar(`${c.nombre}_formato`, `${c.rol}_formato`),
          agregar(`${c.nombre}_digitos`, `${c.rol}_digitos`),
          agregar(`${c.nombre}_tipo`, `${c.rol}_tipo`),
        ];
      case 'codigo-direccion':
        return [
          agregar(c.nombre, c.rol),
          agregar(`${c.nombre}_largo`, `${c.rol}_largo`),
          agregar(`${c.nombre}_tiene_numero`, `${c.rol}_tiene_numero`),
          agregar(`${c.nombre}_complemento`, `${c.rol}_complemento`),
        ];
      case 'texto-libre':
        return [agregar(`${c.nombre}_vacia`), agregar(`${c.nombre}_largo`), agregar(`${c.nombre}_palabras`)];
      default:
        return [agregar(c.nombre, c.rol === 'otro' ? undefined : c.rol)];
    }
  });

  columnas.forEach((c, i) => {
    c.salida = plan[i];
  });

  let fechasSinReconocer = 0;
  const filasSalida = datos.map((fila) => {
    const nueva = new Array(salida.length).fill('');
    columnas.forEach((c, i) => {
      const v = valor(fila, i);
      const [a, b, d, e] = plan[i];
      switch (c.tratamiento) {
        case 'omitir':
          return;
        case 'ocultar':
          nueva[a] = v ? '[oculto]' : '';
          return;
        case 'codigo-nombre': {
          if (!v) return;
          const clave = normalizar(v);
          estado.sensibles.add(clave);
          nueva[a] = codigoDe(estado.nombres, clave, 'Cliente');
          return;
        }
        case 'codigo-telefono': {
          if (!v) return;
          const t = digitosDeTelefono(v);
          if (t.digitos === '') {
            nueva[a] = '';
            nueva[b] = formaDe(v);
            nueva[d] = '0';
            nueva[e] = 'invalido';
            return;
          }
          const clave = t.nacional.length >= 9 && t.digitos.length <= 12 ? t.nacional.slice(-9) : t.digitos;
          estado.sensibles.add(clave);
          nueva[a] = codigoDe(estado.telefonos, clave, 'Tel');
          nueva[b] = formaDe(v);
          nueva[d] = String(t.digitos.length);
          nueva[e] = clasificarTelefono(t);
          return;
        }
        case 'codigo-direccion': {
          if (!v) return;
          const n = normalizar(v).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
          estado.sensibles.add(n);
          nueva[a] = codigoDe(estado.direcciones, n, 'Dir');
          nueva[b] = String(v.length);
          nueva[d] = /\d/.test(v) ? '1' : '0';
          nueva[e] = complementosDe(n);
          return;
        }
        case 'texto-libre':
          nueva[a] = v ? '0' : '1';
          nueva[b] = String(v.length);
          nueva[d] = palabrasClaveDe(v);
          return;
        case 'fecha': {
          if (!v) return;
          const iso = aFechaIso(v);
          if (iso) nueva[a] = iso;
          else {
            fechasSinReconocer += 1;
            nueva[a] = ES_HORA.test(v) ? v : '?';
          }
          return;
        }
        case 'numero':
          nueva[a] = textoNumerico(v);
          return;
        default:
          nueva[a] = enmascarar(v);
      }
    });
    return nueva;
  });

  if (fechasSinReconocer > 0) avisos.push(`${fechasSinReconocer} fechas no se pudieron leer y quedaron como "?".`);

  return { filaEncabezado: indiceEncabezado, encabezados: salida, indices, filas: filasSalida, columnas, avisos };
}

// ---------------------------------------------------------------- revisión final

/**
 * Busca en lo que se va a escribir cualquier cosa que parezca un dato personal: valores originales de nombres,
 * teléfonos y direcciones, correos, RUT y números largos. Devuelve descripciones SIN mostrar el valor encontrado.
 */
export function buscarFiltraciones(celdas, sensibles) {
  const problemas = [];
  let contadas = 0;
  const reportar = (motivo) => {
    contadas += 1;
    if (problemas.length < 10) problemas.push(motivo);
  };
  for (const celda of celdas) {
    if (celda === '') continue;
    const n = normalizar(celda).replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
    if (n !== '' && sensibles.has(n)) reportar('una celda es igual a un valor original (nombre, teléfono o dirección)');
    if (/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.test(celda)) reportar('una celda contiene un correo');
    if (/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/.test(celda)) reportar('una celda contiene un RUT');
    if (/\d{8,}/.test(celda)) reportar('una celda contiene un número de 8 o más dígitos');
    if (/(?:\+?56)?[\s-]?9[\s-]?\d{4}[\s-]?\d{4}/.test(celda) && !ES_FECHA_ISO.test(celda)) reportar('una celda parece un teléfono');
  }
  if (contadas > problemas.length) problemas.push(`... y ${contadas - problemas.length} más`);
  return problemas;
}
