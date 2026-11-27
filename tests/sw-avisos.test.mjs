import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// El service worker de los avisos (D115), corrido con un `self` de mentira: recibe el push y muestra la notificación.
const codigo = readFileSync(new URL('../panel/admin/sw.js', import.meta.url), 'utf8');

function cargar() {
  const escuchas = {};
  const mostradas = [];
  const abiertas = [];
  let ventanas = [];
  const self = {
    location: { origin: 'https://admin.ejemplo.test' },
    skipWaiting: () => {},
    clients: { claim: async () => {}, matchAll: async () => ventanas, openWindow: async (url) => abiertas.push(url) },
    registration: { showNotification: async (titulo, opciones) => mostradas.push({ titulo, ...opciones }) },
    addEventListener: (nombre, funcion) => (escuchas[nombre] = funcion),
  };
  new Function('self', codigo)(self);
  const evento = (extra) => {
    const pendientes = [];
    return { waitUntil: (p) => pendientes.push(p), pendientes, ...extra };
  };
  return { escuchas, mostradas, abiertas, evento, ponerVentanas: (v) => (ventanas = v) };
}

describe('sw.js de los avisos', () => {
  it('muestra la notificación con el título, el texto y la etiqueta que llegan', async () => {
    const { escuchas, mostradas, evento } = cargar();
    const e = evento({ data: { json: () => ({ titulo: 'Brunen: reclamo de un cliente', cuerpo: 'Ábrelo en el panel.', etiqueta: 'brunen-reclamo', url: '/admin/' }) } });
    escuchas.push(e);
    await Promise.all(e.pendientes);
    expect(mostradas).toEqual([expect.objectContaining({ titulo: 'Brunen: reclamo de un cliente', body: 'Ábrelo en el panel.', tag: 'brunen-reclamo', renotify: true, data: { url: '/admin/' } })]);
  });

  it('si el contenido no se puede leer, igual muestra un aviso (iOS lo exige)', async () => {
    const { escuchas, mostradas, evento } = cargar();
    for (const data of [null, { json: () => { throw new Error('no es json'); } }]) {
      const e = evento({ data });
      escuchas.push(e);
      await Promise.all(e.pendientes);
    }
    expect(mostradas).toHaveLength(2);
    expect(mostradas[0].titulo).toBe('Brunen: hay un aviso');
  });

  it('una dirección que no es de /admin/ se ignora', async () => {
    const { escuchas, mostradas, evento } = cargar();
    const e = evento({ data: { json: () => ({ titulo: 'x', url: 'https://malo.test/' }) } });
    escuchas.push(e);
    await Promise.all(e.pendientes);
    expect(mostradas[0].data.url).toBe('/admin/');
  });

  it('al tocar la notificación, enfoca el panel si está abierto y si no lo abre', async () => {
    const { escuchas, abiertas, evento, ponerVentanas } = cargar();
    let enfocada = false;
    ponerVentanas([{ url: 'https://admin.ejemplo.test/admin/', focus: async () => (enfocada = true) }]);
    const a = evento({ notification: { close: () => {}, data: { url: '/admin/' } } });
    escuchas.notificationclick(a);
    await Promise.all(a.pendientes);
    expect(enfocada).toBe(true);
    expect(abiertas).toEqual([]);

    ponerVentanas([]);
    const b = evento({ notification: { close: () => {}, data: { url: '/admin/' } } });
    escuchas.notificationclick(b);
    await Promise.all(b.pendientes);
    expect(abiertas).toEqual(['https://admin.ejemplo.test/admin/']);
  });
});
