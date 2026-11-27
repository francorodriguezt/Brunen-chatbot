import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import panel, { type EntornoPanel } from '../src/panel/index';
import { datosDeConexion, pintarConexion, POLITICA_CONECTAR } from '../src/conectar';

const PLANTILLA = readFileSync(fileURLToPath(new URL('../panel/conectar.html', import.meta.url)), 'utf8');
const SCRIPT = readFileSync(fileURLToPath(new URL('../panel/conectar.js', import.meta.url)), 'utf8');
const ACTIVO = { CONECTAR_ACTIVO: 'SI', META_APP_ID: '1234567890', META_CONFIG_ID: '9876543210', GRAPH_API_VERSION: 'v27.0' };

function entorno(cambios: Partial<EntornoPanel> = {}): EntornoPanel {
  return {
    ASSETS: {
      fetch: async (solicitud) => {
        const ruta = new URL(solicitud.url).pathname;
        if (ruta === '/conectar') return new Response(PLANTILLA);
        if (ruta === '/conectar.js') return new Response(SCRIPT, { headers: { 'content-type': 'text/javascript' } });
        return new Response('otro');
      },
    },
    ...ACTIVO,
    ...cambios,
  };
}
const pedir = (env: EntornoPanel, ruta = '/conectar', metodo = 'GET') => panel.fetch(new Request(`https://publico.example${ruta}`, { method: metodo }), env);

describe('datos de la conexión', () => {
  it('solo existe activada y con identificadores válidos', () => {
    expect(datosDeConexion(ACTIVO)).toEqual({ appId: '1234567890', configId: '9876543210', version: 'v27.0' });
    expect(datosDeConexion({ ...ACTIVO, GRAPH_API_VERSION: '' })?.version).toBe('v27.0');
    expect(datosDeConexion({ ...ACTIVO, CONECTAR_ACTIVO: '' })).toBeNull();
    expect(datosDeConexion({ ...ACTIVO, CONECTAR_ACTIVO: 'NO' })).toBeNull();
    expect(datosDeConexion({ ...ACTIVO, META_APP_ID: '' })).toBeNull();
    expect(datosDeConexion({ ...ACTIVO, META_CONFIG_ID: '12"><script>' })).toBeNull();
    expect(datosDeConexion({ ...ACTIVO, GRAPH_API_VERSION: 'latest' })).toBeNull();
  });

  it('llena los huecos de la plantilla', () => {
    const html = pintarConexion(PLANTILLA, { appId: '111', configId: '222', version: 'v27.0' });
    expect(html).toContain('data-app-id="111"');
    expect(html).toContain('data-config-id="222"');
    expect(html).toContain('data-version="v27.0"');
    expect(html).not.toContain('{{');
  });
});

describe('la página /conectar', () => {
  it('con la conexión activada muestra la página y su política de contenido propia', async () => {
    const r = await pedir(entorno());
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('data-app-id="1234567890"');
    expect(r.headers.get('content-security-policy')).toBe(POLITICA_CONECTAR);
    expect(r.headers.get('cache-control')).toBe('no-store');
  });

  it('su política deja solo lo de Facebook y ningún script en línea', () => {
    expect(POLITICA_CONECTAR).toContain("script-src 'self' https://connect.facebook.net");
    expect(POLITICA_CONECTAR).not.toContain('unsafe-inline');
    expect(POLITICA_CONECTAR).not.toContain('unsafe-eval');
    expect(POLITICA_CONECTAR).toContain("frame-ancestors 'none'");
  });

  it('apagada o incompleta da 404, también su script; y no se escribe nada', async () => {
    for (const cambios of [{ CONECTAR_ACTIVO: '' }, { META_CONFIG_ID: '' }, { META_APP_ID: undefined }]) {
      expect((await pedir(entorno(cambios))).status).toBe(404);
      expect((await pedir(entorno(cambios), '/conectar.js')).status).toBe(404);
    }
    expect((await pedir(entorno(), '/conectar', 'POST')).status).toBe(405);
  });

  it('sirve su script cuando está activa', async () => {
    const r = await pedir(entorno(), '/conectar.js');
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('WA_EMBEDDED_SIGNUP');
  });

  it('el resto del panel no recibe la política de Facebook', async () => {
    const r = await pedir(entorno(), '/privacidad');
    expect(r.headers.get('content-security-policy')).not.toContain('facebook');
  });
});

describe('el script de la página', () => {
  it('solo acepta mensajes de Facebook con el dominio exacto', () => {
    expect(SCRIPT).toContain("'https://www.facebook.com'");
    expect(SCRIPT).not.toContain('endsWith');
  });

  it('no manda el código a ningún servidor ni lo escribe en la consola', () => {
    expect(SCRIPT).not.toMatch(/\bfetch\(|XMLHttpRequest|sendBeacon|console\./);
  });

  it('la plantilla no trae scripts ni estilos en línea', () => {
    expect(PLANTILLA).not.toMatch(/<script(?![^>]*\bsrc=)|style=|<style|onclick=/i);
  });
});
