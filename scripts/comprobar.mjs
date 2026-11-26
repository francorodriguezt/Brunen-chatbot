/**
 * Comprobación después de publicar (D85): revisa en las direcciones reales que el bot, la app pública y la
 * administración respondan como deben. No cambia nada: son lecturas y solicitudes que el servidor tiene que rechazar
 * (una firma falsa, un token falso, una ruta sin sesión). No usa claves ni secretos.
 *
 * Uso: npm run comprobar
 *      npm run comprobar -- --bot https://... --panel https://... --admin https://...
 * Sale con código 1 si algo falla, para usarlo también en un script.
 */

import { pathToFileURL } from 'node:url';
import { argumento } from './vars.mjs';

/** Las direcciones publicadas (D81). */
export const DIRECCIONES = {
  bot: 'https://brunen-chatbot.brunen-chatbot.workers.dev',
  panel: 'https://brunen-panel.brunen-chatbot.workers.dev',
  admin: 'https://brunen-admin.brunen-chatbot.workers.dev',
};

const ESPERA_MS = 15_000;
const estado = (esperado) => (r) => r.status === esperado || `respondió ${r.status}; se esperaba ${esperado}`;
const destino = (r) => r.headers.get('location') ?? '';

/** Lo que se revisa, en orden. `revisar` devuelve true o el motivo de la falla. */
export function comprobaciones(d) {
  return [
    {
      que: 'Bot: /salud responde "ok" (la base responde)',
      url: `${d.bot}/salud`,
      revisar: async (r) => (r.status === 200 && (await r.text()).trim() === 'ok') || `respondió ${r.status}`,
    },
    {
      que: 'Bot: un webhook con firma falsa se rechaza (401)',
      url: `${d.bot}/webhook`,
      init: { method: 'POST', headers: { 'x-hub-signature-256': 'sha256=00', 'content-type': 'application/json' }, body: '{}' },
      revisar: estado(401),
    },
    {
      que: 'Bot: la verificación con un token falso se rechaza (403)',
      url: `${d.bot}/webhook?hub.mode=subscribe&hub.verify_token=token-falso&hub.challenge=1`,
      revisar: estado(403),
    },
    { que: 'Pública: la portada abre (200)', url: `${d.panel}/`, revisar: estado(200) },
    {
      que: 'Pública: la app del repartidor trae la cola nueva (D84)',
      url: `${d.panel}/repartidor/cola.js`,
      revisar: async (r) =>
        r.status !== 200 ? `respondió ${r.status}` : (await r.text()).includes('enviarPendientes') || 'no es la versión con la cola nueva',
    },
    {
      que: 'Pública: /admin manda a la administración (302)',
      url: `${d.panel}/admin`,
      revisar: (r) => (r.status === 302 && destino(r).startsWith(d.admin)) || `respondió ${r.status}${destino(r) ? ' hacia otra dirección' : ''}`,
    },
    { que: 'Pública: no entrega datos de la administración (404)', url: `${d.panel}/admin/api/pedidos`, revisar: estado(404) },
    { que: 'Pública: la ruta del repartidor pide su sesión (401)', url: `${d.panel}/api/repartidor/ruta`, revisar: estado(401) },
    {
      que: 'Administración: sin sesión manda al ingreso de Cloudflare Access',
      url: `${d.admin}/admin/`,
      // Solo se mira el dominio: la dirección completa trae datos de la sesión de Access que no hace falta mostrar.
      revisar: (r) => (r.status === 302 && /^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com\//.test(destino(r))) || `respondió ${r.status}`,
    },
  ];
}

/** Hace cada comprobación y devuelve `[{ que, ok, detalle }]`. `pedir` es `fetch` (las pruebas pasan uno falso). */
export async function comprobar({ direcciones = DIRECCIONES, pedir = fetch } = {}) {
  const resultados = [];
  for (const c of comprobaciones(direcciones)) {
    let resultado;
    try {
      const respuesta = await pedir(c.url, { redirect: 'manual', ...c.init, signal: AbortSignal.timeout(ESPERA_MS) });
      resultado = await c.revisar(respuesta);
    } catch (falla) {
      resultado = `sin respuesta (${falla instanceof Error ? falla.message : String(falla)})`;
    }
    resultados.push({ que: c.que, ok: resultado === true, detalle: resultado === true ? '' : String(resultado) });
  }
  return resultados;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const direcciones = {
    bot: argumento('bot', DIRECCIONES.bot),
    panel: argumento('panel', DIRECCIONES.panel),
    admin: argumento('admin', DIRECCIONES.admin),
  };
  const resultados = await comprobar({ direcciones });
  for (const r of resultados) console.log(`${r.ok ? 'OK   ' : 'FALLA'} ${r.que}${r.detalle ? ` — ${r.detalle}` : ''}`);
  const fallas = resultados.filter((r) => !r.ok).length;
  console.log(fallas === 0 ? `\nTodo bien (${resultados.length} comprobaciones).` : `\n${fallas} de ${resultados.length} fallaron.`);
  process.exitCode = fallas === 0 ? 0 : 1;
}
