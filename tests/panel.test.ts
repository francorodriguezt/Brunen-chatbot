import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PedidoARegistrar } from '../src/pedidos';
import { autenticar, olvidarClavesDeAcceso, type EntornoAcceso } from '../src/panel/acceso';
import panel, { type EntornoPanel } from '../src/panel';
import { RepositorioD1 } from '../src/repositorio';
import { AUD, DOMINIO, crearAccesoFalso, type AccesoFalso } from './acceso-falso';
import { crearBaseSqlite } from './ayudas';

const AHORA = 1793000000;
const ENTORNO_ACCESS: EntornoAcceso = { ACCESS_TEAM_DOMAIN: DOMINIO, ACCESS_AUD: AUD };

let acceso: AccesoFalso;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA * 1000);
  acceso = await crearAccesoFalso(AHORA);
  acceso.instalar();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  olvidarClavesDeAcceso();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const conCabecera = (token?: string, url = 'https://panel.example/api/estado') =>
  new Request(url, { headers: token ? { 'cf-access-jwt-assertion': token } : {} });

describe('autenticar: el token de Cloudflare Access', () => {
  it('acepta un token válido y devuelve el correo', async () => {
    expect(await autenticar(conCabecera(await acceso.token()), ENTORNO_ACCESS, AHORA)).toEqual({ ok: true, correo: 'operadora@brunen.test' });
  });

  it('también lo acepta desde la cookie CF_Authorization', async () => {
    const solicitud = new Request('https://panel.example/', { headers: { cookie: `otra=1; CF_Authorization=${await acceso.token()}; y=2` } });
    expect((await autenticar(solicitud, ENTORNO_ACCESS, AHORA)).ok).toBe(true);
  });

  it('sin token: 401', async () => {
    expect(await autenticar(conCabecera(), ENTORNO_ACCESS, AHORA)).toMatchObject({ ok: false, estado: 401 });
  });

  it.each([
    ['basura', 'esto-no-es-un-token'],
    ['con partes vacías', '..'],
    ['con una parte que no es JSON', 'aaaa.bbbb.cccc'],
  ])('un token %s: 401', async (_nombre, token) => {
    expect(await autenticar(conCabecera(token), ENTORNO_ACCESS, AHORA)).toMatchObject({ ok: false, estado: 401 });
  });

  it('un token con la firma alterada: 401', async () => {
    const valido = await acceso.token();
    const alterado = `${valido.slice(0, -4)}AAAA`;
    expect(await autenticar(conCabecera(alterado), ENTORNO_ACCESS, AHORA)).toMatchObject({ ok: false, estado: 401 });
  });

  it('un token con el contenido cambiado después de firmar: 401', async () => {
    const [cabeza, , firma] = (await acceso.token()).split('.');
    const otro = (await acceso.token({ email: 'intruso@malo.test' })).split('.')[1];
    expect(await autenticar(conCabecera(`${cabeza}.${otro}.${firma}`), ENTORNO_ACCESS, AHORA)).toMatchObject({ ok: false, estado: 401 });
  });

  it('un token vencido: 401', async () => {
    expect(await autenticar(conCabecera(await acceso.token({ exp: AHORA - 3600 })), ENTORNO_ACCESS, AHORA)).toMatchObject({ ok: false, estado: 401 });
  });

  it('un token que todavía no rige: 401', async () => {
    expect(await autenticar(conCabecera(await acceso.token({ nbf: AHORA + 3600 })), ENTORNO_ACCESS, AHORA)).toMatchObject({ ok: false, estado: 401 });
  });

  it('un token de otra aplicación de Access: 401', async () => {
    expect(await autenticar(conCabecera(await acceso.token({ aud: ['otra-aplicacion'] })), ENTORNO_ACCESS, AHORA)).toMatchObject({ ok: false, estado: 401 });
  });

  it('un token emitido por otro equipo: 401', async () => {
    expect(await autenticar(conCabecera(await acceso.token({ iss: 'https://otro.cloudflareaccess.com' })), ENTORNO_ACCESS, AHORA)).toMatchObject({ ok: false, estado: 401 });
  });

  it('un token que declara otro algoritmo (el truco clásico para falsificarlos): 401', async () => {
    for (const alg of ['none', 'HS256']) {
      expect(await autenticar(conCabecera(await acceso.token({}, { alg })), ENTORNO_ACCESS, AHORA)).toMatchObject({ ok: false, estado: 401 });
    }
  });

  it('un token sin correo: 401', async () => {
    expect(await autenticar(conCabecera(await acceso.token({ email: undefined })), ENTORNO_ACCESS, AHORA)).toMatchObject({ ok: false, estado: 401 });
  });

  it('el audience puede venir como texto y no solo como lista', async () => {
    expect((await autenticar(conCabecera(await acceso.token({ aud: AUD })), ENTORNO_ACCESS, AHORA)).ok).toBe(true);
  });

  it('el dominio del equipo se acepta con o sin https://', async () => {
    const env = { ...ENTORNO_ACCESS, ACCESS_TEAM_DOMAIN: `https://${DOMINIO}/` };
    expect((await autenticar(conCabecera(await acceso.token()), env, AHORA)).ok).toBe(true);
  });

  it('las claves públicas se piden una vez y se guardan', async () => {
    await autenticar(conCabecera(await acceso.token()), ENTORNO_ACCESS, AHORA);
    await autenticar(conCabecera(await acceso.token()), ENTORNO_ACCESS, AHORA + 60);
    expect(acceso.pedidosDeClaves()).toBe(1);
  });

  it('si Cloudflare rota las claves, el panel las vuelve a pedir y sigue funcionando', async () => {
    await autenticar(conCabecera(await acceso.token()), ENTORNO_ACCESS, AHORA);
    await acceso.rotarClaves();
    expect((await autenticar(conCabecera(await acceso.token()), ENTORNO_ACCESS, AHORA + 5)).ok).toBe(true);
    expect(acceso.pedidosDeClaves()).toBe(2);
  });

  it('si no se pueden obtener las claves, nadie entra (503) y el error no se sirve', async () => {
    acceso.caer(true);
    expect(await autenticar(conCabecera(await acceso.token()), ENTORNO_ACCESS, AHORA)).toMatchObject({ ok: false, estado: 503 });
  });

  it('falla cerrado: sin ACCESS_TEAM_DOMAIN o ACCESS_AUD el panel no está configurado (503)', async () => {
    const token = await acceso.token();
    for (const env of [{}, { ACCESS_TEAM_DOMAIN: DOMINIO }, { ACCESS_AUD: AUD }, { ACCESS_TEAM_DOMAIN: 'no es un dominio', ACCESS_AUD: AUD }]) {
      expect(await autenticar(conCabecera(token), env, AHORA)).toMatchObject({ ok: false, estado: 503 });
    }
  });

  describe('lista de correos autorizados', () => {
    it('si hay lista, solo entran esos correos (sin importar mayúsculas)', async () => {
      const env = { ...ENTORNO_ACCESS, PANEL_CORREOS: 'Operadora@Brunen.test, dueno@brunen.test' };
      expect((await autenticar(conCabecera(await acceso.token()), env, AHORA)).ok).toBe(true);
      expect(await autenticar(conCabecera(await acceso.token({ email: 'otra@persona.test' })), env, AHORA)).toMatchObject({ ok: false, estado: 403 });
    });

    it('si la lista está vacía, manda la política de Access', async () => {
      expect((await autenticar(conCabecera(await acceso.token({ email: 'cualquiera@x.test' })), { ...ENTORNO_ACCESS, PANEL_CORREOS: ' ' }, AHORA)).ok).toBe(true);
    });
  });

  describe('desarrollo local', () => {
    it('PANEL_DEV_CORREO entra sin token, pero solo desde localhost', async () => {
      const env = { PANEL_DEV_CORREO: 'franco@prueba.local' };
      expect(await autenticar(new Request('http://localhost:8787/'), env, AHORA)).toEqual({ ok: true, correo: 'franco@prueba.local' });
      expect(await autenticar(new Request('http://127.0.0.1:8787/'), env, AHORA)).toMatchObject({ ok: true });
    });

    it('desde cualquier otra dirección se ignora, aunque la variable esté puesta por error', async () => {
      const env = { PANEL_DEV_CORREO: 'franco@prueba.local' };
      expect(await autenticar(new Request('https://brunen-panel.workers.dev/'), env, AHORA)).toMatchObject({ ok: false, estado: 503 });
      expect(await autenticar(new Request('https://localhost.evil.com/'), env, AHORA)).toMatchObject({ ok: false });
    });
  });
});

// ---------------------------------------------------------------------------------------------------------------------

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
    notasRepartidor: '',
    envasesARetirar: 0,
    observaciones: '',
    ...cambios,
  };
}

async function entornoPanel(cambios: Partial<EntornoPanel> = {}) {
  const db = crearBaseSqlite();
  const repositorio = new RepositorioD1(db, () => 1);
  await repositorio.guardarPedido(pedido(), AHORA - 600);
  await repositorio.guardarPedido(pedido({ idPedido: 'P261028-BBBBB', lineas: [{ tipo: '12L', cantidad: 2, precioUnitario: null, subtotal: null }], nombre: '' }), AHORA - 300);
  await repositorio.guardarAviso({ tipo: 'reclamo', telefono: '56911111111', nombre: 'Ana Prueba', resumen: 'Reclamo', motivos: [], texto: 'venía roto' }, 'wamid.1', AHORA - 100);
  const archivos: string[] = [];
  const env: EntornoPanel = {
    ...ENTORNO_ACCESS,
    DB: db,
    ASSETS: { fetch: async (solicitud) => (archivos.push(new URL(solicitud.url).pathname), new Response('<html>panel</html>', { status: 200 })) },
    ...cambios,
  };
  return { env, db, repositorio, archivos };
}

async function pedir(env: EntornoPanel, ruta: string, opciones: { metodo?: string; cuerpo?: unknown; cabeceras?: Record<string, string>; token?: string | null } = {}) {
  const token = opciones.token === undefined ? await acceso.token() : opciones.token;
  const cabeceras: Record<string, string> = { ...(token ? { 'cf-access-jwt-assertion': token } : {}), ...opciones.cabeceras };
  const escribe = opciones.metodo === 'POST';
  if (escribe) Object.assign(cabeceras, { 'content-type': 'application/json', 'x-panel': '1', ...opciones.cabeceras });
  return panel.fetch(new Request(`https://panel.example${ruta}`, { method: opciones.metodo ?? 'GET', headers: cabeceras, body: escribe ? JSON.stringify(opciones.cuerpo ?? {}) : undefined }), env);
}

describe('el Worker del panel', () => {
  it('/salud responde sin pedir sesión y sin datos', async () => {
    const { env } = await entornoPanel();
    const r = await panel.fetch(new Request('https://panel.example/salud'), env);
    expect([r.status, await r.text()]).toEqual([200, 'ok']);
  });

  it('sin sesión no se sirve nada: ni la pantalla ni la API', async () => {
    const { env, archivos } = await entornoPanel();
    expect((await pedir(env, '/', { token: null })).status).toBe(401);
    expect((await pedir(env, '/api/pedidos', { token: null })).status).toBe(401);
    expect((await pedir(env, '/app.js', { token: null })).status).toBe(401);
    expect(archivos).toEqual([]);
  });

  it('sin la configuración de Access falla cerrado', async () => {
    const { env } = await entornoPanel({ ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' });
    expect((await pedir(env, '/api/pedidos')).status).toBe(503);
    expect((await pedir(env, '/')).status).toBe(503);
  });

  it('con sesión válida sirve la pantalla', async () => {
    const { env, archivos } = await entornoPanel();
    const r = await pedir(env, '/');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('panel');
    expect(archivos).toEqual(['/']);
  });

  it('la pantalla solo se pide con GET', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/', { metodo: 'POST' })).status).toBe(405);
  });

  it('sin base de datos la API responde 503', async () => {
    const { env } = await entornoPanel({ DB: undefined });
    expect((await pedir(env, '/api/estado')).status).toBe(503);
  });

  it('toda respuesta lleva las cabeceras de seguridad: solo scripts propios, sin marcos y sin caché', async () => {
    const { env } = await entornoPanel();
    const respuestas = [
      await panel.fetch(new Request('https://panel.example/salud'), env),
      await pedir(env, '/', { token: null }), // rechazada
      await pedir(env, '/'), // la pantalla
      await pedir(env, '/api/estado'),
      await pedir(env, '/api/no-existe'),
    ];
    for (const r of respuestas) {
      const politica = r.headers.get('content-security-policy') ?? '';
      expect(politica).toContain("script-src 'self'");
      expect(politica).toContain("frame-ancestors 'none'");
      expect(politica).not.toContain('unsafe');
      expect(r.headers.get('x-content-type-options')).toBe('nosniff');
      expect(r.headers.get('cache-control')).toBe('no-store');
    }
  });
});

describe('la API: lectura', () => {
  it('/api/estado dice quién está conectado y cuánto hay pendiente', async () => {
    const { env } = await entornoPanel();
    const datos = (await (await pedir(env, '/api/estado')).json()) as { correo: string; resumen: Record<string, number> };
    expect(datos.correo).toBe('operadora@brunen.test');
    expect(datos.resumen).toMatchObject({ porConfirmar: 2, avisosAbiertos: 1 });
  });

  it('los pedidos se piden por grupo: por confirmar es lo que se muestra al abrir', async () => {
    const { env, repositorio } = await entornoPanel();
    await repositorio.cambiarEstado('P261028-AAAAA', 'Confirmado', 'x@y.test', AHORA);
    const ids = async (ruta: string) => ((await (await pedir(env, ruta)).json()) as { pedidos: Array<{ id: string }> }).pedidos.map((p) => p.id);
    expect(await ids('/api/pedidos')).toEqual(['P261028-BBBBB']);
    expect(await ids('/api/pedidos?grupo=confirmados')).toEqual(['P261028-AAAAA']);
    expect(await ids('/api/pedidos?grupo=cerrados')).toEqual([]);
    expect((await ids('/api/pedidos?grupo=todos')).sort()).toEqual(['P261028-AAAAA', 'P261028-BBBBB']);
  });

  it('un grupo o una fecha que no existen se rechazan', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/pedidos?grupo=inventado')).status).toBe(400);
    expect((await pedir(env, '/api/pedidos?fecha=ayer')).status).toBe(400);
  });

  it('un pedido trae su historial', async () => {
    const { env } = await entornoPanel();
    const datos = (await (await pedir(env, '/api/pedidos/P261028-AAAAA')).json()) as { pedido: { id: string }; historial: Array<{ accion: string }> };
    expect(datos.pedido.id).toBe('P261028-AAAAA');
    expect(datos.historial[0]?.accion).toBe('creado');
  });

  it('un pedido que no existe: 404', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/pedidos/P000000-ZZZZZ')).status).toBe(404);
  });

  it('un identificador con formato raro ni llega a la base', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, "/api/pedidos/P261028-AAAAA'%20OR%201=1--")).status).toBe(404);
  });

  it('los avisos abiertos, y los resueltos aparte', async () => {
    const { env, repositorio } = await entornoPanel();
    const abiertos = (await (await pedir(env, '/api/avisos')).json()) as { avisos: Array<{ id: number; tipo: string; texto: string }> };
    expect(abiertos.avisos).toEqual([expect.objectContaining({ tipo: 'reclamo', texto: 'venía roto' })]);
    await repositorio.resolverAviso(abiertos.avisos[0]?.id ?? 0, 'x@y.test', AHORA);
    expect(((await (await pedir(env, '/api/avisos?estado=resuelto')).json()) as { avisos: unknown[] }).avisos).toHaveLength(1);
    expect((await pedir(env, '/api/avisos?estado=otro')).status).toBe(400);
  });

  it('una ruta que no existe: 404', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/secretos')).status).toBe(404);
  });

  it('las respuestas no se guardan en caché', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/estado')).headers.get('cache-control')).toBe('no-store');
  });
});

describe('la API: cambios', () => {
  it('confirmar un pedido lo deja confirmado por quien está conectado', async () => {
    const { env, repositorio } = await entornoPanel();
    const r = await pedir(env, '/api/pedidos/P261028-AAAAA/estado', { metodo: 'POST', cuerpo: { estado: 'Confirmado' } });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { pedido: { estado: string; confirmadoPor: string } }).pedido).toMatchObject({ estado: 'Confirmado', confirmadoPor: 'operadora@brunen.test' });
    expect((await repositorio.historialDe('P261028-AAAAA')).at(-1)?.quien).toBe('operadora@brunen.test');
  });

  it('confirmar un pedido sin precio completo se rechaza con una explicación, y no cambia nada', async () => {
    const { env, repositorio } = await entornoPanel();
    const r = await pedir(env, '/api/pedidos/P261028-BBBBB/estado', { metodo: 'POST', cuerpo: { estado: 'Confirmado' } });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toContain('Falta el precio');
    expect((await repositorio.obtenerPedido('P261028-BBBBB'))?.estado).toBe('Pendiente_Confirmacion');
  });

  it('completar el precio con "editar" y después confirmar', async () => {
    const { env } = await entornoPanel();
    const editado = await pedir(env, '/api/pedidos/P261028-BBBBB/editar', {
      metodo: 'POST',
      cuerpo: { lineas: [{ tipo: '12L', cantidad: 2, precioUnitario: 2400 }], fechaConfirmada: '2026-10-30', nombre: 'ignorado' },
    });
    expect(editado.status).toBe(200);
    expect(((await editado.json()) as { pedido: { total: number; fechaConfirmada: string } }).pedido).toMatchObject({ total: 4800, fechaConfirmada: '2026-10-30' });
    expect((await pedir(env, '/api/pedidos/P261028-BBBBB/estado', { metodo: 'POST', cuerpo: { estado: 'Confirmado' } })).status).toBe(200);
  });

  it('cancelar guarda el motivo en el historial', async () => {
    const { env, repositorio } = await entornoPanel();
    await pedir(env, '/api/pedidos/P261028-AAAAA/estado', { metodo: 'POST', cuerpo: { estado: 'Cancelado', motivo: 'El cliente ya no lo quiere' } });
    expect((await repositorio.historialDe('P261028-AAAAA')).at(-1)?.detalle).toBe('El cliente ya no lo quiere');
  });

  it('un cambio de estado imposible: 409 con explicación', async () => {
    const { env } = await entornoPanel();
    const r = await pedir(env, '/api/pedidos/P261028-AAAAA/estado', { metodo: 'POST', cuerpo: { estado: 'Entregado' } });
    expect(r.status).toBe(409);
  });

  it.each([
    ['un estado que no existe', { estado: 'Volando' }],
    ['sin estado', {}],
    ['un estado que no es texto', { estado: 5 }],
    ['una fecha que no es texto', { estado: 'Confirmado', fechaConfirmada: 20261030 }],
  ])('rechaza %s', async (_nombre, cuerpo) => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/pedidos/P261028-AAAAA/estado', { metodo: 'POST', cuerpo })).status).toBe(400);
  });

  it.each([
    ['líneas que no son una lista', { lineas: 'dos' }],
    ['una comuna que no es texto', { comuna: 5 }],
    ['una fecha que no es texto', { fechaConfirmada: 5 }],
  ])('editar rechaza %s', async (_nombre, cuerpo) => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/pedidos/P261028-AAAAA/editar', { metodo: 'POST', cuerpo })).status).toBe(400);
  });

  it('editar con cantidades inválidas: 422', async () => {
    const { env } = await entornoPanel();
    const r = await pedir(env, '/api/pedidos/P261028-AAAAA/editar', { metodo: 'POST', cuerpo: { lineas: [{ tipo: '20L', cantidad: -1, precioUnitario: 3300 }] } });
    expect(r.status).toBe(422);
  });

  it('resolver un aviso, y resolverlo otra vez: 409', async () => {
    const { env } = await entornoPanel();
    const [aviso] = ((await (await pedir(env, '/api/avisos')).json()) as { avisos: Array<{ id: number }> }).avisos;
    expect((await pedir(env, `/api/avisos/${aviso?.id}/resolver`, { metodo: 'POST' })).status).toBe(200);
    expect((await pedir(env, `/api/avisos/${aviso?.id}/resolver`, { metodo: 'POST' })).status).toBe(409);
  });
});

describe('la API: protección de las escrituras', () => {
  it('sin la cabecera X-Panel o sin JSON, se rechaza (un formulario de otra página no puede cumplirlo)', async () => {
    const { env, repositorio } = await entornoPanel();
    const token = await acceso.token();
    const base = { method: 'POST', body: '{"estado":"Cancelado"}' };
    const sinMarca = await panel.fetch(new Request('https://panel.example/api/pedidos/P261028-AAAAA/estado', { ...base, headers: { 'cf-access-jwt-assertion': token, 'content-type': 'application/json' } }), env);
    const sinJson = await panel.fetch(new Request('https://panel.example/api/pedidos/P261028-AAAAA/estado', { ...base, headers: { 'cf-access-jwt-assertion': token, 'x-panel': '1', 'content-type': 'application/x-www-form-urlencoded' } }), env);
    expect([sinMarca.status, sinJson.status]).toEqual([400, 400]);
    expect((await repositorio.obtenerPedido('P261028-AAAAA'))?.estado).toBe('Pendiente_Confirmacion');
  });

  it('una solicitud que viene de otro sitio (Origin distinto) se rechaza', async () => {
    const { env } = await entornoPanel();
    const r = await pedir(env, '/api/pedidos/P261028-AAAAA/estado', { metodo: 'POST', cuerpo: { estado: 'Cancelado' }, cabeceras: { origin: 'https://malo.example' } });
    expect(r.status).toBe(403);
  });

  it('el mismo sitio sí puede', async () => {
    const { env } = await entornoPanel();
    const r = await pedir(env, '/api/pedidos/P261028-AAAAA/estado', { metodo: 'POST', cuerpo: { estado: 'Cancelado' }, cabeceras: { origin: 'https://panel.example' } });
    expect(r.status).toBe(200);
  });

  it('un cuerpo enorme o que no es JSON se rechaza', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/pedidos/P261028-AAAAA/editar', { metodo: 'POST', cuerpo: { notasRepartidor: 'x'.repeat(30_000) } })).status).toBe(400);
    const token = await acceso.token();
    const roto = await panel.fetch(new Request('https://panel.example/api/pedidos/P261028-AAAAA/editar', { method: 'POST', headers: { 'cf-access-jwt-assertion': token, 'content-type': 'application/json', 'x-panel': '1' }, body: '{no es json' }), env);
    expect(roto.status).toBe(400);
  });

  it('un fallo de la base no devuelve el detalle', async () => {
    const { env } = await entornoPanel({
      DB: { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('SQLITE_ERROR: no such table: secretos'); } }) }) },
    });
    const r = await pedir(env, '/api/pedidos');
    expect(r.status).toBe(500);
    expect(await r.text()).not.toContain('secretos');
  });
});
