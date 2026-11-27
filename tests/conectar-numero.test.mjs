import { describe, expect, it } from 'vitest';
import { conectarNumero, ErrorDeConexion, taparSecretos, validarEntradas } from '../scripts/conectar/nucleo.mjs';

const ENTRADAS = { version: 'v27.0', appId: '1234567890', appSecret: 'secreto-de-la-app-123', code: 'CODIGO-DE-UN-SOLO-USO', waba: '555000111', telefono: '777000222' };
const TOKEN = 'EAAtokendelclientedeprueba0123456789';

/** Meta falsa: guarda las llamadas y responde según la ruta; `fallar` hace que una ruta devuelva un error de Meta. */
function metaFalsa({ fallar = {}, numero = { is_on_biz_app: true, platform_type: 'CLOUD_API', id: '777000222' } } = {}) {
  const llamadas = [];
  const fetchFalso = async (url, opciones = {}) => {
    const u = new URL(url);
    const metodo = opciones.method ?? 'GET';
    llamadas.push({ metodo, ruta: u.pathname, consulta: u.search, cabeceras: opciones.headers ?? {}, cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
    const clave = u.pathname.split('/').slice(2).join('/').replace(/\d{5,}/, '#');
    if (fallar[clave]) return new Response(JSON.stringify({ error: fallar[clave] }), { status: 400 });
    if (u.pathname.endsWith('/oauth/access_token')) return Response.json({ access_token: TOKEN, token_type: 'bearer' });
    if (u.pathname.endsWith('/subscribed_apps')) return Response.json({ success: true });
    if (u.pathname.endsWith('/smb_app_data')) return Response.json({ messaging_product: 'whatsapp', request_id: `req-${JSON.parse(opciones.body).sync_type}` });
    return Response.json(numero);
  };
  return { fetchFalso, llamadas };
}

describe('conectar el número', () => {
  it('hace los pasos en el orden de Meta, sin registrar el número', async () => {
    const { fetchFalso, llamadas } = metaFalsa();
    const avances = [];
    const r = await conectarNumero(ENTRADAS, { fetch: fetchFalso, avisar: (t) => avances.push(t) });
    expect(llamadas.map((l) => `${l.metodo} ${l.ruta.replace(/\d{5,}/, '#')}`)).toEqual([
      'GET /v27.0/oauth/access_token',
      'POST /v27.0/#/subscribed_apps',
      'GET /v27.0/#',
      'POST /v27.0/#/smb_app_data',
      'POST /v27.0/#/smb_app_data',
    ]);
    expect(llamadas.some((l) => l.ruta.endsWith('/register'))).toBe(false);
    expect(llamadas[3].cuerpo).toEqual({ messaging_product: 'whatsapp', sync_type: 'smb_app_state_sync' });
    expect(llamadas[4].cuerpo).toEqual({ messaging_product: 'whatsapp', sync_type: 'history' });
    expect(r.token).toBe(TOKEN);
    expect(r.sincronizaciones).toEqual({ smb_app_state_sync: 'req-smb_app_state_sync', history: 'req-history' });
    expect(r.enLaApp).toBe(true);
    expect(avances).toHaveLength(5);
  });

  it('el canje lleva el código y el secreto; los demás pasos, solo el token en la cabecera', async () => {
    const { fetchFalso, llamadas } = metaFalsa();
    await conectarNumero(ENTRADAS, { fetch: fetchFalso });
    const canje = new URLSearchParams(llamadas[0].consulta);
    expect([canje.get('client_id'), canje.get('client_secret'), canje.get('code')]).toEqual(['1234567890', 'secreto-de-la-app-123', 'CODIGO-DE-UN-SOLO-USO']);
    for (const l of llamadas.slice(1)) {
      expect(l.cabeceras.authorization).toBe(`Bearer ${TOKEN}`);
      expect(l.consulta).not.toContain('secreto');
    }
  });

  it('un error de Meta se informa sin dejar pasar el secreto, el código ni el token', async () => {
    const { fetchFalso } = metaFalsa({ fallar: { 'oauth/access_token': { message: 'Código CODIGO-DE-UN-SOLO-USO vencido con secreto-de-la-app-123', code: 100 } } });
    const falla = await conectarNumero(ENTRADAS, { fetch: fetchFalso }).catch((e) => e);
    expect(falla).toBeInstanceOf(ErrorDeConexion);
    expect(falla.message).toContain('código 100');
    expect(falla.message).not.toContain('CODIGO-DE-UN-SOLO-USO');
    expect(falla.message).not.toContain('secreto-de-la-app-123');
  });

  it('si falla la suscripción no pide ninguna sincronización', async () => {
    const { fetchFalso, llamadas } = metaFalsa({ fallar: { '#/subscribed_apps': { message: 'sin permiso', code: 200 } } });
    await expect(conectarNumero(ENTRADAS, { fetch: fetchFalso })).rejects.toThrow(/Suscripción de la app/);
    expect(llamadas.some((l) => l.ruta.endsWith('/smb_app_data'))).toBe(false);
  });

  it('si el número no figura en la app WhatsApp Business, para antes de sincronizar', async () => {
    const { fetchFalso, llamadas } = metaFalsa({ numero: { is_on_biz_app: false, platform_type: 'CLOUD_API' } });
    await expect(conectarNumero(ENTRADAS, { fetch: fetchFalso })).rejects.toThrow(/is_on_biz_app = false/);
    expect(llamadas.some((l) => l.ruta.endsWith('/smb_app_data'))).toBe(false);
  });

  it('avisa si Meta no informa el estado del número, y sigue', async () => {
    const { fetchFalso } = metaFalsa({ numero: { platform_type: 'NOT_APPLICABLE' } });
    const r = await conectarNumero(ENTRADAS, { fetch: fetchFalso });
    expect(r.advertencias).toHaveLength(2);
  });

  it('una caída de la red no filtra secretos', async () => {
    const caida = async (url) => {
      throw new Error(`fallo conectando a ${url}`);
    };
    const falla = await conectarNumero(ENTRADAS, { fetch: caida }).catch((e) => e);
    expect(falla.message).not.toContain('secreto-de-la-app-123');
    expect(falla.message).not.toContain('CODIGO-DE-UN-SOLO-USO');
  });
});

describe('entradas', () => {
  it('rechaza lo que falta o está mal escrito antes de llamar a Meta', () => {
    expect(() => validarEntradas(ENTRADAS)).not.toThrow();
    expect(() => validarEntradas({ ...ENTRADAS, appSecret: '' })).toThrow(/secreto/);
    expect(() => validarEntradas({ ...ENTRADAS, code: undefined })).toThrow(/código/);
    expect(() => validarEntradas({ ...ENTRADAS, waba: '../x' })).toThrow(/cuenta/);
    expect(() => validarEntradas({ ...ENTRADAS, telefono: '1' })).toThrow(/número/);
    expect(() => validarEntradas({ ...ENTRADAS, version: 'latest' })).toThrow(/Versión/);
    expect(() => validarEntradas({ ...ENTRADAS, appId: 'abc' })).toThrow(/app/);
  });

  it('tapa los secretos en un texto', () => {
    expect(taparSecretos('a SECRETO-LARGO b', ['SECRETO-LARGO', 'ab'])).toBe('a *** b');
  });
});
