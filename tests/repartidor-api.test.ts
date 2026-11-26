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

describe('marcas que llegan tarde, sin señal (D84)', () => {
  async function conPedidosAnteriores() {
    const base = await entorno();
    const repositorio = new RepositorioD1(base.db, () => 1);
    await repositorio.guardarPedido(pedido({ idPedido: 'P261112-EEEEE', fechaEntrega: '2026-11-12', direccion: 'Calle Ayer 1' }), AHORA - 90_000);
    await repositorio.guardarPedido(pedido({ idPedido: 'P261110-GGGGG', fechaEntrega: '2026-11-10', direccion: 'Calle Martes 2' }), AHORA - 300_000);
    await repositorio.guardarPedido(pedido({ idPedido: 'P261109-FFFFF', fechaEntrega: '2026-11-09', direccion: 'Calle Lunes 3' }), AHORA - 400_000);
    return base;
  }
  const marcar = (env: EntornoPanel, token: string, id: string, cuerpo: Record<string, unknown>) =>
    pedir(env, `/api/repartidor/pedidos/${id}/entregado`, token, { vacios: 3, cobrado: false, ...cuerpo });

  it('una marca de la ruta de ayer se anota en su día y a la hora del teléfono', async () => {
    const { db, env, repartidor } = await conPedidosAnteriores();
    const marcadoEn = AHORA - 20 * 3600; // ayer a las 16:00
    expect((await marcar(env, repartidor, 'P261112-EEEEE', { fecha: '2026-11-12', marcadoEn })).status).toBe(200);
    expect(db.sql("SELECT estado, entregado_en FROM pedidos WHERE id = 'P261112-EEEEE'")).toEqual([{ estado: 'Entregado', entregado_en: marcadoEn }]);
    expect(db.sql("SELECT detalle FROM historial_pedidos WHERE pedido_id = 'P261112-EEEEE' AND accion = 'entrega'")).toEqual([
      { detalle: 'Retiró 3 vacíos. Lo marcó sin señal el 2026-11-12 a las 16:00.' },
    ]);
  });

  it('vale hasta 3 días atrás; sin la fecha de su ruta (la app anterior), vale solo hoy', async () => {
    const { env, repartidor } = await conPedidosAnteriores();
    const sinFecha = await marcar(env, repartidor, 'P261112-EEEEE', {});
    expect(sinFecha.status).toBe(409);
    expect(await sinFecha.json()).toEqual({ error: 'Ese pedido no es de la ruta de ese día: puede que lo hayan cambiado de fecha.' });
    expect((await marcar(env, repartidor, 'P261110-GGGGG', { fecha: '2026-11-10' })).status).toBe(200);
    // Una fecha que no existe no sirve: vale hoy.
    expect((await marcar(env, repartidor, 'P261113-AAAAA', { fecha: '2026-11-99' })).status).toBe(200);
  });

  it('una marca de una ruta de hace más de 3 días, o del futuro, se rechaza a la vista: no se anota para hoy', async () => {
    const { db, env, repartidor } = await conPedidosAnteriores();
    // El pedido del lunes se reagendó para hoy; la marca vieja del lunes no puede caer en la entrega de hoy.
    db.sql("UPDATE pedidos SET fecha_confirmada = '2026-11-13' WHERE id = 'P261109-FFFFF'");
    const vieja = await marcar(env, repartidor, 'P261109-FFFFF', { fecha: '2026-11-09', marcadoEn: AHORA - 4 * 86400 });
    expect(vieja.status).toBe(409);
    expect(await vieja.json()).toEqual({ error: 'Esa marca es de una ruta de hace más de 3 días: ya no se anota desde la app. Avísale a la oficina.' });
    const vieja2 = await pedir(env, '/api/repartidor/pedidos/P261109-FFFFF/no-se-pudo', repartidor, { motivo: 'no_estaba', detalle: '', fecha: '2026-11-09' });
    expect(vieja2.status).toBe(409);
    expect((await marcar(env, repartidor, 'P261113-AAAAA', { fecha: '2026-11-14' })).status).toBe(409);
    expect(db.sql("SELECT estado, entregado_en, no_entregado_en FROM pedidos WHERE id IN ('P261109-FFFFF', 'P261113-AAAAA') ORDER BY id")).toEqual([
      { estado: 'Confirmado', entregado_en: null, no_entregado_en: null },
      { estado: 'Confirmado', entregado_en: null, no_entregado_en: null },
    ]);
  });

  it('la hora del teléfono vale solo si la marca llegó con atraso, y nunca una del futuro', async () => {
    const { db, env, repartidor } = await entorno();
    expect((await marcar(env, repartidor, 'P261113-AAAAA', { fecha: HOY, marcadoEn: AHORA - 30 })).status).toBe(200);
    expect((await pedir(env, '/api/repartidor/pedidos/P261113-BBBBB/no-se-pudo', repartidor, { motivo: 'no_estaba', detalle: '', fecha: HOY, marcadoEn: AHORA + 3600 })).status).toBe(200);
    expect(db.sql("SELECT id, entregado_en, no_entregado_en FROM pedidos WHERE id IN ('P261113-AAAAA', 'P261113-BBBBB') ORDER BY id")).toEqual([
      { id: 'P261113-AAAAA', entregado_en: AHORA, no_entregado_en: null },
      { id: 'P261113-BBBBB', entregado_en: null, no_entregado_en: AHORA },
    ]);
    expect(db.sql("SELECT COUNT(*) AS n FROM historial_pedidos WHERE detalle LIKE '%sin señal%'")).toEqual([{ n: 0 }]);
  });

  it('la nota al entregar llega al historial; una que no es texto se ignora (D91)', async () => {
    const { db, env, repartidor } = await entorno();
    expect((await marcar(env, repartidor, 'P261113-AAAAA', { observacion: 'Dejé en conserjería' })).status).toBe(200);
    expect((await marcar(env, repartidor, 'P261113-BBBBB', { observacion: 12 })).status).toBe(200);
    expect(db.sql("SELECT pedido_id, detalle FROM historial_pedidos WHERE accion = 'entrega' ORDER BY pedido_id")).toEqual([
      { pedido_id: 'P261113-AAAAA', detalle: 'Retiró 3 vacíos. Nota: Dejé en conserjería' },
      { pedido_id: 'P261113-BBBBB', detalle: 'Retiró 3 vacíos.' },
    ]);
  });

  it('repetir la misma marca (se perdió la respuesta) deja el pedido igual', async () => {
    const { db, env, repartidor } = await entorno();
    for (let i = 0; i < 2; i++) expect((await marcar(env, repartidor, 'P261113-AAAAA', { cobrado: true })).status).toBe(200);
    expect(db.sql("SELECT estado, vacios_retirados, cobrado_en_entrega, estado_pago, entregado_en FROM pedidos WHERE id = 'P261113-AAAAA'")).toEqual([
      { estado: 'Entregado', vacios_retirados: 3, cobrado_en_entrega: 9900, estado_pago: 'pagado', entregado_en: AHORA },
    ]);
  });
});

describe('cada viaje del repartidor (D67)', () => {
  it('dice cuántos bidones de cada tamaño cargar y trae la ruta del viaje en Google Maps, sin las ya entregadas', async () => {
    const { env, repartidor } = await entorno();
    const datos = (await (await pedir(env, '/api/repartidor/ruta', repartidor)).json()) as {
      cargas: Array<{ numero: number; bidones: Record<string, number>; recargaEn: string | null; mapas: string[] }>;
      paradas: Array<{ idPedido: string; estado: string }>;
    };
    const [viaje] = datos.cargas;
    expect(viaje?.recargaEn).toBeNull(); // el primer viaje sale cargado de la planta
    expect(Object.values(viaje?.bidones ?? {}).reduce((a, b) => a + b, 0)).toBeGreaterThan(0);
    expect(viaje?.mapas).toHaveLength(1);
    expect(viaje?.mapas[0]).toMatch(/^https:\/\/www\.google\.com\/maps\/dir\/\?api=1&/);
    const pendientes = datos.paradas.filter((p) => p.estado === 'pendiente').length;
    const lugares = new URL(viaje?.mapas[0] as string).searchParams;
    expect((lugares.get('waypoints')?.split('|').length ?? 0) + 1).toBe(pendientes);
  });
});

describe('los viajes del repartidor son los guardados al publicar (D86)', () => {
  it('cada parada va en el viaje que tenía al publicar la ruta, aunque por capacidad cupieran juntas', async () => {
    const { db, env, repartidor } = await entorno();
    const repositorio = new RepositorioD1(db, () => 1);
    await repositorio.publicarOrdenDeRuta(HOY, ['P261113-AAAAA', 'P261113-BBBBB']);
    await repositorio.guardarViajesPublicados(HOY, new Map([['P261113-AAAAA', 1], ['P261113-BBBBB', 2]]));
    const r = (await (await pedir(env, '/api/repartidor/ruta', repartidor)).json()) as { paradas: Parada[]; cargas: Array<{ numero: number }> };
    expect(r.paradas.map((p) => [p.idPedido, p.carga])).toEqual([['P261113-AAAAA', 1], ['P261113-BBBBB', 2]]);
    expect(r.cargas.map((c) => c.numero)).toEqual([1, 2]);
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

describe('consentimiento, jornada y posiciones (fase E, D80)', () => {
  const posicion = (en: number) => ({ lat: -33.4569, lng: -70.5976, precision: 12, en });

  it('sin consentimiento no se guarda nada; con él y la jornada abierta, sí; al terminarla, ya no', async () => {
    const { env, db, repartidor } = await entorno();
    expect((await ruta(env, repartidor) as unknown as { ubicacion: unknown }).ubicacion).toEqual({ consentimiento: false, jornada: null });
    expect((await pedir(env, '/api/repartidor/posiciones', repartidor, { posiciones: [posicion(AHORA)] })).status).toBe(409);

    const acepto = await pedir(env, '/api/repartidor/ubicacion', repartidor, { acepta: true });
    expect(((await acepto.json()) as { ubicacion: unknown }).ubicacion).toEqual({ consentimiento: true, jornada: null });
    expect((await pedir(env, '/api/repartidor/posiciones', repartidor, { posiciones: [posicion(AHORA)] })).status).toBe(409); // sin jornada

    const inicio = await pedir(env, '/api/repartidor/jornada', repartidor, { accion: 'iniciar' });
    expect(((await inicio.json()) as { ubicacion: { jornada: unknown } }).ubicacion.jornada).toEqual({ iniciadaEn: AHORA, terminadaEn: null });
    const guardo = await pedir(env, '/api/repartidor/posiciones', repartidor, { posiciones: [posicion(AHORA)] });
    expect([guardo.status, await guardo.json()]).toEqual([200, { ok: true, guardadas: 1 }]);

    await pedir(env, '/api/repartidor/jornada', repartidor, { accion: 'terminar' });
    expect((await pedir(env, '/api/repartidor/posiciones', repartidor, { posiciones: [posicion(AHORA)] })).status).toBe(409);
    expect(db.sql('SELECT COUNT(*) AS n FROM posiciones')).toEqual([{ n: 1 }]);
  });

  it('retirar el consentimiento borra lo guardado', async () => {
    const { env, db, repartidor } = await entorno();
    await pedir(env, '/api/repartidor/ubicacion', repartidor, { acepta: true });
    await pedir(env, '/api/repartidor/jornada', repartidor, { accion: 'iniciar' });
    await pedir(env, '/api/repartidor/posiciones', repartidor, { posiciones: [posicion(AHORA)] });
    await pedir(env, '/api/repartidor/ubicacion', repartidor, { acepta: false });
    expect(db.sql('SELECT COUNT(*) AS n FROM posiciones')).toEqual([{ n: 0 }]);
  });

  it('pide la sesión del repartidor, la cabecera del panel y datos con forma', async () => {
    const { env, repartidor, administrador } = await entorno();
    expect((await pedir(env, '/api/repartidor/jornada', administrador, { accion: 'iniciar' })).status).toBe(401);
    expect((await pedir(env, '/api/repartidor/jornada', repartidor, { accion: 'iniciar' }, { 'content-type': 'application/json' })).status).toBe(400);
    expect((await pedir(env, '/api/repartidor/jornada', repartidor, { accion: 'volar' })).status).toBe(400);
    expect((await pedir(env, '/api/repartidor/ubicacion', repartidor, { acepta: 'si' })).status).toBe(400);
    expect((await pedir(env, '/api/repartidor/posiciones', repartidor, { posiciones: 'aqui' })).status).toBe(400);
  });
});

describe('cambios de la ruta publicada (D94)', () => {
  type ConVersion = { publicacion: { version: number; publicadaEn: number; vista: number | null } | null };
  const leerRuta = async (env: EntornoPanel, token: string) => (await (await pedir(env, '/api/repartidor/ruta', token)).json()) as ConVersion;

  it('sin publicar no hay versión; al publicar, la ruta dice cuál es y cuál confirmó el repartidor', async () => {
    const { db, env, repartidor } = await entorno();
    expect((await leerRuta(env, repartidor)).publicacion).toBeNull();
    const repositorio = new RepositorioD1(db, () => 1);
    await repositorio.registrarPublicacion(HOY, AHORA - 600);
    expect((await leerRuta(env, repartidor)).publicacion).toEqual({ version: 1, publicadaEn: AHORA - 600, vista: null });
    expect((await pedir(env, '/api/repartidor/ruta/vista', repartidor, { version: 1 })).status).toBe(200);
    await repositorio.registrarPublicacion(HOY, AHORA - 60);
    expect((await leerRuta(env, repartidor)).publicacion).toEqual({ version: 2, publicadaEn: AHORA - 60, vista: 1 });
    expect((await pedir(env, '/api/repartidor/ruta/vista', repartidor, { version: 2 })).status).toBe(200);
    // Confirmar una versión anterior (una respuesta atrasada) no la hace retroceder.
    expect((await pedir(env, '/api/repartidor/ruta/vista', repartidor, { version: 1 })).status).toBe(200);
    expect((await leerRuta(env, repartidor)).publicacion?.vista).toBe(2);
    expect(db.sql("SELECT vista_version, vista_en FROM rutas_publicadas WHERE fecha = '2026-11-13'")).toEqual([{ vista_version: 2, vista_en: AHORA }]);
  });

  it('una versión que no existe, o sin la sesión del repartidor, no se confirma', async () => {
    const { db, env, repartidor, administrador } = await entorno();
    expect((await pedir(env, '/api/repartidor/ruta/vista', repartidor, { version: 1 })).status).toBe(409); // sin publicar
    await new RepositorioD1(db, () => 1).registrarPublicacion(HOY, AHORA - 600);
    expect((await pedir(env, '/api/repartidor/ruta/vista', repartidor, { version: 2 })).status).toBe(409);
    expect((await pedir(env, '/api/repartidor/ruta/vista', repartidor, { version: 'una' })).status).toBe(400);
    expect((await pedir(env, '/api/repartidor/ruta/vista', administrador, { version: 1 })).status).toBe(401);
    expect((await pedir(env, '/api/repartidor/ruta/vista', repartidor, { version: 1 }, { 'content-type': 'application/json' })).status).toBe(400);
    expect(db.sql('SELECT vista_version FROM rutas_publicadas')).toEqual([{ vista_version: null }]);
  });
});
