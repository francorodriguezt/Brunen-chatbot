/**
 * Worker de la aplicación de Brunen (D32, D49, D51). Es un Worker aparte del bot, con su propia dirección
 * (`wrangler.panel.toml`): el webhook de Meta del bot tiene que seguir siendo público, y la aplicación no necesita
 * ningún secreto de WhatsApp, Google ni Groq (menos que robar si algo falla). Comparte con el bot la base D1.
 *
 * Tres zonas:
 *  - Pública: la portada con las dos entradas, la pantalla del repartidor y los archivos para instalar la aplicación.
 *    Son archivos sin datos. Los datos del repartidor se piden por `/api/…` y exigen su sesión (RUT y clave).
 *  - Administración (`/admin/…`): nada se sirve, ni la pantalla, sin una sesión válida de Cloudflare Access. Los datos
 *    (`/admin/api/…`) exigen además la sesión de un administrador con su RUT y su clave.
 *  - `/salud`, para el monitoreo.
 *
 * Lo público se sirve desde una lista cerrada de rutas: cualquier otra dirección responde 404, para que ningún
 * archivo de administración se pueda pedir escribiendo su ruta de otra forma.
 */

import type { BaseDatos } from '../almacen';
import { RepositorioD1 } from '../repositorio';
import { autenticar, esLocal, type EntornoAcceso } from './acceso';
import { error, manejarApi } from './api';
import { RepositorioClientes } from '../fichas';
import { RepositorioFijos } from '../fijos';
import { manejarClientes } from './clientes-api';
import { RepositorioEntregas } from '../entregas';
import { manejarRepartidor } from './repartidor-api';
import { Cuentas } from './cuentas';
import { cookieDeSesion, esDelAdministrador, manejarSesionAdmin, manejarSesionPublica, manejarUsuarios, tokenDeCookie, type ContextoDeIngreso } from './ingreso';

export interface EntornoPanel extends EntornoAcceso {
  DB?: BaseDatos;
  /** Archivos de la pantalla (carpeta `panel/`). */
  ASSETS: { fetch(request: Request): Promise<Response> };
  /** Secreto con el que se calculan las huellas de las claves. Se carga con `wrangler secret put`, nunca en el repositorio. */
  PANEL_SECRETO?: string;
  /**
   * Solo en la dirección pública, cuando la administración vive en otra dirección entera detrás de Access (D56,
   * opción 1): por ejemplo `https://brunen-admin.<subdominio>.workers.dev`. Vacío = la administración está aquí en `/admin`.
   */
  PANEL_ADMIN_URL?: string;
}

/** La otra dirección de la administración, si está bien escrita (https y sin ruta); si no, null. */
function administracionAparte(env: EntornoPanel): string | null {
  const valor = env.PANEL_ADMIN_URL?.trim() ?? '';
  return /^https:\/\/[a-z0-9.-]+$/i.test(valor) ? valor : null;
}

/**
 * Cabeceras de seguridad de toda respuesta. La política de contenido solo deja correr los scripts y estilos propios
 * (nada en línea ni de terceros) y no permite que otra página muestre la aplicación dentro de un marco. Van aquí y no
 * en un archivo `_headers` para que valgan igual en producción y en local, y para poder probarlas.
 */
const CABECERAS_DE_SEGURIDAD: Readonly<Record<string, string>> = {
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'same-origin',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cache-control': 'no-store',
};

const ESTATICOS_PUBLICOS: ReadonlySet<string> = new Set([
  '/',
  '/portada.js',
  '/ingreso.js',
  '/estilos.css',
  '/manifest.webmanifest',
  '/sw.js',
  '/repartidor',
  '/repartidor/',
  '/repartidor/app.js',
]);
const ES_ICONO = /^\/iconos\/[a-z0-9-]+\.png$/;

function conCabeceras(respuesta: Response): Response {
  const protegida = new Response(respuesta.body, respuesta); // copia con cabeceras que se pueden cambiar
  for (const [nombre, valor] of Object.entries(CABECERAS_DE_SEGURIDAD)) protegida.headers.set(nombre, valor);
  return protegida;
}

function texto(estado: number, mensaje: string): Response {
  return new Response(mensaje, { status: estado, headers: { 'content-type': 'text/plain; charset=utf-8' } });
}

const esLectura = (request: Request): boolean => request.method === 'GET' || request.method === 'HEAD';

/** Lo que necesita cualquier ruta de datos. Sin base o sin secreto no se atiende: falla cerrado. */
function contexto(request: Request, env: EntornoPanel, ahoraSegundos: number): ContextoDeIngreso | Response {
  if (!env.DB) return texto(503, 'El panel no tiene base de datos conectada.');
  if (!Cuentas.secretoValido(env.PANEL_SECRETO)) return texto(503, 'El panel todavía no está configurado.');
  return {
    cuentas: new Cuentas(env.DB, env.PANEL_SECRETO),
    repositorio: new RepositorioD1(env.DB),
    ahoraSegundos,
    cookieSegura: !esLocal(new URL(request.url).hostname),
  };
}

async function apiPublica(request: Request, url: URL, env: EntornoPanel, ahoraSegundos: number): Promise<Response> {
  const ctx = contexto(request, env, ahoraSegundos);
  if (ctx instanceof Response) return ctx;
  try {
    const deSesion = await manejarSesionPublica(request, url, ctx);
    if (deSesion) return deSesion;
    // El repartidor (fase D, D61): solo con la sesión de un repartidor; un administrador usa su propia puerta.
    if (url.pathname.startsWith('/api/repartidor/')) {
      const token = tokenDeCookie(request);
      const sesion = await ctx.cuentas.sesionDe(token, ahoraSegundos);
      if (sesion?.usuario.rol !== 'repartidor') return error(401, 'Entra con tu RUT y tu clave.');
      const respuesta = await manejarRepartidor(request, url, {
        repositorio: ctx.repositorio,
        entregas: new RepositorioEntregas(env.DB as BaseDatos),
        ahoraSegundos,
        nombre: sesion.usuario.nombre,
      });
      if (respuesta && sesion.renovada && token) respuesta.headers.append('set-cookie', cookieDeSesion(token, true, ctx.cookieSegura));
      return respuesta ?? error(404, 'No encontrado.');
    }
    return error(404, 'No encontrado.');
  } catch (falla) {
    console.error('Error en el ingreso o en la ruta del repartidor:', falla instanceof Error ? falla.message : falla);
    return error(500, 'No se pudo completar. Intenta de nuevo.');
  }
}

async function apiDeAdministracion(request: Request, url: URL, env: EntornoPanel, correo: string, ahoraSegundos: number): Promise<Response> {
  const ctx = contexto(request, env, ahoraSegundos);
  if (ctx instanceof Response) return ctx;
  // Por dentro las rutas no llevan el prefijo: `/admin/api/pedidos` se atiende como `/api/pedidos`.
  const interna = new URL(url);
  interna.pathname = url.pathname.slice('/admin'.length);

  try {
    const deSesion = await manejarSesionAdmin(request, interna, { ...ctx, correo });
    if (deSesion) return deSesion;

    const token = tokenDeCookie(request);
    const sesion = await ctx.cuentas.sesionDe(token, ahoraSegundos);
    if (!esDelAdministrador(sesion?.usuario, correo)) return error(401, 'Entra con tu RUT y tu clave.');

    const clientes = new RepositorioClientes(env.DB as BaseDatos);
    const respuesta =
      (await manejarUsuarios(request, interna, { ...ctx, yo: sesion.usuario })) ??
      (await manejarClientes(request, interna, { clientes, repositorio: ctx.repositorio, fijos: new RepositorioFijos(env.DB as BaseDatos), ahoraSegundos })) ??
      (await manejarApi(request, interna, { repositorio: ctx.repositorio, correo, ahoraSegundos, clientes, entregas: new RepositorioEntregas(env.DB as BaseDatos) }));
    if (sesion?.renovada && token) respuesta.headers.append('set-cookie', cookieDeSesion(token, true, ctx.cookieSegura));
    return respuesta;
  } catch (falla) {
    console.error('Error en la administración:', falla instanceof Error ? falla.message : falla);
    return error(500, 'No se pudo completar. Intenta de nuevo.');
  }
}

async function atender(request: Request, env: EntornoPanel): Promise<Response> {
  const url = new URL(request.url);
  const ruta = url.pathname;
  if (ruta === '/salud') return texto(200, 'ok');
  const ahoraSegundos = Math.floor(Date.now() / 1000);

  if (ruta === '/admin' || ruta.startsWith('/admin/')) {
    // Dirección pública con la administración aparte (D56, opción 1): aquí nunca se sirve nada de administración.
    const aparte = administracionAparte(env);
    if (aparte) {
      if ((ruta === '/admin' || ruta === '/admin/') && esLectura(request)) return Response.redirect(`${aparte}/admin/`, 302);
      return texto(404, 'No existe.');
    }
    const acceso = await autenticar(request, env, ahoraSegundos);
    if (!acceso.ok) return texto(acceso.estado, acceso.motivo);
    if (ruta.startsWith('/admin/api/')) return apiDeAdministracion(request, url, env, acceso.correo, ahoraSegundos);
    if (!esLectura(request)) return texto(405, 'Método no permitido.');
    return env.ASSETS.fetch(request);
  }

  if (ruta.startsWith('/api/')) return apiPublica(request, url, env, ahoraSegundos);
  if (!esLectura(request)) return texto(405, 'Método no permitido.');
  if (ESTATICOS_PUBLICOS.has(ruta) || ES_ICONO.test(ruta)) return env.ASSETS.fetch(request);
  return texto(404, 'No existe.');
}

export default {
  async fetch(request: Request, env: EntornoPanel): Promise<Response> {
    return conCabeceras(await atender(request, env));
  },
};
