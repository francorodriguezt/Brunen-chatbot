import { describe, expect, it, vi } from 'vitest';
import { manejarRuta } from '../src/panel/ruta-api';
import type { PedidoARegistrar } from '../src/pedidos';
import { RepositorioPuntos } from '../src/puntos';
import { RepositorioD1 } from '../src/repositorio';
import { crearBaseSqlite } from './ayudas';

const AHORA = Math.floor(new Date('2026-11-13T09:00:00-03:00').getTime() / 1000);
const FECHA = '2026-11-13';

// Todo ficticio.
function pedido(id: string, direccion: string, comuna: string, bidones = 5, cambios: Partial<PedidoARegistrar> = {}): PedidoARegistrar {
  return {
    idPedido: id,
    telefono: '56911111111',
    nombre: `Cliente ${id}`,
    lineas: [{ tipo: '20L', cantidad: bidones, precioUnitario: 3300, subtotal: bidones * 3300 }],
    fechaEntrega: FECHA,
    estado: 'Confirmado' as PedidoARegistrar['estado'],
    comuna,
    direccion,
    notasRepartidor: '',
    envasesARetirar: 0,
    observaciones: '',
    ...cambios,
  };
}

async function entorno() {
  const db = crearBaseSqlite();
  const repositorio = new RepositorioD1(db, () => 1);
  const puntos = new RepositorioPuntos(db);
  await repositorio.guardarPedido(pedido('P261113-AAAAA', 'Calle Uno 1', 'Ñuñoa'), AHORA - 100);
  await repositorio.guardarPedido(pedido('P261113-BBBBB', 'Calle Dos 2', 'Las Condes'), AHORA - 90);
  await repositorio.guardarPedido(pedido('P261113-CCCCC', 'Calle Tres 3', 'Providencia'), AHORA - 80);
  await repositorio.guardarPedido(pedido('P261113-DDDDD', 'Calle Lejos 4', 'Maipú'), AHORA - 70); // comuna sin centro conocido y sin punto
  await repositorio.guardarPedido(pedido('P261114-EEEEE', 'Calle Mañana 5', 'Macul', 5, { fechaEntrega: '2026-11-14' }), AHORA - 60);
  await puntos.guardar('Calle Uno 1', 'Ñuñoa', { lat: -33.4569, lng: -70.5976, origen: 'manual' }, AHORA);
  const ctx = { repositorio, puntos, ahoraSegundos: AHORA };
  const llamar = (ruta: string, cuerpo?: unknown, cabeceras: Record<string, string> = { 'content-type': 'application/json', 'x-panel': '1' }) => {
    const url = new URL(`https://panel.example${ruta}`);
    const init: RequestInit = cuerpo === undefined ? { method: 'GET' } : { method: 'POST', headers: cabeceras, body: JSON.stringify(cuerpo) };
    return manejarRuta(new Request(url, init), url, ctx);
  };
  return { db, repositorio, llamar };
}

interface Ruta {
  fecha: string;
  publicada: boolean;
  sigueLaPublicada: boolean;
  plan: { orden: string[]; km: number; minutos: number; cargas: Array<{ paradas: string[]; recargaEn: string | null }> };
  paradas: Array<{ idPedido: string; lat: number | null; lng: number | null; aproximado: boolean; carga: number | null; estado: string }>;
  sinUbicar: string[];
  entregadas: string[];
  planta: { lat: number; lng: number };
  actum: { lat: number; lng: number };
}
const leer = async (r: Response | null) => (await (r as Response).json()) as Ruta;

describe('GET /api/ruta (fase C, D63)', () => {
  it('no es de esta puerta si la ruta no es de la ruta ni de los puntos', async () => {
    const { llamar } = await entorno();
    expect(await llamar('/api/pedidos')).toBeNull();
  });

  it('calcula la ruta de hoy con los pedidos confirmados, marca cuáles puntos son aproximados y deja aparte los que no se pueden ubicar', async () => {
    const { llamar } = await entorno();
    const r = await llamar(`/api/ruta?fecha=${FECHA}`);
    expect((r as Response).status).toBe(200);
    const ruta = await leer(r);
    expect(ruta.publicada).toBe(false);
    expect(ruta.sigueLaPublicada).toBe(false);
    expect([...ruta.plan.orden].sort()).toEqual(['P261113-AAAAA', 'P261113-BBBBB', 'P261113-CCCCC']);
    expect(ruta.sinUbicar).toEqual(['P261113-DDDDD']);
    const uno = ruta.paradas.find((p) => p.idPedido === 'P261113-AAAAA');
    expect(uno).toMatchObject({ lat: -33.4569, lng: -70.5976, aproximado: false });
    expect(ruta.paradas.find((p) => p.idPedido === 'P261113-BBBBB')?.aproximado).toBe(true);
    expect(ruta.plan.km).toBeGreaterThan(0);
    expect(ruta.planta.lat).toBeLessThan(-33);
    expect(ruta.actum.lng).toBeGreaterThan(ruta.planta.lng);
    expect(ruta.paradas.some((p) => p.idPedido === 'P261114-EEEEE')).toBe(false); // de otro día
  });

  it('una fecha mal escrita da 400', async () => {
    const { llamar } = await entorno();
    for (const f of ['', 'mañana', '2026-13-45']) expect(((await llamar(`/api/ruta?fecha=${f}`)) as Response).status).toBe(400);
  });
});

describe('publicar la ruta', () => {
  it('guarda el orden: la ruta queda publicada y el reparto la sigue; "optima" vuelve a calcular', async () => {
    const { llamar, repositorio } = await entorno();
    const orden = ['P261113-CCCCC', 'P261113-AAAAA', 'P261113-BBBBB'];
    expect(((await llamar('/api/ruta/publicar', { fecha: FECHA, orden })) as Response).status).toBe(200);
    const publicada = await leer(await llamar(`/api/ruta?fecha=${FECHA}`));
    expect(publicada.publicada).toBe(true);
    expect(publicada.plan.orden).toEqual(orden);
    expect(publicada.sigueLaPublicada).toBe(true);
    const delRepartidor = (await repositorio.pedidosDelDia(FECHA)).filter((p) => p.ordenRuta !== null).sort((a, b) => (a.ordenRuta ?? 0) - (b.ordenRuta ?? 0));
    expect(delRepartidor.map((p) => p.id)).toEqual([...orden, 'P261113-DDDDD']); // el que no se pudo ubicar va al final
    const optima = await leer(await llamar(`/api/ruta?fecha=${FECHA}&modo=optima`));
    expect(optima.publicada).toBe(true);
    expect(optima.sigueLaPublicada).toBe(false);
    expect(optima.plan.km).toBeLessThanOrEqual(publicada.plan.km + 1e-9);
  });

  it('si llega un pedido después de publicar, la ruta se calcula de nuevo y avisa que ya no es la publicada', async () => {
    const { llamar, repositorio } = await entorno();
    await llamar('/api/ruta/publicar', { fecha: FECHA, orden: ['P261113-CCCCC', 'P261113-AAAAA', 'P261113-BBBBB'] });
    await repositorio.guardarPedido(pedido('P261113-FFFFF', 'Calle Nueva 6', 'Macul'), AHORA - 10);
    const ruta = await leer(await llamar(`/api/ruta?fecha=${FECHA}`));
    expect(ruta.publicada).toBe(true);
    expect(ruta.sigueLaPublicada).toBe(false);
    expect(ruta.plan.orden).toContain('P261113-FFFFF');
  });

  it('rechaza un orden que no usa exactamente las paradas de la ruta, y las escrituras sin la cabecera del panel', async () => {
    const { llamar } = await entorno();
    expect(((await llamar('/api/ruta/publicar', { fecha: FECHA, orden: ['P261113-AAAAA'] })) as Response).status).toBe(422);
    expect(((await llamar('/api/ruta/publicar', { fecha: FECHA, orden: ['X', 'Y', 'Z'] })) as Response).status).toBe(422);
    expect(((await llamar('/api/ruta/publicar', { fecha: FECHA, orden: [] }, { 'content-type': 'application/json' })) as Response).status).toBe(400);
  });

  it('evaluar un orden a mano devuelve sus kilómetros sin guardar nada', async () => {
    const { llamar, repositorio } = await entorno();
    const r = await llamar('/api/ruta/evaluar', { fecha: FECHA, orden: ['P261113-BBBBB', 'P261113-AAAAA', 'P261113-CCCCC'] });
    const plan = ((await (r as Response).json()) as { plan: Ruta['plan'] }).plan;
    expect(plan.orden[0]).toBe('P261113-BBBBB');
    expect(plan.km).toBeGreaterThan(0);
    expect((await repositorio.pedidosDelDia(FECHA)).every((p) => p.ordenRuta === null)).toBe(true);
  });

  it('las paradas ya entregadas salen de la ruta y se listan aparte, y quedan primero al publicar', async () => {
    const { llamar, repositorio } = await entorno();
    await repositorio.cambiarEstado('P261113-AAAAA', 'Entregado', 'x', AHORA);
    const ruta = await leer(await llamar(`/api/ruta?fecha=${FECHA}`));
    expect(ruta.entregadas).toEqual(['P261113-AAAAA']);
    expect(ruta.plan.orden).not.toContain('P261113-AAAAA');
    await llamar('/api/ruta/publicar', { fecha: FECHA, orden: ruta.plan.orden });
    const ordenadas = (await repositorio.pedidosDelDia(FECHA)).filter((p) => p.ordenRuta !== null).sort((a, b) => (a.ordenRuta ?? 0) - (b.ordenRuta ?? 0));
    expect(ordenadas[0]?.id).toBe('P261113-AAAAA');
  });
});

describe('viajes guardados al publicar (D86)', () => {
  async function conTresGrandes() {
    const db = crearBaseSqlite();
    const repositorio = new RepositorioD1(db, () => 1);
    const puntos = new RepositorioPuntos(db);
    await repositorio.guardarPedido(pedido('P261113-AAAAA', 'Calle Uno 1', 'Ñuñoa', 30), AHORA - 100);
    await repositorio.guardarPedido(pedido('P261113-BBBBB', 'Calle Dos 2', 'Providencia', 30), AHORA - 90);
    await repositorio.guardarPedido(pedido('P261113-CCCCC', 'Calle Tres 3', 'Las Condes', 30), AHORA - 80);
    const ctx = { repositorio, puntos, ahoraSegundos: AHORA };
    const llamar = (ruta: string, cuerpo?: unknown) => {
      const url = new URL(`https://panel.example${ruta}`);
      const init: RequestInit = cuerpo === undefined ? { method: 'GET' } : { method: 'POST', headers: { 'content-type': 'application/json', 'x-panel': '1' }, body: JSON.stringify(cuerpo) };
      return manejarRuta(new Request(url, init), url, ctx);
    };
    return { db, repositorio, llamar };
  }
  const ORDEN = ['P261113-AAAAA', 'P261113-BBBBB', 'P261113-CCCCC'];

  it('al publicar guarda los viajes; si después se cancela un pedido, el mapa y la lista siguen con los mismos viajes', async () => {
    const { db, repositorio, llamar } = await conTresGrandes();
    expect(((await llamar('/api/ruta/publicar', { fecha: FECHA, orden: ORDEN })) as Response).status).toBe(200);
    expect(await repositorio.viajesPublicados(FECHA)).toEqual(new Map([['P261113-AAAAA', 1], ['P261113-BBBBB', 1], ['P261113-CCCCC', 2]]));
    db.sql("UPDATE pedidos SET estado = 'Cancelado' WHERE id = 'P261113-AAAAA'");
    const ruta = await leer(await llamar(`/api/ruta?fecha=${FECHA}`));
    expect(ruta.sigueLaPublicada).toBe(true);
    expect(ruta.plan.cargas.map((c) => c.paradas)).toEqual([['P261113-BBBBB'], ['P261113-CCCCC']]);
    expect(ruta.paradas.map((p) => [p.idPedido, p.carga])).toEqual([['P261113-BBBBB', 1], ['P261113-CCCCC', 2]]);
  });

  it('publicar de nuevo reemplaza los viajes de ese día', async () => {
    const { repositorio, llamar } = await conTresGrandes();
    await llamar('/api/ruta/publicar', { fecha: FECHA, orden: ORDEN });
    await llamar('/api/ruta/publicar', { fecha: FECHA, orden: ['P261113-CCCCC', 'P261113-AAAAA', 'P261113-BBBBB'] });
    expect(await repositorio.viajesPublicados(FECHA)).toEqual(new Map([['P261113-CCCCC', 1], ['P261113-AAAAA', 1], ['P261113-BBBBB', 2]]));
  });

  it('sin la tabla (antes de aplicar la migración 0016) la ruta se publica igual y los viajes van por capacidad', async () => {
    const { db, repositorio, llamar } = await conTresGrandes();
    db.sql('DROP TABLE viajes_publicados');
    const silencio = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(((await llamar('/api/ruta/publicar', { fecha: FECHA, orden: ORDEN })) as Response).status).toBe(200);
    expect(await repositorio.viajesPublicados(FECHA)).toEqual(new Map());
    const ruta = await leer(await llamar(`/api/ruta?fecha=${FECHA}`));
    expect(ruta.plan.cargas.map((c) => c.paradas)).toEqual([['P261113-AAAAA', 'P261113-BBBBB'], ['P261113-CCCCC']]);
    silencio.mockRestore();
  });
});

describe('POST /api/puntos: poner un pin a mano', () => {
  it('guarda el punto de una dirección y la ruta lo usa como exacto', async () => {
    const { llamar } = await entorno();
    const r = await llamar('/api/puntos', { direccion: 'Calle Dos 2', comuna: 'Las Condes', lat: -33.41, lng: -70.57 });
    expect((r as Response).status).toBe(200);
    const parada = (await leer(await llamar(`/api/ruta?fecha=${FECHA}`))).paradas.find((p) => p.idPedido === 'P261113-BBBBB');
    expect(parada).toMatchObject({ lat: -33.41, lng: -70.57, aproximado: false });
  });

  it('rechaza coordenadas fuera de la región o datos que no son lo que se espera', async () => {
    const { llamar } = await entorno();
    expect(((await llamar('/api/puntos', { direccion: 'Calle Dos 2', comuna: 'Las Condes', lat: 10, lng: 10 })) as Response).status).toBe(422);
    expect(((await llamar('/api/puntos', { direccion: 'Calle Dos 2', comuna: 'Las Condes', lat: '-33.4', lng: -70.5 })) as Response).status).toBe(400);
    expect(((await llamar('/api/puntos', { comuna: 'Las Condes', lat: -33.4, lng: -70.5 })) as Response).status).toBe(400);
  });
});

describe('versiones de la ruta publicada (D94)', () => {
  it('cada publicación del día sube la versión; el día siguiente empieza en 1', async () => {
    const { repositorio, llamar } = await entorno();
    const orden = ['P261113-AAAAA', 'P261113-BBBBB', 'P261113-CCCCC'];
    const primera = (await (await llamar('/api/ruta/publicar', { fecha: FECHA, orden }) as Response).json()) as { version: number | null };
    expect(primera.version).toBe(1);
    const segunda = (await (await llamar('/api/ruta/publicar', { fecha: FECHA, orden: [...orden].reverse() }) as Response).json()) as { version: number | null };
    expect(segunda.version).toBe(2);
    expect(await repositorio.publicacionDe(FECHA)).toEqual({ version: 2, publicadaEn: AHORA, vistaVersion: null, vistaEn: null });
    expect(await repositorio.registrarPublicacion('2026-11-14', AHORA)).toBe(1);
  });

  it('sin la tabla (antes de aplicar la migración 0017) la ruta se publica igual, sin versión', async () => {
    const { db, repositorio, llamar } = await entorno();
    db.sql('DROP TABLE rutas_publicadas');
    const silencio = vi.spyOn(console, 'error').mockImplementation(() => {});
    const r = (await llamar('/api/ruta/publicar', { fecha: FECHA, orden: ['P261113-AAAAA', 'P261113-BBBBB', 'P261113-CCCCC'] })) as Response;
    expect(r.status).toBe(200);
    expect(((await r.json()) as { version: number | null }).version).toBeNull();
    expect(await repositorio.publicacionDe(FECHA)).toBeNull();
    silencio.mockRestore();
  });
});
