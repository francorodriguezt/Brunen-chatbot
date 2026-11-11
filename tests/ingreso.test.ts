import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import panel, { type EntornoPanel } from '../src/panel';
import { olvidarClavesDeAcceso } from '../src/panel/acceso';
import { Cuentas, MAX_INTENTOS } from '../src/panel/cuentas';
import { dispositivoDe } from '../src/panel/ingreso';
import { RepositorioD1 } from '../src/repositorio';
import { AUD, DOMINIO, crearAccesoFalso, type AccesoFalso } from './acceso-falso';
import { crearBaseSqlite } from './ayudas';

const AHORA = 1793000000;
const SECRETO = 'secreto-de-prueba-con-mas-de-32-caracteres';
// RUT de prueba con dígito verificador correcto (no son de personas reales).
const RUT_REPARTIDOR = '22.222.222-2';
const RUT_ADMIN = '11.111.111-1';
const RUT_OTRA_ADMIN = '12.345.678-5';
const CLAVE = '2580';
const CORREO = 'operadora@brunen.test';

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

async function entorno(cambios: Partial<EntornoPanel> = {}) {
  const db = crearBaseSqlite();
  const cuentas = new Cuentas(db, SECRETO);
  const repartidor = await cuentas.crearUsuario({ rut: RUT_REPARTIDOR, nombre: 'Repartidor Demo', rol: 'repartidor', clave: CLAVE }, 'prueba', AHORA - 100);
  if (!repartidor.ok) throw new Error(repartidor.error);
  const archivos: string[] = [];
  const env: EntornoPanel = {
    ACCESS_TEAM_DOMAIN: DOMINIO,
    ACCESS_AUD: AUD,
    DB: db,
    PANEL_SECRETO: SECRETO,
    ASSETS: { fetch: async (solicitud) => (archivos.push(new URL(solicitud.url).pathname), new Response('<html>archivo</html>', { status: 200 })) },
    ...cambios,
  };
  return { env, db, cuentas, archivos, repartidor: repartidor.valor, repositorio: new RepositorioD1(db) };
}

interface Opciones {
  cuerpo?: unknown;
  cookie?: string | null;
  /** Token de Access; por omisión, ninguno. */
  token?: string;
  cabeceras?: Record<string, string>;
  origen?: string;
}

function pedir(env: EntornoPanel, ruta: string, opciones: Opciones = {}, base = 'https://panel.example'): Promise<Response> {
  const escribe = opciones.cuerpo !== undefined;
  const cabeceras: Record<string, string> = {
    ...(escribe ? { 'content-type': 'application/json', 'x-panel': '1' } : {}),
    ...(opciones.cookie ? { cookie: opciones.cookie } : {}),
    ...(opciones.token ? { 'cf-access-jwt-assertion': opciones.token } : {}),
    'cf-connecting-ip': opciones.origen ?? '203.0.113.7',
    'user-agent': 'Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36',
    ...opciones.cabeceras,
  };
  return panel.fetch(new Request(`${base}${ruta}`, { method: escribe ? 'POST' : 'GET', headers: cabeceras, body: escribe ? JSON.stringify(opciones.cuerpo) : undefined }), env);
}

/** "brunen_sesion=…" lista para mandarla de vuelta, a partir del Set-Cookie de una respuesta. */
function cookieDe(respuesta: Response): string {
  return (respuesta.headers.get('set-cookie') ?? '').split(';')[0] ?? '';
}

const entrarComoRepartidor = (env: EntornoPanel, cambios: Record<string, unknown> = {}, opciones: Opciones = {}) =>
  pedir(env, '/api/sesion/entrar', { ...opciones, cuerpo: { rut: RUT_REPARTIDOR, clave: CLAVE, recordar: true, ...cambios } });

/** Deja a una administradora con su RUT y clave creados y devuelve su token de Access y su cookie. */
async function conAdministradora(env: EntornoPanel, correo = CORREO, rut = RUT_ADMIN) {
  const token = await acceso.token({ email: correo });
  const r = await pedir(env, '/admin/api/sesion/primer-ingreso', { token, cuerpo: { nombre: 'Operadora Demo', rut, clave: CLAVE, recordar: true } });
  if (r.status !== 200) throw new Error(`primer ingreso: ${r.status} ${await r.text()}`);
  return { token, cookie: cookieDe(r) };
}

describe('lo público: la portada y los archivos de la aplicación', () => {
  it.each([['/'], ['/portada.js'], ['/ingreso.js'], ['/estilos.css'], ['/manifest.webmanifest'], ['/sw.js'], ['/repartidor/'], ['/repartidor/app.js'], ['/iconos/icono-192.png']])(
    '%s se sirve sin sesión',
    async (ruta) => {
      const { env, archivos } = await entorno();
      expect((await pedir(env, ruta)).status).toBe(200);
      expect(archivos).toEqual([ruta]);
    },
  );

  it.each([['/app.js'], ['/admin.html'], ['/cualquier/cosa'], ['/%61dmin/app.js'], ['/Admin/app.js'], ['//admin/app.js'], ['/iconos/../admin/app.js'], ['/iconos/x.svg'], ['/.dev.vars']])(
    '%s no existe para quien no pasó por Access: nunca llega a los archivos',
    async (ruta) => {
      const { env, archivos } = await entorno();
      const r = await pedir(env, ruta);
      expect([401, 404]).toContain(r.status);
      expect(archivos).toEqual([]);
    },
  );

  it('los archivos de administración no se sirven sin la sesión de Access', async () => {
    const { env, archivos } = await entorno();
    expect((await pedir(env, '/admin/')).status).toBe(401);
    expect((await pedir(env, '/admin/app.js')).status).toBe(401);
    expect((await pedir(env, '/admin')).status).toBe(401);
    expect(archivos).toEqual([]);
  });

  it('lo público solo se pide con GET', async () => {
    const { env } = await entorno();
    expect((await pedir(env, '/', { cuerpo: {} })).status).toBe(405);
  });

  it('lo público también lleva las cabeceras de seguridad', async () => {
    const { env } = await entorno();
    const r = await pedir(env, '/');
    expect(r.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(r.headers.get('x-content-type-options')).toBe('nosniff');
  });
});

describe('entrar como repartidor', () => {
  it('con RUT y clave entra y recibe una cookie que la página no puede leer', async () => {
    const { env } = await entorno();
    const r = await entrarComoRepartidor(env);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ usuario: { nombre: 'Repartidor Demo', rol: 'repartidor' } });
    const cookie = r.headers.get('set-cookie') ?? '';
    expect(cookie).toMatch(/^brunen_sesion=[A-Za-z0-9_-]{40,}; Path=\/; HttpOnly; SameSite=Strict; Secure; Max-Age=2592000$/);
  });

  it('sin "recordar este dispositivo" la cookie se va al cerrar el navegador', async () => {
    const { env } = await entorno();
    const cookie = (await entrarComoRepartidor(env, { recordar: false })).headers.get('set-cookie') ?? '';
    expect(cookie).not.toContain('Max-Age');
    expect(cookie).toContain('HttpOnly');
  });

  it('la respuesta nunca trae la clave, el RUT ni el token en el cuerpo', async () => {
    const { env } = await entorno();
    const r = await entrarComoRepartidor(env);
    const cuerpo = await r.clone().text();
    expect(cuerpo).not.toContain(CLAVE);
    expect(cuerpo).not.toContain('2222');
    expect(cuerpo).not.toContain(cookieDe(r).split('=')[1]);
  });

  it('con la cookie, /api/sesion dice quién es; sin ella, nadie', async () => {
    const { env } = await entorno();
    const cookie = cookieDe(await entrarComoRepartidor(env));
    expect(await (await pedir(env, '/api/sesion', { cookie })).json()).toEqual({ usuario: { nombre: 'Repartidor Demo', rol: 'repartidor' } });
    expect(await (await pedir(env, '/api/sesion')).json()).toEqual({ usuario: null });
    expect(await (await pedir(env, '/api/sesion', { cookie: 'brunen_sesion=inventadainventadainventadainventada' })).json()).toEqual({ usuario: null });
  });

  it('un dispositivo recordado recibe la cookie renovada cuando lleva un día sin renovarse', async () => {
    const { env } = await entorno();
    const cookie = cookieDe(await entrarComoRepartidor(env));
    expect((await pedir(env, '/api/sesion', { cookie })).headers.get('set-cookie')).toBeNull();
    vi.setSystemTime((AHORA + 2 * 86400) * 1000);
    expect((await pedir(env, '/api/sesion', { cookie })).headers.get('set-cookie')).toContain(`${cookie}; Path=/; HttpOnly; SameSite=Strict; Secure; Max-Age=2592000`);
  });

  it('salir borra la sesión y la cookie', async () => {
    const { env } = await entorno();
    const cookie = cookieDe(await entrarComoRepartidor(env));
    const r = await pedir(env, '/api/sesion/salir', { cookie, cuerpo: {} });
    expect(r.headers.get('set-cookie')).toContain('Max-Age=0');
    expect(await (await pedir(env, '/api/sesion', { cookie })).json()).toEqual({ usuario: null });
  });

  it('clave equivocada: 401 con un mensaje que no dice qué falló', async () => {
    const { env } = await entorno();
    const mala = await entrarComoRepartidor(env, { clave: '9041' });
    const noExiste = await entrarComoRepartidor(env, { rut: RUT_OTRA_ADMIN });
    expect([mala.status, noExiste.status]).toEqual([401, 401]);
    expect(await mala.json()).toEqual(await noExiste.json());
    expect(mala.headers.get('set-cookie')).toBeNull();
  });

  it(`al intento fallido número ${MAX_INTENTOS} se bloquea, lo dice, y deja un aviso para los administradores (una sola vez)`, async () => {
    const { env, repositorio } = await entorno();
    for (let i = 1; i < MAX_INTENTOS; i++) expect((await entrarComoRepartidor(env, { clave: '9041' })).status).toBe(401);
    const bloqueo = await entrarComoRepartidor(env, { clave: '9041' });
    expect(bloqueo.status).toBe(429);
    expect(((await bloqueo.json()) as { error: string }).error).toContain('15 minutos');
    expect((await entrarComoRepartidor(env)).status).toBe(429); // ni con la clave correcta
    const avisos = await repositorio.listarAvisos('abierto');
    expect(avisos.filter((a) => a.resumen.includes('Repartidor Demo'))).toHaveLength(1);
    expect(JSON.stringify(avisos)).not.toContain('22222222');
  });

  it('un formulario de otra página no puede iniciar sesión por la persona', async () => {
    const { env } = await entorno();
    const sinMarca = await pedir(env, '/api/sesion/entrar', { cuerpo: { rut: RUT_REPARTIDOR, clave: CLAVE }, cabeceras: { 'x-panel': '' } });
    const otroSitio = await entrarComoRepartidor(env, {}, { cabeceras: { origin: 'https://malo.example' } });
    expect([sinMarca.status, otroSitio.status]).toEqual([400, 403]);
  });

  it('un administrador no entra por la puerta del repartidor', async () => {
    const { env } = await entorno();
    await conAdministradora(env);
    expect((await pedir(env, '/api/sesion/entrar', { cuerpo: { rut: RUT_ADMIN, clave: CLAVE } })).status).toBe(401);
  });

  it('en localhost (sin HTTPS) la cookie no lleva Secure', async () => {
    const { env } = await entorno();
    const r = await pedir(env, '/api/sesion/entrar', { cuerpo: { rut: RUT_REPARTIDOR, clave: CLAVE, recordar: false } }, 'http://localhost:8788');
    expect(r.status).toBe(200);
    expect(r.headers.get('set-cookie')).not.toContain('Secure');
  });

  it('sin el secreto o sin la base, falla cerrado; lo público sigue abierto', async () => {
    const sinSecreto = await entorno({ PANEL_SECRETO: '' });
    expect((await entrarComoRepartidor(sinSecreto.env)).status).toBe(503);
    expect((await pedir(sinSecreto.env, '/')).status).toBe(200);
    const sinBase = await entorno({ DB: undefined });
    expect((await pedir(sinBase.env, '/api/sesion')).status).toBe(503);
  });

  it('una ruta de datos que no existe responde 404, no un archivo', async () => {
    const { env, archivos } = await entorno();
    expect((await pedir(env, '/api/pedidos')).status).toBe(404);
    expect(archivos).toEqual([]);
  });
});

describe('entrar como administrador', () => {
  it('pasar por Access no basta: sin RUT y clave no hay datos', async () => {
    const { env } = await entorno();
    const token = await acceso.token();
    expect((await pedir(env, '/admin/api/pedidos', { token })).status).toBe(401);
    expect((await pedir(env, '/admin/api/usuarios', { token })).status).toBe(401);
    expect((await pedir(env, '/admin/', { token })).status).toBe(200); // la pantalla sí: es la que pide el RUT
  });

  it('la primera vez elige su RUT y su clave, y queda adentro', async () => {
    const { env } = await entorno();
    const token = await acceso.token();
    expect(await (await pedir(env, '/admin/api/sesion', { token })).json()).toEqual({ correo: CORREO, usuario: null, primerIngreso: true });
    const { cookie } = await conAdministradora(env);
    expect(await (await pedir(env, '/admin/api/sesion', { token, cookie })).json()).toEqual({ correo: CORREO, usuario: { nombre: 'Operadora Demo', rol: 'administrador' }, primerIngreso: false });
    expect((await pedir(env, '/admin/api/estado', { token, cookie })).status).toBe(200);
  });

  it('el primer ingreso valida el RUT y la clave, y no se puede repetir', async () => {
    const { env } = await entorno();
    const token = await acceso.token();
    const datos = { nombre: 'Operadora Demo', rut: RUT_ADMIN, clave: CLAVE };
    expect((await pedir(env, '/admin/api/sesion/primer-ingreso', { token, cuerpo: { ...datos, rut: '11.111.111-2' } })).status).toBe(422);
    expect((await pedir(env, '/admin/api/sesion/primer-ingreso', { token, cuerpo: { ...datos, clave: '1234' } })).status).toBe(422);
    expect((await pedir(env, '/admin/api/sesion/primer-ingreso', { token, cuerpo: datos })).status).toBe(200);
    expect((await pedir(env, '/admin/api/sesion/primer-ingreso', { token, cuerpo: { ...datos, rut: RUT_OTRA_ADMIN } })).status).toBe(409);
  });

  it('después entra con su RUT y su clave', async () => {
    const { env } = await entorno();
    const { token } = await conAdministradora(env);
    const r = await pedir(env, '/admin/api/sesion/entrar', { token, cuerpo: { rut: RUT_ADMIN, clave: CLAVE, recordar: false } });
    expect(r.status).toBe(200);
    expect((await pedir(env, '/admin/api/pedidos', { token, cookie: cookieDe(r) })).status).toBe(200);
  });

  it('el RUT y la clave de una administradora no sirven con el Access de otra persona', async () => {
    const { env } = await entorno();
    const primera = await conAdministradora(env);
    const otroToken = await acceso.token({ email: 'dueno@brunen.test' });
    expect((await pedir(env, '/admin/api/sesion/entrar', { token: otroToken, cuerpo: { rut: RUT_ADMIN, clave: CLAVE } })).status).toBe(401);
    // Ni su cookie: la sesión vale solo junto al correo de su dueña.
    expect((await pedir(env, '/admin/api/pedidos', { token: otroToken, cookie: primera.cookie })).status).toBe(401);
    expect(await (await pedir(env, '/admin/api/sesion', { token: otroToken, cookie: primera.cookie })).json()).toEqual({ correo: 'dueno@brunen.test', usuario: null, primerIngreso: true });
  });

  it('la sesión de un repartidor no abre la administración, ni con un Access válido', async () => {
    const { env } = await entorno();
    const cookie = cookieDe(await entrarComoRepartidor(env));
    expect((await pedir(env, '/admin/api/pedidos', { cookie })).status).toBe(401);
    expect((await pedir(env, '/admin/api/pedidos', { cookie, token: await acceso.token() })).status).toBe(401);
    expect((await pedir(env, '/admin/api/usuarios', { cookie, token: await acceso.token() })).status).toBe(401);
  });

  it('sin Access no se llega ni a probar la clave', async () => {
    const { env, db } = await entorno();
    await conAdministradora(env);
    expect((await pedir(env, '/admin/api/sesion/entrar', { cuerpo: { rut: RUT_ADMIN, clave: '9041' } })).status).toBe(401);
    expect(db.sql('SELECT intentos_fallidos FROM usuarios WHERE rol = ?', 'administrador')).toEqual([{ intentos_fallidos: 0 }]);
  });
});

describe('equipo: un administrador gestiona a los repartidores', () => {
  async function listo() {
    const base = await entorno();
    const admin = await conAdministradora(base.env);
    const como = (ruta: string, cuerpo?: unknown) => pedir(base.env, `/admin/api${ruta}`, { ...admin, cuerpo });
    return { ...base, admin, como };
  }

  it('la lista muestra a cada persona con su RUT, sus dispositivos y si es uno mismo; nunca la clave', async () => {
    const { como, env } = await listo();
    await entrarComoRepartidor(env);
    const texto = await (await como('/usuarios')).text();
    const { usuarios } = JSON.parse(texto) as { usuarios: Array<Record<string, unknown>> };
    expect(usuarios).toEqual([
      expect.objectContaining({ nombre: 'Operadora Demo', rol: 'administrador', rut: '11.111.111-1', soyYo: true, dispositivos: 1 }),
      expect.objectContaining({ nombre: 'Repartidor Demo', rol: 'repartidor', rut: '22.222.222-2', soyYo: false, dispositivos: 1, activo: true, bloqueadoHasta: 0 }),
    ]);
    expect(texto).not.toMatch(/clave|hash|sal"/);
  });

  it('crea un repartidor, que puede entrar de inmediato', async () => {
    const { como, env } = await listo();
    expect((await como('/usuarios', { nombre: 'Otro Repartidor', rut: RUT_OTRA_ADMIN, clave: '7410' })).status).toBe(200);
    expect((await pedir(env, '/api/sesion/entrar', { cuerpo: { rut: RUT_OTRA_ADMIN, clave: '7410' } })).status).toBe(200);
  });

  it.each([
    [{ rut: '1-9' }, 422],
    [{ clave: '0000' }, 422],
    [{ clave: '12' }, 422],
    [{ nombre: '' }, 422],
    [{ rut: RUT_REPARTIDOR }, 409],
  ])('al crear rechaza %j', async (cambios, estado) => {
    const { como } = await listo();
    expect((await como('/usuarios', { nombre: 'Otro', rut: RUT_OTRA_ADMIN, clave: '7410', ...cambios })).status).toBe(estado);
  });

  it('cambiarle la clave a un repartidor lo saca de sus dispositivos y le quita el bloqueo', async () => {
    const { como, env, repartidor } = await listo();
    const cookie = cookieDe(await entrarComoRepartidor(env));
    for (let i = 0; i < MAX_INTENTOS; i++) await entrarComoRepartidor(env, { clave: '9041' });
    expect((await como(`/usuarios/${repartidor.id}/clave`, { clave: '7410' })).status).toBe(200);
    expect(await (await pedir(env, '/api/sesion', { cookie })).json()).toEqual({ usuario: null });
    expect((await entrarComoRepartidor(env, { clave: '7410' })).status).toBe(200);
  });

  it('desactivar a un repartidor le corta el acceso, y reactivarlo se lo devuelve', async () => {
    const { como, env, repartidor } = await listo();
    const cookie = cookieDe(await entrarComoRepartidor(env));
    expect((await como(`/usuarios/${repartidor.id}/estado`, { activo: false })).status).toBe(200);
    expect(await (await pedir(env, '/api/sesion', { cookie })).json()).toEqual({ usuario: null });
    expect((await entrarComoRepartidor(env)).status).toBe(401);
    expect((await como(`/usuarios/${repartidor.id}/estado`, { activo: true })).status).toBe(200);
    expect((await entrarComoRepartidor(env)).status).toBe(200);
  });

  it('cerrar las sesiones de un repartidor lo obliga a entrar de nuevo', async () => {
    const { como, env, repartidor } = await listo();
    const cookie = cookieDe(await entrarComoRepartidor(env));
    expect(await (await como(`/usuarios/${repartidor.id}/sesiones/cerrar`, {})).json()).toEqual({ ok: true, cerradas: 1 });
    expect(await (await pedir(env, '/api/sesion', { cookie })).json()).toEqual({ usuario: null });
  });

  it('de su propia cuenta puede cambiar la clave (y vuelve a entrar) y cerrar sus otros dispositivos, pero no desactivarse', async () => {
    const { como, env, admin, db } = await listo();
    const [yo] = db.sql('SELECT id FROM usuarios WHERE rol = ?', 'administrador') as Array<{ id: number }>;
    const otro = cookieDe(await pedir(env, '/admin/api/sesion/entrar', { token: admin.token, cuerpo: { rut: RUT_ADMIN, clave: CLAVE, recordar: true } }));

    expect((await como(`/usuarios/${yo?.id}/estado`, { activo: false })).status).toBe(403);
    expect(await (await como(`/usuarios/${yo?.id}/sesiones/cerrar`, {})).json()).toEqual({ ok: true, cerradas: 1 });
    expect((await pedir(env, '/admin/api/pedidos', { token: admin.token, cookie: otro })).status).toBe(401);
    expect((await como('/pedidos')).status).toBe(200);

    const cambio = await como(`/usuarios/${yo?.id}/clave`, { clave: '7410' });
    expect(await cambio.json()).toEqual({ ok: true, salir: true });
    expect(cambio.headers.get('set-cookie')).toContain('Max-Age=0');
    expect((await como('/pedidos')).status).toBe(401);
  });

  it('no puede tocar la cuenta de otro administrador', async () => {
    const { como, env, db } = await listo();
    await conAdministradora(env, 'dueno@brunen.test', RUT_OTRA_ADMIN);
    const [otro] = db.sql('SELECT id FROM usuarios WHERE correo = ?', 'dueno@brunen.test') as Array<{ id: number }>;
    expect((await como(`/usuarios/${otro?.id}/clave`, { clave: '7410' })).status).toBe(403);
    expect((await como(`/usuarios/${otro?.id}/estado`, { activo: false })).status).toBe(403);
    expect((await como(`/usuarios/${otro?.id}/sesiones/cerrar`, {})).status).toBe(403);
  });

  it('un usuario que no existe o una acción inventada: 404', async () => {
    const { como } = await listo();
    expect((await como('/usuarios/999/clave', { clave: '7410' })).status).toBe(404);
    expect((await como('/usuarios/1/borrar', {})).status).toBe(404);
  });

  it('las escrituras exigen la marca del panel', async () => {
    const { env, admin, repartidor } = await listo();
    const r = await pedir(env, `/admin/api/usuarios/${repartidor.id}/estado`, { ...admin, cuerpo: { activo: false }, cabeceras: { 'x-panel': '' } });
    expect(r.status).toBe(400);
  });
});

describe('nombre del dispositivo', () => {
  it.each([
    ['Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0 Mobile Safari/537.36', 'Android · Chrome'],
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 Version/18.1 Mobile/15E148 Safari/604.1', 'iPhone · Safari'],
    ['Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/130.0 Safari/537.36 Edg/130.0', 'Windows · Edge'],
    ['', 'Dispositivo desconocido'],
    [null, 'Dispositivo desconocido'],
  ])('%s', (agente, esperado) => {
    expect(dispositivoDe(agente)).toBe(esperado);
  });
});
