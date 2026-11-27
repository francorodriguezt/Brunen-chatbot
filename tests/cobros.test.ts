import { describe, expect, it } from 'vitest';
import { RepositorioCobros, estadoDeCobro, montoValido, saldoDe } from '../src/cobros';
import { RepositorioEntregas } from '../src/entregas';
import { RepositorioClientes } from '../src/fichas';
import type { PedidoARegistrar } from '../src/pedidos';
import { manejarApi } from '../src/panel/api';
import { manejarCobros } from '../src/panel/cobros-api';
import { saldoPorCobrar } from '../src/reparto';
import { RepositorioD1 } from '../src/repositorio';
import { crearBaseSqlite } from './ayudas';

const AHORA = 1794582000; // viernes 13 de noviembre de 2026, mediodía en Santiago
const HOY = '2026-11-13';

// Todo ficticio. Cada pedido de 3 de 20 L cuesta $9.900.
function pedido(id: string, cambios: Partial<PedidoARegistrar> = {}): PedidoARegistrar {
  return {
    idPedido: id,
    telefono: '56911111111',
    nombre: 'Ana Prueba',
    lineas: [{ tipo: '20L', cantidad: 3, precioUnitario: 3300, subtotal: 9900 }],
    fechaEntrega: HOY,
    estado: 'Confirmado' as PedidoARegistrar['estado'],
    comuna: 'Ñuñoa',
    direccion: 'Calle Falsa 123',
    notasRepartidor: '',
    envasesARetirar: 3,
    observaciones: '',
    ...cambios,
  };
}

async function base(...pedidos: PedidoARegistrar[]) {
  const db = crearBaseSqlite();
  const repositorio = new RepositorioD1(db, () => 1);
  for (const p of pedidos) await repositorio.guardarPedido(p, AHORA - 1000);
  return { db, repositorio, cobros: new RepositorioCobros(db), entregas: new RepositorioEntregas(db) };
}

const A = 'P261113-AAAAA';
const B = 'P261113-BBBBB';
const quien = 'operadora@brunen.test';
const por = (origen: 'repartidor' | 'panel' = 'panel') => ({ quien, ahora: AHORA, origen });

describe('el estado de cobro de un pedido', () => {
  it.each([
    [9900, 0, 0, 'pendiente'],
    [9900, 4000, 0, 'abonado'],
    [9900, 9900, 0, 'informado'],
    [9900, 9900, 4000, 'informado'],
    [9900, 9900, 9900, 'pagado'],
    [9900, 12000, 9900, 'pagado'],
    [null, 5000, 0, 'informado'],
    [null, 5000, 5000, 'pagado'],
  ] as const)('total %s, pagado %s, verificado %s: %s', (total, pagado, verificado, esperado) => {
    expect(estadoDeCobro(total, pagado, verificado)).toBe(esperado);
  });

  it('el saldo no baja de cero y sin precio no se sabe', () => {
    expect(saldoDe(9900, 4000)).toBe(5900);
    expect(saldoDe(9900, 12000)).toBe(0);
    expect(saldoDe(null, 0)).toBeNull();
  });

  it('un monto es un entero de pesos razonable; acepta "$4.500"', () => {
    expect(montoValido('$4.500')).toBe(4500);
    expect(montoValido(4500)).toBe(4500);
    for (const malo of [0, -5, 12.5, 'mil', '', null, 5_000_000]) expect(montoValido(malo)).toBeNull();
  });
});

describe('anotar y verificar pagos', () => {
  it('un abono deja el pedido abonado; el resto verificado lo deja pagado', async () => {
    const { repositorio, cobros } = await base(pedido(A));
    expect(await cobros.registrar(A, { monto: 4000, forma: 'transferencia' }, por())).toMatchObject({ ok: true });
    expect(await repositorio.obtenerPedido(A)).toMatchObject({ estadoPago: 'abonado', montoPagado: 4000, montoVerificado: 0 });
    const resto = await cobros.registrar(A, { monto: '$5.900', forma: 'efectivo', verificado: true }, por());
    expect(resto).toMatchObject({ ok: true });
    // Pagó todo, pero solo una parte está verificada: falta revisar la transferencia.
    expect(await repositorio.obtenerPedido(A)).toMatchObject({ estadoPago: 'informado', montoPagado: 9900, montoVerificado: 5900 });
    const [primero] = await cobros.pagosDe(A);
    expect(await cobros.decidir(primero?.id as number, 'verificado', quien, AHORA + 60)).toEqual({ ok: true, valor: true });
    expect(await repositorio.obtenerPedido(A)).toMatchObject({ estadoPago: 'pagado', montoVerificado: 9900 });
    expect((await repositorio.historialDe(A)).map((h) => h.accion)).toContain('pago');
  });

  it('un pago rechazado deja de contar y uno ya decidido no cambia', async () => {
    const { repositorio, cobros } = await base(pedido(A));
    const r = await cobros.registrar(A, { monto: 9900, forma: 'transferencia' }, por());
    const id = r.ok ? r.valor : 0;
    expect((await repositorio.obtenerPedido(A))?.estadoPago).toBe('informado');
    expect(await cobros.decidir(id, 'rechazado', quien, AHORA)).toEqual({ ok: true, valor: true });
    expect(await repositorio.obtenerPedido(A)).toMatchObject({ estadoPago: 'pendiente', montoPagado: 0 });
    expect(await cobros.decidir(id, 'verificado', quien, AHORA)).toEqual({ ok: false, error: 'ya_decidido' });
    expect(await cobros.decidir(999, 'verificado', quien, AHORA)).toEqual({ ok: false, error: 'no_existe' });
  });

  it('rechaza montos, formas y pedidos que no sirven', async () => {
    const { cobros } = await base(pedido(A));
    expect(await cobros.registrar(A, { monto: 0, forma: 'efectivo' }, por())).toEqual({ ok: false, error: 'datos_invalidos' });
    expect(await cobros.registrar(A, { monto: 100, forma: 'cheque' }, por())).toEqual({ ok: false, error: 'datos_invalidos' });
    expect(await cobros.registrar(A, { monto: 100, forma: 'efectivo', verificado: 'si' }, por())).toEqual({ ok: false, error: 'datos_invalidos' });
    expect(await cobros.registrar('P261113-ZZZZZ', { monto: 100, forma: 'efectivo' }, por())).toEqual({ ok: false, error: 'no_existe' });
  });

  it('lo que está por verificar son las transferencias y lo anotado en el panel, no el efectivo del repartidor', async () => {
    const { cobros } = await base(pedido(A), pedido(B, { telefono: '56922222222', nombre: 'Bruno Prueba' }));
    await cobros.registrar(A, { monto: 9900, forma: 'transferencia', nota: 'comprobante de las 10:00' }, por());
    await cobros.cobroDeEntrega(B, true, { quien: 'Repartidor Prueba', ahora: AHORA, fecha: HOY });
    const lista = await cobros.porVerificar();
    expect(lista).toHaveLength(1);
    expect(lista[0]).toMatchObject({ pedidoId: A, monto: 9900, forma: 'transferencia', nombre: 'Ana Prueba', totalPedido: 9900, nota: 'comprobante de las 10:00' });
  });

  it('marcar pagado a mano en el editor anota un pago verificado por lo que falta; pendiente los deja sin contar', async () => {
    const { repositorio, cobros } = await base(pedido(A));
    await cobros.registrar(A, { monto: 4000, forma: 'transferencia' }, por());
    await cobros.alinearConEstadoManual(A, 'pagado', 'efectivo', quien, AHORA);
    expect(await repositorio.obtenerPedido(A)).toMatchObject({ estadoPago: 'informado', montoPagado: 9900, montoVerificado: 5900 });
    await cobros.alinearConEstadoManual(A, 'pendiente', 'efectivo', quien, AHORA + 1);
    expect(await repositorio.obtenerPedido(A)).toMatchObject({ estadoPago: 'pendiente', montoPagado: 0 });
    expect((await cobros.pagosDe(A)).every((p) => p.estado === 'rechazado')).toBe(true);
  });
});

describe('el cobro del repartidor al entregar', () => {
  it('cobra lo que falta, no el total, si hubo un abono', async () => {
    const { repositorio, cobros, entregas } = await base(pedido(A, { formaPago: 'efectivo' } as Partial<PedidoARegistrar>));
    await cobros.registrar(A, { monto: 3000, forma: 'transferencia', verificado: true }, por());
    await entregas.entregar(A, { vacios: 3, cobrado: true }, { fecha: HOY, quien: 'Repartidor Prueba', ahora: AHORA });
    expect(await repositorio.obtenerPedido(A)).toMatchObject({ estadoPago: 'informado', montoPagado: 9900, montoVerificado: 3000 });
    expect((await entregas.deDia(HOY)).get(A)?.cobrado).toBe(6900);
  });

  it('corregir la entrega no duplica el cobro; sin cobrar, lo quita', async () => {
    const { db, repositorio, entregas } = await base(pedido(A));
    const opciones = { fecha: HOY, quien: 'Repartidor Prueba', ahora: AHORA };
    await entregas.entregar(A, { vacios: 3, cobrado: true }, opciones);
    await entregas.entregar(A, { vacios: 3, cobrado: true }, { ...opciones, ahora: AHORA + 30 });
    expect(db.sql("SELECT COUNT(*) AS n FROM pagos WHERE pedido_id = 'P261113-AAAAA'")).toEqual([{ n: 1 }]);
    await entregas.entregar(A, { vacios: 3, cobrado: false }, { ...opciones, ahora: AHORA + 60 });
    expect(db.sql("SELECT COUNT(*) AS n FROM pagos WHERE pedido_id = 'P261113-AAAAA'")).toEqual([{ n: 0 }]);
    expect(await repositorio.obtenerPedido(A)).toMatchObject({ estadoPago: 'pendiente', montoPagado: 0 });
  });

  it('un cobro ya verificado en la rendición no se borra al corregir la entrega', async () => {
    const { db, cobros, entregas } = await base(pedido(A));
    const opciones = { fecha: HOY, quien: 'Repartidor Prueba', ahora: AHORA };
    await entregas.entregar(A, { vacios: 3, cobrado: true }, opciones);
    await cobros.guardarRendicion(HOY, { entregado: 9900 }, quien, AHORA + 100);
    await entregas.entregar(A, { vacios: 2, cobrado: true }, { ...opciones, ahora: AHORA + 200 });
    expect(db.sql("SELECT monto, estado FROM pagos WHERE pedido_id = 'P261113-AAAAA'")).toEqual([{ monto: 9900, estado: 'verificado' }]);
  });
});

describe('la rendición del día', () => {
  it('suma el efectivo cobrado, descuenta la bencina y verifica los cobros', async () => {
    const { repositorio, cobros, entregas } = await base(pedido(A), pedido(B, { telefono: '56922222222', nombre: 'Bruno Prueba' }));
    const opciones = { fecha: HOY, quien: 'Repartidor Prueba', ahora: AHORA };
    await entregas.entregar(A, { vacios: 3, cobrado: true }, opciones);
    await entregas.entregar(B, { vacios: 3, cobrado: true }, opciones);
    expect(await cobros.rendicionDe(HOY)).toMatchObject({ efectivoCobrado: 19800, cobros: 2, porVerificar: 2, guardada: null });

    const r = await cobros.guardarRendicion(HOY, { bencina: '$5.000', entregado: 14800, nota: 'cargó bencina' }, quien, AHORA + 3600);
    expect(r).toMatchObject({ ok: true, valor: { efectivoCobrado: 19800, porVerificar: 0, guardada: { bencina: 5000, entregado: 14800, diferencia: 0, nota: 'cargó bencina', registradoPor: quien } } });
    expect(await repositorio.obtenerPedido(A)).toMatchObject({ estadoPago: 'pagado', montoVerificado: 9900 });

    // Si entrega menos de lo que corresponde, la diferencia lo dice (positiva = falta plata).
    const falta = await cobros.guardarRendicion(HOY, { bencina: 5000, entregado: 14000 }, quien, AHORA + 3700);
    expect(falta).toMatchObject({ ok: true, valor: { guardada: { diferencia: 800 } } });
  });

  it('no acepta una rendición sin lo entregado ni montos raros', async () => {
    const { cobros } = await base(pedido(A));
    expect(await cobros.guardarRendicion(HOY, { entregado: '' }, quien, AHORA)).toEqual({ ok: false, error: 'datos_invalidos' });
    expect(await cobros.guardarRendicion(HOY, { entregado: -1 }, quien, AHORA)).toEqual({ ok: false, error: 'datos_invalidos' });
    expect(await cobros.guardarRendicion('hoy', { entregado: 0 }, quien, AHORA)).toEqual({ ok: false, error: 'datos_invalidos' });
  });
});

describe('lo que debe cada cliente', () => {
  async function conDeudas() {
    const b = await base(pedido(A), pedido(B, { telefono: '56922222222', nombre: 'Bruno Prueba', fechaEntrega: '2026-11-10' }), pedido('P261113-CCCCC', { telefono: '56933333333', nombre: 'Carla Prueba' }));
    for (const id of [A, B, 'P261113-CCCCC']) await b.repositorio.cambiarEstado(id, 'Entregado', 'prueba', AHORA - 500);
    return b;
  }

  it('suma lo que falta por cliente, de mayor a menor, y no incluye lo pagado', async () => {
    const { cobros } = await conDeudas();
    await cobros.registrar('P261113-CCCCC', { monto: 9900, forma: 'transferencia', verificado: true }, por());
    await cobros.registrar(A, { monto: 4000, forma: 'efectivo', verificado: true }, por());
    const saldos = await cobros.saldos();
    expect(saldos.map((s) => [s.nombre, s.saldo, s.desde])).toEqual([
      ['Bruno Prueba', 9900, '2026-11-10'],
      ['Ana Prueba', 5900, HOY],
    ]);
  });

  it('un cliente a crédito aparece marcado; los pedidos sin entregar no cuentan', async () => {
    const { db, repositorio, cobros } = await conDeudas();
    await repositorio.guardarPedido(pedido('P261113-DDDDD', { telefono: '56944444444', nombre: 'Dani Prueba' }), AHORA);
    const fichas = new RepositorioClientes(db);
    for (let i = 0; i < 5; i++) await fichas.vincularPendientes(AHORA);
    const ana = (await fichas.clienteDeTelefono('56911111111')) as number;
    expect(await fichas.editar(ana, { credito: true }, AHORA)).toEqual({ ok: true, valor: true });
    expect(await fichas.ficha(ana)).toMatchObject({ credito: true });
    const saldos = await cobros.saldos();
    expect(saldos.find((s) => s.nombre === 'Ana Prueba')).toMatchObject({ credito: true });
    expect(saldos.some((s) => s.nombre === 'Dani Prueba')).toBe(false);
  });
});

describe('la API de cobros', () => {
  const pedirApi = async (ctx: Awaited<ReturnType<typeof base>>, ruta: string, cuerpo?: unknown) => {
    const url = new URL(`https://panel.example${ruta}`);
    const request = new Request(url, cuerpo === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-panel': '1' }, body: JSON.stringify(cuerpo) });
    const respuesta = await manejarCobros(request, url, { cobros: ctx.cobros, repositorio: ctx.repositorio, ahoraSegundos: AHORA, correo: quien });
    return { estado: respuesta?.status, datos: (await respuesta?.json()) as Record<string, unknown> };
  };

  it('anota un pago, lo muestra con el pedido y lo verifica', async () => {
    const ctx = await base(pedido(A));
    const anotado = await pedirApi(ctx, `/api/pedidos/${A}/pagos`, { monto: '$4.000', forma: 'transferencia', nota: 'abono' });
    expect(anotado.estado).toBe(201);
    const del = await pedirApi(ctx, `/api/pedidos/${A}/pagos`);
    expect(del.datos).toMatchObject({ total: 9900, pagado: 4000, saldo: 5900, estado: 'abonado' });
    const hoy = await pedirApi(ctx, `/api/cobros?fecha=${HOY}`);
    const lista = hoy.datos.porVerificar as Array<{ id: number }>;
    expect(lista).toHaveLength(1);
    expect((await pedirApi(ctx, `/api/pagos/${lista[0]?.id}/verificar`, {})).estado).toBe(200);
    expect((await pedirApi(ctx, `/api/pagos/${lista[0]?.id}/verificar`, {})).estado).toBe(409);
  });

  it('rechaza lo mal escrito y los días que no llegaron; las escrituras piden la cabecera del panel', async () => {
    const ctx = await base(pedido(A));
    expect((await pedirApi(ctx, `/api/pedidos/${A}/pagos`, { monto: 'mucho', forma: 'efectivo' })).estado).toBe(422);
    expect((await pedirApi(ctx, '/api/cobros/rendicion', { fecha: '2026-12-31', entregado: 0 })).estado).toBe(422);
    expect((await pedirApi(ctx, '/api/cobros?fecha=ayer')).estado).toBe(400);
    const url = new URL(`https://panel.example/api/pedidos/${A}/pagos`);
    const sinCabecera = await manejarCobros(new Request(url, { method: 'POST', body: '{}' }), url, { cobros: ctx.cobros, repositorio: ctx.repositorio, ahoraSegundos: AHORA, correo: quien });
    expect(sinCabecera?.status).toBe(400);
  });

  it('guarda la rendición del día', async () => {
    const ctx = await base(pedido(A));
    await ctx.entregas.entregar(A, { vacios: 3, cobrado: true }, { fecha: HOY, quien: 'Repartidor Prueba', ahora: AHORA });
    const r = await pedirApi(ctx, '/api/cobros/rendicion', { fecha: HOY, bencina: 0, entregado: 9900 });
    expect(r.estado).toBe(200);
    expect(r.datos.rendicion).toMatchObject({ efectivoCobrado: 9900, porVerificar: 0, guardada: { diferencia: 0 } });
  });
});

describe('cambiar los bidones de un pedido ya pagado', () => {
  it('vuelve a faltar la diferencia: no queda como pagado y el repartidor la cobra', async () => {
    const { repositorio, cobros } = await base(pedido(A));
    await cobros.registrar(A, { monto: 9900, forma: 'transferencia', verificado: true }, por());
    const antes = await repositorio.obtenerPedido(A);
    const url = new URL(`https://panel.example/api/pedidos/${A}/editar`);
    const cuerpo = { actualizadoEn: antes?.actualizadoEn, lineas: [{ tipo: '20L', cantidad: 4, precioUnitario: 3300 }] };
    const request = new Request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-panel': '1' }, body: JSON.stringify(cuerpo) });
    const respuesta = await manejarApi(request, url, { repositorio, cobros, correo: quien, ahoraSegundos: AHORA });
    expect(respuesta?.status).toBe(200);
    expect(((await respuesta?.json()) as { pedido: unknown }).pedido).toMatchObject({ total: 13200, estadoPago: 'abonado' });
    const despues = await repositorio.obtenerPedido(A);
    expect(despues).toMatchObject({ total: 13200, estadoPago: 'abonado', montoPagado: 9900 });
    expect(saldoPorCobrar(despues!)).toBe(3300);
  });
});
