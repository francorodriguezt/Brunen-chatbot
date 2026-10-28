import { describe, expect, it } from 'vitest';
import type { Alerta } from '../src/alertas';
import type { PedidoARegistrar } from '../src/pedidos';
import { RepositorioD1, calcularTotal } from '../src/repositorio';
import { crearBaseSqlite } from './ayudas';

const AHORA = 1793000000;
const OPERADORA = 'operadora@brunen.test';

// Todo ficticio.
function pedido(cambios: Partial<PedidoARegistrar> = {}): PedidoARegistrar {
  return {
    idPedido: 'P261028-AAAAA',
    fechaHora: '2026-10-28 10:00',
    telefono: '56911111111',
    nombre: 'Ana Prueba',
    lineas: [{ tipo: '20L', cantidad: 2, precioUnitario: 3300, subtotal: 6600 }],
    fechaEntrega: '2026-10-29',
    estado: 'Pendiente_Confirmacion',
    comuna: 'Ñuñoa',
    direccion: 'Calle Falsa 123',
    notasRepartidor: 'Tocar el timbre',
    envasesARetirar: 2,
    observaciones: '',
    ...cambios,
  };
}

const aviso = (cambios: Partial<Alerta> = {}): Alerta => ({
  tipo: 'reclamo',
  telefono: '56911111111',
  nombre: 'Ana Prueba',
  resumen: 'El cliente presenta un reclamo',
  motivos: [],
  texto: 'el bidón venía roto',
  ...cambios,
});

function repo() {
  const db = crearBaseSqlite();
  return { db, r: new RepositorioD1(db, () => 0) };
}

describe('calcularTotal', () => {
  it('suma los subtotales, y es null si falta algún precio o no hay líneas', () => {
    expect(calcularTotal([{ tipo: '20L', cantidad: 2, precioUnitario: 3300, subtotal: 6600 }, { tipo: '12L', cantidad: 1, precioUnitario: 2500, subtotal: 2500 }])).toBe(9100);
    expect(calcularTotal([{ tipo: '20L', cantidad: 2, precioUnitario: null, subtotal: null }])).toBeNull();
    expect(calcularTotal([])).toBeNull();
  });
});

describe('guardar lo que decide el bot', () => {
  it('guarda un pedido con sus líneas y deja el historial', async () => {
    const { r } = repo();
    expect(await r.guardarPedido(pedido(), AHORA)).toBe(true);
    expect(await r.obtenerPedido('P261028-AAAAA')).toEqual({
      id: 'P261028-AAAAA',
      creadoEn: AHORA,
      telefono: '56911111111',
      nombre: 'Ana Prueba',
      comuna: 'Ñuñoa',
      direccion: 'Calle Falsa 123',
      fechaEntrega: '2026-10-29',
      fechaConfirmada: null,
      estado: 'Pendiente_Confirmacion',
      lineas: [{ tipo: '20L', cantidad: 2, precioUnitario: 3300, subtotal: 6600 }],
      total: 6600,
      notasRepartidor: 'Tocar el timbre',
      envasesARetirar: 2,
      observaciones: '',
      confirmadoPor: null,
      actualizadoEn: AHORA,
    });
    expect(await r.historialDe('P261028-AAAAA')).toEqual([{ en: AHORA, quien: 'bot', accion: 'creado', detalle: '' }]);
  });

  it('el mismo pedido guardado dos veces (un reintento de Meta) queda una sola vez', async () => {
    const { r, db } = repo();
    expect(await r.guardarPedido(pedido(), AHORA)).toBe(true);
    expect(await r.guardarPedido(pedido({ nombre: 'Otro nombre' }), AHORA + 5)).toBe(false);
    expect(db.sql('SELECT nombre FROM pedidos')).toEqual([{ nombre: 'Ana Prueba' }]);
    expect(await r.historialDe('P261028-AAAAA')).toHaveLength(1);
  });

  it('un pedido sin precios queda con total vacío', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ lineas: [{ tipo: '12L', cantidad: 2, precioUnitario: null, subtotal: null }] }), AHORA);
    expect((await r.obtenerPedido('P261028-AAAAA'))?.total).toBeNull();
  });

  it('un aviso se guarda una vez por mensaje y tipo', async () => {
    const { r } = repo();
    expect(await r.guardarAviso(aviso(), 'wamid.1', AHORA)).toBe(true);
    expect(await r.guardarAviso(aviso(), 'wamid.1', AHORA + 1)).toBe(false); // el reintento
    expect(await r.guardarAviso(aviso({ tipo: 'pago' }), 'wamid.1', AHORA + 1)).toBe(true); // otro tipo del mismo mensaje
    expect(await r.guardarAviso(aviso(), 'wamid.2', AHORA + 2)).toBe(true); // otro mensaje
    expect(await r.listarAvisos()).toHaveLength(3);
  });

  it('un aviso sin mensaje de origen siempre se guarda', async () => {
    const { r } = repo();
    await r.guardarAviso(aviso({ tipo: 'error' }), null, AHORA);
    await r.guardarAviso(aviso({ tipo: 'error' }), null, AHORA + 1);
    expect(await r.listarAvisos()).toHaveLength(2);
  });

  it('los textos largos se recortan', async () => {
    const { r } = repo();
    await r.guardarAviso(aviso({ texto: 'x'.repeat(5000), resumen: 'r'.repeat(5000) }), 'wamid.1', AHORA);
    const [guardado] = await r.listarAvisos();
    expect(guardado?.texto).toHaveLength(500);
    expect(guardado?.resumen).toHaveLength(500);
  });

  it('el aviso guarda los motivos y el pedido al que se refiere', async () => {
    const { r } = repo();
    await r.guardarAviso(aviso({ tipo: 'pedido_revision', motivos: ['Cantidad inusual', 'Fecha por confirmar'], idPedido: 'P261028-AAAAA' }), 'wamid.1', AHORA);
    expect(await r.listarAvisos()).toEqual([
      expect.objectContaining({ tipo: 'pedido_revision', motivos: ['Cantidad inusual', 'Fecha por confirmar'], idPedido: 'P261028-AAAAA', estado: 'abierto', telefono: '56911111111' }),
    ]);
  });
});

describe('listar pedidos', () => {
  async function conVarios() {
    const { r } = repo();
    await r.guardarPedido(pedido({ idPedido: 'P261028-AAAAA', fechaEntrega: '2026-10-29' }), AHORA);
    await r.guardarPedido(pedido({ idPedido: 'P261028-BBBBB', fechaEntrega: '2026-10-30', estado: 'Fuera_de_zona', comuna: 'Maipú' }), AHORA + 10);
    await r.guardarPedido(pedido({ idPedido: 'P261028-CCCCC', fechaEntrega: '2026-10-29' }), AHORA + 20);
    await r.cambiarEstado('P261028-CCCCC', 'Confirmado', OPERADORA, AHORA + 30, { fechaConfirmada: '2026-10-30' });
    return r;
  }

  it('muestra primero lo que espera una decisión, y dentro de cada grupo lo más nuevo', async () => {
    const r = await conVarios();
    expect((await r.listarPedidos()).map((p) => p.id)).toEqual(['P261028-AAAAA', 'P261028-BBBBB', 'P261028-CCCCC']);
  });

  it('filtra por estado', async () => {
    const r = await conVarios();
    expect((await r.listarPedidos({ estados: ['Confirmado'] })).map((p) => p.id)).toEqual(['P261028-CCCCC']);
    expect((await r.listarPedidos({ estados: ['Pendiente_Confirmacion', 'Fuera_de_zona'] })).map((p) => p.id)).toEqual(['P261028-AAAAA', 'P261028-BBBBB']);
  });

  it('filtra por el día de entrega: cuenta la fecha confirmada y, si no hay, la propuesta', async () => {
    const r = await conVarios();
    expect((await r.listarPedidos({ fecha: '2026-10-29' })).map((p) => p.id)).toEqual(['P261028-AAAAA']);
    expect((await r.listarPedidos({ fecha: '2026-10-30' })).map((p) => p.id).sort()).toEqual(['P261028-BBBBB', 'P261028-CCCCC']);
  });

  it('respeta el límite y no deja pedir más de 300', async () => {
    const r = await conVarios();
    expect(await r.listarPedidos({ limite: 2 })).toHaveLength(2);
    expect(await r.listarPedidos({ limite: 0 })).toHaveLength(1);
    expect(await r.listarPedidos({ limite: 10_000 })).toHaveLength(3);
  });
});

describe('confirmar y cambiar el estado', () => {
  it('confirmar deja quién lo hizo, la fecha y el historial', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    const res = await r.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA + 60);
    expect(res).toMatchObject({ ok: true, valor: { estado: 'Confirmado', confirmadoPor: OPERADORA, fechaConfirmada: '2026-10-29', actualizadoEn: AHORA + 60 } });
    expect((await r.historialDe('P261028-AAAAA')).at(-1)).toEqual({ en: AHORA + 60, quien: OPERADORA, accion: 'estado: Pendiente_Confirmacion -> Confirmado', detalle: '' });
  });

  it('se puede confirmar para otro día', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    const res = await r.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA + 1, { fechaConfirmada: '2026-11-02' });
    expect(res).toMatchObject({ ok: true, valor: { fechaConfirmada: '2026-11-02' } });
  });

  it('una fecha que no existe no sirve', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    expect(await r.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA, { fechaConfirmada: '2026-02-30' })).toEqual({ ok: false, error: 'fecha_invalida' });
  });

  it('un pedido sin precio completo no se puede confirmar', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ lineas: [{ tipo: '12L', cantidad: 2, precioUnitario: null, subtotal: null }] }), AHORA);
    expect(await r.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA)).toEqual({ ok: false, error: 'falta_precio' });
    expect((await r.obtenerPedido('P261028-AAAAA'))?.estado).toBe('Pendiente_Confirmacion');
  });

  it('un pedido que no existe', async () => {
    const { r } = repo();
    expect(await r.cambiarEstado('P000000-XXXXX', 'Confirmado', OPERADORA, AHORA)).toEqual({ ok: false, error: 'no_existe' });
  });

  it('los estados siguen un camino: confirmado, en ruta, entregado', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    await r.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA + 1);
    expect(await r.cambiarEstado('P261028-AAAAA', 'En_Ruta', OPERADORA, AHORA + 2)).toMatchObject({ ok: true });
    expect(await r.cambiarEstado('P261028-AAAAA', 'Entregado', OPERADORA, AHORA + 3)).toMatchObject({ ok: true, valor: { estado: 'Entregado' } });
  });

  it('un estado no salta como sea: una entrega no se des-entrega ni se confirma sin pasar por pendiente', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    expect(await r.cambiarEstado('P261028-AAAAA', 'Entregado', OPERADORA, AHORA)).toEqual({ ok: false, error: 'transicion_invalida' });
    await r.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA + 1);
    await r.cambiarEstado('P261028-AAAAA', 'Entregado', OPERADORA, AHORA + 2);
    expect(await r.cambiarEstado('P261028-AAAAA', 'Pendiente_Confirmacion', OPERADORA, AHORA + 3)).toEqual({ ok: false, error: 'transicion_invalida' });
    expect(await r.cambiarEstado('P261028-AAAAA', 'Cancelado', OPERADORA, AHORA + 3)).toEqual({ ok: false, error: 'transicion_invalida' });
  });

  it('un pedido cancelado por error se puede reabrir', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    await r.cambiarEstado('P261028-AAAAA', 'Cancelado', OPERADORA, AHORA + 1, { motivo: 'El cliente ya no lo quiere' });
    expect((await r.historialDe('P261028-AAAAA')).at(-1)?.detalle).toBe('El cliente ya no lo quiere');
    expect(await r.cambiarEstado('P261028-AAAAA', 'Pendiente_Confirmacion', OPERADORA, AHORA + 2)).toMatchObject({ ok: true });
  });

  it('un pedido fuera de zona se puede atender igual, si la operadora lo decide', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ estado: 'Fuera_de_zona', comuna: 'Maipú' }), AHORA);
    expect(await r.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA + 1)).toMatchObject({ ok: true });
  });

  it('un estado que no existe se rechaza', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    expect(await r.cambiarEstado('P261028-AAAAA', 'Volando' as never, OPERADORA, AHORA)).toEqual({ ok: false, error: 'datos_invalidos' });
  });

  it('si otra persona cambió el estado en el medio, avisa del conflicto en vez de pisarla', async () => {
    const { r, db } = repo();
    await r.guardarPedido(pedido(), AHORA);
    // Se simula la carrera: entre la lectura y la escritura, otra persona canceló el pedido.
    const lectora = new RepositorioD1({
      prepare: (sql) => {
        const original = db.prepare(sql);
        return {
          bind: (...valores) => ({
            run: async () => {
              if (sql.startsWith('UPDATE pedidos SET estado')) db.sql("UPDATE pedidos SET estado = 'Cancelado' WHERE id = 'P261028-AAAAA'");
              return original.bind(...valores).run();
            },
          }),
        };
      },
    });
    expect(await lectora.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA + 1)).toEqual({ ok: false, error: 'conflicto' });
    expect((await r.obtenerPedido('P261028-AAAAA'))?.estado).toBe('Cancelado');
  });
});

describe('editar un pedido', () => {
  it('completar el precio de una línea calcula el subtotal y el total, y permite confirmar', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ lineas: [{ tipo: '12L', cantidad: 2, precioUnitario: null, subtotal: null }] }), AHORA);
    const res = await r.editarPedido('P261028-AAAAA', { lineas: [{ tipo: '12L', cantidad: 2, precioUnitario: 2400 }] }, OPERADORA, AHORA + 1);
    expect(res).toMatchObject({ ok: true, valor: { total: 4800, lineas: [{ tipo: '12L', cantidad: 2, precioUnitario: 2400, subtotal: 4800 }] } });
    expect(await r.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA + 2)).toMatchObject({ ok: true });
  });

  it('cambiar las cantidades recalcula todo', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    const res = await r.editarPedido('P261028-AAAAA', { lineas: [{ tipo: '20L', cantidad: 4, precioUnitario: 2750 }, { tipo: '10L', cantidad: 1, precioUnitario: 2200 }] }, OPERADORA, AHORA + 1);
    expect(res).toMatchObject({ ok: true, valor: { total: 13200 } });
  });

  it('cambia la fecha, la comuna, la dirección y las notas, y lo anota en el historial', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    const res = await r.editarPedido('P261028-AAAAA', { fechaConfirmada: '2026-11-02', comuna: 'Macul', direccion: 'Otra 456', notasRepartidor: 'Portón azul' }, OPERADORA, AHORA + 1);
    expect(res).toMatchObject({ ok: true, valor: { fechaConfirmada: '2026-11-02', comuna: 'Macul', direccion: 'Otra 456', notasRepartidor: 'Portón azul' } });
    expect((await r.historialDe('P261028-AAAAA')).at(-1)).toMatchObject({ quien: OPERADORA, accion: 'editado', detalle: 'fecha, comuna, dirección, notas' });
  });

  it('lo que no se manda no cambia', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    const res = await r.editarPedido('P261028-AAAAA', { comuna: 'Macul' }, OPERADORA, AHORA + 1);
    expect(res).toMatchObject({ ok: true, valor: { comuna: 'Macul', direccion: 'Calle Falsa 123', notasRepartidor: 'Tocar el timbre', total: 6600 } });
  });

  it('quitar la fecha confirmada con null', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    await r.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA + 1);
    const res = await r.editarPedido('P261028-AAAAA', { fechaConfirmada: null }, OPERADORA, AHORA + 2);
    expect(res).toMatchObject({ ok: true, valor: { fechaConfirmada: null } });
  });

  it.each([
    ['una cantidad cero', [{ tipo: '20L' as const, cantidad: 0, precioUnitario: 3300 }]],
    ['una cantidad con decimales', [{ tipo: '20L' as const, cantidad: 1.5, precioUnitario: 3300 }]],
    ['una cantidad absurda', [{ tipo: '20L' as const, cantidad: 1000, precioUnitario: 3300 }]],
    ['un precio negativo', [{ tipo: '20L' as const, cantidad: 1, precioUnitario: -1 }]],
    ['un precio absurdo', [{ tipo: '20L' as const, cantidad: 1, precioUnitario: 5_000_000 }]],
    ['un tamaño que no existe', [{ tipo: '15L' as never, cantidad: 1, precioUnitario: 3300 }]],
    ['una lista vacía', []],
  ])('rechaza %s', async (_nombre, lineas) => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    expect(await r.editarPedido('P261028-AAAAA', { lineas }, OPERADORA, AHORA + 1)).toEqual({ ok: false, error: 'datos_invalidos' });
    expect((await r.obtenerPedido('P261028-AAAAA'))?.total).toBe(6600); // nada cambió
  });

  it('rechaza una fecha que no existe', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    expect(await r.editarPedido('P261028-AAAAA', { fechaConfirmada: 'pronto' }, OPERADORA, AHORA)).toEqual({ ok: false, error: 'fecha_invalida' });
  });

  it('un pedido entregado o cancelado ya no se edita', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    await r.cambiarEstado('P261028-AAAAA', 'Cancelado', OPERADORA, AHORA + 1);
    expect(await r.editarPedido('P261028-AAAAA', { comuna: 'Macul' }, OPERADORA, AHORA + 2)).toEqual({ ok: false, error: 'pedido_cerrado' });
  });

  it('un pedido que no existe', async () => {
    const { r } = repo();
    expect(await r.editarPedido('P000000-XXXXX', { comuna: 'Macul' }, OPERADORA, AHORA)).toEqual({ ok: false, error: 'no_existe' });
  });
});

describe('avisos y resumen', () => {
  it('resolver un aviso lo saca de los abiertos y deja quién lo hizo', async () => {
    const { r } = repo();
    await r.guardarAviso(aviso(), 'wamid.1', AHORA);
    const [abierto] = await r.listarAvisos();
    expect(await r.resolverAviso(abierto?.id ?? 0, OPERADORA, AHORA + 5)).toBe(true);
    expect(await r.listarAvisos('abierto')).toEqual([]);
    expect(await r.listarAvisos('resuelto')).toEqual([expect.objectContaining({ estado: 'resuelto', resueltoPor: OPERADORA, resueltoEn: AHORA + 5 })]);
  });

  it('resolver dos veces, o uno que no existe, devuelve false', async () => {
    const { r } = repo();
    await r.guardarAviso(aviso(), 'wamid.1', AHORA);
    const [abierto] = await r.listarAvisos();
    await r.resolverAviso(abierto?.id ?? 0, OPERADORA, AHORA);
    expect(await r.resolverAviso(abierto?.id ?? 0, 'otra@persona.test', AHORA + 1)).toBe(false);
    expect(await r.resolverAviso(9999, OPERADORA, AHORA)).toBe(false);
  });

  it('los avisos más nuevos salen primero', async () => {
    const { r } = repo();
    await r.guardarAviso(aviso({ resumen: 'viejo' }), 'wamid.1', AHORA);
    await r.guardarAviso(aviso({ resumen: 'nuevo' }), 'wamid.2', AHORA + 10);
    expect((await r.listarAvisos()).map((a) => a.resumen)).toEqual(['nuevo', 'viejo']);
  });

  it('el resumen cuenta lo pendiente y marca lo último que llegó', async () => {
    const { r } = repo();
    expect(await r.resumen()).toEqual({ porConfirmar: 0, avisosAbiertos: 0, ultimaActualizacionDePedidos: 0, ultimoAviso: 0 });
    await r.guardarPedido(pedido({ idPedido: 'P261028-AAAAA' }), AHORA);
    await r.guardarPedido(pedido({ idPedido: 'P261028-BBBBB' }), AHORA + 10);
    await r.guardarAviso(aviso(), 'wamid.1', AHORA + 20);
    await r.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA + 30);
    expect(await r.resumen()).toEqual({ porConfirmar: 1, avisosAbiertos: 1, ultimaActualizacionDePedidos: AHORA + 30, ultimoAviso: 1 });
  });
});

describe('limpieza', () => {
  it('borra el texto del cliente de los avisos de más de 90 días, pero deja el aviso', async () => {
    const { r } = repo();
    await r.guardarAviso(aviso({ resumen: 'viejo' }), 'wamid.1', AHORA - 91 * 24 * 3600);
    await r.guardarAviso(aviso({ resumen: 'reciente' }), 'wamid.2', AHORA - 3600);
    await r.limpiar(AHORA);
    const avisos = await r.listarAvisos();
    expect(avisos.find((a) => a.resumen === 'viejo')?.texto).toBe('');
    expect(avisos.find((a) => a.resumen === 'reciente')?.texto).toBe('el bidón venía roto');
  });

  it('casi siempre no hace nada', async () => {
    const db = crearBaseSqlite();
    const r = new RepositorioD1(db, () => 0.5);
    await r.guardarAviso(aviso(), 'wamid.1', AHORA - 91 * 24 * 3600);
    await r.limpiar(AHORA);
    expect((await r.listarAvisos())[0]?.texto).toBe('el bidón venía roto');
  });
});
