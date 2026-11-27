import { afterEach, describe, expect, it, vi } from 'vitest';
import { buscarCliente, buscarClienteConFicha, combinarConFicha, parsearClientes, type BusquedaCliente } from '../src/clientes';
import type { FichaParaBot } from '../src/fichas';
import { olvidarTokens } from '../src/google';
import { olvidarHojas } from '../src/hojas';
import { cotizarPedido } from '../src/precios';
import { normalizarTelefono } from '../src/whatsapp';
import { entornoGoogle, lecturasDe, stubGoogle } from './ayudas';

afterEach(() => {
  olvidarHojas();
  olvidarTokens();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Todo ficticio: nombres, direcciones y teléfonos inventados para las pruebas.
const ENCABEZADO = ['Telefono', 'Nombre', 'Direccion', 'Comuna', 'Tipo', 'Precio_Especial_20L', 'Envases_Pendientes', 'Primera_Compra', 'Aviso_Hora', 'Credito', 'Fecha_Ultimo_Pedido', 'Total_Pedidos', 'Notas', 'Estado'];
const HOJA: string[][] = [
  ENCABEZADO,
  ['56911111111', 'Ana Prueba', 'Calle Falsa 123, depto 4', 'Ñuñoa', 'normal', '', '2', '2026-01-10', 'si', '', '', '', 'Tocar el timbre', 'activo'],
  ['+56 9 2222 2222', 'Bodega Demo', 'Av. Inventada 456', 'Las Condes', 'Mayorista', '', '', '', '', '', '', '', '', ''],
  ['933333333', 'Casa Especial', 'Pasaje Ficticio 7', 'Providencia', 'especial', '$3.500', '', '', 'X', '', '', '', '', 'Activo'],
  ['56944444444', 'Cliente Bloqueado', 'Sin calle 0', 'Macul', 'normal', '', '', '', '', '', '', '', '', 'bloqueado'],
  ['56955555555', 'Tipo Raro', 'Otra calle 9', 'Recoleta', 'mayorsita', '', '', '', '', '', '', '', '', 'suspendido'],
  ['', 'Sin teléfono', 'Calle 1', 'Ñuñoa'],
  ['abc', 'Teléfono inválido', 'Calle 2', 'Ñuñoa'],
];

describe('normalizarTelefono', () => {
  it('deja todos los formatos de un celular chileno en el de WhatsApp', () => {
    for (const texto of ['56987654321', '+56987654321', '+56 9 8765 4321', '9 8765 4321', '987654321', '0056987654321', '(56) 9-8765-4321']) {
      expect(normalizarTelefono(texto)).toBe('56987654321');
    }
  });

  it('deja los números de otros países como están', () => {
    expect(normalizarTelefono('+54 9 11 2345 6789')).toBe('5491123456789');
  });

  it('lo que no parece un teléfono es null', () => {
    for (const texto of ['', 'abc', '1234', '12345678', '5698765432']) expect(normalizarTelefono(texto)).toBeNull();
  });
});

describe('parsearClientes', () => {
  const clientes = parsearClientes(HOJA);

  it('lee los datos de cada cliente por el nombre de su columna', () => {
    expect(clientes.get('56911111111')).toEqual({
      telefono: '56911111111',
      nombre: 'Ana Prueba',
      direccion: 'Calle Falsa 123, depto 4',
      comuna: 'Ñuñoa',
      tipo: 'normal',
      precioEspecial20L: null,
      envasesPendientes: 2,
      avisoHora: true,
      credito: '',
      notas: 'Tocar el timbre',
      estado: 'activo',
      avisos: [],
    });
  });

  it('normaliza los teléfonos de la hoja y entiende el tipo sin importar las mayúsculas', () => {
    expect(clientes.get('56922222222')).toMatchObject({ nombre: 'Bodega Demo', tipo: 'mayorista', estado: 'activo' });
    expect(clientes.get('56933333333')).toMatchObject({ nombre: 'Casa Especial', tipo: 'especial', precioEspecial20L: 3500, avisoHora: true });
  });

  it('marca a los bloqueados', () => {
    expect(clientes.get('56944444444')?.estado).toBe('bloqueado');
  });

  it('lo que no entiende de una fila lo anota en avisos en vez de adivinar', () => {
    const raro = clientes.get('56955555555');
    expect(raro?.tipo).toBe('normal');
    expect(raro?.estado).toBe('activo');
    expect(raro?.avisos).toHaveLength(2);
    expect(raro?.avisos.join(' ')).toContain('mayorsita');
    expect(raro?.avisos.join(' ')).toContain('suspendido');
  });

  it('avisa si tiene precio especial pero su tipo no es "especial": ese precio no se aplicaría', () => {
    const hoja = [
      ['Telefono', 'Nombre', 'Tipo', 'Precio_Especial_20L'],
      ['56911111111', 'Ana', 'normal', '3000'],
      ['56922222222', 'Beto', '', '$3.000'],
      ['56933333333', 'Cami', 'especial', '3000'],
      ['56944444444', 'Dani', 'normal', ''],
    ];
    const lista = parsearClientes(hoja);
    expect(lista.get('56911111111')?.avisos.join(' ')).toContain('Precio_Especial_20L');
    expect(lista.get('56922222222')?.avisos.join(' ')).toContain('Precio_Especial_20L');
    expect(lista.get('56933333333')?.avisos).toEqual([]);
    expect(lista.get('56944444444')?.avisos).toEqual([]);
  });

  it('descarta las filas sin teléfono válido', () => {
    expect(clientes.size).toBe(5);
  });

  it('si el encabezado cambia de orden, sigue leyendo lo correcto', () => {
    const otraHoja = [['Nombre', 'Comuna', 'Telefono'], ['Luis Demo', 'Macul', '56977777777']];
    expect(parsearClientes(otraHoja).get('56977777777')).toMatchObject({ nombre: 'Luis Demo', comuna: 'Macul' });
  });

  it('un teléfono repetido usa la primera fila y avisa solo la cantidad, sin datos personales', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const repetida = [['Telefono', 'Nombre'], ['56911111111', 'Primera'], ['+56 9 1111 1111', 'Segunda']];
    expect(parsearClientes(repetida).get('56911111111')?.nombre).toBe('Primera');
    expect(String(error.mock.calls[0]?.[0])).toContain('1 teléfono(s) repetido(s)');
    expect(JSON.stringify(error.mock.calls)).not.toContain('56911111111');
  });
});

describe('buscarCliente', () => {
  it('encuentra al cliente aunque el teléfono venga en otro formato', async () => {
    stubGoogle({ CLIENTES: HOJA });
    const r = await buscarCliente(await entornoGoogle(), '56933333333', 1000);
    expect(r).toMatchObject({ estado: 'encontrado', cliente: { nombre: 'Casa Especial' } });
  });

  it('un teléfono que no está en la hoja es un cliente nuevo', async () => {
    stubGoogle({ CLIENTES: HOJA });
    expect(await buscarCliente(await entornoGoogle(), '56900000000', 1000)).toEqual({ estado: 'nuevo' });
  });

  it('lee la hoja una vez por minuto, no una vez por mensaje', async () => {
    const llamadas = stubGoogle({ CLIENTES: HOJA });
    const env = await entornoGoogle();
    await buscarCliente(env, '56911111111', 1000);
    await buscarCliente(env, '56922222222', 1020);
    expect(lecturasDe(llamadas, 'CLIENTES')).toBe(1);
    await buscarCliente(env, '56922222222', 1061);
    expect(lecturasDe(llamadas, 'CLIENTES')).toBe(2);
  });

  it('si Google falla no se sabe si es nuevo: no_disponible (el flujo debe escalar)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubGoogle({ CLIENTES: 'falla' });
    expect(await buscarCliente(await entornoGoogle(), '56911111111', 1000)).toEqual({ estado: 'no_disponible' });
  });

  it('sin credenciales de Google tampoco se sabe', async () => {
    expect(await buscarCliente({}, '56911111111', 1000)).toEqual({ estado: 'no_disponible' });
  });

  it('una hoja sin clientes se avisa en el log y todos son nuevos', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubGoogle({ CLIENTES: [ENCABEZADO] });
    expect(await buscarCliente(await entornoGoogle(), '56911111111', 1000)).toEqual({ estado: 'nuevo' });
    expect(String(error.mock.calls[0]?.[0])).toContain('CLIENTES no tiene clientes');
  });

  it('un teléfono que no se entiende es nuevo (no rompe)', async () => {
    stubGoogle({ CLIENTES: HOJA });
    expect(await buscarCliente(await entornoGoogle(), 'no-es-telefono', 1000)).toEqual({ estado: 'nuevo' });
  });
});

describe('clientes en un solo lugar: la ficha y la hoja (D104)', () => {
  // Todo ficticio.
  const ficha = (cambios: Partial<FichaParaBot> = {}): FichaParaBot => ({
    id: 1,
    nombre: 'Local Prueba',
    tipoCliente: '',
    direccion: 'Calle Uno 1',
    comuna: 'Ñuñoa',
    precioEspecial20L: null,
    vaciosPendientes: 0,
    bloqueado: false,
    ...cambios,
  });
  const deHoja = (telefono: string): BusquedaCliente => {
    const cliente = parsearClientes(HOJA).get(telefono);
    return cliente ? { estado: 'encontrado', cliente } : { estado: 'nuevo' };
  };
  const cuatro = [{ tipo: '20L' as const, cantidad: 4 }];

  it('una ficha sin condiciones no cambia lo de la hoja', () => {
    expect(combinarConFicha(deHoja('56911111111'), ficha())).toEqual(deHoja('56911111111'));
    expect(combinarConFicha({ estado: 'nuevo' }, ficha())).toEqual({ estado: 'nuevo' });
    expect(combinarConFicha({ estado: 'no_disponible' }, null)).toEqual({ estado: 'no_disponible' });
  });

  it('minimarket es mayorista y un precio especial vale aunque sea minimarket', () => {
    const mayorista = combinarConFicha({ estado: 'nuevo' }, ficha({ tipoCliente: 'minimarket' }));
    expect(mayorista).toMatchObject({ estado: 'encontrado', cliente: { tipo: 'mayorista', direccion: 'Calle Uno 1', comuna: 'Ñuñoa', avisos: [] } });
    const especial = combinarConFicha({ estado: 'nuevo' }, ficha({ tipoCliente: 'minimarket', precioEspecial20L: 1311 }));
    expect(especial).toMatchObject({ estado: 'encontrado', cliente: { tipo: 'especial', precioEspecial20L: 1311 } });
    if (especial.estado !== 'encontrado') throw new Error('debía encontrarlo');
    expect(cotizarPedido(cuatro, especial.cliente).lineas[0]?.precioUnitario).toBe(1311);
    if (mayorista.estado !== 'encontrado') throw new Error('debía encontrarlo');
    expect(cotizarPedido(cuatro, mayorista.cliente).lineas[0]?.precioUnitario).toBe(1250);
    expect(combinarConFicha({ estado: 'nuevo' }, ficha({ tipoCliente: 'hogar' }))).toMatchObject({ cliente: { tipo: 'normal' } });
  });

  it('con la hoja caída, la ficha alcanza para cotizar', () => {
    expect(combinarConFicha({ estado: 'no_disponible' }, ficha({ tipoCliente: 'empresa' }))).toMatchObject({ estado: 'encontrado', cliente: { tipo: 'empresa' } });
  });

  it('sin dirección en la ficha queda como antes, salvo que esté bloqueado', () => {
    expect(combinarConFicha({ estado: 'nuevo' }, ficha({ tipoCliente: 'minimarket', direccion: '' }))).toEqual({ estado: 'nuevo' });
    expect(combinarConFicha({ estado: 'nuevo' }, ficha({ bloqueado: true, direccion: '' }))).toMatchObject({ estado: 'encontrado', cliente: { estado: 'bloqueado' } });
  });

  it('si la hoja dice otra cosa, manda la ficha y queda un aviso; una fila normal o sin tipo no es un desacuerdo', () => {
    // La hoja dice mayorista y la ficha, precio especial.
    const r = combinarConFicha(deHoja('56922222222'), ficha({ tipoCliente: 'minimarket', precioEspecial20L: 1311 }));
    expect(r).toMatchObject({ estado: 'encontrado', cliente: { nombre: 'Bodega Demo', tipo: 'especial', precioEspecial20L: 1311 } });
    if (r.estado !== 'encontrado') throw new Error('debía encontrarlo');
    expect(r.cliente.avisos).toEqual([expect.stringContaining('se usó la ficha')]);
    // "normal" es lo que vale por defecto: no es un desacuerdo, y los vacíos de la hoja quedan si la ficha no tiene.
    const ana = combinarConFicha(deHoja('56911111111'), ficha({ tipoCliente: 'minimarket' }));
    expect(ana).toMatchObject({ cliente: { tipo: 'mayorista', envasesPendientes: 2, avisos: [] } });
    // Una fila con el tipo vacío no dice nada.
    const sinTipo = parsearClientes([ENCABEZADO, ['56966666666', 'Sin Tipo', 'Calle 3', 'Macul']]).get('56966666666');
    if (!sinTipo) throw new Error('debía leerla');
    const r2 = combinarConFicha({ estado: 'encontrado', cliente: sinTipo }, ficha({ tipoCliente: 'minimarket', vaciosPendientes: 3 }));
    expect(r2).toMatchObject({ cliente: { tipo: 'mayorista', envasesPendientes: 3, avisos: [] } });
  });

  it('el bloqueo de la ficha o de la hoja vale', () => {
    expect(combinarConFicha(deHoja('56911111111'), ficha({ bloqueado: true }))).toMatchObject({ cliente: { estado: 'bloqueado' } });
    expect(combinarConFicha(deHoja('56944444444'), ficha({ tipoCliente: 'hogar' }))).toMatchObject({ cliente: { estado: 'bloqueado' } });
  });

  it('si la ficha no se puede leer, queda lo de la hoja; la ficha armada lleva el teléfono del mensaje', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubGoogle({ CLIENTES: HOJA });
    const env = await entornoGoogle();
    const caida = async (): Promise<FichaParaBot | null> => {
      throw new Error('D1 caída');
    };
    expect(await buscarClienteConFicha(env, caida, '56911111111')).toMatchObject({ estado: 'encontrado', cliente: { nombre: 'Ana Prueba', tipo: 'normal' } });
    const r = await buscarClienteConFicha(env, async () => ficha({ tipoCliente: 'minimarket' }), '+56 9 7777 7777');
    expect(r).toMatchObject({ estado: 'encontrado', cliente: { telefono: '56977777777', tipo: 'mayorista' } });
  });
});
