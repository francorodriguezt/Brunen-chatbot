import { describe, expect, it } from 'vitest';
import { cierreDelDia } from '../src/caja';
import { RepositorioEntregas } from '../src/entregas';
import type { PedidoARegistrar } from '../src/pedidos';
import { armarReparto } from '../src/reparto';
import { RepositorioD1 } from '../src/repositorio';
import { crearBaseSqlite } from './ayudas';

const AHORA = Math.floor(new Date('2026-11-13T12:00:00-03:00').getTime() / 1000);
const FECHA = '2026-11-13';

// Todo ficticio.
function pedido(id: string, bidones: number, cambios: Partial<PedidoARegistrar> = {}): PedidoARegistrar {
  return {
    idPedido: id,
    telefono: '56911111111',
    nombre: `Cliente ${id}`,
    lineas: [{ tipo: '20L', cantidad: bidones, precioUnitario: 2750, subtotal: bidones * 2750 }],
    fechaEntrega: FECHA,
    estado: 'Confirmado' as PedidoARegistrar['estado'],
    comuna: 'Ñuñoa',
    direccion: `Calle ${id}`,
    notasRepartidor: '',
    envasesARetirar: bidones,
    observaciones: '',
    ...cambios,
  };
}

async function dia() {
  const db = crearBaseSqlite();
  const repositorio = new RepositorioD1(db, () => 1);
  const entregas = new RepositorioEntregas(db);
  await repositorio.guardarPedido(pedido('P261113-AAAAA', 4, { formaPago: 'efectivo' }), AHORA); // $11.000 en efectivo
  await repositorio.guardarPedido(pedido('P261113-BBBBB', 2, { formaPago: 'efectivo' }), AHORA); // $5.500 en efectivo
  await repositorio.guardarPedido(pedido('P261113-CCCCC', 6, { formaPago: 'transferencia' }), AHORA);
  await repositorio.guardarPedido(pedido('P261113-DDDDD', 1, { formaPago: 'efectivo', lineas: [{ tipo: '12L', cantidad: 1, precioUnitario: null, subtotal: null }] }), AHORA);
  const opciones = { fecha: FECHA, quien: 'Repartidor: Prueba', ahora: AHORA };
  return {
    entregar: (id: string, vacios: number, cobrado: boolean) => entregas.entregar(id, { vacios, cobrado }, opciones),
    noSePudo: (id: string) => entregas.noEntregado(id, { motivo: 'no_estaba', detalle: '' }, opciones),
    cierre: async () => {
      const pedidos = await repositorio.pedidosDelDia(FECHA);
      return cierreDelDia(armarReparto(pedidos, FECHA), pedidos, await entregas.deDia(FECHA));
    },
  };
}

describe('cierre del día (D64)', () => {
  it('antes de salir: todo pendiente, el efectivo esperado y los vacíos por retirar', async () => {
    const c = await (await dia()).cierre();
    expect(c).toMatchObject({ paradas: 4, entregadas: 0, noSePudo: 0, pendientes: 4 });
    expect(c.efectivo).toEqual({ esperado: 16500, cobrado: 0, entregadosSinCobrar: 0, sinPrecio: 1 });
    expect(c.vacios).toEqual({ esperados: 13, retirados: 0, paradasConFaltante: 0 });
  });

  it('al final: lo cobrado, lo entregado sin cobrar, los vacíos que faltaron y lo que no se pudo', async () => {
    const d = await dia();
    await d.entregar('P261113-AAAAA', 4, true);
    await d.entregar('P261113-BBBBB', 1, false); // no cobró y retiró 1 de 2 vacíos
    await d.entregar('P261113-CCCCC', 6, false); // transferencia: no se cobra en la puerta
    await d.noSePudo('P261113-DDDDD');
    const c = await d.cierre();
    expect(c).toMatchObject({ entregadas: 3, noSePudo: 1, pendientes: 0 });
    expect(c.bidonesEntregados).toEqual({ '10L': 0, '12L': 0, '20L': 12 });
    expect(c.efectivo).toEqual({ esperado: 16500, cobrado: 11000, entregadosSinCobrar: 1, sinPrecio: 1 });
    expect(c.vacios).toEqual({ esperados: 13, retirados: 11, paradasConFaltante: 1 });
  });
});
