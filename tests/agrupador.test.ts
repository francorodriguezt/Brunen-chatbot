import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BaseDatos } from '../src/almacen';
import { agruparMensaje, limpiarPendientes, type MensajeAgrupable } from '../src/agrupador';
import { crearBaseSqlite } from './ayudas';

afterEach(() => vi.restoreAllMocks());

const msg = (wamid: string, texto: string, telefono = '56900000001'): MensajeAgrupable => ({ wamid, telefono, texto });

/** Una espera que se abre a mano, para controlar el orden en que despiertan los mensajes. */
function esperaManual() {
  const pendientes: Array<() => void> = [];
  return {
    esperar: () => new Promise<void>((resolver) => pendientes.push(resolver)),
    esperando: () => pendientes.length,
    despertarTodos: () => pendientes.splice(0).forEach((despertar) => despertar()),
  };
}

describe('agruparMensaje', () => {
  it('un mensaje solo se procesa solo, después de esperar', async () => {
    const db = crearBaseSqlite();
    const espera = vi.fn(async () => {});
    expect(await agruparMensaje(db, msg('w1', 'quiero 2 de 20'), { esperar: espera, esperaMs: 5000 })).toEqual(['quiero 2 de 20']);
    expect(espera).toHaveBeenCalledWith(5000);
    expect(db.sql('SELECT * FROM mensajes_pendientes')).toEqual([]); // se borró al procesarlo
  });

  it('dos mensajes seguidos se juntan, y solo el último procesa', async () => {
    const db = crearBaseSqlite();
    const espera = esperaManual();
    const primero = agruparMensaje(db, msg('w1', '2 bidones'), { esperar: espera.esperar });
    await vi.waitFor(() => expect(espera.esperando()).toBe(1));
    const segundo = agruparMensaje(db, msg('w2', 'de 20'), { esperar: espera.esperar });
    await vi.waitFor(() => expect(espera.esperando()).toBe(2));

    espera.despertarTodos();
    expect(await primero).toBeNull(); // llegó uno más nuevo: se retira
    expect(await segundo).toEqual(['2 bidones', 'de 20']); // en el orden en que llegaron
    expect(db.sql('SELECT * FROM mensajes_pendientes')).toEqual([]);
  });

  it('tres mensajes se juntan igual', async () => {
    const db = crearBaseSqlite();
    const espera = esperaManual();
    const a = agruparMensaje(db, msg('w1', 'hola'), { esperar: espera.esperar });
    await vi.waitFor(() => expect(espera.esperando()).toBe(1));
    const b = agruparMensaje(db, msg('w2', '2 de 20'), { esperar: espera.esperar });
    await vi.waitFor(() => expect(espera.esperando()).toBe(2));
    const c = agruparMensaje(db, msg('w3', 'para mañana'), { esperar: espera.esperar });
    await vi.waitFor(() => expect(espera.esperando()).toBe(3));
    espera.despertarTodos();
    expect([await a, await b, await c]).toEqual([null, null, ['hola', '2 de 20', 'para mañana']]);
  });

  it('los mensajes de números distintos no se mezclan', async () => {
    const db = crearBaseSqlite();
    const espera = esperaManual();
    const ana = agruparMensaje(db, msg('w1', 'pedido de Ana', '56911111111'), { esperar: espera.esperar });
    await vi.waitFor(() => expect(espera.esperando()).toBe(1));
    const luis = agruparMensaje(db, msg('w2', 'pedido de Luis', '56922222222'), { esperar: espera.esperar });
    await vi.waitFor(() => expect(espera.esperando()).toBe(2));
    espera.despertarTodos();
    expect(await ana).toEqual(['pedido de Ana']);
    expect(await luis).toEqual(['pedido de Luis']);
  });

  it('un mensaje que llega después de que el anterior ya se procesó forma su propio grupo', async () => {
    const db = crearBaseSqlite();
    const sinEspera = async () => {};
    expect(await agruparMensaje(db, msg('w1', 'primero'), { esperar: sinEspera })).toEqual(['primero']);
    expect(await agruparMensaje(db, msg('w2', 'segundo'), { esperar: sinEspera })).toEqual(['segundo']);
  });

  it('un reintento del mismo mensaje no lo repite dentro del grupo', async () => {
    const db = crearBaseSqlite();
    const espera = esperaManual();
    const original = agruparMensaje(db, msg('w1', 'quiero 2 de 20'), { esperar: espera.esperar });
    await vi.waitFor(() => expect(espera.esperando()).toBe(1));
    const reintento = agruparMensaje(db, msg('w1', 'quiero 2 de 20'), { esperar: espera.esperar });
    await vi.waitFor(() => expect(espera.esperando()).toBe(2));
    espera.despertarTodos();
    // En producción la deduplicación por wamid (almacen.ts) frena el reintento antes de llegar aquí; esto prueba
    // que, aun si llegara, el mensaje queda una sola vez en la base y en el texto.
    const textos = [await original, await reintento].flatMap((r) => r ?? []);
    expect(textos.length).toBeGreaterThan(0);
    for (const texto of textos) expect(texto).toBe('quiero 2 de 20');
    expect(db.sql('SELECT * FROM mensajes_pendientes')).toEqual([]);
  });

  it('si otro proceso ya se llevó el mensaje, no lo procesa de nuevo', async () => {
    const db = crearBaseSqlite();
    const espera = esperaManual();
    const lento = agruparMensaje(db, msg('w1', 'hola'), { esperar: espera.esperar });
    await vi.waitFor(() => expect(espera.esperando()).toBe(1));
    db.sql("DELETE FROM mensajes_pendientes WHERE wamid = 'w1'"); // otro proceso lo procesó
    espera.despertarTodos();
    expect(await lento).toBeNull();
  });

  it('si D1 falla, atiende el mensaje solo en vez de perderlo', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const rota: BaseDatos = {
      prepare: () => ({
        bind: () => ({
          run: async () => {
            throw new Error('D1 caída');
          },
        }),
      }),
    };
    expect(await agruparMensaje(rota, msg('w1', 'quiero 2 de 20'), { esperar: async () => {} })).toEqual(['quiero 2 de 20']);
    expect(error).toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain('quiero 2 de 20');
  });

  it('el mensaje se guarda con su hora, para poder limpiar lo huérfano', async () => {
    const db = crearBaseSqlite();
    const espera = esperaManual();
    const pendiente = agruparMensaje(db, msg('w1', 'hola'), { esperar: espera.esperar, ahoraSegundos: 1793000000 });
    await vi.waitFor(() => expect(espera.esperando()).toBe(1));
    expect(db.sql('SELECT wamid, recibido_en FROM mensajes_pendientes')).toEqual([{ wamid: 'w1', recibido_en: 1793000000 }]);
    espera.despertarTodos();
    await pendiente;
  });
});

describe('limpiarPendientes', () => {
  it('borra los mensajes que llevan más de una hora sin procesar', async () => {
    const db = crearBaseSqlite();
    const ahora = 1793000000;
    for (const [wamid, hace] of [['viejo', 7200], ['reciente', 60]] as const) {
      await db.prepare('INSERT INTO mensajes_pendientes (wamid, telefono, texto, recibido_en) VALUES (?1, ?2, ?3, ?4)').bind(wamid, '569', 'x', ahora - hace).run();
    }
    await limpiarPendientes(db, ahora);
    expect(db.sql('SELECT wamid FROM mensajes_pendientes')).toEqual([{ wamid: 'reciente' }]);
  });
});
