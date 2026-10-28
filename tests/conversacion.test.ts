import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BaseDatos } from '../src/almacen';
import { MemoriaConversaciones, VIGENCIA_CONVERSACION_SEGUNDOS, validarEstado, type EstadoConversacion } from '../src/conversacion';
import { crearBaseSqlite } from './ayudas';

afterEach(() => vi.restoreAllMocks());

const AHORA = 1793000000;
const TEL = '56900000001';
const A_MEDIAS: EstadoConversacion = { espera: 'tipo', items: [{ tipo: 'no_especificado', cantidad: 4 }], fecha_texto: 'viernes', comuna_mencionada: 'Ñuñoa' };

describe('validarEstado', () => {
  it('acepta un estado válido', () => {
    expect(validarEstado(A_MEDIAS)).toEqual(A_MEDIAS);
  });

  it.each([
    ['nulo', null],
    ['texto', 'tipo'],
    ['espera inventada', { espera: 'direccion', items: [] }],
    ['sin ítems', { espera: 'tipo' }],
    ['ítems inválidos', { espera: 'tipo', items: [{ tipo: '15L', cantidad: 1 }] }],
    ['cantidad absurda', { espera: 'cantidad', items: [{ tipo: '20L', cantidad: 5000 }] }],
  ])('descarta %s', (_nombre, crudo) => {
    expect(validarEstado(crudo)).toBeNull();
  });

  it('descarta textos largos de fecha o comuna en vez de guardarlos', () => {
    const r = validarEstado({ ...A_MEDIAS, fecha_texto: 'x'.repeat(41), comuna_mencionada: '' });
    expect(r).toEqual({ espera: 'tipo', items: A_MEDIAS.items });
  });
});

describe('MemoriaConversaciones: conversación a medias', () => {
  it('guarda y recupera el pedido a medias', async () => {
    const memoria = new MemoriaConversaciones(crearBaseSqlite());
    await memoria.guardar(TEL, A_MEDIAS, AHORA);
    expect(await memoria.obtener(TEL, AHORA + 60)).toEqual(A_MEDIAS);
  });

  it('un teléfono sin conversación da null, y cada teléfono tiene la suya', async () => {
    const memoria = new MemoriaConversaciones(crearBaseSqlite());
    await memoria.guardar(TEL, A_MEDIAS, AHORA);
    expect(await memoria.obtener('56900000002', AHORA)).toBeNull();
  });

  it('guardar de nuevo reemplaza el estado anterior', async () => {
    const memoria = new MemoriaConversaciones(crearBaseSqlite());
    await memoria.guardar(TEL, A_MEDIAS, AHORA);
    const nuevo: EstadoConversacion = { espera: 'cantidad', items: [{ tipo: '20L', cantidad: null }] };
    await memoria.guardar(TEL, nuevo, AHORA + 10);
    expect(await memoria.obtener(TEL, AHORA + 20)).toEqual(nuevo);
  });

  it('vence a las 12 horas', async () => {
    const memoria = new MemoriaConversaciones(crearBaseSqlite());
    await memoria.guardar(TEL, A_MEDIAS, AHORA);
    expect(await memoria.obtener(TEL, AHORA + VIGENCIA_CONVERSACION_SEGUNDOS - 1)).toEqual(A_MEDIAS);
    expect(await memoria.obtener(TEL, AHORA + VIGENCIA_CONVERSACION_SEGUNDOS + 1)).toBeNull();
  });

  it('borrar deja al cliente sin conversación', async () => {
    const memoria = new MemoriaConversaciones(crearBaseSqlite());
    await memoria.guardar(TEL, A_MEDIAS, AHORA);
    await memoria.borrar(TEL);
    expect(await memoria.obtener(TEL, AHORA)).toBeNull();
  });

  it('un contenido dañado en la base no se usa', async () => {
    const db = crearBaseSqlite();
    await db.prepare('INSERT INTO conversaciones (telefono, estado, actualizado_en) VALUES (?1, ?2, ?3)').bind(TEL, '{no es json', AHORA).run();
    expect(await new MemoriaConversaciones(db).obtener(TEL, AHORA)).toBeNull();
    await db.prepare('UPDATE conversaciones SET estado = ?1').bind('{"espera":"inventada","items":[]}').run();
    expect(await new MemoriaConversaciones(db).obtener(TEL, AHORA)).toBeNull();
  });
});

describe('MemoriaConversaciones: último pedido', () => {
  const PEDIDO = [{ tipo: '20L' as const, cantidad: 2 }, { tipo: '12L' as const, cantidad: 1 }];

  it('guarda y recupera el último pedido', async () => {
    const memoria = new MemoriaConversaciones(crearBaseSqlite());
    await memoria.guardarUltimoPedido(TEL, PEDIDO, AHORA);
    expect(await memoria.ultimoPedido(TEL)).toEqual(PEDIDO);
  });

  it('el pedido nuevo reemplaza al anterior', async () => {
    const memoria = new MemoriaConversaciones(crearBaseSqlite());
    await memoria.guardarUltimoPedido(TEL, PEDIDO, AHORA);
    await memoria.guardarUltimoPedido(TEL, [{ tipo: '20L', cantidad: 3 }], AHORA + 1);
    expect(await memoria.ultimoPedido(TEL)).toEqual([{ tipo: '20L', cantidad: 3 }]);
  });

  it('sin pedido anterior da null', async () => {
    expect(await new MemoriaConversaciones(crearBaseSqlite()).ultimoPedido(TEL)).toBeNull();
  });

  it('un pedido incompleto (sin tamaño o sin cantidad) no sirve para repetirlo', async () => {
    const memoria = new MemoriaConversaciones(crearBaseSqlite());
    await memoria.guardarUltimoPedido(TEL, [{ tipo: 'no_especificado', cantidad: 2 }], AHORA);
    expect(await memoria.ultimoPedido(TEL)).toBeNull();
    await memoria.guardarUltimoPedido(TEL, [{ tipo: '20L', cantidad: null }], AHORA);
    expect(await memoria.ultimoPedido(TEL)).toBeNull();
  });
});

describe('MemoriaConversaciones: limpieza', () => {
  it('borra las conversaciones vencidas y los últimos pedidos de hace más de 180 días', async () => {
    const db = crearBaseSqlite();
    const memoria = new MemoriaConversaciones(db, () => 0); // el azar siempre limpia
    await memoria.guardar('vieja', A_MEDIAS, AHORA - VIGENCIA_CONVERSACION_SEGUNDOS - 10);
    await memoria.guardar('reciente', A_MEDIAS, AHORA - 60);
    await memoria.guardarUltimoPedido('antiguo', [{ tipo: '20L', cantidad: 1 }], AHORA - 181 * 24 * 3600);
    await memoria.guardarUltimoPedido('actual', [{ tipo: '20L', cantidad: 1 }], AHORA - 30 * 24 * 3600);
    await memoria.limpiar(AHORA);
    expect(db.sql('SELECT telefono FROM conversaciones')).toEqual([{ telefono: 'reciente' }]);
    expect(db.sql('SELECT telefono FROM ultimos_pedidos')).toEqual([{ telefono: 'actual' }]);
  });

  it('casi siempre no hace nada (limpia en 1 de cada ~50 llamadas)', async () => {
    const db = crearBaseSqlite();
    const memoria = new MemoriaConversaciones(db, () => 0.5);
    await memoria.guardar('vieja', A_MEDIAS, AHORA - VIGENCIA_CONVERSACION_SEGUNDOS - 10);
    await memoria.limpiar(AHORA);
    expect(db.sql('SELECT telefono FROM conversaciones')).toHaveLength(1);
  });
});

describe('MemoriaConversaciones: si D1 falla', () => {
  const rota: BaseDatos = {
    prepare: () => ({
      bind: () => ({
        run: async () => {
          throw new Error('D1 caída');
        },
      }),
    }),
  };

  it('no lanza errores: lee como si no hubiera memoria y lo anota en el log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const memoria = new MemoriaConversaciones(rota, () => 0);
    expect(await memoria.obtener(TEL, AHORA)).toBeNull();
    expect(await memoria.ultimoPedido(TEL)).toBeNull();
    await expect(memoria.guardar(TEL, A_MEDIAS, AHORA)).resolves.toBeUndefined();
    await expect(memoria.borrar(TEL)).resolves.toBeUndefined();
    await expect(memoria.guardarUltimoPedido(TEL, [], AHORA)).resolves.toBeUndefined();
    await expect(memoria.limpiar(AHORA)).resolves.toBeUndefined();
    expect(error).toHaveBeenCalledTimes(6);
  });

  it('el aviso del log no lleva el teléfono ni el contenido', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    await new MemoriaConversaciones(rota).guardar(TEL, A_MEDIAS, AHORA);
    expect(JSON.stringify(error.mock.calls)).not.toContain(TEL);
    expect(JSON.stringify(error.mock.calls)).not.toContain('viernes');
  });
});
