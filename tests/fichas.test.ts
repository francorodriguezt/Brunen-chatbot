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

describe('condiciones del cliente en la ficha (D104)', () => {
  async function conAna() {
    const b = await base();
    await b.pedidos.guardarPedido(pedido('P1'), AHORA);
    await vincularTodo(b.clientes);
    return { ...b, ana: (await b.clientes.clienteDeTelefono('56911111111')) as number };
  }

  it('se guardan el precio especial, los vacíos y el bloqueo, y el bot los lee con la dirección vigente', async () => {
    const { clientes, ana } = await conAna();
    expect(await clientes.ficha(ana)).toMatchObject({ precioEspecial20L: null, vaciosPendientes: 0, bloqueado: false });
    expect(await clientes.editar(ana, { tipoCliente: 'minimarket', precioEspecial20L: '$1.311', vaciosPendientes: 2, bloqueado: false }, AHORA)).toEqual({ ok: true, valor: true });
    expect(await clientes.ficha(ana)).toMatchObject({ tipoCliente: 'minimarket', precioEspecial20L: 1311, vaciosPendientes: 2, bloqueado: false });
    expect(await clientes.paraBot('56911111111')).toEqual({
      id: ana,
      nombre: 'Ana Prueba',
      tipoCliente: 'minimarket',
      direccion: 'Calle Falsa 123',
      comuna: 'Ñuñoa',
      precioEspecial20L: 1311,
      vaciosPendientes: 2,
      bloqueado: false,
    });
    expect(await clientes.paraBot('56900000000')).toBeNull();
    // Vacío quita el precio especial.
    await clientes.editar(ana, { precioEspecial20L: '', bloqueado: true }, AHORA);
    expect(await clientes.paraBot('56911111111')).toMatchObject({ precioEspecial20L: null, bloqueado: true });
  });

  it('un precio o unos vacíos fuera de rango se rechazan', async () => {
    const { clientes, ana } = await conAna();
    for (const malo of [{ precioEspecial20L: 50 }, { precioEspecial20L: 'mil' }, { vaciosPendientes: -1 }, { vaciosPendientes: 2.5 }, { bloqueado: 'si' }]) {
      expect(await clientes.editar(ana, malo, AHORA)).toEqual({ ok: false, error: 'datos_invalidos' });
    }
  });

  it('al unir, manda el precio de la ficha que queda (o toma el de la otra), se suman los vacíos y el bloqueo pasa', async () => {
    const { pedidos, clientes, ana } = await conAna();
    await pedidos.guardarPedido(pedido('P2', { telefono: '56922222222', nombre: 'Ana Prueba (local)' }), AHORA + DIA);
    await vincularTodo(clientes);
    const local = (await clientes.clienteDeTelefono('56922222222')) as number;
    await clientes.editar(ana, { vaciosPendientes: 1 }, AHORA);
    await clientes.editar(local, { precioEspecial20L: 1311, vaciosPendientes: 3, bloqueado: true }, AHORA);
    await clientes.unir(ana, local, AHORA);
    expect(await clientes.ficha(ana)).toMatchObject({ precioEspecial20L: 1311, vaciosPendientes: 4, bloqueado: true });
  });

  it('sin la migración 0018 la ficha se lee y se edita igual, con las condiciones por defecto', async () => {
    const db = crearBaseSqlite('0018');
    const pedidos = new RepositorioD1(db, () => 1);
    const clientes = new RepositorioClientes(db);
    await pedidos.guardarPedido(pedido('P1'), AHORA);
    await vincularTodo(clientes);
    const ana = (await clientes.clienteDeTelefono('56911111111')) as number;
    // El panel manda las condiciones tal como las leyó: no cambian, así que no se escriben.
    expect(await clientes.editar(ana, { nombre: 'Ana P.', precioEspecial20L: null, vaciosPendientes: 0, bloqueado: false }, AHORA)).toEqual({ ok: true, valor: true });
    expect(await clientes.ficha(ana)).toMatchObject({ nombre: 'Ana P.', precioEspecial20L: null, vaciosPendientes: 0, bloqueado: false });
    expect(await clientes.paraBot('56911111111')).toMatchObject({ precioEspecial20L: null, bloqueado: false });
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

describe('borrar los datos de un cliente que lo pide (D87)', () => {
  const ANA = '56911111111';
  const ANA_OTRO = '56933333333';
  const BETO = '56922222222';

  /** Ana tiene dos teléfonos, un pedido fijo, avisos, memoria del bot y una dirección que comparte con Beto. Todo ficticio. */
  async function conDosClientes() {
    const { db, pedidos, clientes } = await base();
    await pedidos.guardarPedido(pedido('P261020-AAAAA', { estado: 'Entregado' as PedidoARegistrar['estado'], observaciones: 'Pidió factura', notasRepartidor: 'Timbre 4B' }), AHORA - 30 * DIA);
    await pedidos.guardarPedido(pedido('P261021-AAAAB', { estado: 'Cancelado' as PedidoARegistrar['estado'] }), AHORA - 20 * DIA);
    await pedidos.guardarPedido(pedido('P261022-AAAAC', { telefono: BETO, nombre: 'Beto Prueba', estado: 'Entregado' as PedidoARegistrar['estado'] }), AHORA - 10 * DIA);
    await vincularTodo(clientes);
    const ana = (await clientes.clienteDeTelefono(ANA)) as number;
    const beto = (await clientes.clienteDeTelefono(BETO)) as number;
    await clientes.agregarTelefono(ana, ANA_OTRO, AHORA);
    await clientes.registrarDireccion(ana, 'Pasaje Solo 9', 'Macul', '', AHORA - DIA);
    // Un pedido del otro teléfono que todavía no se asoció a la ficha.
    db.sql(
      "INSERT INTO pedidos (id, creado_en, telefono, nombre, comuna, direccion, fecha_entrega, estado, lineas, total, actualizado_en) VALUES ('P261023-AAAAD', ?, ?, 'Ana', 'Macul', 'Pasaje Solo 9', '2026-10-23', 'Entregado', '[]', 4500, ?)",
      AHORA - 5 * DIA,
      ANA_OTRO,
      AHORA - 5 * DIA,
    );
    await pedidos.guardarAviso({ tipo: 'reclamo', telefono: ANA, nombre: 'Ana Prueba', resumen: 'Reclamo de Ana', motivos: ['reclamo'], texto: 'venía roto' }, 'wamid.ana', AHORA - DIA);
    await pedidos.guardarAviso({ tipo: 'reclamo', telefono: BETO, nombre: 'Beto Prueba', resumen: 'Reclamo de Beto', motivos: [], texto: 'tarde' }, 'wamid.beto', AHORA - DIA);
    for (const tel of [ANA, BETO]) {
      db.sql('INSERT INTO conversaciones (telefono, estado, actualizado_en) VALUES (?, ?, ?)', tel, '{}', AHORA);
      db.sql('INSERT INTO ultimos_pedidos (telefono, items, actualizado_en) VALUES (?, ?, ?)', tel, '[]', AHORA);
      db.sql('INSERT INTO mensajes_pendientes (wamid, telefono, texto, recibido_en) VALUES (?, ?, ?, ?)', `wamid.p.${tel}`, tel, 'hola', AHORA);
      db.sql('INSERT INTO conversaciones_tomadas (telefono, hasta, ultimo_eco_en) VALUES (?, ?, ?)', tel, AHORA + 3600, AHORA);
      db.sql('INSERT INTO mensajes_procesados (wamid, recibido_en, telefono) VALUES (?, ?, ?)', `wamid.m.${tel}`, AHORA, tel);
    }
    db.sql("INSERT INTO pedidos_fijos (cliente_id, telefono, lineas, cada_dias, proxima_fecha, creado_en, actualizado_en) VALUES (?, ?, '[]', 7, '2026-11-30', ?, ?)", ana, ANA, AHORA, AHORA);
    // "Calle Falsa 123" es de los dos (un edificio); "Pasaje Solo 9" es solo de Ana.
    await clientes.registrarDireccion(beto, 'Calle Falsa 123', 'Ñuñoa', '', AHORA - DIA);
    for (const [direccion, comuna] of [['Calle Falsa 123', 'Ñuñoa'], ['Pasaje Solo 9', 'Macul']]) {
      db.sql("INSERT INTO puntos (clave, lat, lng, origen, actualizado_en) VALUES (?, -33.45, -70.6, 'manual', ?)", claveDeDireccion(direccion as string, comuna as string), AHORA);
    }
    return { db, pedidos, clientes, ana, beto };
  }

  it('borra todo lo que identifica al cliente y deja sus pedidos sin datos personales, para la contabilidad', async () => {
    const { db, clientes, ana, beto } = await conDosClientes();
    // Lo que escribió el repartidor en un No se pudo puede nombrar a alguien.
    db.sql("INSERT INTO historial_pedidos (pedido_id, en, quien, accion, detalle) VALUES ('P261020-AAAAA', ?, 'Repartidor: Prueba', 'no_entregado', 'No estaba o no contestó (la vecina dijo que viaja)')", AHORA);
    db.sql("INSERT INTO historial_pedidos (pedido_id, en, quien, accion, detalle) VALUES ('P261022-AAAAC', ?, 'Repartidor: Prueba', 'no_entregado', 'Estaba cerrado (portón)')", AHORA);
    db.sql("INSERT INTO historial_pedidos (pedido_id, en, quien, accion, detalle) VALUES ('P261023-AAAAD', ?, 'Repartidor: Prueba', 'entrega', 'Retiró 1 vacío. Nota: se lo dejé a su hija')", AHORA);
    // El motivo de una cancelación lo escribe la operadora con sus palabras (D97).
    db.sql("INSERT INTO historial_pedidos (pedido_id, en, quien, accion, detalle) VALUES ('P261021-AAAAB', ?, 'operadora@brunen.test', 'estado: Confirmado -> Cancelado', 'Ana se va de viaje con su hija')", AHORA);
    const r = await clientes.olvidar(ana, 'operadora@brunen.test', AHORA);
    expect(r).toMatchObject({ ok: true, valor: { pedidos: 3, avisos: 1, telefonos: 2, direcciones: 2 } });
    if (!r.ok) return;
    expect(r.valor.aMano[0]).toContain(`busca ${ANA} o ${ANA_OTRO}`);

    expect(db.sql("SELECT id, nombre, telefono, direccion, notas_repartidor, observaciones, cliente_id, total, estado FROM pedidos WHERE id != 'P261022-AAAAC' ORDER BY id")).toEqual([
      { id: 'P261020-AAAAA', nombre: '', telefono: '', direccion: '', notas_repartidor: '', observaciones: '', cliente_id: 0, total: 6600, estado: 'Entregado' },
      { id: 'P261021-AAAAB', nombre: '', telefono: '', direccion: '', notas_repartidor: '', observaciones: '', cliente_id: 0, total: 6600, estado: 'Cancelado' },
      { id: 'P261023-AAAAD', nombre: '', telefono: '', direccion: '', notas_repartidor: '', observaciones: '', cliente_id: 0, total: 4500, estado: 'Entregado' },
    ]);
    expect(db.sql("SELECT COUNT(*) AS n FROM historial_pedidos WHERE accion = 'datos borrados' AND quien = 'operadora@brunen.test'")).toEqual([{ n: 3 }]);
    expect(db.sql("SELECT detalle FROM historial_pedidos WHERE accion LIKE 'estado:%'")).toEqual([{ detalle: 'Detalle borrado a pedido del cliente.' }]);
    expect(db.sql("SELECT pedido_id, detalle FROM historial_pedidos WHERE accion IN ('no_entregado', 'entrega') ORDER BY pedido_id")).toEqual([
      { pedido_id: 'P261020-AAAAA', detalle: 'Detalle borrado a pedido del cliente.' },
      { pedido_id: 'P261022-AAAAC', detalle: 'Estaba cerrado (portón)' },
      { pedido_id: 'P261023-AAAAD', detalle: 'Detalle borrado a pedido del cliente.' },
    ]);

    // Lo de Ana ya no está; lo de Beto sigue igual.
    expect(db.sql('SELECT id FROM clientes')).toEqual([{ id: beto }]);
    expect(db.sql('SELECT telefono FROM telefonos_cliente')).toEqual([{ telefono: BETO }]);
    expect(db.sql('SELECT DISTINCT cliente_id FROM direcciones_cliente')).toEqual([{ cliente_id: beto }]);
    expect(db.sql('SELECT telefono, nombre, texto, resumen FROM avisos ORDER BY id')).toEqual([
      { telefono: '', nombre: '', texto: '', resumen: 'Datos del cliente borrados a su pedido.' },
      { telefono: BETO, nombre: 'Beto Prueba', texto: 'tarde', resumen: 'Reclamo de Beto' },
    ]);
    for (const tabla of ['conversaciones', 'ultimos_pedidos', 'mensajes_pendientes', 'conversaciones_tomadas']) {
      expect(db.sql(`SELECT telefono FROM ${tabla}`)).toEqual([{ telefono: BETO }]);
    }
    expect(db.sql('SELECT telefono FROM mensajes_procesados ORDER BY wamid')).toEqual([{ telefono: '' }, { telefono: BETO }]);
    expect(db.sql('SELECT COUNT(*) AS n FROM pedidos_fijos')).toEqual([{ n: 0 }]);
    expect(db.sql('SELECT clave FROM puntos')).toEqual([{ clave: claveDeDireccion('Calle Falsa 123', 'Ñuñoa') }]);
    expect(db.sql("SELECT nombre, telefono, cliente_id FROM pedidos WHERE id = 'P261022-AAAAC'")).toEqual([{ nombre: 'Beto Prueba', telefono: BETO, cliente_id: beto }]);
    // Nada vuelve a crear su ficha.
    expect(await vincularTodo(clientes)).toBe(0);
    expect(db.sql('SELECT COUNT(*) AS n FROM clientes')).toEqual([{ n: 1 }]);
  });

  it('no se puede con un pedido sin entregar, y no toca nada', async () => {
    const { db, pedidos, clientes, ana } = await conDosClientes();
    await pedidos.guardarPedido(pedido('P261124-AAAAE', { estado: 'Confirmado' as PedidoARegistrar['estado'] }), AHORA);
    await vincularTodo(clientes);
    expect(await clientes.olvidar(ana, 'x', AHORA)).toEqual({ ok: false, error: 'pedidos_vivos' });
    expect(db.sql('SELECT COUNT(*) AS n FROM telefonos_cliente WHERE cliente_id = ?', ana)).toEqual([{ n: 2 }]);
    expect(db.sql("SELECT COUNT(*) AS n FROM historial_pedidos WHERE accion = 'datos borrados'")).toEqual([{ n: 0 }]);
  });

  it('un cliente que no existe da no_existe', async () => {
    const { clientes } = await base();
    expect(await clientes.olvidar(999, 'x', AHORA)).toEqual({ ok: false, error: 'no_existe' });
  });
});
