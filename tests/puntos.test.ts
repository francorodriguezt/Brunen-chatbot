import { describe, expect, it } from 'vitest';
import { RepositorioPuntos, claveDePunto } from '../src/puntos';
import { crearBaseSqlite } from './ayudas';

const AHORA = 1794582000;
const CERCA = { lat: -33.4569, lng: -70.5976 }; // Ñuñoa, ficticio

function repo() {
  const db = crearBaseSqlite();
  return { db, puntos: new RepositorioPuntos(db) };
}

describe('puntos del mapa (fase C, D63)', () => {
  it('la misma dirección escrita distinto es el mismo punto', () => {
    expect(claveDePunto('Av. Grecia 123, depto 4', 'Ñuñoa')).toBe(claveDePunto('av grecia 123 depto 4', 'nunoa'));
    expect(claveDePunto('Av. Grecia 123', 'Ñuñoa')).not.toBe(claveDePunto('Av. Grecia 124', 'Ñuñoa'));
  });

  it('guarda un pin puesto a mano y lo devuelve por su dirección', async () => {
    const { puntos } = repo();
    expect(await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...CERCA, origen: 'manual' }, AHORA)).toBe('guardado');
    const mapa = await puntos.deDirecciones([{ direccion: 'calle falsa 123', comuna: 'nunoa' }, { direccion: 'Otra 1', comuna: 'Macul' }]);
    expect(mapa.get(claveDePunto('Calle Falsa 123', 'Ñuñoa'))).toMatchObject({ ...CERCA, origen: 'manual' });
    expect(mapa.size).toBe(1);
  });

  it('el teléfono aprende el punto al entregar si el GPS es preciso (75 m o menos), y no si no lo es', async () => {
    const { puntos } = repo();
    expect(await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...CERCA, origen: 'repartidor', precisionM: 20 }, AHORA)).toBe('guardado');
    expect(await puntos.guardar('Calle Nueva 9', 'Ñuñoa', { ...CERCA, origen: 'repartidor', precisionM: 400 }, AHORA)).toBe('ignorado');
    expect(await puntos.guardar('Calle Nueva 9', 'Ñuñoa', { ...CERCA, origen: 'repartidor' }, AHORA)).toBe('ignorado');
    expect((await puntos.deDirecciones([{ direccion: 'Calle Nueva 9', comuna: 'Ñuñoa' }])).size).toBe(0);
  });

  it('un pin puesto a mano nunca lo pisa el teléfono, pero otro pin a mano sí', async () => {
    const { puntos } = repo();
    await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...CERCA, origen: 'manual' }, AHORA);
    const otro = { lat: CERCA.lat + 0.001, lng: CERCA.lng };
    expect(await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...otro, origen: 'repartidor', precisionM: 5 }, AHORA + 1)).toBe('ignorado');
    expect(await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...otro, origen: 'manual' }, AHORA + 2)).toBe('guardado');
    const mapa = await puntos.deDirecciones([{ direccion: 'Calle Falsa 123', comuna: 'Ñuñoa' }]);
    expect(mapa.get(claveDePunto('Calle Falsa 123', 'Ñuñoa'))?.lat).toBe(otro.lat);
  });

  it('el teléfono solo cambia un punto suyo si la lectura nueva es igual o más precisa', async () => {
    const { puntos } = repo();
    await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...CERCA, origen: 'repartidor', precisionM: 30 }, AHORA);
    const peor = { lat: CERCA.lat + 0.0005, lng: CERCA.lng };
    const mejor = { lat: CERCA.lat - 0.0002, lng: CERCA.lng };
    expect(await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...peor, origen: 'repartidor', precisionM: 60 }, AHORA + 1)).toBe('ignorado');
    expect(await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...mejor, origen: 'repartidor', precisionM: 10 }, AHORA + 2)).toBe('guardado');
    const mapa = await puntos.deDirecciones([{ direccion: 'Calle Falsa 123', comuna: 'Ñuñoa' }]);
    expect(mapa.get(claveDePunto('Calle Falsa 123', 'Ñuñoa'))).toMatchObject({ lat: mejor.lat, precisionM: 10 });
  });

  it('rechaza coordenadas que no son números o que caen fuera de la Región Metropolitana', async () => {
    const { puntos } = repo();
    for (const mala of [{ lat: Number.NaN, lng: -70.6 }, { lat: 0, lng: 0 }, { lat: -33.45, lng: 70.6 }, { lat: -45, lng: -70.6 }, { lat: Infinity, lng: -70.6 }]) {
      expect(await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...mala, origen: 'manual' }, AHORA)).toBe('invalido');
    }
    expect(await puntos.guardar('', 'Ñuñoa', { ...CERCA, origen: 'manual' }, AHORA)).toBe('invalido');
  });

  it('busca muchas direcciones de una vez, sin pasar el tope de valores por consulta de D1', async () => {
    const { puntos } = repo();
    await puntos.guardar('Calle 1', 'Ñuñoa', { ...CERCA, origen: 'manual' }, AHORA);
    const direcciones = Array.from({ length: 250 }, (_, i) => ({ direccion: `Calle ${i + 1}`, comuna: 'Ñuñoa' }));
    expect((await puntos.deDirecciones(direcciones)).size).toBe(1);
  });
});

describe('la ubicación que manda el cliente (D77)', () => {
  const LEJOS = { lat: -33.43, lng: -70.6 };

  it('se guarda si no hay punto, y una ubicación nueva del cliente reemplaza a la anterior', async () => {
    const { puntos } = repo();
    expect(await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...LEJOS, origen: 'cliente' }, AHORA)).toBe('guardado');
    expect(await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...CERCA, origen: 'cliente' }, AHORA + 1)).toBe('guardado');
    const mapa = await puntos.deDirecciones([{ direccion: 'Calle Falsa 123', comuna: 'Ñuñoa' }]);
    expect(mapa.get(claveDePunto('Calle Falsa 123', 'Ñuñoa'))).toMatchObject({ ...CERCA, origen: 'cliente' });
  });

  it('no pisa un pin manual ni el GPS del repartidor', async () => {
    const { puntos } = repo();
    await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...CERCA, origen: 'manual' }, AHORA);
    expect(await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...LEJOS, origen: 'cliente' }, AHORA + 1)).toBe('ignorado');
    await puntos.guardar('Otra 9', 'Macul', { ...CERCA, origen: 'repartidor', precisionM: 60 }, AHORA);
    expect(await puntos.guardar('Otra 9', 'Macul', { ...LEJOS, origen: 'cliente' }, AHORA + 1)).toBe('ignorado');
  });

  it('el GPS del repartidor reemplaza la ubicación del cliente (pudo mandarla desde otro lado)', async () => {
    const { puntos } = repo();
    await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...LEJOS, origen: 'cliente' }, AHORA);
    expect(await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { ...CERCA, origen: 'repartidor', precisionM: 70 }, AHORA + 1)).toBe('guardado');
    const mapa = await puntos.deDirecciones([{ direccion: 'Calle Falsa 123', comuna: 'Ñuñoa' }]);
    expect(mapa.get(claveDePunto('Calle Falsa 123', 'Ñuñoa'))).toMatchObject({ ...CERCA, origen: 'repartidor', precisionM: 70 });
  });
});
