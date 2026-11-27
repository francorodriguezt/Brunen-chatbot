import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import panel, { type EntornoPanel } from '../src/panel/index';
import { datosDePrivacidad, fechaLegible, pintarPrivacidad } from '../src/privacidad';

const PLANTILLA = readFileSync(fileURLToPath(new URL('../panel/privacidad.html', import.meta.url)), 'utf8');
const COMPLETO = {
  PRIVACIDAD_PUBLICADA: 'SI',
  PRIVACIDAD_RUT: '76.123.456-7',
  PRIVACIDAD_CORREO: 'contacto@ejemplo.test',
  PRIVACIDAD_FECHA: '2026-11-27',
};

function entorno(cambios: Partial<EntornoPanel> = {}, redirige = false): EntornoPanel {
  return {
    ASSETS: {
      fetch: async (solicitud) => {
        const ruta = new URL(solicitud.url).pathname;
        if (redirige && ruta === '/privacidad') return new Response(null, { status: 307, headers: { location: '/privacidad.html' } });
        if (ruta === '/privacidad' || ruta === '/privacidad.html') return new Response(PLANTILLA, { status: 200 });
        return new Response('<html>archivo</html>', { status: 200 });
      },
    },
    ...COMPLETO,
    ...cambios,
  };
}
const pedir = (env: EntornoPanel, ruta = '/privacidad', metodo = 'GET') => panel.fetch(new Request(`https://publico.example${ruta}`, { method: metodo }), env);

describe('datos del aviso de privacidad', () => {
  it('escribe la fecha para leerla y rechaza las que no existen', () => {
    expect(fechaLegible('2026-11-27')).toBe('27 de noviembre de 2026');
    expect(fechaLegible('2026-02-30')).toBeNull();
    expect(fechaLegible('27-11-2026')).toBeNull();
    expect(fechaLegible('')).toBeNull();
  });

  it('solo se publica con todo completo y bien escrito', () => {
    expect(datosDePrivacidad(COMPLETO)).toEqual({ rut: '76.123.456-7', correo: 'contacto@ejemplo.test', fecha: '27 de noviembre de 2026' });
    expect(datosDePrivacidad({ ...COMPLETO, PRIVACIDAD_PUBLICADA: 'NO' })).toBeNull();
    expect(datosDePrivacidad({ ...COMPLETO, PRIVACIDAD_PUBLICADA: undefined })).toBeNull();
    expect(datosDePrivacidad({ ...COMPLETO, PRIVACIDAD_RUT: '' })).toBeNull();
    expect(datosDePrivacidad({ ...COMPLETO, PRIVACIDAD_RUT: 'pendiente' })).toBeNull();
    expect(datosDePrivacidad({ ...COMPLETO, PRIVACIDAD_CORREO: 'sin-arroba' })).toBeNull();
    expect(datosDePrivacidad({ ...COMPLETO, PRIVACIDAD_FECHA: '2026-13-01' })).toBeNull();
  });

  it('escapa lo que se inserta en la página', () => {
    const html = pintarPrivacidad('<a href="mailto:{{CORREO}}">{{RUT}}</a> {{FECHA}}', { rut: '<b>1</b>', correo: 'a"b@c.cl', fecha: 'hoy & mañana' });
    expect(html).toBe('<a href="mailto:a&quot;b@c.cl">&lt;b&gt;1&lt;/b&gt;</a> hoy &amp; mañana');
  });
});

describe('la página /privacidad', () => {
  it('muestra el aviso con los datos de Brunen, con la política de contenido estricta', async () => {
    const r = await pedir(entorno());
    const html = await r.text();
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    expect(r.headers.get('content-security-policy')).toContain("script-src 'self'");
    expect(html).toContain('76.123.456-7');
    expect(html).toContain('contacto@ejemplo.test');
    expect(html).toContain('27 de noviembre de 2026');
    expect(html).not.toContain('{{');
  });

  it('sigue una redirección del servidor de archivos', async () => {
    const r = await pedir(entorno({}, true));
    expect(r.status).toBe(200);
    expect(await r.text()).toContain('76.123.456-7');
  });

  it('no existe mientras esté apagada o incompleta, y el archivo con huecos nunca se sirve suelto', async () => {
    expect((await pedir(entorno({ PRIVACIDAD_PUBLICADA: '' }))).status).toBe(404);
    expect((await pedir(entorno({ PRIVACIDAD_CORREO: '' }))).status).toBe(404);
    expect((await pedir(entorno(), '/privacidad.html')).status).toBe(404);
  });

  it('solo se lee', async () => {
    expect((await pedir(entorno(), '/privacidad', 'POST')).status).toBe(405);
  });

  it('la plantilla no trae scripts ni estilos en línea, no nombra a la operadora y menciona a todos los encargados', () => {
    expect(PLANTILLA).not.toMatch(/<script|style=|<style|onclick=/i);
    for (const nombre of ['Meta', 'Cloudflare', 'Google', 'Groq', 'Telegram']) expect(PLANTILLA).toContain(nombre);
    expect(PLANTILLA).toContain('borrar mis datos');
  });
});
