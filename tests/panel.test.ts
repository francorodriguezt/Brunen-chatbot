import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PedidoARegistrar } from '../src/pedidos';
import { autenticar, olvidarClavesDeAcceso, type EntornoAcceso } from '../src/panel/acceso';
import panel, { type EntornoPanel } from '../src/panel';
import { manejarApi } from '../src/panel/api';
import { Cuentas } from '../src/panel/cuentas';
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
    // Pasaron más de 30 s desde la última descarga: una clave desconocida ya puede volver a pedirlas.
    expect((await autenticar(conCabecera(await acceso.token()), ENTORNO_ACCESS, AHORA + 40)).ok).toBe(true);
    expect(acceso.pedidosDeClaves()).toBe(2);
  });

  it('una firma con caracteres inválidos es un 401, no una excepción', async () => {
    const [cabeza, cuerpo] = (await acceso.token()).split('.');
    expect(await autenticar(conCabecera(`${cabeza}.${cuerpo}.@@@`), ENTORNO_ACCESS, AHORA)).toMatchObject({ ok: false, estado: 401 });
  });

  it('las claves desconocidas no hacen pedir las claves a Access a cada solicitud: como máximo una vez cada 30 s', async () => {
    await autenticar(conCabecera(await acceso.token()), ENTORNO_ACCESS, AHORA);
    for (const kid of ['a', 'b', 'c', 'd']) {
      expect(await autenticar(conCabecera(await acceso.token({}, { kid })), ENTORNO_ACCESS, AHORA + 1)).toMatchObject({ ok: false, estado: 401 });
    }
    expect(acceso.pedidosDeClaves()).toBe(1);
    await autenticar(conCabecera(await acceso.token({}, { kid: 'e' })), ENTORNO_ACCESS, AHORA + 40);
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

const SECRETO = 'secreto-de-prueba-con-mas-de-32-caracteres';
/** La cookie de la administradora de prueba que deja abierta `entornoPanel`. */
let sesionDePrueba = '';
const cookieDePrueba = (): string => `brunen_sesion=${sesionDePrueba}`;

async function entornoPanel(cambios: Partial<EntornoPanel> = {}) {
  const db = crearBaseSqlite();
  // Desde D51 la administración pide, además de Access, la sesión de un administrador con su RUT y su clave.
  const cuentas = new Cuentas(db, SECRETO);
  await cuentas.crearUsuario({ rut: '11.111.111-1', nombre: 'Operadora Demo', rol: 'administrador', clave: '2580', correo: 'operadora@brunen.test' }, 'prueba', AHORA - 1000);
  const ingreso = await cuentas.entrar({ rol: 'administrador', rut: '11.111.111-1', clave: '2580', recordar: false, origen: 'prueba', dispositivo: 'Prueba', correo: 'operadora@brunen.test' }, AHORA - 900);
  if (!ingreso.ok) throw new Error('la administradora de prueba no pudo entrar');
  sesionDePrueba = ingreso.token;
  const repositorio = new RepositorioD1(db, () => 1);
  await repositorio.guardarPedido(pedido(), AHORA - 600);
  await repositorio.guardarPedido(pedido({ idPedido: 'P261028-BBBBB', lineas: [{ tipo: '12L', cantidad: 2, precioUnitario: null, subtotal: null }], nombre: '' }), AHORA - 300);
  await repositorio.guardarAviso({ tipo: 'reclamo', telefono: '56911111111', nombre: 'Ana Prueba', resumen: 'Reclamo', motivos: [], texto: 'venía roto' }, 'wamid.1', AHORA - 100);
  const archivos: string[] = [];
  const env: EntornoPanel = {
    ...ENTORNO_ACCESS,
    DB: db,
    PANEL_SECRETO: SECRETO,
    ASSETS: { fetch: async (solicitud) => (archivos.push(new URL(solicitud.url).pathname), new Response('<html>panel</html>', { status: 200 })) },
    ...cambios,
  };
  return { env, db, repositorio, archivos };
}

async function pedir(env: EntornoPanel, ruta: string, opciones: { metodo?: string; cuerpo?: unknown; cabeceras?: Record<string, string>; token?: string | null } = {}) {
  const token = opciones.token === undefined ? await acceso.token() : opciones.token;
  const cabeceras: Record<string, string> = { ...(token ? { 'cf-access-jwt-assertion': token } : {}), cookie: cookieDePrueba(), ...opciones.cabeceras };
  const escribe = opciones.metodo === 'POST';
  if (escribe) Object.assign(cabeceras, { 'content-type': 'application/json', 'x-panel': '1', ...opciones.cabeceras });
  // La administración vive bajo /admin: `/api/pedidos` es `/admin/api/pedidos`, y la pantalla es `/admin/`.
  return panel.fetch(new Request(`https://panel.example/admin${ruta}`, { method: opciones.metodo ?? 'GET', headers: cabeceras, body: escribe ? JSON.stringify(opciones.cuerpo ?? {}) : undefined }), env);
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

  describe('con la administración en otra dirección (D56, opción 1)', () => {
    const ADMIN = 'https://brunen-admin.ejemplo.workers.dev';

    it('la dirección pública manda la pantalla de administración a la otra dirección', async () => {
      const { env, archivos } = await entornoPanel({ PANEL_ADMIN_URL: ADMIN });
      for (const ruta of ['/', '']) {
        const r = await pedir(env, ruta, { token: null });
        expect([r.status, r.headers.get('location')]).toEqual([302, `${ADMIN}/admin/`]);
      }
      expect(archivos).toEqual([]);
    });

    it('la dirección pública nunca atiende datos de administración, ni con un token de Access válido', async () => {
      const { env } = await entornoPanel({ PANEL_ADMIN_URL: ADMIN });
      expect((await pedir(env, '/api/pedidos')).status).toBe(404);
      expect((await pedir(env, '/api/pedidos', { metodo: 'POST' })).status).toBe(404);
      expect((await pedir(env, '/app.js')).status).toBe(404);
    });

    it('una dirección mal escrita se ignora: la administración sigue exigiendo Access aquí', async () => {
      const { env } = await entornoPanel({ PANEL_ADMIN_URL: 'http://sin-https.example/ruta' });
      expect((await pedir(env, '/', { token: null })).status).toBe(401);
    });
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
    expect(archivos).toEqual(['/admin/']);
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

  it('el mapa y la ubicación se permiten solo en su zona: mosaicos en /admin y GPS en /repartidor (D63)', async () => {
    const { env } = await entornoPanel();
    const admin = await pedir(env, '/');
    const politica = admin.headers.get('content-security-policy') ?? '';
    expect(politica).toContain("connect-src 'self' https://tiles.openfreemap.org");
    expect(politica).toContain("img-src 'self' data: blob: https://tiles.openfreemap.org");
    expect(politica).not.toContain('worker-src'); // el worker del mapa es un archivo propio
    expect(politica).toContain("script-src 'self'");
    expect(politica).not.toContain('unsafe');
    expect(admin.headers.get('permissions-policy')).toContain('geolocation=()');

    const portada = await panel.fetch(new Request('https://panel.example/'), env);
    expect(portada.headers.get('content-security-policy')).not.toContain('openfreemap');
    expect(portada.headers.get('permissions-policy')).toContain('geolocation=()');

    const repartidor = await panel.fetch(new Request('https://panel.example/repartidor'), env);
    expect(repartidor.headers.get('permissions-policy')).toContain('geolocation=(self)');
    expect(repartidor.headers.get('content-security-policy')).not.toContain('openfreemap');
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
    // Los nombres heredados de todo objeto de JavaScript tampoco son grupos.
    for (const grupo of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) {
      expect((await pedir(env, `/api/pedidos?grupo=${grupo}`)).status).toBe(400);
    }
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

  it('los pedidos del historial (H…) y los fijos (F…) también se abren y se cambian, no solo los del bot (P…)', async () => {
    const { env, repositorio } = await entornoPanel();
    await repositorio.guardarPedido(pedido({ idPedido: 'H261110-7K2QZ', estado: 'Confirmado' as never }), AHORA - 50);
    await repositorio.guardarPedido(pedido({ idPedido: 'F261111-0000C' }), AHORA - 40);
    for (const id of ['H261110-7K2QZ', 'F261111-0000C']) {
      const r = await pedir(env, `/api/pedidos/${id}`);
      expect([id, r.status]).toEqual([id, 200]);
    }
    expect((await pedir(env, '/api/pedidos/X261110-7K2QZ')).status).toBe(404);
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
    const sinMarca = await panel.fetch(new Request('https://panel.example/admin/api/pedidos/P261028-AAAAA/estado', { ...base, headers: { 'cf-access-jwt-assertion': token, cookie: cookieDePrueba(), 'content-type': 'application/json' } }), env);
    const sinJson = await panel.fetch(new Request('https://panel.example/admin/api/pedidos/P261028-AAAAA/estado', { ...base, headers: { 'cf-access-jwt-assertion': token, cookie: cookieDePrueba(), 'x-panel': '1', 'content-type': 'application/x-www-form-urlencoded' } }), env);
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
    const roto = await panel.fetch(new Request('https://panel.example/admin/api/pedidos/P261028-AAAAA/editar', { method: 'POST', headers: { 'cf-access-jwt-assertion': token, cookie: cookieDePrueba(), 'content-type': 'application/json', 'x-panel': '1' }, body: '{no es json' }), env);
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

describe('la API: reparto del día', () => {
  it('devuelve las paradas del día con la carga y los textos listos para copiar', async () => {
    const { env, repositorio } = await entornoPanel();
    await repositorio.cambiarEstado('P261028-AAAAA', 'Confirmado', 'x@y.test', AHORA);
    const r = await pedir(env, '/api/reparto?fecha=2026-10-29');
    expect(r.status).toBe(200);
    const datos = (await r.json()) as { reparto: { paradas: Array<{ idPedido: string }> } & Record<string, unknown>; texto: string; tsv: string };
    expect(datos.reparto).toMatchObject({ fecha: '2026-10-29', totalBidones: 2, carga: { '20L': 2, '12L': 0, '10L': 0 }, sinConfirmar: 1 });
    expect(datos.reparto.paradas.map((p) => p.idPedido)).toEqual(['P261028-AAAAA']);
    expect(datos.texto).toContain('Reparto del jueves 29 de octubre');
    expect(datos.tsv.split('\n')).toHaveLength(2);
  });

  it('trae lo que anotó el repartidor en cada parada, para seguir el avance (fase D, D61)', async () => {
    const { env, db, repositorio } = await entornoPanel();
    await repositorio.cambiarEstado('P261028-AAAAA', 'Confirmado', 'x@y.test', AHORA);
    db.sql("UPDATE pedidos SET no_entregado_en = 1793282400, no_entregado_motivo = 'cerrado' WHERE id = 'P261028-AAAAA'");
    const datos = (await (await pedir(env, '/api/reparto?fecha=2026-10-29')).json()) as { entregas: Record<string, unknown> };
    expect(datos.entregas['P261028-AAAAA']).toEqual({ vaciosRetirados: null, cobrado: null, entregadoEn: null, noEntregado: { motivo: 'cerrado', en: 1793282400 } });
  });

  it('un día sin entregas responde vacío, no un error', async () => {
    const { env } = await entornoPanel();
    const datos = (await (await pedir(env, '/api/reparto?fecha=2027-01-05')).json()) as { reparto: { paradas: unknown[] } };
    expect(datos.reparto.paradas).toEqual([]);
  });

  it.each(['/api/reparto', '/api/reparto?fecha=mañana', '/api/reparto?fecha=2026-13-45', '/api/reparto.csv', '/api/reparto.csv?fecha=29-10-2026'])('sin fecha o con una fecha mal escrita (%s): 400', async (ruta) => {
    const { env } = await entornoPanel();
    expect((await pedir(env, ruta)).status).toBe(400);
  });

  it('el archivo se descarga como CSV, con el día en el nombre y la marca que Excel necesita para los acentos', async () => {
    const { env, repositorio } = await entornoPanel();
    await repositorio.cambiarEstado('P261028-AAAAA', 'Confirmado', 'x@y.test', AHORA);
    const r = await pedir(env, '/api/reparto.csv?fecha=2026-10-29');
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toBe('text/csv; charset=utf-8');
    expect(r.headers.get('content-disposition')).toBe('attachment; filename="reparto-2026-10-29.csv"');
    const bytes = new Uint8Array(await r.arrayBuffer());
    expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]);
    expect(new TextDecoder().decode(bytes)).toContain('P261028-AAAAA;Ana Prueba;56911111111;Calle Falsa 123;Ñuñoa;2;0;0;2;');
  });

  it('el reparto también exige sesión', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/reparto?fecha=2026-10-29', { token: null })).status).toBe(401);
    expect((await pedir(env, '/api/reparto.csv?fecha=2026-10-29', { token: null })).status).toBe(401);
  });
});

describe('la API: anotar un pedido a mano', () => {
  const NUEVO = {
    telefono: '+56 9 2222 2222',
    nombre: 'Luz Demo',
    comuna: 'Macul',
    direccion: 'Avenida Ficticia 987',
    fecha: '2026-10-30',
    lineas: [{ tipo: '20L', cantidad: 2, precioUnitario: 3300 }],
    notasRepartidor: 'Dejar en conserjería',
    envasesARetirar: 1,
    confirmar: true,
  };
  type Creado = { pedido: { id: string } & Record<string, unknown> };

  it('lo crea confirmado por quien está conectado, con el teléfono en el formato de WhatsApp y el número de pedido del día', async () => {
    const { env } = await entornoPanel();
    const r = await pedir(env, '/api/pedidos', { metodo: 'POST', cuerpo: NUEVO });
    expect(r.status).toBe(201);
    const { pedido } = (await r.json()) as Creado;
    expect(pedido).toMatchObject({ telefono: '56922222222', nombre: 'Luz Demo', estado: 'Confirmado', confirmadoPor: 'operadora@brunen.test', total: 6600, fechaConfirmada: '2026-10-30', envasesARetirar: 1 });
    expect(pedido.id).toMatch(/^P261026-[0-9A-Z]{5}$/); // AHORA es el lunes 26 de octubre en Santiago
  });

  it('sin "confirmar" queda por confirmar y aparece en la bandeja', async () => {
    const { env } = await entornoPanel();
    const { pedido } = (await (await pedir(env, '/api/pedidos', { metodo: 'POST', cuerpo: { ...NUEVO, confirmar: false } })).json()) as Creado;
    expect(pedido.estado).toBe('Pendiente_Confirmacion');
    const bandeja = (await (await pedir(env, '/api/pedidos')).json()) as { pedidos: Array<{ id: string }> };
    expect(bandeja.pedidos.map((p) => p.id)).toContain(pedido.id);
  });

  it('lo mínimo: basta con los bidones y la fecha', async () => {
    const { env } = await entornoPanel();
    const r = await pedir(env, '/api/pedidos', { metodo: 'POST', cuerpo: { fecha: '2026-10-30', lineas: [{ tipo: '12L', cantidad: 1, precioUnitario: null }] } });
    expect(r.status).toBe(201);
    expect(((await r.json()) as Creado).pedido).toMatchObject({ telefono: '', nombre: '', estado: 'Pendiente_Confirmacion', total: null, envasesARetirar: 0 });
  });

  it('un teléfono que no se entiende: 422 con una explicación', async () => {
    const { env } = await entornoPanel();
    const r = await pedir(env, '/api/pedidos', { metodo: 'POST', cuerpo: { ...NUEVO, telefono: '12345' } });
    expect(r.status).toBe(422);
    expect(((await r.json()) as { error: string }).error).toContain('teléfono');
  });

  it.each([
    ['un nombre que no es texto', { nombre: 5 }],
    ['un teléfono que no es texto', { telefono: 56922222222 }],
    ['líneas que no son una lista', { lineas: 'dos de 20' }],
    ['sin líneas', { lineas: undefined }],
    ['sin fecha', { fecha: undefined }],
    ['envases que no son un número', { envasesARetirar: 'dos' }],
    ['"confirmar" que no es sí o no', { confirmar: 'sí' }],
  ])('rechaza %s: 400', async (_nombre, cambios) => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/pedidos', { metodo: 'POST', cuerpo: { ...NUEVO, ...cambios } })).status).toBe(400);
  });

  it.each([
    ['sin productos', { lineas: [] }],
    ['con una línea que no es un producto', { lineas: [null] }],
    ['con una cantidad de cero', { lineas: [{ tipo: '20L', cantidad: 0, precioUnitario: 3300 }] }],
    ['con una fecha que no existe', { fecha: '2026-02-30' }],
  ])('un pedido %s: 422 y no se guarda', async (_nombre, cambios) => {
    const { env, db } = await entornoPanel();
    expect((await pedir(env, '/api/pedidos', { metodo: 'POST', cuerpo: { ...NUEVO, ...cambios } })).status).toBe(422);
    expect(db.sql('SELECT COUNT(*) AS n FROM pedidos')).toEqual([{ n: 2 }]);
  });

  it('tiene las mismas protecciones que las demás escrituras', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/pedidos', { metodo: 'POST', cuerpo: NUEVO, cabeceras: { 'x-panel': '0' } })).status).toBe(400);
    expect((await pedir(env, '/api/pedidos', { metodo: 'POST', cuerpo: NUEVO, cabeceras: { origin: 'https://otro.example' } })).status).toBe(403);
    expect((await pedir(env, '/api/pedidos', { metodo: 'POST', cuerpo: NUEVO, token: null })).status).toBe(401);
  });
});

describe('la API: buscar pedidos', () => {
  const buscar = (env: EntornoPanel, texto: unknown) => pedir(env, '/api/pedidos/buscar', { metodo: 'POST', cuerpo: { texto } });

  it('trae los que calzan por nombre o teléfono, estén en el estado que estén', async () => {
    const { env, repositorio } = await entornoPanel();
    await repositorio.cambiarEstado('P261028-AAAAA', 'Cancelado', 'x@y.test', AHORA);
    const ids = async (texto: string) => ((await (await buscar(env, texto)).json()) as { pedidos: Array<{ id: string }> }).pedidos.map((p) => p.id);
    expect(await ids('ana pru')).toEqual(['P261028-AAAAA']);
    expect((await ids('1111 1111')).sort()).toEqual(['P261028-AAAAA', 'P261028-BBBBB']);
    expect(await ids('nadie con este nombre')).toEqual([]);
  });

  it('con menos de 2 caracteres, o sin texto: 400 con explicación', async () => {
    const { env } = await entornoPanel();
    expect((await buscar(env, 'a')).status).toBe(400);
    expect((await buscar(env, 5)).status).toBe(400);
    expect((await buscar(env, undefined)).status).toBe(400);
  });

  it('lo que se busca (nombres, teléfonos) viaja en el cuerpo y no en la dirección, que queda en los registros de Cloudflare', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/pedidos?buscar=ana')).status).toBe(400);
    expect((await pedir(env, '/api/pedidos/buscar')).status).toBe(404);
  });
});

describe('la API: opciones para anotar un pedido', () => {
  it('entrega las 12 comunas que se atienden y la fecha de entrega sugerida', async () => {
    const { env } = await entornoPanel();
    const datos = (await (await pedir(env, '/api/opciones')).json()) as { comunas: string[]; fechaSugerida: string };
    expect(datos.comunas).toHaveLength(12);
    expect(datos.comunas).toContain('Ñuñoa');
    // AHORA es lunes a las 04:33 en Santiago: antes del corte de las 9:00 se sugiere el mismo día.
    expect(datos.fechaSugerida).toBe('2026-10-26');
  });

  it('después del corte sugiere el siguiente día de despacho; el sábado en la tarde, el lunes', async () => {
    const { repositorio } = await entornoPanel();
    const sugerida = async (instante: string) => {
      const ahoraSegundos = Date.parse(instante) / 1000;
      const r = await manejarApi(new Request('https://panel.example/api/opciones'), new URL('https://panel.example/api/opciones'), { repositorio, correo: 'x@y.test', ahoraSegundos });
      return ((await r.json()) as { fechaSugerida: string }).fechaSugerida;
    };
    expect(await sugerida('2026-10-26T15:00:00Z')).toBe('2026-10-27'); // lunes 12:00 en Santiago
    expect(await sugerida('2026-10-31T16:00:00Z')).toBe('2026-11-02'); // sábado 13:00 en Santiago
  });
});

describe('la API: reconocer al cliente por su teléfono', () => {
  const anterior = (env: EntornoPanel, telefono: unknown) => pedir(env, '/api/clientes/anterior', { metodo: 'POST', cuerpo: { telefono } });

  it('devuelve los datos de su último pedido con dirección, aunque el teléfono venga con espacios', async () => {
    const { env } = await entornoPanel();
    const r = await anterior(env, '+56 9 1111 1111');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ datos: { idPedido: 'P261028-BBBBB', nombre: '', direccion: 'Calle Falsa 123', comuna: 'Ñuñoa', notasRepartidor: '' } });
  });

  it('si ese teléfono no tiene pedidos, o no se entiende, no hay datos', async () => {
    const { env } = await entornoPanel();
    expect(await (await anterior(env, '56999999999')).json()).toEqual({ datos: null });
    expect(await (await anterior(env, 'hola')).json()).toEqual({ datos: null });
    expect(await (await anterior(env, undefined)).json()).toEqual({ datos: null });
  });

  it('el teléfono viaja en el cuerpo, no en la dirección', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/clientes/anterior?telefono=56911111111')).status).toBe(404);
  });
});

describe('la API: bidones entregados (D65)', () => {
  it('responde las cifras del día pedido, y una fecha mal escrita da 400', async () => {
    const { env } = await entornoPanel();
    const r = await pedir(env, '/api/estadisticas?hasta=2026-10-28');
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ hasta: '2026-10-28', dias: expect.any(Array), vacios: expect.any(Array) });
    expect((await pedir(env, '/api/estadisticas?hasta=ayer')).status).toBe(400);
  });
});

describe('la API: pedido rápido con el mensaje pegado (D64)', () => {
  it('lee el mensaje con el intérprete del bot y no guarda nada', async () => {
    const { env, repositorio } = await entornoPanel();
    const antes = (await repositorio.listarPedidos()).length;
    const r = await pedir(env, '/api/pedidos/interpretar', { metodo: 'POST', cuerpo: { texto: '[10:32, 28/10/2026] +56 9 1111 2222: 3 de 20, pago en efectivo' } });
    expect(r.status).toBe(200);
    expect(await r.json()).toMatchObject({ telefono: '56911112222', lineas: [{ tipo: '20L', cantidad: 3 }], formaPago: 'efectivo' });
    expect((await repositorio.listarPedidos()).length).toBe(antes);
  });

  it('sin texto, o sin la cabecera del panel, se rechaza', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/pedidos/interpretar', { metodo: 'POST', cuerpo: { texto: '  ' } })).status).toBe(400);
    expect((await pedir(env, '/api/pedidos/interpretar', { metodo: 'POST', cuerpo: { texto: '2 de 20' }, cabeceras: { 'x-panel': '' } })).status).not.toBe(200);
  });
});

describe('la API: la versión del pedido que la pantalla estaba mostrando', () => {
  it('con la versión al día, confirma', async () => {
    const { env } = await entornoPanel();
    const r = await pedir(env, '/api/pedidos/P261028-AAAAA/estado', { metodo: 'POST', cuerpo: { estado: 'Confirmado', actualizadoEn: AHORA - 600 } });
    expect(r.status).toBe(200);
  });

  it('si otra persona lo cambió mientras tanto: 409 con explicación, y el pedido no cambia', async () => {
    const { env, repositorio } = await entornoPanel();
    await repositorio.editarPedido('P261028-AAAAA', { direccion: 'Otra Calle 9' }, 'dueno@brunen.test', AHORA - 10);
    const r = await pedir(env, '/api/pedidos/P261028-AAAAA/estado', { metodo: 'POST', cuerpo: { estado: 'Confirmado', actualizadoEn: AHORA - 600 } });
    expect(r.status).toBe(409);
    expect(((await r.json()) as { error: string }).error).toContain('Otra persona');
    expect((await repositorio.obtenerPedido('P261028-AAAAA'))?.estado).toBe('Pendiente_Confirmacion');
  });

  it('lo mismo al editar', async () => {
    const { env, repositorio } = await entornoPanel();
    await repositorio.editarPedido('P261028-AAAAA', { direccion: 'Otra Calle 9' }, 'dueno@brunen.test', AHORA - 10);
    const r = await pedir(env, '/api/pedidos/P261028-AAAAA/editar', { metodo: 'POST', cuerpo: { comuna: 'Macul', actualizadoEn: AHORA - 600 } });
    expect(r.status).toBe(409);
    expect((await repositorio.obtenerPedido('P261028-AAAAA'))?.comuna).toBe('Ñuñoa');
  });

  it.each(['estado', 'editar'])('una versión que no es un número entero se rechaza al pedir "%s": 400', async (accion) => {
    const { env } = await entornoPanel();
    const cuerpo = accion === 'estado' ? { estado: 'Confirmado', actualizadoEn: 'ayer' } : { comuna: 'Macul', actualizadoEn: 1.5 };
    expect((await pedir(env, `/api/pedidos/P261028-AAAAA/${accion}`, { metodo: 'POST', cuerpo })).status).toBe(400);
  });
});

describe('la API: envases por retirar al editar', () => {
  it('se pueden corregir desde "Cambiar"', async () => {
    const { env } = await entornoPanel();
    const r = await pedir(env, '/api/pedidos/P261028-AAAAA/editar', { metodo: 'POST', cuerpo: { envasesARetirar: 3 } });
    expect(r.status).toBe(200);
    expect(((await r.json()) as { pedido: { envasesARetirar: number } }).pedido.envasesARetirar).toBe(3);
  });

  it('si no son un número: 400', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/pedidos/P261028-AAAAA/editar', { metodo: 'POST', cuerpo: { envasesARetirar: 'tres' } })).status).toBe(400);
  });
});

describe('la API: pago, documento y tipo de cliente (D52)', () => {
  it('las opciones traen las listas cerradas', async () => {
    const { env } = await entornoPanel();
    const datos = (await (await pedir(env, '/api/opciones')).json()) as Record<string, unknown>;
    expect(datos.formaPago).toEqual(['transferencia', 'efectivo', 'redcompra', 'webpay', 'plan', 'otro']);
    expect(datos.estadoPago).toEqual(['pendiente', 'pagado']);
    expect(datos.documento).toEqual(['boleta', 'factura']);
    expect(datos.tipoCliente).toEqual(['hogar', 'minimarket', 'empresa']);
  });

  it('se cambian en un pedido y quedan en el historial', async () => {
    const { env, repositorio } = await entornoPanel();
    const r = await pedir(env, '/api/pedidos/P261028-AAAAA/editar', {
      metodo: 'POST',
      cuerpo: { formaPago: 'efectivo', estadoPago: 'pagado', documento: 'factura', numeroDocumento: ' 1234 ', tipoCliente: 'minimarket' },
    });
    expect(r.status).toBe(200);
    expect(await repositorio.obtenerPedido('P261028-AAAAA')).toMatchObject({ formaPago: 'efectivo', estadoPago: 'pagado', documento: 'factura', numeroDocumento: '1234', tipoCliente: 'minimarket' });
    const [, editado] = await repositorio.historialDe('P261028-AAAAA');
    expect(editado?.detalle).toContain('forma de pago: efectivo');
    expect(editado?.detalle).toContain('tipo de cliente: minimarket');
  });

  it.each([
    [{ formaPago: 'cheque' }],
    [{ estadoPago: '' }],
    [{ documento: 'recibo' }],
    [{ tipoCliente: 'hotel' }],
    [{ numeroDocumento: '<script>' }],
    [{ formaPago: 3 }],
  ])('rechaza %j', async (cuerpo) => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/pedidos/P261028-AAAAA/editar', { metodo: 'POST', cuerpo })).status).toBeGreaterThanOrEqual(400);
  });

  it('un pedido entregado todavía se puede marcar pagado o con factura, pero no cambiar sus bidones', async () => {
    const { env, repositorio } = await entornoPanel();
    await repositorio.cambiarEstado('P261028-AAAAA', 'Confirmado', 'x', AHORA);
    await repositorio.cambiarEstado('P261028-AAAAA', 'Entregado', 'x', AHORA + 1);
    expect((await pedir(env, '/api/pedidos/P261028-AAAAA/editar', { metodo: 'POST', cuerpo: { estadoPago: 'pagado', documento: 'boleta', numeroDocumento: '88' } })).status).toBe(200);
    expect((await pedir(env, '/api/pedidos/P261028-AAAAA/editar', { metodo: 'POST', cuerpo: { tipoCliente: 'hogar' } })).status).toBe(409);
    expect((await pedir(env, '/api/pedidos/P261028-AAAAA/editar', { metodo: 'POST', cuerpo: { comuna: 'Macul' } })).status).toBe(409);
  });

  it('un pedido anotado a mano guarda su forma de pago y su tipo de cliente', async () => {
    const { env } = await entornoPanel();
    const r = await pedir(env, '/api/pedidos', {
      metodo: 'POST',
      cuerpo: { telefono: '', nombre: 'Minimarket Demo', comuna: 'Macul', direccion: 'Calle 1', fecha: '2026-10-30', lineas: [{ tipo: '20L', cantidad: 10, precioUnitario: 1250 }], formaPago: 'transferencia', tipoCliente: 'minimarket' },
    });
    expect(r.status).toBe(201);
    const { pedido } = (await r.json()) as { pedido: Record<string, unknown> };
    expect(pedido).toMatchObject({ formaPago: 'transferencia', estadoPago: 'pendiente', tipoCliente: 'minimarket' });
    expect((await pedir(env, '/api/pedidos', { metodo: 'POST', cuerpo: { telefono: '', fecha: '2026-10-30', lineas: [{ tipo: '20L', cantidad: 1, precioUnitario: 4500 }], formaPago: 'cheque' } })).status).toBe(422);
  });
});

describe('la API: clientes (D53)', () => {
  it('lista los clientes, asociando primero los pedidos nuevos', async () => {
    const { env } = await entornoPanel();
    const { clientes } = (await (await pedir(env, '/api/clientes')).json()) as { clientes: Array<Record<string, unknown>> };
    expect(clientes).toHaveLength(1);
    expect(clientes[0]).toMatchObject({ nombre: 'Ana Prueba', telefonos: ['56911111111'], pedidos: 2 });
  });

  it('dice a quién le toca pedir (D58), solo a un administrador con sesión', async () => {
    const { env } = await entornoPanel();
    const r = await pedir(env, '/api/clientes/por-pedir');
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ clientes: [], inactivos: 0 }); // con 2 pedidos todavía no hay ritmo
    expect((await pedir(env, '/api/clientes/por-pedir', { token: null })).status).toBe(401);
  });

  it('guarda el pedido fijo de un cliente y lo muestra en su ficha (D59)', async () => {
    const { env } = await entornoPanel();
    const { clientes } = (await (await pedir(env, '/api/clientes')).json()) as { clientes: Array<{ id: number }> };
    const id = clientes[0]?.id as number;
    expect(((await (await pedir(env, `/api/clientes/${id}`)).json()) as { fijo: unknown }).fijo).toBeNull();
    const fijo = { tipo: '20L', cantidad: 10, cadaDias: 7, proximaFecha: '2026-11-16', activo: true, notas: '' };
    expect((await pedir(env, `/api/clientes/${id}/fijo`, { metodo: 'POST', cuerpo: fijo })).status).toBe(200);
    expect(((await (await pedir(env, `/api/clientes/${id}`)).json()) as { fijo: Record<string, unknown> }).fijo).toMatchObject({ cadaDias: 7, proximaFecha: '2026-11-16', activo: true });
    expect((await pedir(env, `/api/clientes/${id}/fijo`, { metodo: 'POST', cuerpo: { ...fijo, cantidad: 0 } })).status).toBe(422);
  });

  it('busca por POST y muestra la ficha con sus pedidos', async () => {
    const { env } = await entornoPanel();
    const { clientes } = (await (await pedir(env, '/api/clientes/buscar', { metodo: 'POST', cuerpo: { texto: '1111' } })).json()) as { clientes: Array<{ id: number }> };
    expect(clientes).toHaveLength(1);
    const ficha = (await (await pedir(env, `/api/clientes/${clientes[0]?.id}`)).json()) as { cliente: Record<string, unknown>; pedidos: unknown[] };
    expect(ficha.cliente).toMatchObject({ nombre: 'Ana Prueba' });
    expect(ficha.pedidos).toHaveLength(2);
    expect((await pedir(env, '/api/clientes/999')).status).toBe(404);
  });

  it('edita, agrega un teléfono y une dos fichas', async () => {
    const { env, repositorio } = await entornoPanel();
    await repositorio.guardarPedido(pedido({ idPedido: 'P261028-CCCCC', telefono: '56922222222', nombre: 'Ana Oficina' }), AHORA - 50);
    const { clientes } = (await (await pedir(env, '/api/clientes')).json()) as { clientes: Array<{ id: number; nombre: string }> };
    const ana = clientes.find((c) => c.nombre === 'Ana Prueba')?.id;
    expect((await pedir(env, `/api/clientes/${ana}/editar`, { metodo: 'POST', cuerpo: { tipoCliente: 'empresa', notas: 'Recepción' } })).status).toBe(200);
    expect((await pedir(env, `/api/clientes/${ana}/editar`, { metodo: 'POST', cuerpo: { tipoCliente: 'hotel' } })).status).toBe(422);
    expect((await pedir(env, `/api/clientes/${ana}/telefonos`, { metodo: 'POST', cuerpo: { telefono: '9 3333 3333' } })).status).toBe(200);
    const deOtro = await pedir(env, `/api/clientes/${ana}/telefonos`, { metodo: 'POST', cuerpo: { telefono: '+56 9 2222 2222' } });
    expect(deOtro.status).toBe(409);
    expect(((await deOtro.json()) as { otroId: number }).otroId).toBeGreaterThan(0);
    expect((await pedir(env, `/api/clientes/${ana}/unir`, { metodo: 'POST', cuerpo: { telefono: '922222222' } })).status).toBe(200);
    const despues = (await (await pedir(env, `/api/clientes/${ana}`)).json()) as { cliente: { telefonos: string[]; pedidos: number } };
    expect(despues.cliente.telefonos.sort()).toEqual(['56911111111', '56922222222', '56933333333']);
    expect(despues.cliente.pedidos).toBe(3);
  });

  it('corregir la dirección de un pedido la suma al historial de su cliente', async () => {
    const { env } = await entornoPanel();
    const { clientes } = (await (await pedir(env, '/api/clientes')).json()) as { clientes: Array<{ id: number }> };
    await pedir(env, '/api/pedidos/P261028-AAAAA/editar', { metodo: 'POST', cuerpo: { direccion: 'Av. Nueva 45', comuna: 'Providencia' } });
    const { cliente } = (await (await pedir(env, `/api/clientes/${clientes[0]?.id}`)).json()) as { cliente: { direccion: { direccion: string }; direcciones: unknown[] } };
    expect(cliente.direccion.direccion).toBe('Av. Nueva 45');
    expect(cliente.direcciones).toHaveLength(2);
  });

  it('las escrituras exigen la marca del panel, y sin sesión de administrador no hay datos', async () => {
    const { env } = await entornoPanel();
    expect((await pedir(env, '/api/clientes/1/editar', { metodo: 'POST', cuerpo: { notas: 'x' }, cabeceras: { 'x-panel': '' } })).status).toBe(400);
    const sinSesion = await panel.fetch(new Request('https://panel.example/admin/api/clientes', { headers: { 'cf-access-jwt-assertion': await acceso.token() } }), env);
    expect(sinSesion.status).toBe(401);
  });
});

describe('correcciones de la revisión: el panel', () => {
  it('si asociar pedidos falla, la lista de clientes se muestra igual', async () => {
    const { env } = await entornoPanel();
    const { RepositorioClientes } = await import('../src/fichas');
    const espia = vi.spyOn(RepositorioClientes.prototype, 'vincularPendientes').mockRejectedValue(new Error('Too many API requests by single worker invocation'));
    const r = await pedir(env, '/api/clientes');
    expect(r.status).toBe(200);
    espia.mockRestore();
  });

  it('una edición sin cambios no escribe ni deja historial', async () => {
    const { env, repositorio } = await entornoPanel();
    const antes = await repositorio.obtenerPedido('P261028-AAAAA');
    expect((await pedir(env, '/api/pedidos/P261028-AAAAA/editar', { metodo: 'POST', cuerpo: {} })).status).toBe(200);
    expect((await repositorio.obtenerPedido('P261028-AAAAA'))?.actualizadoEn).toBe(antes?.actualizadoEn);
    expect(await repositorio.historialDe('P261028-AAAAA')).toHaveLength(1);
  });
});
