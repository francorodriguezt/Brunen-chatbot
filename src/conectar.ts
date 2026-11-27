/**
 * Página de conexión del número de WhatsApp (`/conectar` en la dirección pública del panel, D116).
 *
 * Es la parte de "Embedded Signup" que Meta exige que corra en una página web: abre la ventana de Meta, el dueño del
 * número entra, y Meta le entrega a la página un código de un solo uso (vale 5 minutos) y los identificadores de su
 * cuenta. La página NO manda nada a ningún servidor: lo muestra en pantalla y el comando local `npm run conectar-numero`
 * (scripts/conectar-numero.mjs) lo canjea desde el computador de Franco, donde viven el secreto de la app y el token.
 * Así el secreto de la app y el token del número nunca pasan por el Worker ni por el navegador.
 *
 * Solo existe mientras `CONECTAR_ACTIVO` sea "SI" y estén el identificador de la app y el de la configuración; el resto
 * del tiempo da 404 y nadie puede abrir la ventana de Meta desde nuestro dominio. Se activa para conectar y se apaga.
 */

export interface EntornoConectar {
  /** "SI" solo el día en que se conecta el número. */
  CONECTAR_ACTIVO?: string;
  /** Identificador de la app de Meta (no es un secreto: se ve en cualquier página que use el inicio de sesión de Facebook). */
  META_APP_ID?: string;
  /** Identificador de la configuración de "Inicio de sesión de Facebook para empresas" (tampoco es un secreto). */
  META_CONFIG_ID?: string;
  /** Versión de la Graph API para el SDK de Facebook; la misma del bot. */
  GRAPH_API_VERSION?: string;
}

export interface DatosDeConexion {
  appId: string;
  configId: string;
  version: string;
}

/** Versión por omisión si el panel no la trae: la que muestra la documentación de Meta del 2026-11-27. */
const VERSION_POR_OMISION = 'v27.0';
const NUMERO = /^\d{5,30}$/;
const VERSION = /^v\d{1,3}\.\d{1,2}$/;

export function datosDeConexion(env: EntornoConectar): DatosDeConexion | null {
  if (env.CONECTAR_ACTIVO?.trim().toUpperCase() !== 'SI') return null;
  const appId = env.META_APP_ID?.trim() ?? '';
  const configId = env.META_CONFIG_ID?.trim() ?? '';
  const version = env.GRAPH_API_VERSION?.trim() || VERSION_POR_OMISION;
  if (!NUMERO.test(appId) || !NUMERO.test(configId) || !VERSION.test(version)) return null;
  return { appId, configId, version };
}

/** Pone los identificadores en la plantilla. Son solo dígitos y una versión (validados arriba), así que no hay nada que escapar. */
export function pintarConexion(plantilla: string, datos: DatosDeConexion): string {
  return plantilla
    .replaceAll('{{APP_ID}}', datos.appId)
    .replaceAll('{{CONFIG_ID}}', datos.configId)
    .replaceAll('{{VERSION}}', datos.version);
}

/**
 * Política de contenido de esta sola página: lo mínimo que pide el SDK de Facebook (scripts, marcos y consultas a los
 * dominios de Facebook), sin abrir nada para el resto del panel. Documentación de Meta: developers.facebook.com/docs/javascript.
 */
export const POLITICA_CONECTAR = [
  "default-src 'self'",
  "script-src 'self' https://connect.facebook.net",
  "style-src 'self'",
  "img-src 'self' data: https://www.facebook.com https://web.facebook.com https://*.fbcdn.net",
  "connect-src 'self' https://www.facebook.com https://web.facebook.com https://graph.facebook.com",
  "frame-src https://www.facebook.com https://web.facebook.com https://staticxx.facebook.com",
  "frame-ancestors 'none'",
  "base-uri 'none'",
  "form-action 'self'",
].join('; ');
