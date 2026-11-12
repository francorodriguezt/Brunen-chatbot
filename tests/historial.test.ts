import { describe, expect, it } from 'vitest';
// @ts-expect-error: módulo de JavaScript sin tipos (scripts/), se prueba igual
import { claveDeDireccion as claveDelScript, convertir, fechaDe, formaDePagoDe, normalizarTelefono as telefonoDelScript, sentencias, tamanoDe, tipoDeClienteDe } from '../scripts/historial/convertir.mjs';
import { RepositorioClientes, claveDeDireccion } from '../src/fichas';
import { RepositorioD1 } from '../src/repositorio';
import { normalizarTelefono } from '../src/whatsapp';
import { crearBaseSqlite } from './ayudas';

const ENCABEZADO = ['Fecha', 'Cliente', 'Direccion', 'Comuna', 'Contacto', 'Tipo de Cliente', 'Pedido', '20L - 12L', 'Monto', 'Forma de pago', 'Boleta - Factura', 'Estado', 'N° Fact.', 'Comentarios', 'Importante'];
const HOY = '2026-11-12';

// Filas ficticias con la forma del Excel real.
const FILAS = [
  ['CONTROL DE PEDIDOS'],
  ENCABEZADO,
  ['2026-01-05', 'Ana Prueba', 'Calle Falsa 123', 'Ñuñoa', '56911111111', 'Hogar', '2', '20Lts', '6000', 'Transferencia', '', '', '', 'PAGADO', ''],
  ['2026-02-05', 'Ana Prueba', 'calle falsa 123', 'Ñuñoa', '56911111111', 'hogar', '4', '20lts', '10000', 'Efectivo', 'AM', '', '', 'PENDIENTE DE PAGO', 'Llamar antes'],
  ['2026-03-05', 'Ana P.', 'Av. Nueva 45', 'Providencia', '+56 9 1111 1111', 'Hogar', '1', '20Lts', '4000', 'Webpay', '', '', '', 'PAGADO', ''],
  ['2026-03-06', 'Minimarket Demo', 'Pasaje 9', 'Macul', '56922222222', 'Minimarket', '10', '20Lts', '12500', 'Redcompra', 'Factura + IVA', 'ENVIADA', '1234', 'PAGADO', ''],
  ['2026-03-07', 'Oficina Demo', 'Av. Uno 1', 'Las Condes', '', 'Empresa', '3', '12Lts', '7500', 'PLAN', 'Boleta', '', '88', 'PENDIENTE', ''],
  ['2026-03-08', 'Sin Tamaño', 'Calle 2', 'Macul', '56933333333', 'Hogar', '2', '12 y 20', '6000', 'Efectivo', '', '', '', 'PAGADO', ''],
  ['2026-03-09', 'Sin Cantidad', 'Calle 3', 'Macul', '56933333333', 'Hogar', 'dos', '20Lts', '6000', 'Efectivo', '', '', '', 'PAGADO', ''],
  ['fecha mala', 'X', 'Calle 4', 'Macul', '56933333333', 'Hogar', '2', '20Lts', '6000', 'Efectivo', '', '', '', 'PAGADO', ''],
  ['2027-12-24', 'Futuro', 'Calle 5', 'Macul', '56933333333', 'Hogar', '2', '20Lts', '6000', 'Efectivo', '', '', '', 'PAGADO', ''],
  ['2026-11-14', 'Agendado', 'Calle 6', 'Macul', '56944444444', 'Hogar', '3', '20Lts', '', 'ABONO', '', '', '', '', ''],
  [],
];

describe('piezas', () => {
  it('el teléfono y la clave de dirección son idénticos a los del sistema', () => {
    for (const t of ['912345678', '+56 9 1234 5678', '56912345678', '0056912345678', '123', '', '5491123456789']) expect(telefonoDelScript(t)).toBe(normalizarTelefono(t));
    for (const [d, c] of [['Av. Grecia 123, depto 4', 'Ñuñoa'], ['  PASAJE  UNO  #9 ', 'Las Condes']] as Array<[string, string]>) expect(claveDelScript(d, c)).toBe(claveDeDireccion(d, c));
  });

  it.each([
    ['20Lts', '20L'],
    ['20 lts', '20L'],
    ['12lLts', '12L'],
    ['10', '10L'],
    ['12 y 20', null],
    ['20Y12Lts', null],
    ['6', null],
    ['-', null],
  ])('tamaño %s', (texto, esperado) => {
    expect(tamanoDe(texto)).toBe(esperado);
  });

  it.each([
    ['Transferencia', 'transferencia'],
    ['efectivo', 'efectivo'],
    ['Debito', 'redcompra'],
    ['Pagina', 'webpay'],
    ['PLAN', 'plan'],
    ['ABONO', 'otro'],
    ['1750', 'otro'],
    ['', ''],
  ])('forma de pago %s', (texto, esperado) => {
    expect(formaDePagoDe(texto)).toBe(esperado);
  });

  it('tipo de cliente y fechas', () => {
    expect(['Hogar', 'Empresas', 'Minimarket', 'otra cosa'].map(tipoDeClienteDe)).toEqual(['hogar', 'empresa', 'minimarket', '']);
    expect(['2026-01-05', '05/01/2026', '5-1-26', '31/02/2026', '2019-01-01', 'ayer'].map(fechaDe)).toEqual(['2026-01-05', '2026-01-05', '2026-01-05', null, null, null]);
  });
});

describe('convertir el Excel', () => {
  const r = convertir(FILAS, 1, HOY);
  const porNombre = (nombre: string) => r.pedidos.find((p: { nombre: string }) => p.nombre === nombre);

  it('carga las filas que entiende y cuenta las que descarta, por motivo', () => {
    expect(r.pedidos).toHaveLength(6);
    expect(Object.fromEntries(r.descartes)).toEqual({
      'tamaño ilegible o dos tamaños en una fila': 1,
      'cantidad que no es un número': 1,
      'fecha ilegible': 1,
      'fecha más de 14 días en el futuro': 1,
    });
  });

  it('el monto es el total: con él se calcula el precio por bidón', () => {
    expect(porNombre('Minimarket Demo')).toMatchObject({ total: 12500, lineas: [{ tipo: '20L', cantidad: 10, precioUnitario: 1250, subtotal: 12500 }] });
    expect(porNombre('Agendado')).toMatchObject({ total: null, lineas: [{ precioUnitario: null, subtotal: null }] });
  });

  it('lo pasado queda entregado y lo agendado de los próximos días, confirmado', () => {
    expect(porNombre('Ana Prueba')?.estado).toBe('Entregado');
    expect(porNombre('Agendado')?.estado).toBe('Confirmado');
  });

  it('pago, documento, tipo de cliente y notas salen de sus columnas', () => {
    expect(porNombre('Minimarket Demo')).toMatchObject({ formaPago: 'redcompra', estadoPago: 'pagado', documento: 'factura', numeroDocumento: '1234', tipoCliente: 'minimarket' });
    expect(porNombre('Minimarket Demo')?.observaciones).toContain('Factura enviada.');
    const pendiente = r.pedidos.find((p: { fecha: string }) => p.fecha === '2026-02-05');
    expect(pendiente).toMatchObject({ formaPago: 'efectivo', estadoPago: 'pendiente', documento: '' });
    expect(pendiente?.observaciones).toContain('AM');
    expect(pendiente?.observaciones).toContain('Llamar antes');
    expect(porNombre('Agendado')?.observaciones).toContain('Forma de pago en el Excel: ABONO');
  });

  it('un cliente por teléfono, con el nombre más reciente y sus direcciones contadas', () => {
    const ana = r.clientes.find((c: { telefono: string }) => c.telefono === '56911111111');
    expect(ana.nombre).toBe('Ana P.');
    expect([...ana.direcciones.values()].map((d: { direccion: string; usos: number }) => [d.direccion, d.usos])).toEqual([
      ['calle falsa 123', 2],
      ['Av. Nueva 45', 1],
    ]);
    expect(r.clientes).toHaveLength(3); // el pedido sin teléfono no crea cliente
  });

  it('números de pedido fijos: la misma fila da siempre el mismo número', () => {
    expect(convertir(FILAS, 1, HOY).pedidos.map((p: { id: string }) => p.id)).toEqual(r.pedidos.map((p: { id: string }) => p.id));
    expect(r.pedidos.every((p: { id: string }) => /^H\d{6}-[0-9A-Z]{5}$/.test(p.id))).toBe(true);
  });

  it('sin las columnas esenciales, se detiene y dice cuáles faltan', () => {
    expect(() => convertir([['Fecha', 'Cliente']], 0, HOY)).toThrow(/cantidad, tamano, monto/);
  });
});

describe('el SQL generado, aplicado a una base', () => {
  async function cargar(veces = 1) {
    const db = crearBaseSqlite();
    const texto: string = sentencias(convertir(FILAS, 1, HOY), 1794000000);
    for (let i = 0; i < veces; i++) for (const linea of texto.split('\n').filter((l) => l.startsWith('INSERT'))) await db.prepare(linea).bind().run();
    return { db, pedidos: new RepositorioD1(db), clientes: new RepositorioClientes(db) };
  }

  it('deja los pedidos con su cliente, y las fichas con teléfonos y direcciones', async () => {
    const { pedidos, clientes } = await cargar();
    const [ana] = await clientes.listar('Ana');
    expect(ana).toMatchObject({ nombre: 'Ana P.', tipoCliente: 'hogar', telefonos: ['56911111111'], pedidos: 3 });
    expect(ana?.direccion).toMatchObject({ direccion: 'Av. Nueva 45' });
    const pedido = (await pedidos.pedidosDeCliente(ana?.id ?? 0))[0];
    expect(pedido).toMatchObject({ estado: 'Entregado', formaPago: 'webpay', estadoPago: 'pagado', total: 4000 });
    expect(await clientes.vincularPendientes(1794000000)).toBe(0); // ya estaban asociados
  });

  it('correrlo dos veces no duplica pedidos, clientes ni usos de direcciones', async () => {
    const una = await cargar(1);
    const dos = await cargar(2);
    const contar = (db: { sql(s: string): unknown[] }) => db.sql('SELECT (SELECT COUNT(*) FROM pedidos) AS p, (SELECT COUNT(*) FROM clientes) AS c, (SELECT SUM(usos) FROM direcciones_cliente) AS u');
    expect(contar(dos.db)).toEqual(contar(una.db));
  });

  it('un teléfono que ya tenía ficha no crea otra', async () => {
    const db = crearBaseSqlite();
    await new RepositorioD1(db).guardarPedido({ idPedido: 'P1', telefono: '56911111111', nombre: 'Ana del bot', lineas: [{ tipo: '20L', cantidad: 1, precioUnitario: 4500, subtotal: 4500 }], fechaEntrega: '2026-11-13', estado: 'Pendiente_Confirmacion', comuna: 'Ñuñoa', direccion: 'Calle Falsa 123', notasRepartidor: '', envasesARetirar: 0, observaciones: '' }, 1794000000);
    const clientes = new RepositorioClientes(db);
    await clientes.vincularPendientes(1794000000);
    for (const linea of sentencias(convertir(FILAS, 1, HOY), 1794000000).split('\n').filter((l: string) => l.startsWith('INSERT'))) await db.prepare(linea).bind().run();
    const [ana] = await clientes.listar('1111');
    expect(ana).toMatchObject({ nombre: 'Ana del bot', pedidos: 4 });
    expect(await clientes.listar('1111')).toHaveLength(1);
  });

  it('los textos con comillas no rompen el SQL', () => {
    const filas = [ENCABEZADO, ['2026-01-05', "D'Angelo", "Calle O'Higgins 1", 'Ñuñoa', '56955555555', 'Hogar', '1', '20Lts', '4000', 'Efectivo', '', '', '', 'PAGADO', "it's ok"]];
    expect(sentencias(convertir(filas, 0, HOY), 1)).toContain("'D''Angelo'");
  });
});

describe('el día de hoy', () => {
  it('un pedido con fecha de hoy queda confirmado, no entregado: la ruta puede estar en curso', () => {
    const filas = [ENCABEZADO, [HOY, 'Hoy Demo', 'Calle 1', 'Macul', '56955555555', 'Hogar', '2', '20Lts', '6000', 'Efectivo', '', '', '', 'PAGADO', '']];
    expect(convertir(filas, 0, HOY).pedidos[0]?.estado).toBe('Confirmado');
  });
});
