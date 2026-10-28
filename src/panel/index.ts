/**
 * Worker del panel de administración (D32). Es un Worker aparte del bot, con su propia dirección (`wrangler.panel.toml`),
 * por dos motivos: Cloudflare Access protege la dirección completa, y el webhook de Meta del bot tiene que seguir
 * siendo público; y el panel no necesita ningún secreto de WhatsApp, Google ni Groq (menos que robar si algo falla).
 * Comparte con el bot la base D1.
 *
 * Todo lo que no sea /salud pasa primero por `autenticar`: sin sesión válida de Access, no se sirve ni una página.
 */

import type { BaseDatos } from '../almacen';
import { RepositorioD1 } from '../repositorio';
import { autenticar, type EntornoAcceso } from './acceso';
import { manejarApi } from './api';

export interface EntornoPanel extends EntornoAcceso {
  DB?: BaseDatos;
  /** Archivos de la pantalla (carpeta `panel/`). */
  ASSETS: { fetch(request: Request): Promise<Response> };
}

/**
 * Cabeceras de seguridad de toda respuesta del panel. La política de contenido solo deja correr los scripts y estilos
 * del propio panel (nada en línea ni de terceros) y no permite que otra página lo muestre dentro de un marco. Van aquí
 * y no en un archivo `_headers` para que valgan igual en producción y en local, y para poder probarlas.
 */
const CABECERAS_DE_SEGURIDAD: Readonly<Record<string, string>> = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cache-control': 'no-store',
};

function conCabeceras(respuesta: Response): Response {
  const protegida = new Response(respuesta.body, respuesta); // copia con cabeceras que se pueden cambiar
  for (const [nombre, valor] of Object.entries(CABECERAS_DE_SEGURIDAD)) protegida.headers.set(nombre, valor);
  return protegida;
}

function texto(estado: number, mensaje: string): Response {
  return new Response(mensaje, { status: estado, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

async function atender(request: Request, env: EntornoPanel): Promise<Response> {
  const url = new URL(request.url);
  if (url.pathname === '/salud') return texto(200, 'ok');

  const acceso = await autenticar(request, env);
  if (!acceso.ok) return texto(acceso.estado, acceso.motivo);

  if (url.pathname.startsWith('/api/')) {
    if (!env.DB) return texto(503, 'El panel no tiene base de datos conectada.');
    return manejarApi(request, url, { repositorio: new RepositorioD1(env.DB), correo: acceso.correo, ahoraSegundos: Math.floor(Date.now() / 1000) });
  }
  if (request.method !== 'GET' && request.method !== 'HEAD') return texto(405, 'Método no permitido.');
  return env.ASSETS.fetch(request);
}

export default {
  async fetch(request: Request, env: EntornoPanel): Promise<Response> {
    return conCabeceras(await atender(request, env));
  },
};
