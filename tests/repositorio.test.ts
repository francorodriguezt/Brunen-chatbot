import { describe, expect, it } from 'vitest';
import type { Alerta } from '../src/alertas';
import type { PedidoARegistrar } from '../src/pedidos';
import { RepositorioClientes } from '../src/fichas';
import { RepositorioD1, SQL_RESUMEN, calcularTotal } from '../src/repositorio';
import { crearBaseSqlite } from './ayudas';

const AHORA = 1793000000;
const OPERADORA = 'operadora@brunen.test';

// Todo ficticio.
function pedido(cambios: Partial<PedidoARegistrar> = {}): PedidoARegistrar {
  return {
    idPedido: 'P261028-AAAAA',
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
  it('guarda la forma de pago que dijo el cliente; si no la dijo, queda vacía para que la complete una persona', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ formaPago: 'efectivo' }), AHORA);
    await r.guardarPedido(pedido({ idPedido: 'P261028-BBBBB' }), AHORA);
    expect((await r.obtenerPedido('P261028-AAAAA'))?.formaPago).toBe('efectivo');
    expect((await r.obtenerPedido('P261028-BBBBB'))?.formaPago).toBe('');
  });

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
      mensajeCliente: '',
      // Lo que no sabe el bot queda vacío: lo completa una persona en el panel (D52).
      formaPago: '',
      estadoPago: 'pendiente',
      documento: '',
      numeroDocumento: '',
      tipoCliente: '',
      ordenRuta: null,
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
    await r.guardarAviso(aviso({ tipo: 'reclamo', motivos: ['Bidón defectuoso', 'Pide cambio'], idPedido: 'P261028-AAAAA' }), 'wamid.1', AHORA);
    expect(await r.listarAvisos()).toEqual([
      expect.objectContaining({ tipo: 'reclamo', motivos: ['Bidón defectuoso', 'Pide cambio'], idPedido: 'P261028-AAAAA', estado: 'abierto', telefono: '56911111111' }),
    ]);
  });

  it('los avisos que nacen con un pedido no van a la bandeja de avisos: se ven en el pedido', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    for (const [i, tipo] of (['pedido', 'pedido_revision', 'cliente_nuevo', 'fuera_de_zona'] as const).entries()) {
      await r.guardarAviso(aviso({ tipo, idPedido: 'P261028-AAAAA' }), `wamid.${i}`, AHORA + i);
    }
    await r.guardarAviso(aviso({ tipo: 'reclamo' }), 'wamid.9', AHORA + 9);
    expect((await r.listarAvisos()).map((a) => a.tipo)).toEqual(['reclamo']);
    expect(await r.resumen()).toMatchObject({ porConfirmar: 1, avisosAbiertos: 1, ultimoAviso: 5 });
  });

  it('el pedido trae lo que escribió el cliente, y queda vacío si no hubo texto o ya se borró', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ idPedido: 'P261028-AAAAA' }), AHORA);
    await r.guardarPedido(pedido({ idPedido: 'P261028-BBBBB' }), AHORA + 1);
    await r.guardarPedido(pedido({ idPedido: 'P261028-CCCCC' }), AHORA + 2);
    await r.guardarAviso(aviso({ tipo: 'pedido', texto: 'quiero 2 de 20', idPedido: 'P261028-AAAAA' }), 'wamid.1', AHORA);
    await r.guardarAviso(aviso({ tipo: 'cliente_nuevo', texto: 'otro texto', idPedido: 'P261028-AAAAA' }), 'wamid.1', AHORA);
    await r.guardarAviso(aviso({ tipo: 'pedido', texto: '', idPedido: 'P261028-BBBBB' }), 'wamid.2', AHORA + 1);
    await r.guardarAviso(aviso({ tipo: 'reclamo', texto: 'el bidón venía roto', idPedido: 'P261028-CCCCC' }), 'wamid.3', AHORA + 2); // no es lo que pidió
    expect((await r.obtenerPedido('P261028-AAAAA'))?.mensajeCliente).toBe('quiero 2 de 20');
    expect((await r.obtenerPedido('P261028-BBBBB'))?.mensajeCliente).toBe('');
    expect((await r.obtenerPedido('P261028-CCCCC'))?.mensajeCliente).toBe('');
    const listados = await r.listarPedidos();
    expect(listados.find((p) => p.id === 'P261028-AAAAA')?.mensajeCliente).toBe('quiero 2 de 20');
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

  it('"por confirmar" cuenta lo mismo que la lista del panel: también los pedidos fuera de zona', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ idPedido: 'P261028-AAAAA' }), AHORA);
    await r.guardarPedido(pedido({ idPedido: 'P261028-BBBBB', estado: 'Fuera_de_zona', comuna: 'Maipú' }), AHORA + 1);
    expect((await r.resumen()).porConfirmar).toBe(2);
  });
});

describe('costo de lo que el panel repite', () => {
  it('el resumen no recorre las tablas enteras: D1 gratis permite 5 millones de filas leídas al día y esta consulta se repite miles de veces', () => {
    const { db } = repo();
    const detalles = db.sql(`EXPLAIN QUERY PLAN ${SQL_RESUMEN}`).map((fila) => String((fila as { detail: unknown }).detail));
    expect(detalles.filter((d) => /^SCAN (pedidos|avisos)\b/.test(d))).toEqual([]);
    expect(detalles.join('\n')).toContain('idx_pedidos_actualizado'); // el último cambio es leer una sola fila
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

describe('completar los datos de un pedido ya anotado (D37)', () => {
  const ID = 'P261028-AAAAA';
  const sinDatos = (cambios: Partial<PedidoARegistrar> = {}) =>
    pedido({ nombre: '', comuna: '', direccion: '', notasRepartidor: '', observaciones: 'Cliente nuevo, sin ficha', ...cambios });

  it('llena lo que está vacío, suma a las notas y a las observaciones, y deja el historial', async () => {
    const { r } = repo();
    await r.guardarPedido(sinDatos(), AHORA);
    const hecho = await r.completarDatos(
      { idPedido: ID, nombre: 'Juan Pérez', direccion: 'Los Leones 123', comuna: 'Providencia', notasRepartidor: 'Depto 45', observacion: 'Dijo sus datos' },
      AHORA + 60,
    );
    expect(hecho).toBe(true);
    expect(await r.obtenerPedido(ID)).toMatchObject({
      nombre: 'Juan Pérez',
      direccion: 'Los Leones 123',
      comuna: 'Providencia',
      notasRepartidor: 'Depto 45',
      observaciones: 'Cliente nuevo, sin ficha | Dijo sus datos',
      actualizadoEn: AHORA + 60,
    });
    expect(await r.historialDe(ID)).toContainEqual({
      en: AHORA + 60,
      quien: 'bot',
      accion: 'datos del cliente',
      detalle: 'nombre, dirección, comuna, notas, observaciones',
    });
  });

  it('nunca pisa lo que una persona ya escribió, pero sí suma a las notas', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ notasRepartidor: 'Tocar el timbre' }), AHORA);
    await r.completarDatos({ idPedido: ID, nombre: 'Otro', direccion: 'Otra 1', comuna: 'Macul', notasRepartidor: 'Edificio: Mirador' }, AHORA + 60);
    expect(await r.obtenerPedido(ID)).toMatchObject({
      nombre: 'Ana Prueba',
      direccion: 'Calle Falsa 123',
      comuna: 'Ñuñoa',
      notasRepartidor: 'Tocar el timbre. Edificio: Mirador',
    });
  });

  it('pasa a Fuera_de_zona solo si el pedido seguía pendiente de confirmar', async () => {
    const { r } = repo();
    await r.guardarPedido(sinDatos(), AHORA);
    await r.guardarPedido(sinDatos({ idPedido: 'P261028-BBBBB' }), AHORA);
    await r.cambiarEstado('P261028-BBBBB', 'Confirmado', OPERADORA, AHORA + 30);
    await r.completarDatos({ idPedido: ID, comuna: 'Maipú', estado: 'Fuera_de_zona' }, AHORA + 60);
    await r.completarDatos({ idPedido: 'P261028-BBBBB', comuna: 'Maipú', estado: 'Fuera_de_zona' }, AHORA + 60);
    expect((await r.obtenerPedido(ID))?.estado).toBe('Fuera_de_zona');
    expect((await r.obtenerPedido('P261028-BBBBB'))?.estado).toBe('Confirmado');
  });

  it('un pedido que no existe, o que ya se canceló, no se toca y devuelve false', async () => {
    const { r } = repo();
    expect(await r.completarDatos({ idPedido: 'P261028-ZZZZZ', nombre: 'X' }, AHORA)).toBe(false);
    await r.guardarPedido(sinDatos(), AHORA);
    await r.cambiarEstado(ID, 'Cancelado', OPERADORA, AHORA + 10);
    expect(await r.completarDatos({ idPedido: ID, nombre: 'X' }, AHORA + 20)).toBe(false);
    expect((await r.obtenerPedido(ID))?.nombre).toBe('');
  });
});

describe('datos de un cliente por sus pedidos anteriores (D40)', () => {
  it('devuelve nombre, dirección, comuna y notas del último pedido de ese teléfono que tiene dirección', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ idPedido: 'P261020-AAAAA', nombre: 'Ana Vieja', direccion: 'Calle Vieja 1', comuna: 'Macul', notasRepartidor: '' }), AHORA - 1000);
    await r.guardarPedido(pedido({ idPedido: 'P261028-AAAAA', nombre: 'Ana Prueba', direccion: 'Calle Falsa 123', comuna: 'Ñuñoa', notasRepartidor: 'Edificio: Mirador' }), AHORA);
    expect(await r.datosDelUltimoPedido('56911111111')).toEqual({
      idPedido: 'P261028-AAAAA',
      nombre: 'Ana Prueba',
      direccion: 'Calle Falsa 123',
      comuna: 'Ñuñoa',
      notasRepartidor: 'Edificio: Mirador',
    });
  });

  it('salta los pedidos cancelados y los que nunca tuvieron dirección', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ idPedido: 'P261020-AAAAA', direccion: 'Calle Buena 5' }), AHORA - 2000);
    await r.guardarPedido(pedido({ idPedido: 'P261027-AAAAA', direccion: 'Calle Mala 9' }), AHORA - 1000);
    await r.cambiarEstado('P261027-AAAAA', 'Cancelado', OPERADORA, AHORA - 500);
    await r.guardarPedido(pedido({ idPedido: 'P261028-AAAAA', nombre: '', comuna: '', direccion: '', notasRepartidor: '' }), AHORA);
    expect((await r.datosDelUltimoPedido('56911111111'))?.idPedido).toBe('P261020-AAAAA');
  });

  it('no usa pedidos de hace más de un año: el número pudo pasar a otra persona', async () => {
    const { r } = repo();
    const unAnio = 365 * 24 * 3600;
    await r.guardarPedido(pedido({ idPedido: 'P241020-AAAAA', direccion: 'Calle Antigua 1' }), AHORA - unAnio - 60);
    expect(await r.datosDelUltimoPedido('56911111111', AHORA)).toBeNull();
    await r.guardarPedido(pedido({ idPedido: 'P251120-AAAAA', direccion: 'Calle Reciente 2' }), AHORA - unAnio + 60);
    expect((await r.datosDelUltimoPedido('56911111111', AHORA))?.direccion).toBe('Calle Reciente 2');
  });

  it('es null si ese teléfono no tiene pedidos con dirección, y no mezcla a otros clientes', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ telefono: '56922222222' }), AHORA);
    expect(await r.datosDelUltimoPedido('56911111111')).toBeNull();
  });
});

describe('datos de un cliente por su ficha (fase B: el bot lee las fichas)', () => {
  it('un teléfono que una persona agregó a la ficha reconoce al cliente con su último pedido, aunque lo hiciera desde otro número', async () => {
    const { db, r } = repo();
    const clientes = new RepositorioClientes(db);
    await r.guardarPedido(pedido({ idPedido: 'P261020-AAAAA', direccion: 'Calle Uno 1', comuna: 'Macul' }), AHORA - 1000);
    await clientes.vincularPendientes(AHORA - 900);
    const ana = (await clientes.clienteDeTelefono('56911111111')) as number;
    expect(await r.datosDelUltimoPedido('56922222222', AHORA)).toBeNull();
    await clientes.agregarTelefono(ana, '56922222222', AHORA - 100);
    expect(await r.datosDelUltimoPedido('56922222222', AHORA)).toMatchObject({ idPedido: 'P261020-AAAAA', direccion: 'Calle Uno 1', comuna: 'Macul' });
  });

  it('un número viejo de la ficha no reconoce al cliente por los pedidos de su número nuevo: pudo pasar a otra persona', async () => {
    const { db, r } = repo();
    const clientes = new RepositorioClientes(db);
    const dosAnios = 2 * 365 * 24 * 3600;
    await r.guardarPedido(pedido({ idPedido: 'P241020-AAAAA', direccion: 'Calle Antigua 1' }), AHORA - dosAnios);
    await clientes.vincularPendientes(AHORA - dosAnios + 10);
    const ana = (await clientes.clienteDeTelefono('56911111111')) as number;
    await clientes.agregarTelefono(ana, '56922222222', AHORA - dosAnios + 20);
    await r.guardarPedido(pedido({ idPedido: 'P261020-BBBBB', telefono: '56922222222', direccion: 'Calle Nueva 2' }), AHORA - 1000);
    await clientes.vincularPendientes(AHORA - 900);
    expect((await r.datosDelUltimoPedido('56922222222', AHORA))?.direccion).toBe('Calle Nueva 2');
    expect(await r.datosDelUltimoPedido('56911111111', AHORA)).toBeNull();
  });

  it('si la ficha tiene una dirección usada después del último pedido, manda la de la ficha, y su nombre si lo tiene', async () => {
    const { db, r } = repo();
    const clientes = new RepositorioClientes(db);
    await r.guardarPedido(pedido({ idPedido: 'P261020-AAAAA', nombre: 'ana', direccion: 'Calle Vieja 1', comuna: 'Macul' }), AHORA - 1000);
    await clientes.vincularPendientes(AHORA - 900);
    const ana = (await clientes.clienteDeTelefono('56911111111')) as number;
    await clientes.editar(ana, { nombre: 'Ana Prueba' }, AHORA - 800);
    await clientes.registrarDireccion(ana, 'Calle Nueva 9', 'Ñuñoa', 'Casa azul', AHORA - 500);
    expect(await r.datosDelUltimoPedido('56911111111', AHORA)).toEqual({
      idPedido: 'P261020-AAAAA',
      nombre: 'Ana Prueba',
      direccion: 'Calle Nueva 9',
      comuna: 'Ñuñoa',
      notasRepartidor: 'Casa azul',
    });
  });
});

describe('los pedidos de un día, para el reparto', () => {
  it('trae los de ese día por su fecha confirmada o, si no la hay, por la propuesta, sin los cancelados', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ idPedido: 'P261028-AAAAA', fechaEntrega: '2026-10-29' }), AHORA);
    await r.guardarPedido(pedido({ idPedido: 'P261028-BBBBB', fechaEntrega: '2026-10-30' }), AHORA);
    await r.guardarPedido(pedido({ idPedido: 'P261028-CCCCC', fechaEntrega: '2026-10-28' }), AHORA);
    await r.guardarPedido(pedido({ idPedido: 'P261028-DDDDD', fechaEntrega: '2026-10-29' }), AHORA);
    await r.cambiarEstado('P261028-CCCCC', 'Confirmado', OPERADORA, AHORA + 1, { fechaConfirmada: '2026-10-29' }); // se movió a ese día
    await r.cambiarEstado('P261028-DDDDD', 'Cancelado', OPERADORA, AHORA + 1);
    expect((await r.pedidosDelDia('2026-10-29')).map((p) => p.id).sort()).toEqual(['P261028-AAAAA', 'P261028-CCCCC']);
  });

  it('un día sin pedidos da una lista vacía', async () => {
    expect(await repo().r.pedidosDelDia('2026-10-29')).toEqual([]);
  });
});

describe('anotar un pedido a mano desde el panel', () => {
  const MANUAL = {
    telefono: '56922222222',
    nombre: 'Luz Demo',
    comuna: 'Macul',
    direccion: 'Avenida Ficticia 987',
    fecha: '2026-10-30',
    lineas: [{ tipo: '20L' as const, cantidad: 2, precioUnitario: 3300 }],
    notasRepartidor: 'Dejar en conserjería',
    envasesARetirar: 1,
    confirmar: false,
  };

  it('queda por confirmar, con su total calculado, y el historial dice quién lo anotó', async () => {
    const { r } = repo();
    const res = await r.crearPedido(MANUAL, OPERADORA, AHORA, '2026-10-28');
    expect(res).toMatchObject({
      ok: true,
      valor: {
        telefono: '56922222222', nombre: 'Luz Demo', comuna: 'Macul', direccion: 'Avenida Ficticia 987', fechaEntrega: '2026-10-30', fechaConfirmada: null,
        estado: 'Pendiente_Confirmacion', total: 6600, notasRepartidor: 'Dejar en conserjería', envasesARetirar: 1, creadoEn: AHORA,
        lineas: [{ tipo: '20L', cantidad: 2, precioUnitario: 3300, subtotal: 6600 }],
      },
    });
    const id = res.ok ? res.valor.id : '';
    expect(id).toMatch(/^P261028-[0-9A-Z]{5}$/);
    expect(await r.historialDe(id)).toEqual([{ en: AHORA, quien: OPERADORA, accion: 'creado', detalle: 'a mano en el panel' }]);
  });

  it('las observaciones dicen que se anotó a mano, para distinguirlo de los que tomó el bot', async () => {
    const res = await repo().r.crearPedido(MANUAL, OPERADORA, AHORA, '2026-10-28');
    expect(res.ok && res.valor.observaciones).toBe('Anotado a mano en el panel.');
  });

  it('con "confirmar" queda confirmado de una vez, por quien lo anotó y para la fecha indicada', async () => {
    const res = await repo().r.crearPedido({ ...MANUAL, confirmar: true }, OPERADORA, AHORA, '2026-10-28');
    expect(res).toMatchObject({ ok: true, valor: { estado: 'Confirmado', confirmadoPor: OPERADORA, fechaConfirmada: '2026-10-30' } });
  });

  it('con "confirmar" pero sin precio queda por confirmar: nunca se confirma sin precio', async () => {
    const res = await repo().r.crearPedido({ ...MANUAL, confirmar: true, lineas: [{ tipo: '12L', cantidad: 2, precioUnitario: null }] }, OPERADORA, AHORA, '2026-10-28');
    expect(res).toMatchObject({ ok: true, valor: { estado: 'Pendiente_Confirmacion', total: null } });
  });

  it('se puede anotar sin teléfono ni dirección (se completan después con "Cambiar")', async () => {
    const res = await repo().r.crearPedido({ ...MANUAL, telefono: '', direccion: '', comuna: '', nombre: 'Empresa Ejemplo' }, OPERADORA, AHORA, '2026-10-28');
    expect(res).toMatchObject({ ok: true, valor: { telefono: '', direccion: '' } });
  });

  it.each([
    ['sin productos', { lineas: [] }, 'datos_invalidos'],
    ['con más de 5 líneas', { lineas: Array.from({ length: 6 }, () => ({ tipo: '20L' as const, cantidad: 1, precioUnitario: 4500 })) }, 'datos_invalidos'],
    ['con una cantidad de cero', { lineas: [{ tipo: '20L' as const, cantidad: 0, precioUnitario: 4500 }] }, 'datos_invalidos'],
    ['con un precio negativo', { lineas: [{ tipo: '20L' as const, cantidad: 1, precioUnitario: -1 }] }, 'datos_invalidos'],
    ['con un tamaño que no existe', { lineas: [{ tipo: '15L' as never, cantidad: 1, precioUnitario: 4500 }] }, 'datos_invalidos'],
    ['con un teléfono que no son solo dígitos', { telefono: '+56 9 2222' }, 'datos_invalidos'],
    ['con envases negativos', { envasesARetirar: -1 }, 'datos_invalidos'],
    ['con envases que no son un número entero', { envasesARetirar: 1.5 }, 'datos_invalidos'],
    ['con una fecha que no existe', { fecha: '2026-02-30' }, 'fecha_invalida'],
    ['con una fecha mal escrita', { fecha: '30-10-2026' }, 'fecha_invalida'],
  ])('rechaza un pedido %s y no guarda nada', async (_nombre, cambios, error) => {
    const { r, db } = repo();
    expect(await r.crearPedido({ ...MANUAL, ...cambios }, OPERADORA, AHORA, '2026-10-28')).toEqual({ ok: false, error });
    expect(db.sql('SELECT COUNT(*) AS n FROM pedidos')).toEqual([{ n: 0 }]);
  });

  it('recorta los textos demasiado largos en vez de fallar', async () => {
    const res = await repo().r.crearPedido({ ...MANUAL, nombre: 'N'.repeat(300), direccion: 'D'.repeat(900), notasRepartidor: 'X'.repeat(2000) }, OPERADORA, AHORA, '2026-10-28');
    expect(res.ok && [res.valor.nombre.length, res.valor.direccion.length, res.valor.notasRepartidor.length]).toEqual([80, 200, 500]);
  });

  it('si el identificador sorteado ya existe, sortea otro', async () => {
    const db = crearBaseSqlite();
    const sorteos = [...Array<number>(5).fill(0), ...Array<number>(5).fill(0), ...Array<number>(5).fill(0.5)]; // "00000" dos veces y después "IIIII"
    const r = new RepositorioD1(db, () => sorteos.shift() ?? 0.99);
    const primero = await r.crearPedido(MANUAL, OPERADORA, AHORA, '2026-10-28');
    const segundo = await r.crearPedido(MANUAL, OPERADORA, AHORA, '2026-10-28');
    expect([primero.ok && primero.valor.id, segundo.ok && segundo.valor.id]).toEqual(['P261028-00000', 'P261028-IIIII']);
  });
});

describe('buscar pedidos', () => {
  async function conTres() {
    const { r } = repo();
    await r.guardarPedido(pedido({ idPedido: 'P261028-AAAAA', nombre: 'Ana Prueba', telefono: '56911111111', direccion: 'Calle Falsa 123' }), AHORA);
    await r.guardarPedido(pedido({ idPedido: 'P261028-BBBBB', nombre: 'Pedro Muestra', telefono: '56922222222', direccion: 'Avenida Ficticia 987' }), AHORA + 10);
    await r.guardarPedido(pedido({ idPedido: 'P261028-CCCCC', nombre: 'Ana María Ejemplo', telefono: '56933333333', direccion: 'Pasaje Inventado 45' }), AHORA + 20);
    return r;
  }
  const idsDe = async (r: RepositorioD1, texto: string) => (await r.buscarPedidos(texto)).map((p) => p.id);

  it('por parte del nombre, sin importar mayúsculas, del más nuevo al más antiguo', async () => {
    expect(await idsDe(await conTres(), 'ana')).toEqual(['P261028-CCCCC', 'P261028-AAAAA']);
  });

  it('por parte del teléfono, aunque se escriba con espacios o con +', async () => {
    const r = await conTres();
    expect(await idsDe(r, '2222')).toEqual(['P261028-BBBBB']);
    expect(await idsDe(r, '+56 9 3333')).toEqual(['P261028-CCCCC']);
  });

  it('por la dirección y por el número de pedido', async () => {
    const r = await conTres();
    expect(await idsDe(r, 'ficticia')).toEqual(['P261028-BBBBB']);
    expect(await idsDe(r, 'P261028-AAA')).toEqual(['P261028-AAAAA']);
  });

  it('los comodines de SQL se buscan como texto: "%" no trae todo', async () => {
    const r = await conTres();
    expect(await idsDe(r, '%%')).toEqual([]);
    expect(await idsDe(r, '__')).toEqual([]);
  });

  it('con menos de 2 caracteres no busca', async () => {
    const r = await conTres();
    expect(await idsDe(r, 'a')).toEqual([]);
    expect(await idsDe(r, '   ')).toEqual([]);
  });
});

describe('que dos personas no se pisen: la versión que cada una estaba viendo', () => {
  it('cambiar el estado con la versión que se veía funciona', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    expect(await r.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA + 60, { versionVista: AHORA })).toMatchObject({ ok: true });
  });

  it('si otra persona lo cambió después de que se cargó la pantalla, el cambio de estado se rechaza', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    await r.editarPedido('P261028-AAAAA', { direccion: 'Otra Calle 9' }, 'dueno@brunen.test', AHORA + 30);
    expect(await r.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA + 60, { versionVista: AHORA })).toEqual({ ok: false, error: 'conflicto' });
    expect((await r.obtenerPedido('P261028-AAAAA'))?.estado).toBe('Pendiente_Confirmacion');
  });

  it('lo mismo al editar: no se guarda encima de un cambio que no se vio', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    await r.editarPedido('P261028-AAAAA', { direccion: 'Otra Calle 9' }, 'dueno@brunen.test', AHORA + 30);
    expect(await r.editarPedido('P261028-AAAAA', { comuna: 'Macul' }, OPERADORA, AHORA + 60, AHORA)).toEqual({ ok: false, error: 'conflicto' });
    expect(await r.obtenerPedido('P261028-AAAAA')).toMatchObject({ direccion: 'Otra Calle 9', comuna: 'Ñuñoa' });
  });

  it('dos cambios dentro del mismo segundo igual dejan versiones distintas', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    const uno = await r.editarPedido('P261028-AAAAA', { direccion: 'Calle Uno 1' }, OPERADORA, AHORA);
    const dos = await r.editarPedido('P261028-AAAAA', { direccion: 'Calle Dos 2' }, OPERADORA, AHORA);
    expect([uno.ok && uno.valor.actualizadoEn, dos.ok && dos.valor.actualizadoEn]).toEqual([AHORA + 1, AHORA + 2]);
  });

  it('cuando el bot completa los datos del cliente también cambia la versión', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ nombre: '', direccion: '', comuna: '' }), AHORA);
    await r.completarDatos({ idPedido: 'P261028-AAAAA', nombre: 'Ana Torres', direccion: 'Av. Siempre Viva 742', comuna: 'Ñuñoa' }, AHORA);
    expect((await r.obtenerPedido('P261028-AAAAA'))?.actualizadoEn).toBe(AHORA + 1);
  });

  it('sin versión (por ejemplo, una pantalla antigua todavía abierta) se mantiene la comprobación de siempre', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    await r.editarPedido('P261028-AAAAA', { direccion: 'Otra Calle 9' }, 'dueno@brunen.test', AHORA + 30);
    expect(await r.cambiarEstado('P261028-AAAAA', 'Confirmado', OPERADORA, AHORA + 60)).toMatchObject({ ok: true });
  });
});

describe('editar los envases por retirar', () => {
  it('se pueden corregir, y el historial lo dice', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    const res = await r.editarPedido('P261028-AAAAA', { envasesARetirar: 5 }, OPERADORA, AHORA + 1);
    expect(res).toMatchObject({ ok: true, valor: { envasesARetirar: 5 } });
    expect((await r.historialDe('P261028-AAAAA')).at(-1)).toMatchObject({ accion: 'editado', detalle: 'envases' });
  });

  it('si no se mandan, quedan como estaban', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA); // el pedido de prueba trae 2 envases por retirar
    const res = await r.editarPedido('P261028-AAAAA', { comuna: 'Macul' }, OPERADORA, AHORA + 1);
    expect(res).toMatchObject({ ok: true, valor: { envasesARetirar: 2 } });
  });

  it.each([-1, 1.5, 1000])('rechaza %s envases', async (envasesARetirar) => {
    const { r } = repo();
    await r.guardarPedido(pedido(), AHORA);
    expect(await r.editarPedido('P261028-AAAAA', { envasesARetirar }, OPERADORA, AHORA + 1)).toEqual({ ok: false, error: 'datos_invalidos' });
  });
});

describe('lo que pidió la última vez, para "lo de siempre" (D57)', () => {
  it('devuelve los tipos y cantidades de su último pedido del último año, sin los cancelados ni fuera de zona', async () => {
    const { r } = repo();
    await r.guardarPedido(pedido({ idPedido: 'P261020-AAAAA', lineas: [{ tipo: '20L', cantidad: 4, precioUnitario: 2750, subtotal: 11000 }] }), AHORA - 2000);
    await r.guardarPedido(pedido({ idPedido: 'P261027-AAAAA', estado: 'Fuera_de_zona', lineas: [{ tipo: '12L', cantidad: 9, precioUnitario: null, subtotal: null }] }), AHORA - 1000);
    expect(await r.itemsDelUltimoPedido('56911111111', AHORA)).toEqual([{ tipo: '20L', cantidad: 4 }]);
    expect(await r.itemsDelUltimoPedido('56922222222', AHORA)).toBeNull();
    expect(await r.itemsDelUltimoPedido('56911111111', AHORA + 2 * 365 * 24 * 3600)).toBeNull();
  });
});

describe('publicar el orden de la ruta (fase C, D63)', () => {
  const FECHA = '2026-10-29';
  async function conTres() {
    const { db, r } = repo();
    for (const [id, dir] of [['P261028-AAAAA', 'Calle A'], ['P261028-BBBBB', 'Calle B'], ['P261028-CCCCC', 'Calle C']] as const) {
      await r.guardarPedido(pedido({ idPedido: id, direccion: dir, estado: 'Confirmado' as never }), AHORA);
    }
    await r.guardarPedido(pedido({ idPedido: 'P261028-DDDDD', fechaEntrega: '2026-10-30', estado: 'Confirmado' as never }), AHORA);
    return { db, r };
  }

  it('guarda la posición de cada parada y deja la versión del pedido como estaba', async () => {
    const { db, r } = await conTres();
    const antes = (await r.obtenerPedido('P261028-AAAAA'))?.actualizadoEn;
    expect(await r.publicarOrdenDeRuta(FECHA, ['P261028-CCCCC', 'P261028-AAAAA', 'P261028-BBBBB'])).toBe(3);
    expect(db.sql("SELECT id, orden_ruta FROM pedidos WHERE fecha_entrega = '2026-10-29' ORDER BY orden_ruta")).toEqual([
      { id: 'P261028-CCCCC', orden_ruta: 1 },
      { id: 'P261028-AAAAA', orden_ruta: 2 },
      { id: 'P261028-BBBBB', orden_ruta: 3 },
    ]);
    expect((await r.obtenerPedido('P261028-AAAAA'))?.actualizadoEn).toBe(antes);
    expect((await r.obtenerPedido('P261028-AAAAA'))?.ordenRuta).toBe(2);
  });

  it('publicar de nuevo reemplaza el orden anterior, y no toca pedidos de otro día', async () => {
    const { db, r } = await conTres();
    await r.publicarOrdenDeRuta('2026-10-30', ['P261028-DDDDD']);
    await r.publicarOrdenDeRuta(FECHA, ['P261028-AAAAA', 'P261028-BBBBB', 'P261028-CCCCC']);
    await r.publicarOrdenDeRuta(FECHA, ['P261028-BBBBB']);
    expect(db.sql("SELECT id, orden_ruta FROM pedidos ORDER BY id")).toEqual([
      { id: 'P261028-AAAAA', orden_ruta: null },
      { id: 'P261028-BBBBB', orden_ruta: 1 },
      { id: 'P261028-CCCCC', orden_ruta: null },
      { id: 'P261028-DDDDD', orden_ruta: 1 },
    ]);
  });

  it('ignora ids que no son de ese día, y con una lista vacía quita la ruta publicada', async () => {
    const { db, r } = await conTres();
    expect(await r.publicarOrdenDeRuta(FECHA, ['P261028-AAAAA', 'P261028-DDDDD', 'P000000-ZZZZZ'])).toBe(1);
    expect(await r.publicarOrdenDeRuta(FECHA, [])).toBe(0);
    expect(db.sql('SELECT COUNT(*) AS n FROM pedidos WHERE orden_ruta IS NOT NULL')).toEqual([{ n: 0 }]);
  });

  it('con más paradas de las que caben en una consulta no publica a medias: falla sin tocar el orden anterior', async () => {
    const { db, r } = await conTres();
    await r.publicarOrdenDeRuta(FECHA, ['P261028-BBBBB', 'P261028-AAAAA']);
    const demasiadas = Array.from({ length: 91 }, (_, i) => `P261028-${String(i).padStart(5, '0')}`);
    await expect(r.publicarOrdenDeRuta(FECHA, demasiadas)).rejects.toThrow(RangeError);
    expect(db.sql('SELECT id, orden_ruta FROM pedidos WHERE orden_ruta IS NOT NULL ORDER BY orden_ruta')).toEqual([
      { id: 'P261028-BBBBB', orden_ruta: 1 },
      { id: 'P261028-AAAAA', orden_ruta: 2 },
    ]);
  });
});
