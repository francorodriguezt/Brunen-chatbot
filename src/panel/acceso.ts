/**
 * Quién puede entrar al panel (D32). El panel va detrás de Cloudflare Access: Access hace el inicio de sesión (código
 * de un solo uso por correo, u otro proveedor) y manda a este Worker un token firmado en la cabecera
 * `Cf-Access-Jwt-Assertion`. Aquí se comprueba ese token (firma, quién lo emitió, para qué aplicación, que no haya
 * vencido) aunque Access ya haya filtrado: así, si alguien llegara al Worker por otra ruta, no entra.
 *
 * El panel muestra datos personales, por eso falla cerrado: sin la configuración de Access, o si no se puede
 * verificar la firma, nadie entra. La única excepción es el desarrollo local (`wrangler dev`): con la variable
 * `PANEL_DEV_CORREO` y solo desde localhost. Esa variable nunca se pone en la configuración de producción.
 *
 * Fuente del formato del token y de las claves públicas:
 * https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
 */

export interface EntornoAcceso {
  /** Dominio del equipo de Cloudflare Zero Trust, por ejemplo "brunen.cloudflareaccess.com". */
  ACCESS_TEAM_DOMAIN?: string;
  /** "AUD tag" de la aplicación de Access que protege este panel. */
  ACCESS_AUD?: string;
  /** Opcional: correos autorizados, separados por coma. Es una segunda barrera además de la política de Access. */
  PANEL_CORREOS?: string;
  /** Solo para desarrollo local. */
  PANEL_DEV_CORREO?: string;
}

export type ResultadoAcceso =
  | { ok: true; correo: string }
  | { ok: false; estado: 401 | 403 | 503; motivo: string };

interface ClavePublica {
  kid: string;
  kty: string;
  n: string;
  e: string;
}

interface ClavesEnMemoria {
  vigenteHasta: number;
  claves: Map<string, CryptoKey>;
}

const DURACION_CLAVES_SEGUNDOS = 3600;
const MARGEN_RELOJ_SEGUNDOS = 30;
const cache = new Map<string, ClavesEnMemoria>();

/** Solo para pruebas. */
export function olvidarClavesDeAcceso(): void {
  cache.clear();
}

const decodificador = new TextDecoder();

function base64UrlABytes(texto: string): Uint8Array<ArrayBuffer> {
  const base64 = texto.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(texto.length / 4) * 4, '=');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

function jsonDeParte(parte: string): Record<string, unknown> | null {
  try {
    const valor = JSON.parse(decodificador.decode(base64UrlABytes(parte))) as unknown;
    return typeof valor === 'object' && valor !== null ? (valor as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

function equipo(env: EntornoAcceso): string | null {
  const dominio = (env.ACCESS_TEAM_DOMAIN ?? '').trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return /^[a-z0-9.-]+\.[a-z]{2,}$/i.test(dominio) ? dominio : null;
}

async function cargarClaves(dominio: string, ahoraSegundos: number): Promise<Map<string, CryptoKey>> {
  const respuesta = await fetch(`https://${dominio}/cdn-cgi/access/certs`, { signal: AbortSignal.timeout(5000) });
  if (!respuesta.ok) throw new Error(`Access respondió ${respuesta.status} al pedir las claves`);
  const { keys } = (await respuesta.json()) as { keys?: ClavePublica[] };
  const claves = new Map<string, CryptoKey>();
  for (const clave of keys ?? []) {
    if (clave.kty !== 'RSA' || !clave.kid) continue;
    claves.set(
      clave.kid,
      await crypto.subtle.importKey('jwk', { kty: 'RSA', n: clave.n, e: clave.e, alg: 'RS256', ext: true }, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']),
    );
  }
  cache.set(dominio, { vigenteHasta: ahoraSegundos + DURACION_CLAVES_SEGUNDOS, claves });
  return claves;
}

/** Las claves se guardan una hora; si llega un token con una clave desconocida (Cloudflare las rota), se vuelven a pedir una vez. */
async function clavePara(dominio: string, kid: string, ahoraSegundos: number): Promise<CryptoKey | undefined> {
  const guardadas = cache.get(dominio);
  const vigente = guardadas && guardadas.vigenteHasta > ahoraSegundos ? guardadas.claves : undefined;
  const clave = vigente?.get(kid);
  if (clave) return clave;
  return (await cargarClaves(dominio, ahoraSegundos)).get(kid);
}

function tokenDeLaSolicitud(request: Request): string | null {
  const cabecera = request.headers.get('cf-access-jwt-assertion');
  if (cabecera) return cabecera;
  const cookie = /(?:^|;\s*)CF_Authorization=([^;]+)/.exec(request.headers.get('cookie') ?? '');
  return cookie?.[1] ?? null;
}

const esLocal = (host: string): boolean => host === 'localhost' || host === '127.0.0.1' || host === '[::1]';

export async function autenticar(
  request: Request,
  env: EntornoAcceso,
  ahoraSegundos: number = Math.floor(Date.now() / 1000),
): Promise<ResultadoAcceso> {
  if (env.PANEL_DEV_CORREO && esLocal(new URL(request.url).hostname)) return { ok: true, correo: env.PANEL_DEV_CORREO };

  const dominio = equipo(env);
  if (!dominio || !env.ACCESS_AUD) return { ok: false, estado: 503, motivo: 'El panel todavía no está configurado.' };

  const token = tokenDeLaSolicitud(request);
  if (!token) return { ok: false, estado: 401, motivo: 'Hace falta iniciar sesión.' };
  const partes = token.split('.');
  const [cabeza, cuerpo, firma] = partes;
  if (partes.length !== 3 || !cabeza || !cuerpo || !firma) return { ok: false, estado: 401, motivo: 'Acceso no válido.' };

  const encabezado = jsonDeParte(cabeza);
  const datos = jsonDeParte(cuerpo);
  // Solo RS256: aceptar el algoritmo que declara el token es el truco clásico para falsificarlos.
  if (!encabezado || !datos || encabezado.alg !== 'RS256' || typeof encabezado.kid !== 'string') return { ok: false, estado: 401, motivo: 'Acceso no válido.' };

  let clave: CryptoKey | undefined;
  try {
    clave = await clavePara(dominio, encabezado.kid, ahoraSegundos);
  } catch (error) {
    console.error('No se pudieron obtener las claves de Access:', error instanceof Error ? error.message : error);
    return { ok: false, estado: 503, motivo: 'No se pudo verificar el acceso. Intenta de nuevo en un momento.' };
  }
  if (!clave) return { ok: false, estado: 401, motivo: 'Acceso no válido.' };

  const firmaValida = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clave, base64UrlABytes(firma), new TextEncoder().encode(`${cabeza}.${cuerpo}`));
  const audiencias = Array.isArray(datos.aud) ? datos.aud : [datos.aud];
  const vence = typeof datos.exp === 'number' ? datos.exp : 0;
  const desde = typeof datos.nbf === 'number' ? datos.nbf : 0;
  const valido =
    firmaValida &&
    datos.iss === `https://${dominio}` &&
    audiencias.includes(env.ACCESS_AUD) &&
    vence > ahoraSegundos - MARGEN_RELOJ_SEGUNDOS &&
    desde <= ahoraSegundos + MARGEN_RELOJ_SEGUNDOS;
  if (!valido) return { ok: false, estado: 401, motivo: 'Acceso no válido o vencido. Vuelve a iniciar sesión.' };

  const correo = typeof datos.email === 'string' ? datos.email.trim() : '';
  if (!correo) return { ok: false, estado: 401, motivo: 'Acceso no válido.' };

  const permitidos = (env.PANEL_CORREOS ?? '').split(',').map((c) => c.trim().toLowerCase()).filter(Boolean);
  if (permitidos.length > 0 && !permitidos.includes(correo.toLowerCase())) return { ok: false, estado: 403, motivo: 'Esta cuenta no tiene permiso para entrar al panel.' };
  return { ok: true, correo };
}
