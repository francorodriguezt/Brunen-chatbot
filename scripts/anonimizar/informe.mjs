/**
 * Informe de estructura y patrones, calculado SOLO sobre la copia ya anonimizada (nunca sobre el archivo original).
 * Así lo que sale de aquí no puede traer nombres, teléfonos ni direcciones: no los tiene.
 *
 * Todo lo que dice son patrones observados en los datos, no reglas confirmadas por el dueño o Constanza.
 */

import { normalizar } from './nucleo.mjs';

const COMUNAS_ATENDIDAS = new Set([
  'nunoa',
  'macul',
  'san joaquin',
  'penalolen',
  'santiago centro',
  'santiago',
  'providencia',
  'las condes',
  'vitacura',
  'lo barnechea',
  'recoleta',
  'huechuraba',
  'la reina',
]);
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const CAPACIDAD_DEL_FURGON = 65;
const PEDIDOS_MAXIMOS_POR_DIA = 50;

// ---------------------------------------------------------------- utilidades

export function aNumero(valor) {
  const t = String(valor ?? '').replace(/[$\s]/g, '');
  if (t === '' || !/^-?[\d.,]+$/.test(t)) return NaN;
  if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(t)) return Number(t.replace(/\./g, '').replace(',', '.'));
  if (/^-?\d+,\d+$/.test(t)) return Number(t.replace(',', '.'));
  return Number(t);
}

function contar(valores) {
  const mapa = new Map();
  for (const v of valores) mapa.set(v, (mapa.get(v) ?? 0) + 1);
  return mapa;
}

const ordenado = (mapa) => [...mapa.entries()].sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), 'es'));

function mediana(lista) {
  if (lista.length === 0) return NaN;
  const o = [...lista].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

function percentil(lista, p) {
  if (lista.length === 0) return NaN;
  const o = [...lista].sort((a, b) => a - b);
  return o[Math.min(o.length - 1, Math.ceil((p / 100) * o.length) - 1)];
}

const redondear = (n, d = 1) => (Number.isFinite(n) ? String(Math.round(n * 10 ** d) / 10 ** d) : 'n/d');
const pct = (n, total) => (total === 0 ? '0 %' : `${redondear((100 * n) / total)} %`);
const miles = (n) => (Number.isFinite(n) ? String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.') : 'n/d');

function tabla(encabezados, filas) {
  if (filas.length === 0) return ['_(sin datos)_'];
  const limpiar = (v) => String(v).replace(/\|/g, '/');
  return [`| ${encabezados.join(' | ')} |`, `| ${encabezados.map(() => '---').join(' | ')} |`, ...filas.map((f) => `| ${f.map(limpiar).join(' | ')} |`)];
}

function fechaDe(valor) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor ?? '');
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(ms) ? null : { clave: `${m[1]}-${m[2]}-${m[3]}`, ms };
}

function tamanoNormal(valor) {
  const v = String(valor ?? '').trim();
  if (v === '') return '(vacío)';
  // La columna puede venir combinada ("15 de 20lts"): el tamaño es el número que es 10, 12 o 20, no el primero.
  // Si algún número lleva unidad ("20lts", "12 L"), ese es el tamaño: "10 de 20lts" son 10 bidones de 20 L.
  const conUnidad = [...new Set([...v.matchAll(/(\d+)\s*(?:l|lt|lts|litros?)\b/gi)].map((m) => m[1]))];
  if (conUnidad.length === 1) return `${conUnidad[0]} L`;
  if (conUnidad.length > 1) return 'varios tamaños';
  const numeros = [...v.matchAll(/\d+/g)].map((m) => m[0]);
  const tamanos = [...new Set(numeros.filter((n) => n === '10' || n === '12' || n === '20'))];
  if (numeros.length > 1 && tamanos.length > 1) return 'varios tamaños';
  if (numeros.length > 1 && tamanos.length === 1) return `${tamanos[0]} L`;
  return numeros.length > 0 ? `${numeros[0]} L` : v;
}

function tramoDe(cantidad) {
  if (cantidad <= 1) return '1';
  if (cantidad <= 3) return '2 a 3';
  return '4 o más';
}

function bucket(n, cortes) {
  for (const [hasta, etiqueta] of cortes) if (n <= hasta) return etiqueta;
  return cortes[cortes.length - 1][1];
}

// ---------------------------------------------------------------- acceso a columnas

function accesos(hoja) {
  const i = hoja.indices;
  const celda = (fila, clave) => (i[clave] === undefined ? '' : (fila[i[clave]] ?? ''));
  const tiene = (clave) => i[clave] !== undefined;
  const cliente = (fila) => celda(fila, 'telefono') || celda(fila, 'nombre');
  return { celda, tiene, cliente };
}

// ---------------------------------------------------------------- secciones

function seccionColumnas(hoja) {
  const filas = hoja.columnas.map((c, n) => [n + 1, c.nombre, c.rol, c.tratamiento, `${c.vacias} (${pct(c.vacias, hoja.filas.length)})`, c.distintos]);
  return ['### Columnas y cómo se trataron', '', ...tabla(['#', 'Encabezado', 'Rol', 'Tratamiento', 'Vacías', 'Valores distintos'], filas), ''];
}

function seccionVolumen(hoja, { celda, tiene }) {
  if (!tiene('fecha')) return ['### Fechas y volumen', '', '_No hay columna de fecha reconocida._', ''];
  const fechas = hoja.filas.map((f) => fechaDe(celda(f, 'fecha')));
  const validas = fechas.filter(Boolean);
  const L = ['### Fechas y volumen', ''];
  L.push(`- Filas con fecha legible: ${validas.length} de ${hoja.filas.length}.`);
  if (validas.length === 0) return [...L, ''];
  const claves = validas.map((f) => f.clave).sort();
  L.push(`- Rango: ${claves[0]} a ${claves[claves.length - 1]}.`);
  const porDia = contar(claves);
  const cuentas = [...porDia.values()];
  L.push(`- Días distintos con filas: ${porDia.size}. Filas por día: media ${redondear(cuentas.reduce((a, b) => a + b, 0) / cuentas.length)}, mediana ${redondear(mediana(cuentas))}, percentil 90 ${percentil(cuentas, 90)}, máximo ${Math.max(...cuentas)}.`);
  L.push(`- Días con más de ${PEDIDOS_MAXIMOS_POR_DIA} filas: ${cuentas.filter((n) => n > PEDIDOS_MAXIMOS_POR_DIA).length} (el negocio dice que el máximo es ~${PEDIDOS_MAXIMOS_POR_DIA} solicitudes).`);
  const porSemana = contar(validas.map((f) => new Date(f.ms).getUTCDay()));
  L.push('', ...tabla(['Día de la semana', 'Filas'], DIAS.map((d, n) => [d, porSemana.get(n) ?? 0])), '');
  return L;
}

function seccionCategorias(hoja) {
  const L = ['### Columnas de categorías (valores y cuántas veces aparecen)', ''];
  let hubo = false;
  for (const c of hoja.columnas) {
    if (c.tratamiento !== 'categoria' || c.distintos === 0) continue;
    hubo = true;
    const indice = c.salida[0];
    const cuentas = ordenado(contar(hoja.filas.map((f) => f[indice] ?? '').filter((v) => v !== '')));
    const visibles = cuentas.slice(0, 25);
    const resto = cuentas.slice(25);
    const filas = visibles.map(([v, n]) => [v, n, pct(n, hoja.filas.length)]);
    if (resto.length > 0) filas.push([`(otros: ${resto.length} valores menos frecuentes)`, resto.reduce((a, [, n]) => a + n, 0), '']);
    L.push(`**${c.nombre}** (rol: ${c.rol}; vacías: ${c.vacias})`, '', ...tabla(['Valor', 'Filas', '%'], filas), '');
  }
  return hubo ? L : [...L, '_No hay columnas de categorías._', ''];
}

function seccionCantidad(hoja, { celda, tiene, cliente }) {
  const L = ['### Cantidad y tamaño', ''];
  if (!tiene('cantidad')) {
    L.push('_No hay columna de cantidad reconocida._', '');
    if (tiene('tamano')) L.push('**Tamaños** (el número que es 10, 12 o 20)', '', ...tabla(['Tamaño', 'Filas'], ordenado(contar(hoja.filas.map((f) => tamanoNormal(celda(f, 'tamano')))))), '');
    return L;
  }
  const valores = hoja.filas.map((f) => celda(f, 'cantidad'));
  const numeros = valores.map(aNumero);
  const validos = numeros.filter(Number.isFinite);
  const enteros = validos.filter(Number.isInteger).length;
  const textos = valores.filter((v, n) => v !== '' && !Number.isFinite(numeros[n]));
  L.push(`- Vacías: ${valores.filter((v) => v === '').length}. Números enteros: ${enteros}. Con decimales: ${validos.length - enteros}. Con texto: ${textos.length}.`);
  if (validos.length > 0) L.push(`- Mínimo ${Math.min(...validos)}, mediana ${redondear(mediana(validos))}, máximo ${Math.max(...validos)}.`);
  const cortes = [[1, '1'], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [9, '6 a 9'], [19, '10 a 19'], [Infinity, '20 o más']];
  const histograma = contar(validos.filter((n) => n > 0).map((n) => bucket(n, cortes)));
  L.push('', ...tabla(['Cantidad', 'Filas'], cortes.map(([, etiqueta]) => [etiqueta, histograma.get(etiqueta) ?? 0])));
  if (textos.length > 0) L.push('', 'Formas de texto en la columna de cantidad (las palabras desconocidas aparecen como `?`):', '', ...tabla(['Texto', 'Filas'], ordenado(contar(textos)).slice(0, 10)));

  if (tiene('tamano')) {
    const tamanos = hoja.filas.map((f) => tamanoNormal(celda(f, 'tamano')));
    L.push('', '**Tamaños** (el número que es 10, 12 o 20)', '', ...tabla(['Tamaño', 'Filas'], ordenado(contar(tamanos))));
    const combos = ordenado(contar(hoja.filas.map((f, n) => `${tamanos[n]} × ${Number.isFinite(numeros[n]) ? numeros[n] : '(texto o vacío)'}`))).slice(0, 15);
    L.push('', '**Combinaciones tamaño × cantidad más frecuentes**', '', ...tabla(['Combinación', 'Filas'], combos));
  }

  if (tiene('fecha') && (tiene('telefono') || tiene('nombre'))) {
    const grupos = new Map();
    hoja.filas.forEach((f) => {
      const clave = `${cliente(f)}|${celda(f, 'fecha')}`;
      if (cliente(f) === '' || celda(f, 'fecha') === '') return;
      grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
    });
    const repetidos = [...grupos.values()].filter((g) => g.length > 1);
    const mezclados = repetidos.filter((g) => new Set(g.map((f) => tamanoNormal(celda(f, 'tamano')))).size > 1).length;
    L.push('', `- Mismo cliente y mismo día en más de una fila: ${repetidos.length} casos (${mezclados} con tamaños distintos, que serían pedidos mezclados; ${repetidos.length - mezclados} con el mismo tamaño, que podrían ser duplicados o líneas separadas).`);
  }
  return [...L, ''];
}

function seccionPrecios(hoja, { celda, tiene }) {
  const L = ['### Precios', ''];
  if (!tiene('precio') || !tiene('cantidad')) return [...L, '_Faltan columnas de precio o cantidad._', ''];
  const filas = hoja.filas
    .map((f) => ({ cantidad: aNumero(celda(f, 'cantidad')), precio: aNumero(celda(f, 'precio')), tamano: tiene('tamano') ? tamanoNormal(celda(f, 'tamano')) : '(sin columna de tamaño)' }))
    .filter((f) => f.cantidad > 0 && f.precio > 0);
  const sinPrecio = hoja.filas.length - filas.length;
  L.push(`- Filas usables (cantidad y precio mayores que cero): ${filas.length}. Descartadas: ${sinPrecio}.`);

  const grupos = new Map();
  for (const f of filas) {
    const clave = `${f.tamano}|${tramoDe(f.cantidad)}`;
    grupos.set(clave, [...(grupos.get(clave) ?? []), f]);
  }
  const salida = [...grupos.entries()]
    .filter(([, g]) => g.length >= 3)
    .sort((a, b) => a[0].localeCompare(b[0], 'es', { numeric: true }))
    .map(([clave, g]) => {
      const [tamano, tramo] = clave.split('|');
      const top = (valores) => ordenado(contar(valores)).slice(0, 3).map(([v, n]) => `${miles(v)} (${n})`).join(', ');
      return [tamano, tramo, g.length, top(g.map((f) => f.precio)), top(g.map((f) => Math.round(f.precio / f.cantidad)))];
    });
  L.push('', ...tabla(['Tamaño', 'Cantidad', 'Filas', 'Precios más comunes (veces)', 'Precio por bidón más común (veces)'], salida));

  const lineas = [];
  for (const tamano of new Set(filas.map((f) => f.tamano))) {
    const uno = filas.filter((f) => f.tamano === tamano && f.cantidad === 1).map((f) => f.precio);
    const dos = filas.filter((f) => f.tamano === tamano && f.cantidad === 2).map((f) => f.precio);
    if (uno.length < 3 || dos.length < 3) continue;
    const razon = mediana(dos) / mediana(uno);
    const lectura = razon > 1.7 && razon < 2.3 ? 'el precio parece ser el total del pedido' : razon > 0.85 && razon < 1.15 ? 'el precio parece ser por bidón' : 'no se ve claro';
    lineas.push(`- ${tamano}: la mediana con 2 bidones es ${redondear(razon, 2)} veces la de 1 bidón: ${lectura} (patrón, falta confirmar).`);
  }
  return [...L, '', ...(lineas.length > 0 ? ['¿El precio es del pedido o de cada bidón?', '', ...lineas] : []), ''];
}

function seccionPagos(hoja, { celda, tiene }) {
  const L = ['### Pagos y facturas', ''];
  if (!tiene('tipo_pago') && !tiene('estado_pago') && !tiene('factura')) return [...L, '_No hay columnas de pago o factura reconocidas._', ''];
  for (const [clave, titulo] of [['tipo_pago', 'Tipo de pago'], ['estado_pago', 'Estado del pago'], ['factura', 'Factura']]) {
    if (!tiene(clave)) continue;
    L.push(`**${titulo}**`, '', ...tabla(['Valor', 'Filas'], ordenado(contar(hoja.filas.map((f) => celda(f, clave) || '(vacío)')))), '');
  }
  if (tiene('tipo_pago') && tiene('estado_pago')) {
    const tipos = [...new Set(hoja.filas.map((f) => celda(f, 'tipo_pago') || '(vacío)'))].sort();
    const estados = [...new Set(hoja.filas.map((f) => celda(f, 'estado_pago') || '(vacío)'))].sort();
    const cruce = contar(hoja.filas.map((f) => `${celda(f, 'tipo_pago') || '(vacío)'}|${celda(f, 'estado_pago') || '(vacío)'}`));
    L.push('**Tipo de pago × estado del pago**', '', ...tabla(['Tipo de pago', ...estados], tipos.map((t) => [t, ...estados.map((e) => cruce.get(`${t}|${e}`) ?? 0)])), '');
  }
  if (tiene('estado_pago') && tiene('precio')) {
    const suma = new Map();
    for (const f of hoja.filas) {
      const p = aNumero(celda(f, 'precio'));
      if (Number.isFinite(p)) suma.set(celda(f, 'estado_pago') || '(vacío)', (suma.get(celda(f, 'estado_pago') || '(vacío)') ?? 0) + p);
    }
    L.push('**Suma del precio por estado del pago (pesos)**', '', ...tabla(['Estado', 'Suma'], [...suma.entries()].map(([e, s]) => [e, miles(s)])), '');
  }
  return L;
}

function seccionClientes(hoja, { celda, tiene, cliente }) {
  const L = ['### Clientes e identificación', ''];
  if (!tiene('telefono') && !tiene('nombre')) return [...L, '_No hay columnas de nombre ni de teléfono reconocidas._', ''];
  const total = hoja.filas.length;
  if (tiene('nombre')) L.push(`- Filas sin nombre: ${hoja.filas.filter((f) => celda(f, 'nombre') === '').length}. Nombres distintos (por código): ${new Set(hoja.filas.map((f) => celda(f, 'nombre')).filter(Boolean)).size}.`);
  if (tiene('telefono')) {
    L.push(`- Filas sin teléfono: ${hoja.filas.filter((f) => celda(f, 'telefono') === '').length}. Teléfonos distintos (por código): ${new Set(hoja.filas.map((f) => celda(f, 'telefono')).filter(Boolean)).size}.`);
    L.push('', '**Formatos de teléfono**', '', ...tabla(['Forma (# = dígito)', 'Filas'], ordenado(contar(hoja.filas.map((f) => celda(f, 'telefono_formato')).filter(Boolean))).slice(0, 8)));
    L.push('', ...tabla(['Tipo de número', 'Filas'], ordenado(contar(hoja.filas.map((f) => celda(f, 'telefono_tipo')).filter(Boolean)))));
  }
  if (tiene('telefono') && tiene('nombre')) {
    const nombresPorTelefono = new Map();
    const telefonosPorNombre = new Map();
    for (const f of hoja.filas) {
      const t = celda(f, 'telefono');
      const n = celda(f, 'nombre');
      if (!t || !n) continue;
      nombresPorTelefono.set(t, (nombresPorTelefono.get(t) ?? new Set()).add(n));
      telefonosPorNombre.set(n, (telefonosPorNombre.get(n) ?? new Set()).add(t));
    }
    L.push('', `- Teléfonos con más de un nombre: ${[...nombresPorTelefono.values()].filter((s) => s.size > 1).length} (teléfono compartido, o el mismo cliente escrito distinto).`);
    L.push(`- Nombres con más de un teléfono: ${[...telefonosPorNombre.values()].filter((s) => s.size > 1).length} (cliente que cambió de número, o nombres repetidos de personas distintas).`);
  }

  const porCliente = new Map();
  for (const f of hoja.filas) {
    const c = cliente(f);
    if (c) porCliente.set(c, [...(porCliente.get(c) ?? []), f]);
  }
  const cortes = [[1, '1 pedido'], [2, '2 pedidos'], [5, '3 a 5'], [10, '6 a 10'], [20, '11 a 20'], [Infinity, 'más de 20']];
  const histograma = contar([...porCliente.values()].map((g) => bucket(g.length, cortes)));
  L.push('', `**Filas por cliente** (cliente = teléfono, o nombre si no hay teléfono; ${porCliente.size} clientes, ${total} filas)`, '', ...tabla(['Filas del cliente', 'Clientes'], cortes.map(([, e]) => [e, histograma.get(e) ?? 0])));
  const top = [...porCliente.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 10).map(([c, g]) => [c, g.length]);
  L.push('', '**Los 10 clientes con más filas**', '', ...tabla(['Cliente (código)', 'Filas'], top));

  if (tiene('fecha')) {
    const medianas = [];
    const ultimas = [];
    let maximo = 0;
    for (const g of porCliente.values()) {
      const dias = [...new Set(g.map((f) => fechaDe(celda(f, 'fecha'))?.ms).filter((n) => n !== undefined))].sort((a, b) => a - b);
      if (dias.length > 0) maximo = Math.max(maximo, dias[dias.length - 1]);
      if (dias.length >= 3) medianas.push(mediana(dias.slice(1).map((d, n) => (d - dias[n]) / 86400000)));
      if (dias.length >= 2) ultimas.push(dias[dias.length - 1]);
    }
    const cortesDias = [[7, '7 días o menos'], [14, '8 a 14 días'], [30, '15 a 30 días'], [Infinity, 'más de 30 días']];
    const dist = contar(medianas.map((m) => bucket(m, cortesDias)));
    L.push('', `**Cada cuánto piden los clientes con 3 o más días distintos de pedido** (mediana de días entre pedidos; ${medianas.length} clientes)`, '', ...tabla(['Mediana', 'Clientes'], cortesDias.map(([, e]) => [e, dist.get(e) ?? 0])));
    const inactivos = ultimas.filter((u) => (maximo - u) / 86400000 > 60).length;
    L.push('', `- Clientes con 2 o más días de pedido cuyo último pedido fue hace más de 60 días respecto del último día del archivo: ${inactivos} de ${ultimas.length} (posibles clientes que dejaron de pedir).`);
  }
  return [...L, ''];
}

function seccionDirecciones(hoja, { celda, tiene, cliente }) {
  const L = ['### Direcciones y cambios de domicilio', ''];
  if (!tiene('direccion')) return [...L, '_No hay columna de dirección reconocida._', ''];
  L.push(`- Filas sin dirección: ${hoja.filas.filter((f) => celda(f, 'direccion') === '').length}. Direcciones sin ningún número: ${hoja.filas.filter((f) => celda(f, 'direccion') !== '' && celda(f, 'direccion_tiene_numero') === '0').length}. Con departamento, torre u oficina: ${hoja.filas.filter((f) => celda(f, 'direccion_complemento') !== '').length}.`);
  if (tiene('comuna')) L.push(`- Filas sin comuna: ${hoja.filas.filter((f) => celda(f, 'comuna') === '').length}.`);

  const porCliente = new Map();
  hoja.filas.forEach((f, n) => {
    const c = cliente(f);
    if (c) porCliente.set(c, [...(porCliente.get(c) ?? []), { f, n }]);
  });
  const direccionesPorCliente = [];
  let conCambio = 0;
  let cambios = 0;
  let vueltas = 0;
  let cambioDeComuna = 0;
  for (const g of porCliente.values()) {
    const ordenadas = tiene('fecha') ? [...g].sort((a, b) => (fechaDe(celda(a.f, 'fecha'))?.ms ?? 0) - (fechaDe(celda(b.f, 'fecha'))?.ms ?? 0) || a.n - b.n) : g;
    const secuencia = ordenadas.map(({ f }) => celda(f, 'direccion')).filter(Boolean);
    const distintas = new Set(secuencia);
    direccionesPorCliente.push(distintas.size);
    let transiciones = 0;
    const vistas = new Set();
    secuencia.forEach((d, i) => {
      if (i > 0 && d !== secuencia[i - 1]) {
        transiciones += 1;
        if (vistas.has(d)) vueltas += 1;
      }
      vistas.add(d);
    });
    if (transiciones > 0) conCambio += 1;
    cambios += transiciones;
    if (tiene('comuna') && new Set(g.map(({ f }) => celda(f, 'comuna')).filter(Boolean)).size > 1) cambioDeComuna += 1;
  }
  const cortes = [[0, 'sin dirección'], [1, '1'], [2, '2'], [3, '3'], [Infinity, '4 o más']];
  const histograma = contar(direccionesPorCliente.map((n) => bucket(n, cortes)));
  L.push('', '**Direcciones distintas por cliente** (las escritas distinto cuentan como distintas: incluye errores de tipeo, no solo mudanzas)', '', ...tabla(['Direcciones', 'Clientes'], cortes.map(([, e]) => [e, histograma.get(e) ?? 0])));
  L.push('', `- Clientes que cambiaron de dirección: ${conCambio} de ${porCliente.size} (cambios en total: ${cambios}).`);
  L.push(`- Veces que un cliente vuelve a una dirección que ya había usado antes (A, B, A): ${vueltas}. Suele indicar errores de tipeo, no mudanzas.`);
  if (tiene('comuna')) L.push(`- Clientes con más de una comuna: ${cambioDeComuna}.`);
  return [...L, ''];
}

function seccionCalidad(hoja, { celda, tiene }) {
  const L = ['### Calidad de los datos', ''];
  const exactas = contar(hoja.filas.map((f) => f.join('\u0001')));
  const duplicadas = [...exactas.values()].reduce((a, n) => a + (n > 1 ? n - 1 : 0), 0);
  L.push(`- Filas idénticas a otra (todas las columnas iguales): ${duplicadas}.`);
  if (tiene('cantidad')) L.push(`- Cantidad vacía, cero, negativa o con texto: ${hoja.filas.filter((f) => !(aNumero(celda(f, 'cantidad')) > 0)).length}.`);
  if (tiene('precio')) L.push(`- Precio vacío, cero, negativo o con texto: ${hoja.filas.filter((f) => !(aNumero(celda(f, 'precio')) > 0)).length}.`);
  if (tiene('fecha')) {
    const domingos = hoja.filas.filter((f) => {
      const d = fechaDe(celda(f, 'fecha'));
      return d && new Date(d.ms).getUTCDay() === 0;
    }).length;
    L.push(`- Filas con entrega en domingo (el negocio no despacha): ${domingos}. Fechas que no se pudieron leer: ${hoja.filas.filter((f) => celda(f, 'fecha') !== '' && !fechaDe(celda(f, 'fecha'))).length}.`);
  }
  if (tiene('comuna')) {
    const grupos = new Map();
    for (const f of hoja.filas) {
      const crudo = celda(f, 'comuna');
      if (crudo === '') continue;
      const n = normalizar(crudo);
      grupos.set(n, (grupos.get(n) ?? new Map()).set(crudo, (grupos.get(n)?.get(crudo) ?? 0) + 1));
    }
    const fuera = [...grupos.entries()].filter(([n]) => !COMUNAS_ATENDIDAS.has(n));
    const variantes = [...grupos.entries()].filter(([, escrituras]) => escrituras.size > 1);
    L.push('', `**Comunas** (${grupos.size} escrituras distintas, sin contar mayúsculas ni tildes)`);
    if (fuera.length > 0) L.push('', 'Comunas fuera de las 12 que atiende Brunen:', '', ...tabla(['Comuna', 'Filas'], fuera.map(([, e]) => [[...e.keys()][0], [...e.values()].reduce((a, b) => a + b, 0)])));
    else L.push('', 'Todas las comunas están entre las 12 atendidas.');
    if (variantes.length > 0) L.push('', 'Comunas escritas de más de una forma:', '', ...tabla(['Escrituras', 'Filas'], variantes.map(([, e]) => [[...e.keys()].join(' / '), [...e.values()].reduce((a, b) => a + b, 0)])));
  }
  return [...L, ''];
}

function seccionCapacidad(hoja, { celda, tiene }) {
  const L = ['### Bidones por día (para comparar con los 65 del furgón)', ''];
  if (!tiene('fecha') || !tiene('cantidad')) return [...L, '_Faltan columnas de fecha o cantidad._', ''];
  const porDia = new Map();
  const porDiaYTamano = new Map();
  for (const f of hoja.filas) {
    const d = fechaDe(celda(f, 'fecha'));
    const c = aNumero(celda(f, 'cantidad'));
    if (!d || !(c > 0)) continue;
    porDia.set(d.clave, (porDia.get(d.clave) ?? 0) + c);
    const clave = `${d.clave}|${tiene('tamano') ? tamanoNormal(celda(f, 'tamano')) : 'todos'}`;
    porDiaYTamano.set(clave, (porDiaYTamano.get(clave) ?? 0) + c);
  }
  if (porDia.size === 0) return [...L, '_No hay filas con fecha y cantidad legibles._', ''];
  const totales = [...porDia.values()];
  L.push('Supone que cada fila es una entrega y que la cantidad son bidones. No distingue entregas hechas con recarga a mitad de ruta.', '');
  L.push(`- Bidones por día: mediana ${redondear(mediana(totales))}, percentil 90 ${percentil(totales, 90)}, máximo ${Math.max(...totales)}.`);
  L.push(`- Días con más de ${CAPACIDAD_DEL_FURGON} bidones: ${totales.filter((n) => n > CAPACIDAD_DEL_FURGON).length} de ${porDia.size}.`);
  const mayores = [...porDia.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  L.push('', ...tabla(['Los 5 días con más bidones', 'Bidones'], mayores));
  const maximoPorTamano = new Map();
  for (const [clave, total] of porDiaYTamano) {
    const tamano = clave.split('|')[1];
    maximoPorTamano.set(tamano, Math.max(maximoPorTamano.get(tamano) ?? 0, total));
  }
  L.push('', ...tabla(['Tamaño', 'Máximo de bidones en un día'], [...maximoPorTamano.entries()].sort()));
  return [...L, ''];
}

// ---------------------------------------------------------------- informe completo

export function construirInforme({ archivo, hojas }) {
  const L = [
    `# Informe de estructura y patrones: ${archivo}`,
    '',
    'Lo generó `scripts/anonimizar-excel.mjs` en el computador de Franco. Se calculó sobre la copia anonimizada: no tiene nombres, teléfonos ni direcciones reales, solo códigos.',
    'Todo lo que dice son **patrones observados en los datos**, no reglas confirmadas por el dueño o Constanza.',
    '',
  ];
  for (const hoja of hojas) {
    const a = accesos(hoja);
    L.push(`## Hoja "${hoja.nombre}"`, '', `- ${hoja.filas.length} filas de datos y ${hoja.columnas.length} columnas. El encabezado estaba en la fila ${hoja.filaEncabezado + 1}.`);
    for (const aviso of hoja.avisos) L.push(`- Aviso: ${aviso}`);
    L.push('');
    L.push(
      ...seccionColumnas(hoja),
      ...seccionVolumen(hoja, a),
      ...seccionCategorias(hoja),
      ...seccionCantidad(hoja, a),
      ...seccionPrecios(hoja, a),
      ...seccionPagos(hoja, a),
      ...seccionClientes(hoja, a),
      ...seccionDirecciones(hoja, a),
      ...seccionCalidad(hoja, a),
      ...seccionCapacidad(hoja, a),
    );
  }
  return `${L.join('\n')}\n`;
}
