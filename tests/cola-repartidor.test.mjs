import { describe, expect, it } from 'vitest';
import { agregar, clasificar, cuerpoParaEnviar, enviarPendientes, normalizar, nuevaMarca, pendientes, rechazadas } from '../panel/repartidor/cola.js';

// Todo ficticio. 13 de noviembre de 2026, mediodía en Santiago.
const AHORA_MS = Date.parse('2026-11-13T12:00:00-03:00');
const parada = (idPedido, nombre = 'Ana Prueba') => ({ idPedido, nombre, orden: 1 });
const marca = (idPedido, tipo = 'entregado', cuerpo = { vacios: 2, cobrado: false }) =>
  nuevaMarca({ parada: parada(idPedido), tipo, cuerpo, fecha: '2026-11-13', ahoraMs: AHORA_MS });

/** Un teléfono de mentira: la cola en memoria y un servidor que responde lo que se le diga, en orden. */
function telefono(cola, respuestas) {
  let guardada = cola;
  const enviadas = [];
  return {
    leer: () => guardada,
    guardar: (nueva) => (guardada = nueva),
    enviar: async (m) => {
      enviadas.push(m.id);
      const siguiente = respuestas.shift();
      if (siguiente === 'sin señal' || siguiente === undefined) throw new TypeError('Failed to fetch');
      return typeof siguiente === 'function' ? siguiente() : siguiente;
    },
    get cola() {
      return guardada;
    },
    enviadas,
  };
}

describe('qué significa cada respuesta del servidor (D84)', () => {
  it.each([
    [200, 'anotada'],
    [401, 'sin_sesion'],
    [500, 'reintentar'],
    [503, 'reintentar'],
    [429, 'reintentar'],
    [408, 'reintentar'],
    [0, 'reintentar'],
    [400, 'rechazada'],
    [403, 'rechazada'],
    [404, 'rechazada'],
    [409, 'rechazada'],
    [422, 'rechazada'],
  ])('%i → %s', (estado, esperado) => {
    expect(clasificar(estado)).toBe(esperado);
  });
});

describe('enviar la cola (D84)', () => {
  it('lo que el servidor confirma sale de la cola', async () => {
    const t = telefono([marca('P1')], [{ estado: 200, datos: { ok: true } }]);
    expect(await enviarPendientes(t)).toMatchObject({ anotadas: [expect.any(String)], rechazadas: [], detenida: null });
    expect(t.cola).toEqual([]);
  });

  it.each([500, 503, 429])('si el servidor falla de su lado (%i), la marca queda y se reintenta después', async (estado) => {
    const t = telefono([marca('P1')], [{ estado, datos: { error: 'No se pudo completar.' } }]);
    expect(await enviarPendientes(t)).toMatchObject({ anotadas: [], detenida: 'servidor' });
    expect(pendientes(t.cola)).toHaveLength(1);
    // La siguiente vuelta la envía de nuevo y, si sale, la quita.
    const despues = telefono(t.cola, [{ estado: 200 }]);
    await enviarPendientes(despues);
    expect(despues.cola).toEqual([]);
  });

  it('sin señal, la marca queda y no se intenta la siguiente', async () => {
    const t = telefono([marca('P1'), marca('P2')], ['sin señal']);
    expect(await enviarPendientes(t)).toMatchObject({ detenida: 'sin_senal' });
    expect(t.enviadas).toEqual(['P1']);
    expect(pendientes(t.cola)).toHaveLength(2);
  });

  it('con la sesión vencida, la marca queda para enviarla después de entrar', async () => {
    const t = telefono([marca('P1')], [{ estado: 401 }]);
    expect(await enviarPendientes(t)).toMatchObject({ detenida: 'sin_sesion' });
    expect(pendientes(t.cola)).toHaveLength(1);
  });

  it('un rechazo queda a la vista con el motivo del servidor, no se reintenta y no frena a las demás', async () => {
    const t = telefono(
      [marca('P1'), marca('P2')],
      [{ estado: 409, datos: { error: 'Ese pedido ya no está en la ruta.' } }, { estado: 200 }],
    );
    const resumen = await enviarPendientes(t);
    expect(resumen.rechazadas).toEqual([{ op: expect.any(String), motivo: 'Ese pedido ya no está en la ruta.' }]);
    expect(resumen.anotadas).toHaveLength(1);
    expect(rechazadas(t.cola)).toEqual([expect.objectContaining({ id: 'P1', rechazo: 'Ese pedido ya no está en la ruta.' })]);
    expect(pendientes(t.cola)).toEqual([]);
    // Otra vuelta no la vuelve a mandar.
    const otra = telefono(t.cola, []);
    await enviarPendientes(otra);
    expect(otra.enviadas).toEqual([]);
  });

  it('un rechazo sin explicación igual dice algo', async () => {
    const t = telefono([marca('P1')], [{ estado: 400, datos: null }]);
    await enviarPendientes(t);
    expect(rechazadas(t.cola)[0]?.rechazo).toBe('El sistema no aceptó esta marca.');
  });

  it('lo que se marca mientras se envía también sale en la misma vuelta', async () => {
    let t;
    t = telefono([marca('P1')], [
      () => {
        t.guardar(agregar(t.leer(), marca('P2')));
        return { estado: 200 };
      },
      { estado: 200 },
    ]);
    await enviarPendientes(t);
    expect(t.enviadas).toEqual(['P1', 'P2']);
    expect(t.cola).toEqual([]);
  });

  it('si la parada se marca de nuevo mientras viaja la primera, la nueva no se pierde', async () => {
    let t;
    const corregida = marca('P1', 'entregado', { vacios: 3, cobrado: true });
    t = telefono([marca('P1')], [
      () => {
        t.guardar(agregar(t.leer(), corregida));
        return { estado: 200 };
      },
      { estado: 200 },
    ]);
    await enviarPendientes(t);
    expect(t.enviadas).toEqual(['P1', 'P1']);
    expect(t.cola).toEqual([]);
  });
});

describe('las marcas (D84)', () => {
  it('marcar de nuevo una parada reemplaza la marca anterior, aunque sea de otro tipo o estuviera rechazada', () => {
    const noSePudo = marca('P1', 'no-se-pudo', { motivo: 'no_estaba', detalle: '' });
    const rechazada = { ...marca('P2'), rechazo: 'Ese pedido no es de la ruta de hoy.' };
    const cola = agregar(agregar([noSePudo, rechazada, marca('P3')], marca('P1')), marca('P2'));
    expect(cola.map((m) => [m.id, m.tipo, m.rechazo ?? null])).toEqual([
      ['P3', 'entregado', null],
      ['P1', 'entregado', null],
      ['P2', 'entregado', null],
    ]);
  });

  it('cada marca lleva la fecha de su ruta y la hora del teléfono, y eso viaja al servidor', () => {
    const m = marca('P1');
    expect(m).toMatchObject({ id: 'P1', nombre: 'Ana Prueba', fecha: '2026-11-13', marcadoEn: Math.floor(AHORA_MS / 1000) });
    expect(cuerpoParaEnviar(m)).toEqual({ vacios: 2, cobrado: false, fecha: '2026-11-13', marcadoEn: Math.floor(AHORA_MS / 1000) });
    expect(marca('P1').op).not.toBe(m.op);
  });

  it('lee la cola de la versión anterior de la app y descarta lo que no tiene forma', () => {
    const vieja = [
      { id: 'P1', tipo: 'entregado', cuerpo: { vacios: 1, cobrado: false } },
      { id: 'P2', tipo: 'borrar', cuerpo: {} },
      { tipo: 'entregado', cuerpo: {} },
      'basura',
    ];
    const cola = normalizar(vieja);
    expect(cola).toEqual([{ id: 'P1', tipo: 'entregado', cuerpo: { vacios: 1, cobrado: false }, op: 'P1:entregado' }]);
    expect(cuerpoParaEnviar(cola[0])).toEqual({ vacios: 1, cobrado: false });
    expect(normalizar(null)).toEqual([]);
  });
});
