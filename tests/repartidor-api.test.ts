import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import panel, { type EntornoPanel } from '../src/panel';
import { Cuentas } from '../src/panel/cuentas';
import type { PedidoARegistrar } from '../src/pedidos';
import { RepositorioPuntos } from '../src/puntos';
import { RepositorioD1 } from '../src/repositorio';
import { crearBaseSqlite } from './ayudas';

// Viernes 13 de noviembre de 2026, mediodía en Chile. Todo ficticio.
const AHORA_FECHA = new Date('2026-11-13T12:00:00-03:00');
const AHORA = Math.floor(AHORA_FECHA.getTime() / 1000);
const HOY = '2026-11-13';
const SECRETO = 'secreto-de-prueba-con-mas-de-32-caracteres';

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
    notasRepartidor: 'Timbre 4B',
    envasesARetirar: 3,
    observaciones: 'Nota interna que el repartidor no ve',
    ...cambios,
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA_FECHA);
});
afterEach(() => vi.useRealTimers());

async function entorno() {
  const db = crearBaseSqlite();
  const cuentas = new Cuentas(db, SECRETO);
  await cuentas.crearUsuario({ rut: '22.222.222-2', nombre: 'Repartidor Prueba', rol: 'repartidor', clave: '2580' }, 'prueba', AHORA - 1000);
  await cuentas.crearUsuario({ rut: '11.111.111-1', nombre: 'Operadora Prueba', rol: 'administrador', clave: '2580', correo: 'operadora@brunen.test' }, 'prueba', AHORA - 1000);
  const sesion = async (rol: 'repartidor' | 'administrador', rut: string) => {
    const r = await cuentas.entrar({ rol, rut, clave: '2580', recordar: false, origen: `prueba-${rol}`, dispositivo: 'Prueba', ...(rol === 'administrador' ? { correo: 'operadora@brunen.test' } : {}) }, AHORA - 900);
    if (!r.ok) throw new Error(`no entró ${rol}`);
    return r.token;
  };
  const repositorio = new RepositorioD1(db, () => 1);
  await repositorio.guardarPedido(pedido(), AHORA - 600);
  await repositorio.guardarPedido(pedido({ idPedido: 'P261113-BBBBB', direccion: 'Calle Otra 9', telefono: '56922222222', nombre: 'Beto Prueba' }), AHORA - 500);
  await repositorio.guardarPedido(pedido({ idPedido: 'P261113-CCCCC', estado: 'Pendiente_Confirmacion' }), AHORA - 400);
  await repositorio.guardarPedido(pedido({ idPedido: 'P261114-DDDDD', fechaEntrega: '2026-11-14' }), AHORA - 300);
  db.sql("UPDATE pedidos SET forma_pago = 'efectivo' WHERE id = 'P261113-AAAAA'");
  db.sql("UPDATE pedidos SET forma_pago = 'transferencia' WHERE id = 'P261113-BBBBB'");
  const env: EntornoPanel = { DB: db, PANEL_SECRETO: SECRETO, ASSETS: { fetch: async () => new Response('ok') } };
  return { db, env, repartidor: await sesion('repartidor', '22.222.222-2'), administrador: await sesion('administrador', '11.111.111-1') };
}

function pedir(env: EntornoPanel, ruta: string, token: string | null, cuerpo?: unknown, cabeceras: Record<string, string> = { 'content-type': 'application/json', 'x-panel': '1' }) {
  const headers: Record<string, string> = token ? { cookie: `brunen_sesion=${token}` } : {};
  if (cuerpo !== undefined) Object.assign(headers, cabeceras);
  return panel.fetch(new Request(`https://panel.example${ruta}`, { method: cuerpo === undefined ? 'GET' : 'POST', headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) }), env);
}

interface Parada {
  idPedido: string;
  estado: string;
  cobrar: number | null;
  vaciosRetirados: number | null;
  motivo: string | null;
  punto: { lat: number; lng: number; afinar: boolean } | null;
  [clave: string]: unknown;
}

const ruta = async (env: EntornoPanel, token: string) => (await (await pedir(env, '/api/repartidor/ruta', token)).json()) as { fecha: string; paradas: Parada[]; motivos: Array<{ valor: string }> };

describe('la ruta del repartidor (fase D, D61)', () => {
  it('solo la ve un repartidor con su sesión', async () => {
    const { env, administrador } = await entorno();
    expect((await pedir(env, '/api/repartidor/ruta', null)).status).toBe(401);
    expect((await pedir(env, '/api/repartidor/ruta', administrador)).status).toBe(401);
  });

  it('trae las paradas confirmadas de hoy, con lo que hay que cobrar en efectivo, y sin notas internas', async () => {
    const { env, repartidor } = await entorno();
    const datos = await ruta(env, repartidor);
    expect(datos.fecha).toBe(HOY);
    expect(datos.paradas.map((p) => p.idPedido)).toEqual(['P261113-AAAAA', 'P261113-BBBBB']); // orden por comuna y dirección; sin la pendiente ni la de mañana
    const ana = datos.paradas.find((p) => p.idPedido === 'P261113-AAAAA');
    expect(ana).toMatchObject({ cobrar: 9900, estado: 'pendiente', notas: 'Timbre 4B', telefono: '56911111111', totalBidones: 3, envasesARetirar: 3 });
    expect(datos.paradas.find((p) => p.idPedido === 'P261113-BBBBB')?.cobrar).toBeNull();
    expect(JSON.stringify(datos)).not.toContain('Nota interna');
    expect(datos.motivos.map((m) => m.valor)).toContain('no_estaba');
  });
});

describe('lo que marca el repartidor', () => {
  it('Entregado: queda en la ruta con los vacíos, y exige la cabecera del panel', async () => {
    const { env, repartidor } = await entorno();
    expect((await pedir(env, '/api/repartidor/pedidos/P261113-AAAAA/entregado', repartidor, { vacios: 2, cobrado: true }, { 'content-type': 'application/json' })).status).toBe(400);
    const r = await pedir(env, '/api/repartidor/pedidos/P261113-AAAAA/entregado', repartidor, { vacios: 2, cobrado: true });
    expect(r.status).toBe(200);
    expect((await ruta(env, repartidor)).paradas.find((p) => p.idPedido === 'P261113-AAAAA')).toMatchObject({ estado: 'entregado', vaciosRetirados: 2, cobrar: null, cobrado: 9900, montoEfectivo: 9900 });
    // Para corregir, la pantalla sabe que ya cobró y cuánto: no se pierde el cobro al cambiar los vacíos.
    expect((await ruta(env, repartidor)).paradas.find((p) => p.idPedido === 'P261113-BBBBB')).toMatchObject({ cobrado: null, montoEfectivo: null });
  });

  it('No se pudo: queda marcado con su motivo; un motivo raro o un pedido de otro día no se aceptan', async () => {
    const { env, repartidor } = await entorno();
    expect((await pedir(env, '/api/repartidor/pedidos/P261113-BBBBB/no-se-pudo', repartidor, { motivo: 'no_estaba', detalle: '' })).status).toBe(200);
    expect((await ruta(env, repartidor)).paradas.find((p) => p.idPedido === 'P261113-BBBBB')).toMatchObject({ estado: 'no_se_pudo', motivo: 'no_estaba' });
    expect((await pedir(env, '/api/repartidor/pedidos/P261113-AAAAA/no-se-pudo', repartidor, { motivo: 'xx', detalle: '' })).status).toBe(422);
    expect((await pedir(env, '/api/repartidor/pedidos/P261114-DDDDD/entregado', repartidor, { vacios: 0, cobrado: false })).status).toBe(409);
    expect((await pedir(env, '/api/repartidor/pedidos/P261113-CCCCC/entregado', repartidor, { vacios: 0, cobrado: false })).status).toBe(409);
    expect((await pedir(env, "/api/repartidor/pedidos/P261113-AAAAA'--/entregado", repartidor, { vacios: 0, cobrado: false })).status).toBe(404);
  });

  it('un administrador no marca entregas por esta puerta', async () => {
    const { env, administrador } = await entorno();
    expect((await pedir(env, '/api/repartidor/pedidos/P261113-AAAAA/entregado', administrador, { vacios: 0, cobrado: false })).status).toBe(401);
  });
});

describe('el repartidor y el mapa (fase C, D63)', () => {
  it('cada parada trae su punto exacto si se conoce (para que Navegar lo use), y nunca uno aproximado', async () => {
    const { env, db, repartidor } = await entorno();
    await new RepositorioPuntos(db).guardar('Calle Falsa 123', 'Ñuñoa', { lat: -33.4569, lng: -70.5976, origen: 'manual' }, AHORA);
    const paradas = (await ruta(env, repartidor)).paradas;
    expect(paradas.find((p) => p.idPedido === 'P261113-AAAAA')?.punto).toEqual({ lat: -33.4569, lng: -70.5976, afinar: false });
    expect(paradas.find((p) => p.idPedido === 'P261113-BBBBB')?.punto).toBeNull();
  });

  it('un punto de un GPS poco preciso se marca para afinarlo en la próxima entrega; uno preciso o uno a mano, no', async () => {
    const { env, db, repartidor } = await entorno();
    const puntos = new RepositorioPuntos(db);
    await puntos.guardar('Calle Falsa 123', 'Ñuñoa', { lat: -33.4569, lng: -70.5976, origen: 'repartidor', precisionM: 60 }, AHORA);
    await puntos.guardar('Calle Otra 9', 'Ñuñoa', { lat: -33.458, lng: -70.599, origen: 'repartidor', precisionM: 12 }, AHORA);
    const paradas = (await ruta(env, repartidor)).paradas;
    expect(paradas.find((p) => p.idPedido === 'P261113-AAAAA')?.punto?.afinar).toBe(true);
    expect(paradas.find((p) => p.idPedido === 'P261113-BBBBB')?.punto?.afinar).toBe(false);
  });

  it('al entregar con un GPS preciso el teléfono enseña el punto; con uno impreciso no', async () => {
    const { env, db, repartidor } = await entorno();
    const gps = (precision: number) => ({ vacios: 0, cobrado: false, lat: -33.457, lng: -70.598, precision });
    expect((await pedir(env, '/api/repartidor/pedidos/P261113-BBBBB/entregado', repartidor, gps(300))).status).toBe(200);
    expect((await new RepositorioPuntos(db).deDirecciones([{ direccion: 'Calle Otra 9', comuna: 'Ñuñoa' }])).size).toBe(0);
    expect((await pedir(env, '/api/repartidor/pedidos/P261113-AAAAA/entregado', repartidor, gps(15))).status).toBe(200);
    const aprendido = await new RepositorioPuntos(db).deDirecciones([{ direccion: 'Calle Falsa 123', comuna: 'Ñuñoa' }]);
    expect([...aprendido.values()][0]).toMatchObject({ lat: -33.457, lng: -70.598, origen: 'repartidor', precisionM: 15 });
  });

  it('entregar sin GPS, o con un GPS fuera de la región, funciona igual y no guarda nada', async () => {
    const { env, db, repartidor } = await entorno();
    expect((await pedir(env, '/api/repartidor/pedidos/P261113-AAAAA/entregado', repartidor, { vacios: 0, cobrado: false, lat: 10, lng: 10, precision: 5 })).status).toBe(200);
    expect((await pedir(env, '/api/repartidor/pedidos/P261113-BBBBB/entregado', repartidor, { vacios: 0, cobrado: false })).status).toBe(200);
    expect(db.sql('SELECT COUNT(*) AS n FROM puntos')).toEqual([{ n: 0 }]);
  });
});
