import { describe, expect, it } from 'vitest';
import { DIRECCIONES, comprobaciones, comprobar } from '../scripts/comprobar.mjs';

const ACCESS = 'https://equipo-falso.cloudflareaccess.com/cdn-cgi/access/login/x';

/** Un servidor de mentira que responde como el real; `cambios` reemplaza la respuesta de una dirección. */
function servidor(cambios = {}) {
  const d = DIRECCIONES;
  const normal = {
    [`${d.bot}/salud`]: () => new Response('ok'),
    [`${d.bot}/webhook`]: () => new Response('Invalid signature', { status: 401 }),
    [`${d.bot}/webhook?hub.mode=subscribe&hub.verify_token=token-falso&hub.challenge=1`]: () => new Response('Forbidden', { status: 403 }),
    [`${d.panel}/`]: () => new Response('<html></html>'),
    [`${d.panel}/repartidor/cola.js`]: () => new Response('export async function enviarPendientes() {}'),
    [`${d.panel}/admin`]: () => new Response(null, { status: 302, headers: { location: `${d.admin}/admin/` } }),
    [`${d.panel}/admin/api/pedidos`]: () => new Response('No encontrado', { status: 404 }),
    [`${d.panel}/api/repartidor/ruta`]: () => new Response('{}', { status: 401 }),
    [`${d.admin}/admin/`]: () => new Response(null, { status: 302, headers: { location: ACCESS } }),
  };
  const llamadas = [];
  const pedir = async (url, init) => {
    llamadas.push({ url, metodo: init?.method ?? 'GET', redirect: init?.redirect });
    const responder = cambios[url] ?? normal[url];
    if (!responder) throw new Error(`dirección inesperada: ${url}`);
    return responder();
  };
  return { pedir, llamadas };
}

describe('npm run comprobar (D85)', () => {
  it('con todo publicado como corresponde, todo sale bien', async () => {
    const resultados = await comprobar(servidor());
    expect(resultados).toHaveLength(comprobaciones(DIRECCIONES).length);
    expect(resultados.filter((r) => !r.ok)).toEqual([]);
  });

  it('no cambia nada: solo lee, salvo el webhook con firma falsa, y nunca sigue redirecciones', async () => {
    const s = servidor();
    await comprobar(s);
    expect(s.llamadas.filter((l) => l.metodo !== 'GET').map((l) => l.url)).toEqual([`${DIRECCIONES.bot}/webhook`]);
    expect(s.llamadas.every((l) => l.redirect === 'manual')).toBe(true);
  });

  it('avisa qué falló: la base caída, una administración expuesta, una versión vieja o un servidor sin respuesta', async () => {
    const d = DIRECCIONES;
    const resultados = await comprobar(
      servidor({
        [`${d.bot}/salud`]: () => new Response('error', { status: 503 }),
        [`${d.panel}/admin/api/pedidos`]: () => new Response('[]', { status: 200 }),
        [`${d.panel}/repartidor/cola.js`]: () => new Response('No encontrado', { status: 404 }),
        [`${d.admin}/admin/`]: () => {
          throw new TypeError('fetch failed');
        },
      }),
    );
    expect(resultados.filter((r) => !r.ok).map((r) => [r.que, r.detalle])).toEqual([
      ['Bot: /salud responde "ok" (la base responde)', 'respondió 503'],
      ['Pública: la app del repartidor trae la cola nueva (D84)', 'respondió 404'],
      ['Pública: no entrega datos de la administración (404)', 'respondió 200; se esperaba 404'],
      ['Administración: sin sesión manda al ingreso de Cloudflare Access', 'sin respuesta (fetch failed)'],
    ]);
  });

  it('una administración que no manda a Access, o un /admin que manda a otro lado, fallan', async () => {
    const d = DIRECCIONES;
    const resultados = await comprobar(
      servidor({
        [`${d.admin}/admin/`]: () => new Response('<html>panel</html>', { status: 200 }),
        [`${d.panel}/admin`]: () => new Response(null, { status: 302, headers: { location: 'https://otro.example/admin/' } }),
      }),
    );
    expect(resultados.filter((r) => !r.ok).map((r) => r.detalle)).toEqual(['respondió 302 hacia otra dirección', 'respondió 200']);
  });
});
