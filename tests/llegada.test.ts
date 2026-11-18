import { describe, expect, it } from 'vitest';
import { estadoDeMiPedido, preguntaPorLlegada } from '../src/llegada';
import type { PedidoARegistrar } from '../src/pedidos';
import { RepositorioD1 } from '../src/repositorio';
import { crearBaseSqlite } from './ayudas';

// Todo ficticio.
const HOY = '2026-11-18';
const AHORA = Math.floor(new Date('2026-11-18T08:00:00-03:00').getTime() / 1000);
const ANA = '56911111111';

function pedido(id: string, telefono: string, cambios: Partial<PedidoARegistrar> = {}): PedidoARegistrar {
  return {
    idPedido: id,
    telefono,
    nombre: 'Cliente',
    lineas: [{ tipo: '20L', cantidad: 2, precioUnitario: 3300, subtotal: 6600 }],
    fechaEntrega: HOY,
    estado: 'Pendiente_Confirmacion',
    comuna: 'Ñuñoa',
    direccion: `Calle ${id}`,
    notasRepartidor: '',
    envasesARetirar: 0,
    observaciones: '',
    ...cambios,
  };
}

describe('qué cuenta como "¿cuándo llega?" (D78)', () => {
  it('reconoce las formas de preguntar', () => {
    for (const texto of ['¿Cuándo llega mi pedido?', 'a que hora llegan?', 'hola, ya viene?', '¿falta mucho?', 'por donde va el repartidor', 'mi pedido viene hoy?', 'ya va en camino?']) {
      expect(preguntaPorLlegada(texto), texto).toBe(true);
    }
  });

  it('un "no llegó" es un reclamo, no una pregunta: sigue por el camino de siempre', () => {
    for (const texto of ['mi pedido no llegó', 'no me ha llegado el pedido', 'todavía no llegan', 'nunca vinieron']) {
      expect(preguntaPorLlegada(texto), texto).toBe(false);
    }
    expect(preguntaPorLlegada('quiero 3 de 20')).toBe(false);
  });
});

describe('en qué está el pedido del cliente (D78)', () => {
  it('sin pedidos de hoy en adelante: null (se responde lo de siempre)', async () => {
    const db = crearBaseSqlite();
    await new RepositorioD1(db).guardarPedido(pedido('P261110-AAAAA', ANA, { fechaEntrega: '2026-11-10' }), AHORA - 900000);
    expect(await estadoDeMiPedido(db, ANA, HOY)).toBeNull();
  });

  it('por confirmar o agendado para otro día', async () => {
    const db = crearBaseSqlite();
    const r = new RepositorioD1(db);
    await r.guardarPedido(pedido('P261118-AAAAA', ANA, { fechaEntrega: '2026-11-20' }), AHORA);
    expect(await estadoDeMiPedido(db, ANA, HOY)).toEqual({ tipo: 'por_confirmar', fecha: '2026-11-20' });
    await r.cambiarEstado('P261118-AAAAA', 'Confirmado', 'prueba', AHORA + 1);
    expect(await estadoDeMiPedido(db, ANA, HOY)).toEqual({ tipo: 'agendado', fecha: '2026-11-20' });
  });

  it('en el reparto de hoy: con la ruta publicada dice cuántas entregas quedan antes; sin publicar, no', async () => {
    const db = crearBaseSqlite();
    const r = new RepositorioD1(db);
    for (const [id, tel] of [['P261118-AAAAA', '56922222222'], ['P261118-BBBBB', '56933333333'], ['P261118-CCCCC', ANA]] as const) {
      await r.guardarPedido(pedido(id, tel), AHORA);
      await r.cambiarEstado(id, 'Confirmado', 'prueba', AHORA + 1);
    }
    expect(await estadoDeMiPedido(db, ANA, HOY)).toEqual({ tipo: 'en_reparto', antes: null });
    db.sql("UPDATE pedidos SET orden_ruta = CASE id WHEN 'P261118-AAAAA' THEN 1 WHEN 'P261118-BBBBB' THEN 2 ELSE 3 END");
    expect(await estadoDeMiPedido(db, ANA, HOY)).toEqual({ tipo: 'en_reparto', antes: 2 });
    await r.cambiarEstado('P261118-AAAAA', 'Entregado', 'prueba', AHORA + 2);
    expect(await estadoDeMiPedido(db, ANA, HOY)).toEqual({ tipo: 'en_reparto', antes: 1 });
    await r.cambiarEstado('P261118-CCCCC', 'Entregado', 'prueba', AHORA + 3);
    expect(await estadoDeMiPedido(db, ANA, HOY)).toEqual({ tipo: 'entregado' });
  });
});
