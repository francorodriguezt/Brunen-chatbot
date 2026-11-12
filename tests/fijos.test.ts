import { describe, expect, it } from 'vitest';
import { RepositorioClientes } from '../src/fichas';
import { RepositorioFijos, idDePedidoFijo } from '../src/fijos';
import type { PedidoARegistrar } from '../src/pedidos';
import { RepositorioD1 } from '../src/repositorio';
import { crearBaseSqlite } from './ayudas';

const AHORA = 1793000000;

// Todo ficticio.
function pedido(cambios: Partial<PedidoARegistrar> = {}): PedidoARegistrar {
  return {
    idPedido: 'P261020-AAAAA',
    telefono: '56911111111',
    nombre: 'Empresa Prueba',
    lineas: [{ tipo: '20L', cantidad: 10, precioUnitario: null, subtotal: null }],
    fechaEntrega: '2026-10-20',
    estado: 'Pendiente_Confirmacion',
    comuna: 'Providencia',
    direccion: 'Av. Prueba 100, oficina 5',
    notasRepartidor: 'Recepción',
    envasesARetirar: 0,
    observaciones: '',
    ...cambios,
  };
}

async function conCliente() {
  const db = crearBaseSqlite();
  const pedidos = new RepositorioD1(db, () => 1);
  await pedidos.guardarPedido(pedido(), AHORA - 1000);
  const clientes = new RepositorioClientes(db);
  await clientes.vincularPendientes(AHORA - 900);
  const id = (await clientes.clienteDeTelefono('56911111111')) as number;
  return { db, pedidos, clientes, fijos: new RepositorioFijos(db), id };
}

const FIJO = { tipo: '20L', cantidad: 10, cadaDias: 7, proximaFecha: '2026-11-16', activo: true, notas: 'Plan mensual' };

describe('pedidos fijos (D59)', () => {
  it('se guarda uno por cliente, con el primer teléfono de su ficha, y se puede cambiar', async () => {
    const { fijos, id } = await conCliente();
    const r = await fijos.guardar(id, FIJO, AHORA);
    expect(r).toMatchObject({ ok: true, fijo: { clienteId: id, telefono: '56911111111', lineas: [{ tipo: '20L', cantidad: 10 }], cadaDias: 7, proximaFecha: '2026-11-16', activo: true } });
    await fijos.guardar(id, { ...FIJO, cantidad: 12, activo: false }, AHORA + 1);
    expect(await fijos.deCliente(id)).toMatchObject({ lineas: [{ tipo: '20L', cantidad: 12 }], activo: false });
  });

  it('rechaza datos raros: tamaño, cantidad, ritmo o fecha que no sirven', async () => {
    const { fijos, id } = await conCliente();
    for (const malo of [{ tipo: '5L' }, { cantidad: 0 }, { cantidad: 2.5 }, { cadaDias: 0 }, { cadaDias: 90 }, { proximaFecha: 'lunes' }, { activo: 'si' }]) {
      expect(await fijos.guardar(id, { ...FIJO, ...malo }, AHORA)).toEqual({ ok: false, error: 'datos_invalidos' });
    }
    expect(await fijos.guardar(999, FIJO, AHORA)).toEqual({ ok: false, error: 'sin_telefono' });
  });

  it('crea el pedido dos días antes de la entrega, con la dirección vigente, sin precio y pendiente de confirmar, y corre la próxima fecha', async () => {
    const { fijos, pedidos, id } = await conCliente();
    const { fijo } = (await fijos.guardar(id, FIJO, AHORA)) as { ok: true; fijo: { id: number } };
    expect(await fijos.crearLosQueTocan('2026-11-13', AHORA)).toBe(0); // faltan 3 días
    expect(await fijos.crearLosQueTocan('2026-11-14', AHORA)).toBe(1);
    const creado = await pedidos.obtenerPedido(idDePedidoFijo(fijo.id, '2026-11-16'));
    expect(creado).toMatchObject({
      estado: 'Pendiente_Confirmacion',
      fechaEntrega: '2026-11-16',
      direccion: 'Av. Prueba 100, oficina 5',
      comuna: 'Providencia',
      lineas: [{ tipo: '20L', cantidad: 10, precioUnitario: null, subtotal: null }],
    });
    expect(creado?.observaciones).toContain('Pedido fijo (cada 7 días)');
    expect((await fijos.deCliente(id))?.proximaFecha).toBe('2026-11-23');
    expect(await fijos.crearLosQueTocan('2026-11-14', AHORA)).toBe(0); // correrla otra vez no duplica
  });

  it('si la tarea estuvo detenida no crea pedidos del pasado: salta a la próxima fecha que viene', async () => {
    const { fijos, id } = await conCliente();
    await fijos.guardar(id, { ...FIJO, proximaFecha: '2026-11-02' }, AHORA);
    expect(await fijos.crearLosQueTocan('2026-11-20', AHORA)).toBe(0); // el 2, el 9 y el 16 ya pasaron: salta al 23
    expect((await fijos.deCliente(id))?.proximaFecha).toBe('2026-11-23');
    expect(await fijos.crearLosQueTocan('2026-11-21', AHORA)).toBe(1); // dos días antes del 23
    expect((await fijos.deCliente(id))?.proximaFecha).toBe('2026-11-30');
  });

  it('un fijo pausado no crea nada, y un domingo pasa al lunes', async () => {
    const { fijos, pedidos, id } = await conCliente();
    const { fijo } = (await fijos.guardar(id, { ...FIJO, activo: false }, AHORA)) as { ok: true; fijo: { id: number } };
    expect(await fijos.crearLosQueTocan('2026-11-15', AHORA)).toBe(0);
    await fijos.guardar(id, { ...FIJO, proximaFecha: '2026-11-15' }, AHORA); // domingo
    expect(await fijos.crearLosQueTocan('2026-11-14', AHORA)).toBe(1);
    expect(await pedidos.obtenerPedido(idDePedidoFijo(fijo.id, '2026-11-16'))).not.toBeNull();
  });
});
