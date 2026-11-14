/**
 * Núcleo de la restauración desde el respaldo (D66): lee el CSV de RESPALDO_PEDIDOS (descargado desde Google Sheets) o
 * el Excel que baja el panel, se queda con la versión más nueva de cada pedido y arma el SQL para la base.
 *
 * El SQL no pisa un pedido que en la base ya está más nuevo que en el respaldo: si la base sigue viva, solo completa
 * lo que falta. Sin dependencias, para poder correrlo en cualquier computador con Node.
 */

const ESTADOS = new Set(['Pendiente_Confirmacion', 'Fuera_de_zona', 'Confirmado', 'En_Ruta', 'Entregado', 'Cancelado']);
const ID = /^[PHF]\d{6}-[0-9A-Z]{5}$/;

/** Columna del respaldo -> columna de la base, y cómo se convierte. */
const COLUMNAS = [
  ['ID_Pedido', 'id', 'texto'],
  ['Creado_Unix', 'creado_en', 'entero'],
  ['Telefono', 'telefono', 'texto'],
  ['Nombre', 'nombre', 'texto'],
  ['Comuna', 'comuna', 'texto'],
  ['Direccion', 'direccion', 'texto'],
  ['Fecha_Entrega', 'fecha_entrega', 'texto'],
  ['Fecha_Confirmada', 'fecha_confirmada', 'textoONulo'],
  ['Estado', 'estado', 'texto'],
  ['Lineas_JSON', 'lineas', 'texto'],
  ['Total', 'total', 'enteroONulo'],
  ['Notas_Repartidor', 'notas_repartidor', 'texto'],
  ['Envases_A_Retirar', 'envases_a_retirar', 'entero'],
  ['Observaciones', 'observaciones', 'texto'],
  ['Confirmado_Por', 'confirmado_por', 'textoONulo'],
  ['Actualizado_Unix', 'actualizado_en', 'entero'],
  ['Forma_Pago', 'forma_pago', 'texto'],
  ['Estado_Pago', 'estado_pago', 'texto'],
  ['Documento', 'documento', 'texto'],
  ['Numero_Documento', 'numero_documento', 'texto'],
  ['Tipo_Cliente', 'tipo_cliente', 'texto'],
  ['Cliente_Id', 'cliente_id', 'enteroONulo'],
  ['Entregado_Unix', 'entregado_en', 'enteroONulo'],
  ['Vacios_Retirados', 'vacios_retirados', 'enteroONulo'],
  ['Cobrado_En_Entrega', 'cobrado_en_entrega', 'enteroONulo'],
  ['No_Entregado_Unix', 'no_entregado_en', 'enteroONulo'],
  ['No_Entregado_Motivo', 'no_entregado_motivo', 'texto'],
];

/** Lee un CSV con comillas. Detecta si va separado por coma (Google Sheets) o por punto y coma (el Excel del panel). */
export function leerCsv(contenido) {
  const texto = contenido.replace(/^﻿/, '');
  const primera = texto.slice(0, texto.indexOf('\n') === -1 ? texto.length : texto.indexOf('\n'));
  const separador = (primera.match(/;/g)?.length ?? 0) > (primera.match(/,/g)?.length ?? 0) ? ';' : ',';
  const filas = [];
  let fila = [];
  let celda = '';
  let entreComillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (entreComillas) {
      if (c === '"' && texto[i + 1] === '"') {
        celda += '"';
        i++;
      } else if (c === '"') entreComillas = false;
      else celda += c;
    } else if (c === '"' && celda === '') entreComillas = true;
    else if (c === separador) {
      fila.push(celda);
      celda = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      fila.push(celda);
      if (fila.some((v) => v !== '')) filas.push(fila);
      fila = [];
      celda = '';
    } else celda += c;
  }
  fila.push(celda);
  if (fila.some((v) => v !== '')) filas.push(fila);
  return filas;
}

/** El Excel del panel antepone un apóstrofo a lo que parece fórmula ("'=..."): se le quita al restaurar. */
const sinProteccion = (valor) => (/^'[=+\-@]/.test(valor) ? valor.slice(1) : valor);

/**
 * De las filas del respaldo, la versión más nueva de cada pedido. Devuelve también las filas que no sirven, con el
 * motivo, para revisarlas a mano (sin imprimir datos de clientes).
 */
export function pedidosVigentes(filas) {
  const [encabezado, ...datos] = filas;
  if (!encabezado) return { pedidos: [], descartadas: [] };
  const posicion = new Map(encabezado.map((nombre, i) => [nombre.trim(), i]));
  const faltan = COLUMNAS.map(([columna]) => columna).filter((c) => !posicion.has(c));
  if (faltan.length > 0) throw new Error(`Al archivo le faltan columnas del respaldo: ${faltan.join(', ')}`);

  const vigentes = new Map();
  const descartadas = [];
  datos.forEach((fila, i) => {
    const valor = (columna) => sinProteccion(String(fila[posicion.get(columna)] ?? '').trim());
    const pedido = {};
    for (const [columna, destino, tipo] of COLUMNAS) {
      const v = valor(columna);
      if (tipo === 'texto') pedido[destino] = v;
      else if (tipo === 'textoONulo') pedido[destino] = v === '' ? null : v;
      else {
        const n = v === '' ? null : Number(v);
        if (n !== null && !Number.isInteger(n)) {
          descartadas.push({ fila: i + 2, motivo: `${columna} no es un número entero` });
          return;
        }
        if (tipo === 'entero' && n === null) {
          descartadas.push({ fila: i + 2, motivo: `falta ${columna}` });
          return;
        }
        pedido[destino] = n;
      }
    }
    if (!ID.test(pedido.id)) return void descartadas.push({ fila: i + 2, motivo: 'número de pedido no válido' });
    if (!ESTADOS.has(pedido.estado)) return void descartadas.push({ fila: i + 2, motivo: 'estado no válido' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(pedido.fecha_entrega)) return void descartadas.push({ fila: i + 2, motivo: 'fecha de entrega no válida' });
    try {
      if (!Array.isArray(JSON.parse(pedido.lineas))) throw new Error();
    } catch {
      return void descartadas.push({ fila: i + 2, motivo: 'Lineas_JSON no válido' });
    }
    const previo = vigentes.get(pedido.id);
    // Con la misma versión gana la fila de más abajo: es la que se copió después.
    if (!previo || pedido.actualizado_en >= previo.actualizado_en) vigentes.set(pedido.id, pedido);
  });
  return { pedidos: [...vigentes.values()], descartadas };
}

const literal = (valor) => (valor === null ? 'NULL' : typeof valor === 'number' ? String(valor) : `'${String(valor).replace(/'/g, "''")}'`);

/** El SQL que vuelve a poner los pedidos en la base. Un pedido más nuevo en la base no se pisa. */
export function sqlDeRestauracion(pedidos) {
  const columnas = COLUMNAS.map(([, destino]) => destino);
  const actualizar = columnas.filter((c) => c !== 'id').map((c) => `${c} = excluded.${c}`).join(', ');
  return pedidos
    .map(
      (p) =>
        `INSERT INTO pedidos (${columnas.join(', ')}) VALUES (${columnas.map((c) => literal(p[c])).join(', ')})\n` +
        `  ON CONFLICT(id) DO UPDATE SET ${actualizar} WHERE excluded.actualizado_en > pedidos.actualizado_en;`,
    )
    .join('\n');
}
