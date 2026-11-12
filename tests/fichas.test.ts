import { describe, expect, it } from 'vitest';
import { RepositorioClientes, VINCULAR_POR_PASADA, claveDeDireccion } from '../src/fichas';
import type { PedidoARegistrar } from '../src/pedidos';
import { RepositorioD1 } from '../src/repositorio';
import { crearBaseSqlite } from './ayudas';

const AHORA = 1793000000;
const DIA = 86400;

function pedido(id: string, cambios: Partial<PedidoARegistrar> = {}): PedidoARegistrar {
  return {
    idPedido: id,
    telefono: '56911111111',
    nombre: 'Ana Prueba',
    lineas: [{ tipo: '20L', cantidad: 2, precioUnitario: 3300, subtotal: 6600 }],
    fechaEntrega: '2026-10-29',
    estado: 'Pendiente_Confirmacion',
    comuna: 'Ñuñoa',
    direccion: 'Calle Falsa 123',
    notasRepartidor: '',
    envasesARetirar: 0,
    observaciones: '',
    ...cambios,
  };
}

async function base() {
  const db = crearBaseSqlite();
  return { db, pedidos: new RepositorioD1(db, () => 1), clientes: new RepositorioClientes(db) };
}

async function vincularTodo(clientes: RepositorioClientes) {
  let total = 0;
  for (let i = 0; i < 20; i++) {
    const n = await clientes.vincularPendientes(AHORA);
    total += n;
    if (n === 0) break;
  }
  return total;
}

describe('dirección: la misma escrita distinto cuenta una vez', () => {
  it.each([
    ['Av. Grecia 123, depto 4', 'av grecia 123 depto 4'],
    ['Calle Ñandú 12', 'calle nandu 12'],
    ['  PASAJE  UNO  #9 ', 'pasaje uno 9'],
  ])('%s', (direccion, esperado) => {
    expect(claveDeDireccion(direccion, 'Ñuñoa')).toBe(`${esperado}|nunoa`);
  });
});

describe('vincular pedidos a clientes', () => {
  it('crea una ficha por teléfono y le asocia todos sus pedidos', async () => {
    const { pedidos, clientes } = await base();
    await pedidos.guardarPedido(pedido('P1'), AHORA);
    await pedidos.guardarPedido(pedido('P2'), AHORA + DIA);
    await pedidos.guardarPedido(pedido('P3', { telefono: '56922222222', nombre: 'Beto Dos' }), AHORA + DIA);
    expect(await vincularTodo(clientes)).toBe(3);
    const lista = await clientes.listar();
    expect(lista.map((c) => [c.nombre, c.telefonos, c.pedidos])).toEqual(
      expect.arrayContaining([
        ['Ana Prueba', ['56911111111'], 2],
        ['Beto Dos', ['56922222222'], 1],
      ]),
    );
    expect(await vincularTodo(clientes)).toBe(0);
  });

  it(`avanza de a ${VINCULAR_POR_PASADA} pedidos por pasada (tope de consultas del plan gratis)`, async () => {
    const { pedidos, clientes } = await base();
    for (let i = 0; i < VINCULAR_POR_PASADA + 3; i++) await pedidos.guardarPedido(pedido(`P${i}`, { telefono: `569${String(10000000 + i)}` }), AHORA + i);
    expect(await clientes.vincularPendientes(AHORA)).toBe(VINCULAR_POR_PASADA);
    expect(await clientes.vincularPendientes(AHORA)).toBe(3);
  });

  it('guarda el historial de direcciones sin pisar las anteriores; la vigente es la última usada', async () => {
    const { pedidos, clientes } = await base();
    await pedidos.guardarPedido(pedido('P1', { direccion: 'Calle Falsa 123', comuna: 'Ñuñoa' }), AHORA);
    await pedidos.guardarPedido(pedido('P2', { direccion: 'calle falsa 123', comuna: 'Ñuñoa' }), AHORA + DIA);
    await pedidos.guardarPedido(pedido('P3', { direccion: 'Av. Nueva 45', comuna: 'Providencia', notasRepartidor: 'Torre B' }), AHORA + 2 * DIA);
    await vincularTodo(clientes);
    const [resumen] = await clientes.listar();
    expect(resumen?.direccion).toMatchObject({ direccion: 'Av. Nueva 45', comuna: 'Providencia', notasRepartidor: 'Torre B' });
    const ficha = await clientes.ficha(resumen?.id ?? 0);
    expect(ficha?.direcciones.map((d) => [d.direccion, d.usos])).toEqual([
      ['Av. Nueva 45', 1],
      ['calle falsa 123', 2],
    ]);
  });

  it('un pedido sin teléfono no se asocia solo', async () => {
    const { pedidos, clientes } = await base();
    await pedidos.guardarPedido(pedido('P1', { telefono: '' }), AHORA);
    expect(await vincularTodo(clientes)).toBe(0);
  });

  it('una ficha sin nombre toma el primero que aparece, y no cambia uno que ya tenía', async () => {
    const { pedidos, clientes } = await base();
    await pedidos.guardarPedido(pedido('P1', { nombre: '' }), AHORA);
    await pedidos.guardarPedido(pedido('P2', { nombre: 'Ana Prueba' }), AHORA + 1);
    await pedidos.guardarPedido(pedido('P3', { nombre: 'Otra Persona' }), AHORA + 2);
    await vincularTodo(clientes);
    expect((await clientes.listar())[0]?.nombre).toBe('Ana Prueba');
  });
});

describe('ficha, edición y teléfonos', () => {
  async function conDos() {
    const b = await base();
    await b.pedidos.guardarPedido(pedido('P1'), AHORA);
    await b.pedidos.guardarPedido(pedido('P2', { telefono: '56922222222', nombre: 'Ana Prueba (oficina)', direccion: 'Av. Nueva 45' }), AHORA + DIA);
    await vincularTodo(b.clientes);
    const ana = (await b.clientes.clienteDeTelefono('56911111111')) as number;
    const oficina = (await b.clientes.clienteDeTelefono('56922222222')) as number;
    return { ...b, ana, oficina };
  }

  it('se edita el nombre, el tipo y las notas; un tipo fuera de la lista se rechaza', async () => {
    const { clientes, ana } = await conDos();
    expect(await clientes.editar(ana, { nombre: '  Ana   Prueba ', tipoCliente: 'minimarket', notas: 'Paga a fin de mes' }, AHORA)).toEqual({ ok: true, valor: true });
    expect(await clientes.ficha(ana)).toMatchObject({ nombre: 'Ana Prueba', tipoCliente: 'minimarket', notas: 'Paga a fin de mes' });
    expect(await clientes.editar(ana, { tipoCliente: 'hotel' }, AHORA)).toEqual({ ok: false, error: 'datos_invalidos' });
    expect(await clientes.editar(999, { nombre: 'x' }, AHORA)).toEqual({ ok: false, error: 'no_existe' });
  });

  it('agregar un teléfono nuevo le pasa sus pedidos sin cliente; uno de otro cliente se avisa', async () => {
    const { pedidos, clientes, ana, oficina } = await conDos();
    await pedidos.guardarPedido(pedido('P3', { telefono: '56933333333' }), AHORA + 2 * DIA);
    expect(await clientes.agregarTelefono(ana, '56933333333', AHORA)).toEqual({ ok: true, valor: true });
    expect((await clientes.ficha(ana))?.pedidos).toBe(2);
    expect(await clientes.agregarTelefono(ana, '56922222222', AHORA)).toEqual({ ok: false, error: 'telefono_de_otro', otroId: oficina });
    expect(await clientes.agregarTelefono(ana, '123', AHORA)).toEqual({ ok: false, error: 'telefono_invalido' });
  });

  it('unir dos fichas junta teléfonos, direcciones y pedidos, y borra la otra', async () => {
    const { clientes, ana, oficina } = await conDos();
    await clientes.editar(oficina, { notas: 'Entregar en recepción', tipoCliente: 'empresa' }, AHORA);
    expect(await clientes.unir(ana, oficina, AHORA)).toEqual({ ok: true, valor: true });
    const ficha = await clientes.ficha(ana);
    expect(ficha).toMatchObject({ nombre: 'Ana Prueba', tipoCliente: 'empresa', notas: 'Entregar en recepción', pedidos: 2 });
    expect(ficha?.telefonos.sort()).toEqual(['56911111111', '56922222222']);
    expect(ficha?.direcciones).toHaveLength(2);
    expect(await clientes.ficha(oficina)).toBeNull();
    expect(await clientes.unir(ana, ana, AHORA)).toEqual({ ok: false, error: 'mismo_cliente' });
  });

  it('al unir, la misma dirección de las dos fichas queda una sola vez con los usos sumados', async () => {
    const { pedidos, clientes, ana, oficina } = await conDos();
    await pedidos.guardarPedido(pedido('P9', { telefono: '56922222222', direccion: 'CALLE FALSA 123' }), AHORA + 5 * DIA);
    await vincularTodo(clientes);
    await clientes.unir(ana, oficina, AHORA);
    const falsa = (await clientes.ficha(ana))?.direcciones.find((d) => d.direccion.toLowerCase() === 'calle falsa 123');
    expect(falsa?.usos).toBe(2);
    expect(falsa?.direccion).toBe('CALLE FALSA 123');
  });
});

describe('buscar clientes', () => {
  it('por nombre, por parte del teléfono, por dirección o comuna; con menos de 2 letras lista los recientes', async () => {
    const { pedidos, clientes } = await base();
    await pedidos.guardarPedido(pedido('P1'), AHORA);
    await pedidos.guardarPedido(pedido('P2', { telefono: '56922222222', nombre: 'Beto Dos', direccion: 'Av. Nueva 45', comuna: 'Macul' }), AHORA);
    await vincularTodo(clientes);
    const nombres = async (texto: string) => (await clientes.listar(texto)).map((c) => c.nombre);
    expect(await nombres('beto')).toEqual(['Beto Dos']);
    expect(await nombres('2222')).toEqual(['Beto Dos']);
    expect(await nombres('nueva')).toEqual(['Beto Dos']);
    expect(await nombres('macul')).toEqual(['Beto Dos']);
    expect(await nombres('%%')).toEqual([]);
    expect((await nombres('a')).length).toBe(2);
  });
});

describe('a quién le toca pedir (D58)', () => {
  /** Pedidos de un cliente en esas fechas de entrega. */
  async function conPedidos(b: Awaited<ReturnType<typeof base>>, telefono: string, nombre: string, fechas: string[], estado = 'Entregado') {
    let n = 0;
    for (const fecha of fechas) {
      n += 1;
      await b.pedidos.guardarPedido(pedido(`P26${telefono.slice(-4)}-${String(n).padStart(5, '0')}`, { telefono, nombre, fechaEntrega: fecha, estado: estado as PedidoARegistrar['estado'] }), AHORA - 100 * DIA + n);
    }
  }

  it('avisa del cliente que pide cada 7 días y lleva 12 sin pedir; no del que pidió hace poco', async () => {
    const b = await base();
    await conPedidos(b, '56911111111', 'Ana Prueba', ['2026-10-01', '2026-10-08', '2026-10-15', '2026-10-22']);
    await conPedidos(b, '56922222222', 'Beto Prueba', ['2026-10-10', '2026-10-17', '2026-10-24', '2026-10-31']);
    await vincularTodo(b.clientes);
    const { clientes } = await b.clientes.porPedir('2026-11-03');
    expect(clientes.map((c) => c.nombre)).toEqual(['Ana Prueba']);
    expect(clientes[0]).toMatchObject({ cadaDias: 7, ultimo: '2026-10-22', diasSinPedir: 12, telefonos: ['56911111111'] });
  });

  it('no avisa con menos de 4 pedidos (no hay ritmo), ni si ya tiene un pedido para hoy o adelante', async () => {
    const b = await base();
    await conPedidos(b, '56911111111', 'Ana Prueba', ['2026-10-01', '2026-10-08', '2026-10-15']);
    await conPedidos(b, '56922222222', 'Beto Prueba', ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-11-05']);
    await vincularTodo(b.clientes);
    expect((await b.clientes.porPedir('2026-11-03')).clientes).toEqual([]);
  });

  it('los cancelados no cuentan, y quien lleva más de 4 meses sin pedir se cuenta aparte como inactivo', async () => {
    const b = await base();
    await conPedidos(b, '56911111111', 'Ana Prueba', ['2026-06-01', '2026-06-08', '2026-06-15', '2026-06-22']);
    await conPedidos(b, '56922222222', 'Beto Prueba', ['2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29'], 'Cancelado');
    await vincularTodo(b.clientes);
    expect(await b.clientes.porPedir('2026-11-03')).toEqual({ clientes: [], inactivos: 1 });
  });
});
