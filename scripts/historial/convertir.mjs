/**
 * Convierte las filas del Excel de control de pedidos en pedidos y clientes de la base (fase B, D54).
 * Solo lógica, sin leer ni escribir archivos: así se puede probar. El programa está en `scripts/cargar-historial.mjs`.
 *
 * Cómo se lee cada columna (lo muestran los datos reales, conocimiento §17 y D54):
 *  - Monto es el TOTAL del pedido (2 bidones = $6.000), no el precio de cada bidón.
 *  - Comentarios es el estado del pago ("PAGADO", "PENDIENTE DE PAGO").
 *  - Estado es si la factura se envió ("ENVIADA", "PENDIENTE").
 *  - Boleta - Factura dice el documento ("Factura + IVA", "Boleta"), pero también trae notas ("AM", "carga inicial"):
 *    esas notas pasan a las observaciones del pedido.
 *
 * Una fila que no se entiende no se adivina: se descarta y se cuenta el motivo.
 */

const CABECERAS = {
  fecha: ['fecha'],
  nombre: ['cliente'],
  direccion: ['direccion'],
  comuna: ['comuna'],
  telefono: ['contacto'],
  tipo: ['tipo de cliente'],
  cantidad: ['pedido'],
  tamano: ['20l - 12l'],
  monto: ['monto'],
  formaPago: ['forma de pago'],
  documento: ['boleta - factura'],
  estadoFactura: ['estado'],
  numero: ['n° fact.', 'n fact.', 'nº fact.'],
  pago: ['comentarios'],
  importante: ['importante'],
};

export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** Índice de cada columna conocida en la fila de encabezados; las que faltan quedan en -1. */
export function columnas(encabezado) {
  const normales = encabezado.map(normalizar);
  return Object.fromEntries(Object.entries(CABECERAS).map(([clave, nombres]) => [clave, normales.findIndex((n) => nombres.includes(n))]));
}

/** Igual que `normalizarTelefono` de src/whatsapp.ts (una prueba lo comprueba): solo dígitos con código de país, o null. */
export function normalizarTelefono(texto) {
  let digitos = String(texto ?? '').replace(/\D/g, '');
  if (digitos.startsWith('00')) digitos = digitos.slice(2);
  if (digitos.length === 9) return `56${digitos}`;
  if (digitos.length === 11 && digitos.startsWith('56')) return digitos;
  if (digitos.length >= 10 && digitos.length <= 15 && !digitos.startsWith('56')) return digitos;
  return null;
}

/** Igual que `claveDeDireccion` de src/fichas.ts (una prueba lo comprueba). */
export function claveDeDireccion(direccion, comuna) {
  const limpiar = (t) =>
    String(t ?? '')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
  return `${limpiar(direccion)}|${limpiar(comuna)}`;
}

/** "20Lts" → '20L'; "12 y 20" → null (dos tamaños en una fila no se adivinan). */
export function tamanoDe(texto) {
  const t = String(texto ?? '');
  // Dos tamaños distintos en la misma celda ('20Y12Lts', '12 y 20') no se adivinan.
  if (new Set([...t.matchAll(/\d+/g)].map((m) => m[0]).filter((n) => n === '10' || n === '12' || n === '20')).size > 1) return null;
  const conUnidad = [...new Set([...t.matchAll(/(\d+)\s*l/gi)].map((m) => m[1]))];
  const numeros = conUnidad.length > 0 ? conUnidad : [...new Set([...t.matchAll(/\d+/g)].map((m) => m[0]))];
  if (numeros.length !== 1) return null;
  return { 10: '10L', 12: '12L', 20: '20L' }[numeros[0]] ?? null;
}

const FORMAS_DE_PAGO = [
  [/transf/, 'transferencia'],
  [/efectivo/, 'efectivo'],
  [/redcompra|debito|tarjeta/, 'redcompra'],
  [/webpay|pagina/, 'webpay'],
  [/plan/, 'plan'],
];

export function formaDePagoDe(texto) {
  const n = normalizar(texto);
  if (n === '') return '';
  for (const [patron, valor] of FORMAS_DE_PAGO) if (patron.test(n)) return valor;
  return 'otro';
}

export function tipoDeClienteDe(texto) {
  const n = normalizar(texto);
  if (/hogar|casa|particular/.test(n)) return 'hogar';
  if (/minimarket|almacen|negocio/.test(n)) return 'minimarket';
  if (/empresa|oficina|hotel/.test(n)) return 'empresa';
  return '';
}

/** Fecha ISO (YYYY-MM-DD) desde una celda ya leída: "2026-01-05" o "05/01/2026". null si no es una fecha posible. */
export function fechaDe(texto) {
  const t = String(texto ?? '').trim();
  let anio, mes, dia;
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(t);
  if (m) [anio, mes, dia] = [m[1], m[2], m[3]].map(Number);
  else if ((m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/.exec(t))) [dia, mes, anio] = [Number(m[1]), Number(m[2]), m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])];
  else return null;
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia || anio < 2020) return null;
  return fecha.toISOString().slice(0, 10);
}

function sumarDias(iso, dias) {
  const f = new Date(`${iso}T12:00:00Z`);
  f.setUTCDate(f.getUTCDate() + dias);
  return f.toISOString().slice(0, 10);
}

/** Mediodía de ese día en Santiago, en segundos (Chile está entre UTC-3 y UTC-4: 16:00 UTC cae de día). */
const segundosDe = (iso) => Math.floor(Date.parse(`${iso}T16:00:00Z`) / 1000);

/** Las notas que vienen en "Boleta - Factura" y no son el documento. */
function notaDeDocumento(texto) {
  const t = String(texto ?? '').trim();
  if (t === '' || /^(factura|boleta)\s*(\+\s*iva)?$/i.test(t)) return '';
  return t.replace(/factura\s*\+\s*iva|factura|boleta/gi, '').trim();
}

const DIAS_FUTUROS_ACEPTADOS = 14;

/** FNV-1a de 32 bits: una huella corta y siempre igual para el mismo texto. */
function huella(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) {
    h ^= texto.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}

/** "H" + fecha + 5 caracteres que salen del contenido de la fila (y de cuántas veces ya apareció esa misma fila). */
function numeroDePedido(fecha, contenido, repetidas) {
  const clave = `${fecha}|${contenido}`;
  const vez = repetidas.get(clave) ?? 0;
  repetidas.set(clave, vez + 1);
  const sufijo = (huella(`${clave}#${vez}`) % 36 ** 5).toString(36).toUpperCase().padStart(5, '0');
  return `H${fecha.slice(2, 4)}${fecha.slice(5, 7)}${fecha.slice(8, 10)}-${sufijo}`;
}

/**
 * Convierte la hoja. `filas` incluye la fila de encabezados en `filaEncabezado`. `hoy` (YYYY-MM-DD) separa lo ya
 * entregado de lo agendado: una entrega de antes de hoy queda "Entregado"; la de hoy y hasta 14 días después, "Confirmado" (la ruta de hoy puede estar en curso); más allá
 * se descarta, porque en el Excel hay fechas mal tipeadas (de años futuros).
 * Devuelve los pedidos, los clientes (uno por teléfono) y los descartes con su motivo.
 */
export function convertir(filas, filaEncabezado, hoy) {
  const c = columnas(filas[filaEncabezado] ?? []);
  const faltan = ['fecha', 'nombre', 'cantidad', 'tamano', 'monto'].filter((clave) => c[clave] < 0);
  if (faltan.length > 0) throw new Error(`Faltan columnas en el Excel: ${faltan.join(', ')}.`);
  const valor = (fila, clave) => (c[clave] < 0 ? '' : String(fila[c[clave]] ?? '').trim());
  const limite = sumarDias(hoy, DIAS_FUTUROS_ACEPTADOS);

  const pedidos = [];
  const descartes = new Map();
  // El número de pedido sale del contenido de la fila, no de su posición: si el Excel se ordena o se le agregan filas,
  // cada pedido conserva su número y volver a cargar no duplica. Dos filas idénticas (el mismo cliente pidió dos veces
  // lo mismo el mismo día) se distinguen por el orden en que aparecen.
  const repetidas = new Map();
  const descartar = (motivo) => descartes.set(motivo, (descartes.get(motivo) ?? 0) + 1);

  filas.forEach((fila, indice) => {
    if (indice <= filaEncabezado || !fila.some((v) => String(v ?? '').trim() !== '')) return;
    const fecha = fechaDe(valor(fila, 'fecha'));
    if (!fecha) return descartar('fecha ilegible');
    if (fecha > limite) return descartar(`fecha más de ${DIAS_FUTUROS_ACEPTADOS} días en el futuro`);
    const cantidad = Number(valor(fila, 'cantidad'));
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 999) return descartar('cantidad que no es un número');
    const tipo = tamanoDe(valor(fila, 'tamano'));
    if (!tipo) return descartar('tamaño ilegible o dos tamaños en una fila');

    const montoTexto = valor(fila, 'monto').replace(/[$.\s]/g, '').replace(',', '.');
    const monto = /^\d+(\.\d+)?$/.test(montoTexto) && Number(montoTexto) > 0 ? Math.round(Number(montoTexto)) : null;
    const precioUnitario = monto !== null && monto % cantidad === 0 ? monto / cantidad : null;

    const pagoTexto = normalizar(valor(fila, 'pago'));
    const documentoTexto = normalizar(valor(fila, 'documento'));
    const documento = /factura/.test(documentoTexto) ? 'factura' : /boleta/.test(documentoTexto) ? 'boleta' : '';
    const numero = valor(fila, 'numero').replace(/[^0-9A-Za-z-]/g, '').slice(0, 20);
    const estadoFactura = normalizar(valor(fila, 'estadoFactura'));
    const formaTexto = valor(fila, 'formaPago');
    const formaPago = formaDePagoDe(formaTexto);

    const observaciones = [
      'Importado del Excel histórico.',
      formaPago === 'otro' ? `Forma de pago en el Excel: ${formaTexto.slice(0, 40)}` : '',
      documento === 'factura' && /enviada/.test(estadoFactura) ? 'Factura enviada.' : documento === 'factura' && /pendiente/.test(estadoFactura) ? 'Factura pendiente de enviar.' : '',
      notaDeDocumento(valor(fila, 'documento')),
      valor(fila, 'importante'),
    ]
      .filter(Boolean)
      .join(' | ')
      .slice(0, 500);

    pedidos.push({
      id: numeroDePedido(fecha, [valor(fila, 'telefono'), normalizar(valor(fila, 'nombre')), claveDeDireccion(valor(fila, 'direccion'), valor(fila, 'comuna')), tipo, cantidad, monto ?? ''].join('|'), repetidas),
      creadoEn: segundosDe(fecha),
      fecha,
      estado: fecha < hoy ? 'Entregado' : 'Confirmado',
      telefono: normalizarTelefono(valor(fila, 'telefono')) ?? '',
      nombre: valor(fila, 'nombre').slice(0, 80),
      comuna: valor(fila, 'comuna').slice(0, 80),
      direccion: valor(fila, 'direccion').slice(0, 200),
      lineas: [{ tipo, cantidad, precioUnitario, subtotal: monto }],
      total: monto,
      formaPago,
      estadoPago: /pagad/.test(pagoTexto) && !/pendiente/.test(pagoTexto) ? 'pagado' : 'pendiente',
      documento,
      numeroDocumento: documento ? numero : '',
      tipoCliente: tipoDeClienteDe(valor(fila, 'tipo')),
      observaciones,
    });
  });

  pedidos.sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));

  // Un cliente por teléfono; su nombre y su tipo son los del pedido más reciente. Las direcciones, con sus usos.
  const clientes = new Map();
  for (const p of pedidos) {
    if (!p.telefono) continue;
    const cliente = clientes.get(p.telefono) ?? { telefono: p.telefono, nombre: '', tipoCliente: '', desde: p.creadoEn, direcciones: new Map() };
    if (p.nombre) cliente.nombre = p.nombre;
    if (p.tipoCliente) cliente.tipoCliente = p.tipoCliente;
    if (p.direccion) {
      const clave = claveDeDireccion(p.direccion, p.comuna);
      const d = cliente.direcciones.get(clave) ?? { clave, usos: 0, primerUso: p.creadoEn };
      Object.assign(d, { direccion: p.direccion, comuna: p.comuna, usos: d.usos + 1, ultimoUso: p.creadoEn });
      cliente.direcciones.set(clave, d);
    }
    clientes.set(p.telefono, cliente);
  }

  return { pedidos, clientes: [...clientes.values()], descartes };
}

const sql = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);

/**
 * Las sentencias SQL para cargar todo. Se pueden correr dos veces sin duplicar: los pedidos tienen número fijo
 * (`ON CONFLICT DO NOTHING`), un cliente se crea solo si su teléfono no existe, y las direcciones se fusionan.
 *
 * Cada ficha nueva nace con una marca en sus notas ("importando:<teléfono>") y el teléfono se liga a la ficha que
 * tiene esa marca, que después se borra. Así, si el bot crea otra ficha mientras corre la carga, ningún teléfono
 * queda ligado a la ficha equivocada (con "la última ficha creada" sí podía pasar).
 */
export function sentencias({ pedidos, clientes }, ahora) {
  const lineas = ['-- Carga del Excel histórico de pedidos (D54). Generado por scripts/cargar-historial.mjs. NO subir a git.'];
  const clienteDe = (telefono) => `(SELECT cliente_id FROM telefonos_cliente WHERE telefono = ${sql(telefono)})`;
  for (const c of clientes) {
    lineas.push(
      `INSERT INTO clientes (nombre, tipo_cliente, notas, creado_en, actualizado_en) SELECT ${sql(c.nombre)}, ${sql(c.tipoCliente)}, ${sql(`importando:${c.telefono}`)}, ${c.desde}, ${ahora} WHERE NOT EXISTS (SELECT 1 FROM telefonos_cliente WHERE telefono = ${sql(c.telefono)});`,
      `INSERT INTO telefonos_cliente (telefono, cliente_id, agregado_en) SELECT ${sql(c.telefono)}, id, ${c.desde} FROM clientes WHERE notas = ${sql(`importando:${c.telefono}`)} ON CONFLICT (telefono) DO NOTHING;`,
      `UPDATE clientes SET notas = '' WHERE notas = ${sql(`importando:${c.telefono}`)};`,
    );
    for (const d of c.direcciones.values()) {
      lineas.push(
        `INSERT INTO direcciones_cliente (cliente_id, clave, direccion, comuna, usos, primer_uso, ultimo_uso) VALUES (${clienteDe(c.telefono)}, ${sql(d.clave)}, ${sql(d.direccion)}, ${sql(d.comuna)}, ${d.usos}, ${d.primerUso}, ${d.ultimoUso}) ON CONFLICT (cliente_id, clave) DO UPDATE SET usos = MAX(usos, excluded.usos), primer_uso = MIN(primer_uso, excluded.primer_uso), ultimo_uso = MAX(ultimo_uso, excluded.ultimo_uso);`,
      );
    }
  }
  for (const p of pedidos) {
    lineas.push(
      `INSERT INTO pedidos (id, creado_en, telefono, nombre, comuna, direccion, fecha_entrega, fecha_confirmada, estado, lineas, total, observaciones, confirmado_por, actualizado_en, forma_pago, estado_pago, documento, numero_documento, tipo_cliente, cliente_id) VALUES (${[
        p.id, p.creadoEn, p.telefono, p.nombre, p.comuna, p.direccion, p.fecha, p.fecha, p.estado, JSON.stringify(p.lineas), p.total, p.observaciones, 'Excel histórico', p.creadoEn, p.formaPago, p.estadoPago, p.documento, p.numeroDocumento, p.tipoCliente,
      ]
        .map(sql)
        .join(', ')}, ${p.telefono ? clienteDe(p.telefono) : 'NULL'}) ON CONFLICT (id) DO NOTHING;`,
    );
  }
  return `${lineas.join('\n')}\n`;
}
