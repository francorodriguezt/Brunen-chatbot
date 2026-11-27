import { describe, expect, it } from 'vitest';
import { RepositorioEntregas } from '../src/entregas';
import { RepositorioClientes } from '../src/fichas';
import { RepositorioFijos } from '../src/fijos';
import type { PedidoARegistrar } from '../src/pedidos';
import { RepositorioD1 } from '../src/repositorio';
import { crearBaseSqlite } from './ayudas';

// Los vacíos que faltan quedan como deuda del cliente y se retiran la próxima vez (D108). Todo ficticio.
const AHORA = 1794582000; // viernes 13 de noviembre de 2026, mediodía en Santiago
const HOY = '2026-11-13';
const TEL = '56911111111';

function pedido(id: string, cambios: Partial<PedidoARegistrar> = {}): PedidoARegistrar {
  return {
    idPedido: id,
    telefono: TEL,
    nombre: 'Ana Prueba',
    lineas: [{ tipo: '20L', cantidad: 3, precioUnitario: 3300, subtotal: 9900 }],
    fechaEntrega: HOY,
    estado: 'Confirmado' as PedidoARegistrar['estado'],
    comuna: 'Ñuñoa',
    direccion: 'Calle Falsa 123',
    notasRepartidor: '',
    envasesARetirar: 0,
    observaciones: '',
    ...cambios,
  };
}

async function entorno(...pedidos: PedidoARegistrar[]) {
  const db = crearBaseSqlite();
  const repositorio = new RepositorioD1(db, () => 1);
  for (const p of pedidos) await repositorio.guardarPedido(p, AHORA - 1000);
  const clientes = new RepositorioClientes(db);
  for (let i = 0; i < 5; i++) await clientes.vincularPendientes(AHORA);
  const ana = (await clientes.clienteDeTelefono(TEL)) as number;
  return { db, repositorio, clientes, ana, entregas: new RepositorioEntregas(db) };
}

const opciones = (ahora = AHORA) => ({ fecha: HOY, quien: 'Repartidor Prueba', ahora });
const debe = async (clientes: RepositorioClientes, id: number) => (await clientes.ficha(id))?.vaciosPendientes;

describe('vacíos que faltan como deuda (D108)', () => {
  // Para que no sea una carga inicial, el cliente ya tiene una entrega anterior.
  const anterior = pedido('P261110-ANTES', { fechaEntrega: '2026-11-10', estado: 'Entregado' as PedidoARegistrar['estado'] });

  it('si trae menos vacíos que bidones, lo que falta queda en la ficha y el historial lo dice', async () => {
    const { db, clientes, ana, entregas } = await entorno(anterior, pedido('P261113-AAAAA'));
    await entregas.entregar('P261113-AAAAA', { vacios: 1, cobrado: false }, opciones());
    expect(await debe(clientes, ana)).toBe(2);
    expect(db.sql("SELECT detalle FROM historial_pedidos WHERE pedido_id = 'P261113-AAAAA' AND accion = 'entrega'")).toEqual([{ detalle: 'Retiró 1 vacío. Le quedan 2 vacíos por retirar.' }]);
  });

  it('si trae justo uno por bidón, no queda deuda; si trae de más, baja la que tenía', async () => {
    const { clientes, ana, entregas } = await entorno(anterior, pedido('P261113-AAAAA'));
    await clientes.ajustarVacios(ana, 2);
    await entregas.entregar('P261113-AAAAA', { vacios: 3, cobrado: false }, opciones());
    expect(await debe(clientes, ana)).toBe(2);
    const otro = await entorno(anterior, pedido('P261113-AAAAA', { envasesARetirar: 2 }));
    await otro.clientes.ajustarVacios(otro.ana, 2);
    await otro.entregas.entregar('P261113-AAAAA', { vacios: 5, cobrado: false }, opciones());
    expect(await debe(otro.clientes, otro.ana)).toBe(0);
  });

  it('nunca baja de 0, aunque traiga muchos de más', async () => {
    const { clientes, ana, entregas } = await entorno(anterior, pedido('P261113-AAAAA'));
    await entregas.entregar('P261113-AAAAA', { vacios: 9, cobrado: false }, opciones());
    expect(await debe(clientes, ana)).toBe(0);
  });

  it('corregir la entrega el mismo día no cuenta dos veces la deuda', async () => {
    const { clientes, ana, entregas } = await entorno(anterior, pedido('P261113-AAAAA'));
    await entregas.entregar('P261113-AAAAA', { vacios: 1, cobrado: false }, opciones());
    await entregas.entregar('P261113-AAAAA', { vacios: 1, cobrado: false }, opciones(AHORA + 30)); // la cola sin señal reenvía
    expect(await debe(clientes, ana)).toBe(2);
    await entregas.entregar('P261113-AAAAA', { vacios: 3, cobrado: false }, opciones(AHORA + 60)); // era un error: sí trajo los 3
    expect(await debe(clientes, ana)).toBe(0);
  });

  it('un cliente sin entregas anteriores (carga inicial) no queda debiendo vacíos', async () => {
    const { clientes, ana, entregas } = await entorno(pedido('P261113-AAAAA'));
    await entregas.entregar('P261113-AAAAA', { vacios: 0, cobrado: false }, opciones());
    expect(await debe(clientes, ana)).toBe(0);
  });

  it('un pedido sin ficha entrega igual y no falla', async () => {
    const db = crearBaseSqlite();
    await new RepositorioD1(db, () => 1).guardarPedido(pedido('P261113-AAAAA'), AHORA - 1000);
    expect(await new RepositorioEntregas(db).entregar('P261113-AAAAA', { vacios: 0, cobrado: false }, opciones())).toEqual({ ok: true });
  });

  it('las estadísticas salen de las fichas: quien debe aparece y quien ya devolvió, no', async () => {
    const { clientes, ana, entregas } = await entorno(anterior, pedido('P261113-AAAAA'));
    await entregas.entregar('P261113-AAAAA', { vacios: 1, cobrado: false }, opciones());
    expect(await clientes.conVaciosPendientes()).toEqual([{ telefono: TEL, nombre: 'Ana Prueba', faltan: 2, ultimoDia: HOY }]);
    await clientes.ajustarVacios(ana, -2);
    expect(await clientes.conVaciosPendientes()).toEqual([]);
  });

  it('el pedido fijo nace con los vacíos que el cliente debe de antes', async () => {
    const { db, repositorio, clientes, ana } = await entorno(anterior);
    await clientes.ajustarVacios(ana, 3);
    const fijos = new RepositorioFijos(db);
    const creado = await fijos.guardar(ana, { tipo: '20L', cantidad: 2, cadaDias: 7, proximaFecha: '2026-11-16', activo: true, notas: '' }, AHORA);
    expect(creado.ok).toBe(true);
    expect(await fijos.crearLosQueTocan('2026-11-14', AHORA)).toBe(1);
    const nuevo = (await repositorio.listarPedidos()).find((p) => p.id.startsWith('F'));
    expect(nuevo?.envasesARetirar).toBe(3);
  });
});
