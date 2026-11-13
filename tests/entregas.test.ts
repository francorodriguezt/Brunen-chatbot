import { describe, expect, it } from 'vitest';
import { RepositorioEntregas } from '../src/entregas';
import type { PedidoARegistrar } from '../src/pedidos';
import { RepositorioD1 } from '../src/repositorio';
import { crearBaseSqlite } from './ayudas';

const AHORA = 1794582000; // viernes 13 de noviembre de 2026, mediodía en Santiago
const HOY = '2026-11-13';
const REPARTIDOR = 'Repartidor Prueba';

// Todo ficticio.
function pedido(cambios: Partial<PedidoARegistrar> = {}): PedidoARegistrar {
  return {
    idPedido: 'P261113-AAAAA',
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
  return { db, repositorio, entregas: new RepositorioEntregas(db) };
}

const opciones = { fecha: HOY, quien: REPARTIDOR, ahora: AHORA };

describe('Entregado (fase D, D61)', () => {
  it('pasa el pedido a Entregado y guarda los vacíos retirados, con su historial', async () => {
    const { db, repositorio, entregas } = await base(pedido());
    expect(await entregas.entregar('P261113-AAAAA', { vacios: 2, cobrado: false }, opciones)).toEqual({ ok: true });
    expect((await repositorio.obtenerPedido('P261113-AAAAA'))?.estado).toBe('Entregado');
    expect(db.sql("SELECT vacios_retirados, entregado_en, cobrado_en_entrega FROM pedidos WHERE id = 'P261113-AAAAA'")).toEqual([
      { vacios_retirados: 2, entregado_en: AHORA, cobrado_en_entrega: null },
    ]);
    expect(db.sql("SELECT accion, detalle FROM historial_pedidos WHERE pedido_id = 'P261113-AAAAA' AND accion = 'entrega'")).toEqual([
      { accion: 'entrega', detalle: 'Retiró 2 vacíos.' },
    ]);
  });

  it('si cobró, el pago queda pagado y se anota lo cobrado; si después se corrige, vuelve a pendiente', async () => {
    const { db, repositorio, entregas } = await base(pedido());
    await entregas.entregar('P261113-AAAAA', { vacios: 3, cobrado: true }, opciones);
    expect((await repositorio.obtenerPedido('P261113-AAAAA'))?.estadoPago).toBe('pagado');
    expect(db.sql("SELECT cobrado_en_entrega FROM pedidos WHERE id = 'P261113-AAAAA'")).toEqual([{ cobrado_en_entrega: 9900 }]);
    await entregas.entregar('P261113-AAAAA', { vacios: 1, cobrado: false }, { ...opciones, ahora: AHORA + 60 });
    expect((await repositorio.obtenerPedido('P261113-AAAAA'))?.estadoPago).toBe('pendiente');
    expect(db.sql("SELECT vacios_retirados, entregado_en, cobrado_en_entrega FROM pedidos WHERE id = 'P261113-AAAAA'")).toEqual([
      { vacios_retirados: 1, entregado_en: AHORA, cobrado_en_entrega: null },
    ]);
  });

  it('no toca pedidos de otro día, cancelados o sin confirmar, ni acepta vacíos raros', async () => {
    const { entregas } = await base(
      pedido(),
      pedido({ idPedido: 'P261114-BBBBB', fechaEntrega: '2026-11-14' }),
      pedido({ idPedido: 'P261113-CCCCC', estado: 'Pendiente_Confirmacion' }),
    );
    expect(await entregas.entregar('P261114-BBBBB', { vacios: 1, cobrado: false }, opciones)).toEqual({ ok: false, error: 'no_es_de_hoy' });
    expect(await entregas.entregar('P261113-CCCCC', { vacios: 1, cobrado: false }, opciones)).toEqual({ ok: false, error: 'no_disponible' });
    expect(await entregas.entregar('P261113-ZZZZZ', { vacios: 1, cobrado: false }, opciones)).toEqual({ ok: false, error: 'no_existe' });
    for (const vacios of [-1, 2.5, 201, Number.NaN]) {
      expect(await entregas.entregar('P261113-AAAAA', { vacios, cobrado: false }, opciones)).toEqual({ ok: false, error: 'datos_invalidos' });
    }
  });
});

describe('No se pudo (fase D, D61)', () => {
  it('deja el pedido abierto con su motivo y crea un aviso para reagendarlo, una sola vez', async () => {
    const { db, repositorio, entregas } = await base(pedido());
    expect(await entregas.noEntregado('P261113-AAAAA', { motivo: 'no_estaba', detalle: 'tocó dos veces' }, opciones)).toEqual({ ok: true });
    expect((db.sql("SELECT resumen FROM avisos WHERE id_pedido = 'P261113-AAAAA'") as Array<{ resumen: string }>)[0]?.resumen).toContain('No estaba o no contestó (tocó dos veces)');
    // Corrige el motivo el mismo día: sigue habiendo un solo aviso, y dice el motivo nuevo.
    await entregas.noEntregado('P261113-AAAAA', { motivo: 'cerrado', detalle: '' }, { ...opciones, ahora: AHORA + 60 });
    expect((await repositorio.obtenerPedido('P261113-AAAAA'))?.estado).toBe('Confirmado');
    expect(db.sql("SELECT no_entregado_motivo FROM pedidos WHERE id = 'P261113-AAAAA'")).toEqual([{ no_entregado_motivo: 'cerrado' }]);
    const avisos = db.sql("SELECT tipo, id_pedido, resumen FROM avisos WHERE id_pedido = 'P261113-AAAAA'") as Array<{ tipo: string; resumen: string }>;
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ tipo: 'escalamiento' });
    expect(avisos[0]?.resumen).toContain('Estaba cerrado');
  });

  it('rechaza un motivo que no es de la lista y un pedido ya entregado', async () => {
    const { entregas } = await base(pedido());
    expect(await entregas.noEntregado('P261113-AAAAA', { motivo: 'cualquiera', detalle: '' }, opciones)).toEqual({ ok: false, error: 'datos_invalidos' });
    await entregas.entregar('P261113-AAAAA', { vacios: 0, cobrado: false }, opciones);
    expect(await entregas.noEntregado('P261113-AAAAA', { motivo: 'no_estaba', detalle: '' }, opciones)).toEqual({ ok: false, error: 'no_disponible' });
  });

  it('entregar después de un "no se pudo" borra el motivo', async () => {
    const { db, entregas } = await base(pedido());
    await entregas.noEntregado('P261113-AAAAA', { motivo: 'cerrado', detalle: '' }, opciones);
    await entregas.entregar('P261113-AAAAA', { vacios: 3, cobrado: false }, { ...opciones, ahora: AHORA + 600 });
    expect(db.sql("SELECT no_entregado_motivo, no_entregado_en FROM pedidos WHERE id = 'P261113-AAAAA'")).toEqual([{ no_entregado_motivo: '', no_entregado_en: null }]);
  });
});

describe('lo anotado en las paradas de un día', () => {
  it('un "no se pudo" de otro día no cuenta: el pedido reagendado aparece pendiente en su día nuevo', async () => {
    const { db, entregas } = await base(pedido());
    await entregas.noEntregado('P261113-AAAAA', { motivo: 'no_estaba', detalle: '' }, opciones);
    db.sql("UPDATE pedidos SET fecha_confirmada = '2026-11-16' WHERE id = 'P261113-AAAAA'");
    expect((await entregas.deDia('2026-11-16')).get('P261113-AAAAA')?.noEntregado).toBeNull();
  });

  it('devuelve, por pedido, los vacíos, si cobró y el motivo de hoy', async () => {
    const { entregas } = await base(pedido(), pedido({ idPedido: 'P261113-BBBBB' }), pedido({ idPedido: 'P261113-CCCCC' }));
    await entregas.entregar('P261113-AAAAA', { vacios: 2, cobrado: true }, opciones);
    await entregas.noEntregado('P261113-BBBBB', { motivo: 'direccion', detalle: '' }, opciones);
    const del_dia = await entregas.deDia(HOY);
    expect(del_dia.get('P261113-AAAAA')).toEqual({ vaciosRetirados: 2, cobrado: 9900, entregadoEn: AHORA, noEntregado: null });
    expect(del_dia.get('P261113-BBBBB')).toEqual({ vaciosRetirados: null, cobrado: null, entregadoEn: null, noEntregado: { motivo: 'direccion', en: AHORA } });
    expect(del_dia.get('P261113-CCCCC')).toEqual({ vaciosRetirados: null, cobrado: null, entregadoEn: null, noEntregado: null });
  });
});
