import { crc32, deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { aCsv, anonimizarArchivo } from '../scripts/anonimizar-excel.mjs';
import { construirInforme } from '../scripts/anonimizar/informe.mjs';
import { columnaDe, leerArchivo, leerCsv, leerXlsx, serialAFecha } from '../scripts/anonimizar/lector.mjs';
import { anonimizarHoja, buscarFiltraciones, clasificarColumnas, crearEstado, detectarEncabezado, normalizar } from '../scripts/anonimizar/nucleo.mjs';

// ---------------------------------------------------------------- ayudas para armar un .xlsx de prueba

function zip(archivos, comprimir) {
  const partes = [];
  const central = [];
  let desplazamiento = 0;
  for (const [nombre, contenido] of Object.entries(archivos)) {
    const datos = Buffer.from(contenido, 'utf8');
    const metodo = comprimir ? 8 : 0;
    const guardado = comprimir ? deflateRawSync(datos) : datos;
    const nom = Buffer.from(nombre);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(metodo, 8);
    local.writeUInt32LE(crc32(datos), 14);
    local.writeUInt32LE(guardado.length, 18);
    local.writeUInt32LE(datos.length, 22);
    local.writeUInt16LE(nom.length, 26);
    partes.push(local, nom, guardado);
    const cab = Buffer.alloc(46);
    cab.writeUInt32LE(0x02014b50, 0);
    cab.writeUInt16LE(20, 4);
    cab.writeUInt16LE(20, 6);
    cab.writeUInt16LE(metodo, 10);
    cab.writeUInt32LE(crc32(datos), 16);
    cab.writeUInt32LE(guardado.length, 20);
    cab.writeUInt32LE(datos.length, 24);
    cab.writeUInt16LE(nom.length, 28);
    cab.writeUInt32LE(desplazamiento, 42);
    central.push(cab, nom);
    desplazamiento += 30 + nom.length + guardado.length;
  }
  const tamanoCentral = central.reduce((a, b) => a + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(Object.keys(archivos).length, 8);
  fin.writeUInt16LE(Object.keys(archivos).length, 10);
  fin.writeUInt32LE(tamanoCentral, 12);
  fin.writeUInt32LE(desplazamiento, 16);
  return Buffer.concat([...partes, ...central, fin]);
}

const esc = (t) => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const letra = (i) => String.fromCharCode(65 + i);

/** Filas como texto en línea (números como números). */
function filasXml(filas) {
  return filas
    .map(
      (fila, r) =>
        `<row r="${r + 1}">${fila
          .map((v, c) => (typeof v === 'number' ? `<c r="${letra(c)}${r + 1}"><v>${v}</v></c>` : `<c r="${letra(c)}${r + 1}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`))
          .join('')}</row>`,
    )
    .join('');
}

function xlsx({ hojas, compartidas = [], comprimir = true, estilos }) {
  return zip(
    {
      '[Content_Types].xml': '<Types/>',
      'xl/workbook.xml': `<workbook><workbookPr/><sheets>${hojas.map((h, i) => `<sheet name="${esc(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`,
      'xl/_rels/workbook.xml.rels': `<Relationships>${hojas.map((h, i) => `<Relationship Id="rId${i + 1}" Type="hoja" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}</Relationships>`,
      'xl/sharedStrings.xml': `<sst>${compartidas.map((t) => `<si><t>${esc(t)}</t></si>`).join('')}</sst>`,
      'xl/styles.xml':
        estilos ??
        '<styleSheet><numFmts count="1"><numFmt numFmtId="164" formatCode="dd/mm/yyyy"/></numFmts><cellXfs count="4"><xf numFmtId="0"/><xf numFmtId="14"/><xf numFmtId="22"/><xf numFmtId="164"/></cellXfs></styleSheet>',
      ...Object.fromEntries(hojas.map((h, i) => [`xl/worksheets/sheet${i + 1}.xml`, `<worksheet><sheetData>${h.xml ?? filasXml(h.filas)}</sheetData></worksheet>`])),
    },
    comprimir,
  );
}

const ENCABEZADOS = ['Fecha de entrega', 'Nombre del cliente', 'Dirección', 'Comuna', 'Teléfono', 'Tipo de cliente', 'Cantidad de bidones', 'Tamaño de los bidones', 'Precio a pagar', 'Tipo de pago', 'Si el cliente necesita factura', 'Estado del pago'];

const PEDIDOS = [
  ['2026-01-05', 'Ana Uno', 'Calle 1 10', 'Ñuñoa', '911111111', 'hogar', '2', '20 L', '6600', 'efectivo', 'No', 'Pagado'],
  ['2026-01-12', 'Ana Uno', 'Calle 1 10', 'Ñuñoa', '911111111', 'hogar', '2', '20 L', '6600', 'efectivo', 'No', 'Pagado'],
  ['2026-02-02', 'Ana Uno', 'Calle 2 20', 'Providencia', '911111111', 'hogar', '2', '20 L', '6600', 'efectivo', 'No', 'Pagado'],
  ['2026-01-04', 'Beto Dos', 'Av 5 100', 'Macul', '922222222', 'hogar', '1', '12 L', '2500', 'transferencia', 'No', 'Pendiente'],
  ['2026-01-06', 'Beto D.', 'Av 5 100', 'Macul', '922222222', 'hogar', '1', '12 L', '2500', 'transferencia', 'No', 'Pendiente'],
  ['2026-03-02', 'Carla Tres', 'Pasaje 9 1', 'Las Condes', '933333333', 'empresa', '40', '20 L', '110000', 'transferencia', 'Sí', 'Pendiente'],
  ['2026-03-02', 'Carla Tres', 'Pasaje 9 1', 'Las Condes', '933333333', 'empresa', '30', '20 L', '82500', 'transferencia', 'Sí', 'Pendiente'],
  ['2026-03-03', 'Carla Tres', 'Pasaje 9 1', 'Las Condes', '933333333', 'empresa', '3', '10 L', '6600', 'efectivo', 'No', 'Pagado'],
];

// ---------------------------------------------------------------- lector

describe('lector de csv', () => {
  it('detecta ; como separador, respeta comillas y quita el BOM', () => {
    const [hoja] = leerCsv(Buffer.from('﻿Nombre;Tel\r\n"Ana; Pérez";"5691234"\r\n"Dice ""hola""";x\r\n', 'utf8'));
    expect(hoja.filas).toEqual([['Nombre', 'Tel'], ['Ana; Pérez', '5691234'], ['Dice "hola"', 'x']]);
  });

  it('si no es UTF-8 lo lee como Windows-1252 (CSV guardado desde Excel antiguo)', () => {
    const [hoja] = leerCsv(Buffer.from('Comuna;N\nÑuñoa;1\n', 'latin1'));
    expect(hoja.filas[1]).toEqual(['Ñuñoa', '1']);
  });
});

describe('lector de xlsx', () => {
  const hojaDeTipos = `
    <row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="C1" t="s"><v>2</v></c></row>
    <row r="2"><c r="A2" s="1"><v>45658</v></c><c r="B2"><v>56912345678</v></c><c r="C2" t="inlineStr"><is><t>Ana</t></is></c><c r="D2" t="b"><v>1</v></c><c r="E2" s="2"><v>45658.5</v></c><c r="F2" s="3"><v>45659</v></c><c r="G2" t="str"><f>A1</f><v>texto</v></c><c r="H2"><v>4.5</v></c></row>
    <row r="4"><c r="C4" t="inlineStr"><is><t>x</t></is></c></row>`;

  for (const comprimir of [true, false]) {
    it(`lee textos compartidos, números, fechas con estilo, booleanos y filas vacías (${comprimir ? 'comprimido' : 'sin comprimir'})`, () => {
      const buffer = xlsx({ comprimir, compartidas: ['Fecha', 'Teléfono', 'Nombre & Apellido'], hojas: [{ nombre: 'Pedidos', xml: hojaDeTipos }] });
      const [hoja] = leerXlsx(buffer);
      expect(hoja.nombre).toBe('Pedidos');
      expect(hoja.filas).toEqual([
        ['Fecha', 'Teléfono', 'Nombre & Apellido'],
        ['2025-01-01', '56912345678', 'Ana', 'VERDADERO', '2025-01-01 12:00', '2025-01-02', 'texto', '4.5'],
        [],
        ['', '', 'x'],
      ]);
    });
  }

  it('lee varias hojas en el orden del libro', () => {
    const buffer = xlsx({ hojas: [{ nombre: 'Uno', filas: [['a']] }, { nombre: 'Dos', filas: [['b']] }] });
    expect(leerXlsx(buffer).map((h) => h.nombre)).toEqual(['Uno', 'Dos']);
  });

  it('un número de serie se convierte a fecha ISO', () => {
    expect(serialAFecha(45658, 'fecha')).toBe('2025-01-01');
    expect(serialAFecha(45658.75, 'hora')).toBe('18:00');
    expect(serialAFecha(-5, 'fecha')).toBe('-5');
  });

  it('convierte referencias de columna', () => {
    expect(columnaDe('A1')).toBe(0);
    expect(columnaDe('AB12')).toBe(27);
  });

  it('rechaza lo que no es un xlsx y los .xls antiguos, diciendo qué hacer', () => {
    expect(() => leerArchivo(Buffer.from('hola'), 'a.xlsx')).toThrow(/no parece un \.xlsx/i);
    expect(() => leerArchivo(Buffer.from('x'), 'a.xls')).toThrow(/guárdalo como \.xlsx/i);
    expect(() => leerArchivo(Buffer.from('x'), 'a.pdf')).toThrow(/no sé leer/i);
  });
});

// ---------------------------------------------------------------- núcleo

describe('roles de columna', () => {
  it('reconoce los 12 encabezados del Excel de Brunen sin confundir "tipo de cliente" con el nombre', () => {
    expect(clasificarColumnas(ENCABEZADOS)).toEqual(['fecha', 'nombre', 'direccion', 'comuna', 'telefono', 'tipo_cliente', 'cantidad', 'tamano', 'precio', 'tipo_pago', 'factura', 'estado_pago']);
  });

  it('distingue "cantidad de bidones" de "cant bidones y tamaño" (así las describió Franco)', () => {
    expect(clasificarColumnas(['cantidad de bidones', 'cant bidones y tamaño'])).toEqual(['cantidad', 'tamano']);
  });

  it('una columna combinada con muchas formas ("15 de 20lts") conserva números y unidades, y tapa lo demás', () => {
    const filas = Array.from({ length: 45 }, (_, n) => [`${n + 1} de 20lts`]);
    const r = anonimizarHoja([['cant bidones y tamaño'], ...filas, ['3 de 12 para Pedro']]);
    expect(r.columnas[0].tratamiento).toBe('numero');
    expect(r.filas[14][0]).toBe('15 de 20lts');
    expect(r.filas[45][0]).toBe('3 de 12 ? ?');
    const informe = construirInforme({ archivo: 'x.csv', hojas: [{ nombre: 'h', ...r }] });
    expect(informe).toMatch(/\| 20 L \| 45 \|/);
  });

  it('una sobrescritura manda sobre lo automático', () => {
    expect(clasificarColumnas(['Apodo', 'Vendedor'], new Map([['apodo', 'nombre'], ['vendedor', 'omitir']]))).toEqual(['nombre', 'omitir']);
  });

  it('encuentra el encabezado aunque haya filas de título antes', () => {
    expect(detectarEncabezado([['Registro de pedidos 2026'], [], ['Fecha', 'Nombre', 'Dirección'], ['2026-01-01', 'Ana', 'x']])).toBe(2);
    expect(detectarEncabezado([['Nombre'], ['Ana']])).toBe(0);
    expect(detectarEncabezado([['1', '2'], ['3', '4']])).toBe(-1);
  });

  it('normaliza tildes, mayúsculas y espacios', () => {
    expect(normalizar('  ÑUÑOA   Centro ')).toBe('nunoa centro');
  });
});

describe('anonimizar una hoja', () => {
  const encabezados = [...ENCABEZADOS, 'Observaciones', 'Correo'];
  const filas = [
    encabezados,
    ['05/01/2026', 'Juanita Ñandú', 'Calle Falsa 123, depto 4', 'Ñuñoa', '+56 9 1234 5678', 'hogar', '2', '20 L', '6600', 'efectivo', 'No', 'Pagado', 'Llamar a Don Pedro al portón', 'juanita@correo.cl'],
    ['2026-01-12', 'JUANITA NANDU', 'calle falsa 123 depto 4', 'Ñuñoa', '912345678', 'hogar', '2', '20 L', '6600', 'efectivo', 'No', 'Pagado', '', ''],
    ['12/01/2026', 'Pedro Soto', 'Av. Otra 45', 'Providencia', '988887777', 'minimarket', '2 de Juan', '20 L', '5500', 'transferencia', 'Sí', 'Pendiente', '', ''],
  ];
  const resultado = anonimizarHoja(filas);
  const columna = (nombre) => resultado.encabezados.indexOf(nombre);
  const celda = (fila, nombre) => resultado.filas[fila][columna(nombre)];

  it('no deja pasar nombres, teléfonos, direcciones, correos ni observaciones', () => {
    const todo = JSON.stringify([resultado.encabezados, resultado.filas]);
    for (const secreto of ['Juanita', 'Ñandú', 'Nandu', 'Falsa', '1234', '988887777', 'Pedro', 'Soto', 'Otra', 'juanita@', 'Don Pedro']) {
      expect(todo).not.toContain(secreto);
    }
  });

  it('el mismo cliente recibe el mismo código aunque cambien mayúsculas, tildes o el formato del teléfono', () => {
    expect(celda(0, 'Nombre del cliente')).toBe(celda(1, 'Nombre del cliente'));
    expect(celda(0, 'Teléfono')).toBe(celda(1, 'Teléfono'));
    expect(celda(0, 'Dirección')).toBe(celda(1, 'Dirección'));
    expect(celda(2, 'Nombre del cliente')).not.toBe(celda(0, 'Nombre del cliente'));
    expect(celda(0, 'Nombre del cliente')).toBe('Cliente-0001');
    expect(celda(0, 'Teléfono')).toBe('Tel-0001');
  });

  it('del teléfono deja el formato, la cantidad de dígitos y el tipo, sin los números', () => {
    expect(celda(0, 'Teléfono_formato')).toBe('+## # #### ####');
    expect(celda(0, 'Teléfono_digitos')).toBe('11');
    expect(celda(1, 'Teléfono_digitos')).toBe('9');
    expect(celda(0, 'Teléfono_tipo')).toBe('movil');
  });

  it('de la dirección deja si trae número y qué complemento menciona', () => {
    expect(celda(0, 'Dirección_tiene_numero')).toBe('1');
    expect(celda(0, 'Dirección_complemento')).toBe('depto');
    expect(celda(2, 'Dirección_complemento')).toBe('');
  });

  it('deja tal cual comuna, tipo de cliente, pago y precio, y convierte la fecha a ISO', () => {
    expect(celda(0, 'Comuna')).toBe('Ñuñoa');
    expect(celda(2, 'Tipo de cliente')).toBe('minimarket');
    expect(celda(0, 'Estado del pago')).toBe('Pagado');
    expect(celda(0, 'Precio a pagar')).toBe('6600');
    expect(celda(0, 'Fecha de entrega')).toBe('2026-01-05');
  });

  it('de las observaciones deja solo palabras clave de una lista cerrada', () => {
    expect(celda(0, 'Observaciones_palabras')).toBe('llamar|porton');
    expect(celda(0, 'Observaciones_vacia')).toBe('0');
    expect(celda(1, 'Observaciones_vacia')).toBe('1');
  });

  it('oculta el correo y tapa las palabras desconocidas dentro de una cantidad con texto', () => {
    expect(celda(0, 'Correo')).toBe('[oculto]');
    expect(celda(2, 'Cantidad de bidones')).toBe('2 de ?');
  });

  it('una columna desconocida con texto variado no se copia; una numérica sí', () => {
    const nombres = Array.from({ length: 30 }, (_, n) => `Vendedor Número ${n}`);
    const r = anonimizarHoja([['Vendedor', 'Margen'], ...nombres.map((nombre, n) => [nombre, String(n)])]);
    expect(JSON.stringify(r.filas)).not.toContain('Vendedor Número');
    expect(r.encabezados).toContain('Vendedor_palabras');
    expect(r.columnas[1].tratamiento).toBe('numero');
    expect(r.avisos.join(' ')).toMatch(/Vendedor/);
  });

  it('una columna desconocida con pocas opciones se deja visible, y avisa cómo quitarla', () => {
    const r = anonimizarHoja([['Turno', 'x'], ['mañana', '1'], ['tarde', '2'], ['mañana', '3']]);
    expect(r.columnas[0].tratamiento).toBe('categoria');
    expect(r.filas.map((f) => f[0])).toEqual(['mañana', 'tarde', 'mañana']);
    expect(r.avisos.join(' ')).toContain('--col "Turno=omitir"');
  });

  it('las coordenadas de la plataforma de rutas se ocultan: son la casa del cliente', () => {
    const r = anonimizarHoja([['Latitud', 'Longitud', 'Orden'], ['-33.4567', '-70.6123', '1'], ['-33.4001', '-70.5999', '2']]);
    expect(JSON.stringify(r.filas)).not.toMatch(/33\.4|70\.6|70\.5/);
    expect(r.columnas.map((c) => c.rol)).toEqual(['coordenadas', 'coordenadas', 'otro']);
  });

  it('si la fila de encabezados en realidad son datos, no copia esos valores como títulos', () => {
    const r = anonimizarHoja([['Juanita Ñandú', '56912345678', 'Calle Falsa 123'], ['Ana', '911111111', 'x']], { filaEncabezado: 0 });
    expect(JSON.stringify(r.encabezados)).not.toMatch(/56912345678/);
  });

  it('una columna de categorías con teléfonos adentro se trata como texto libre', () => {
    const r = anonimizarHoja([['Tipo de pago'], ['efectivo'], ['transferencia, llamar al 912345678']]);
    expect(r.columnas[0].tratamiento).toBe('texto-libre');
    expect(JSON.stringify(r.filas)).not.toContain('912345678');
  });

  it('los códigos se comparten entre hojas del mismo archivo', () => {
    const estado = crearEstado();
    const a = anonimizarHoja([['Nombre'], ['Ana Uno'], ['Beto Dos']], { estado });
    const b = anonimizarHoja([['Cliente'], ['Beto Dos'], ['Carla Tres']], { estado });
    expect(a.filas[1][0]).toBe(b.filas[0][0]);
    expect(b.filas[1][0]).toBe('Cliente-0003');
  });

  it('exige encabezado', () => {
    expect(() => anonimizarHoja([['1', '2'], ['3', '4']])).toThrow(/fila de encabezados/);
  });
});

describe('revisión de fugas', () => {
  const sensibles = new Set(['juanita nandu', '912345678', 'calle falsa 123']);

  it('detecta un valor original, un correo, un RUT y números largos sin mostrar el valor', () => {
    const problemas = buscarFiltraciones(['Cliente-0001', 'Juanita Ñandú', 'a@b.cl', '12.345.678-9', '912345678', '56912345678'], sensibles);
    expect(problemas.length).toBeGreaterThanOrEqual(5);
    expect(problemas.join(' ')).not.toMatch(/Juanita|a@b|912345678/);
  });

  it('no se queja de códigos, fechas, precios ni cantidades', () => {
    expect(buscarFiltraciones(['Cliente-0007', 'Tel-0003', 'Dir-0120', '2026-01-05', '2026-01-05 12:00', '110000', '2 de ?', '+## # #### ####', 'llamar|porton', 'Ñuñoa'], sensibles)).toEqual([]);
  });
});

// ---------------------------------------------------------------- informe

describe('informe', () => {
  const hoja = { nombre: 'Pedidos', ...anonimizarHoja([ENCABEZADOS, ...PEDIDOS]) };
  const informe = construirInforme({ archivo: 'historial.xlsx', hojas: [hoja] });

  it('cuenta los días que pasan de la capacidad del furgón', () => {
    expect(informe).toMatch(/Días con más de 65 bidones: 1 de 7/);
  });

  it('detecta teléfonos con más de un nombre y clientes que cambian de dirección', () => {
    expect(informe).toMatch(/Teléfonos con más de un nombre: 1/);
    expect(informe).toMatch(/Clientes que cambiaron de dirección: 1 de 3/);
  });

  it('muestra el precio por bidón más común para comparar con la lista de precios', () => {
    expect(informe).toContain('3.300 (3)');
  });

  it('cuenta las entregas en domingo y los pedidos del mismo cliente el mismo día', () => {
    expect(informe).toMatch(/entrega en domingo \(el negocio no despacha\): 1/);
    expect(informe).toMatch(/Mismo cliente y mismo día en más de una fila: 1 casos/);
  });

  it('no trae nombres, teléfonos ni direcciones', () => {
    for (const secreto of ['Ana', 'Beto', 'Carla', '911111111', '922222222', 'Calle 1', 'Pasaje']) expect(informe).not.toContain(secreto);
  });

  it('muestra todas las categorías aunque sean pocas filas (la copia anonimizada ya las trae)', () => {
    expect(informe).toMatch(/\| Sí \| 2 \|/);
    expect(informe).toMatch(/\| Macul \| 2 \|/);
  });

  it('el informe del Excel de Brunen pregunta si el precio es del pedido o por bidón cuando hay datos suficientes', () => {
    const filas = Array.from({ length: 6 }, (_, n) => ['2026-01-0' + (n + 1), `Cliente ${n}`, `Calle ${n}`, 'Macul', `9000000${n}0`, 'hogar', n % 2 ? '2' : '1', '20 L', n % 2 ? '6600' : '4500', 'efectivo', 'No', 'Pagado']);
    const hojaPrecios = { nombre: 'Pedidos', ...anonimizarHoja([ENCABEZADOS, ...filas]) };
    expect(construirInforme({ archivo: 'x.xlsx', hojas: [hojaPrecios] })).toMatch(/20 L: la mediana con 2 bidones es 1\.47 veces la de 1 bidón/);
  });
});

// ---------------------------------------------------------------- de punta a punta

describe('anonimizarArchivo', () => {
  const buffer = xlsx({ hojas: [{ nombre: 'Pedidos', filas: [ENCABEZADOS, ...PEDIDOS] }, { nombre: 'Vacía', filas: [] }] });

  it('lee el xlsx, anonimiza, arma el informe y no encuentra fugas', () => {
    const r = anonimizarArchivo({ buffer, nombreArchivo: 'datos/Historial 2026.xlsx' });
    expect(r.problemas).toEqual([]);
    expect(r.omitidas).toEqual(['Vacía (vacía)']);
    expect(r.archivos.map((a) => a.nombre)).toEqual(['historial-2026__pedidos.csv']);
    for (const secreto of ['Ana', 'Beto', 'Carla', '911111111']) expect(r.archivos[0].contenido).not.toContain(secreto);
    expect(r.informe).toContain('Hoja "Pedidos"');
  });

  it('también acepta un CSV', () => {
    const csv = [ENCABEZADOS, ...PEDIDOS].map((f) => f.join(';')).join('\n');
    const r = anonimizarArchivo({ buffer: Buffer.from(csv, 'utf8'), nombreArchivo: 'x.csv' });
    expect(r.hojas[0].filas).toHaveLength(8);
  });

  it('avisa si la hoja pedida no existe', () => {
    expect(() => anonimizarArchivo({ buffer, nombreArchivo: 'a.xlsx', hoja: 'No existe' })).toThrow(/No encontré la hoja/);
  });

  it('el CSV de salida neutraliza fórmulas y cita lo que lleva comas', () => {
    expect(aCsv(['a', 'b'], [['=1+1', 'x, y'], ['-5', 'ok']])).toBe("a,b\n'=1+1,\"x, y\"\n-5,ok\n");
  });
});

describe('ajustes por el Excel real de Brunen', () => {
  it('"Pedido" es la cantidad y "20L - 12L" el tamaño', () => {
    expect(clasificarColumnas(['Pedido', '20L - 12L'])).toEqual(['cantidad', 'tamano']);
  });

  it('una columna "Contacto" con números de teléfono se trata como teléfono', () => {
    const r = anonimizarHoja([['Cliente', 'Contacto'], ['Ana Uno', '+56 9 1111 1111'], ['Beto Dos', '922222222'], ['Carla Tres', '933333333']]);
    expect(r.columnas.map((c) => c.rol)).toEqual(['nombre', 'telefono']);
    expect(JSON.stringify(r.filas)).not.toContain('1111');
  });

  it('una columna con nombres de contacto sigue siendo nombre', () => {
    const r = anonimizarHoja([['Cliente', 'Contacto'], ['Ana Uno', 'Pedro'], ['Beto Dos', 'Marta']]);
    expect(r.columnas.map((c) => c.rol)).toEqual(['nombre', 'nombre']);
  });

  it('las columnas vacías sin título se descartan', () => {
    const r = anonimizarHoja([['Fecha', '', '', ''], ['2026-01-05', '', '', ''], ['2026-01-06', '', '', '']]);
    expect(r.encabezados).toEqual(['Fecha']);
  });
});

describe('categorías con datos personales adentro', () => {
  it('una dirección escrita en la columna Comuna se tapa', () => {
    const r = anonimizarHoja([['Direccion', 'Comuna'], ['Calle Falsa 123', 'Ñuñoa'], ['Av Otra 45', 'Calle Falsa 123'], ['Pasaje Uno 9', 'Macul']]);
    expect(JSON.stringify(r.filas)).not.toContain('Falsa');
    expect(r.filas[1][r.encabezados.indexOf('Comuna')]).toBe('[dato personal]');
    expect(r.avisos.join(' ')).toMatch(/1 celdas/);
  });
});
