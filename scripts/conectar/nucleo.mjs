/**
 * Los pasos para conectar el número de WhatsApp (D116), sin tocar la red por su cuenta: `fetch` se recibe de afuera para
 * poder probarlos con respuestas falsas. Los pasos y su orden salen de la documentación de Meta (revisada el 2026-11-27):
 *
 *   - Onboarding de clientes como Tech Provider: developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-customers-as-a-tech-provider
 *   - Usuarios de la app WhatsApp Business (coexistencia): .../embedded-signup/onboarding-business-app-users
 *
 * Nada de lo que pasa por aquí se imprime: ni el secreto de la app, ni el código, ni el token. Los mensajes de error
 * llevan solo el texto y el código que devuelve Meta, con cualquiera de esos valores tapado por si acaso.
 */

const VERSION = /^v\d{1,3}\.\d{1,2}$/;
const ID = /^\d{5,30}$/;
const BASE = 'https://graph.facebook.com';

export class ErrorDeConexion extends Error {}

/** Cambia cada valor secreto que aparezca en un texto por "***". */
export function taparSecretos(texto, secretos) {
  let limpio = String(texto);
  for (const secreto of secretos) {
    if (secreto && String(secreto).length >= 4) limpio = limpio.split(String(secreto)).join('***');
  }
  return limpio;
}

export function validarEntradas({ version, appId, appSecret, code, waba, telefono }) {
  if (!VERSION.test(version ?? '')) throw new ErrorDeConexion(`Versión de la Graph API inválida: "${version}" (formato vNN.N).`);
  if (!ID.test(appId ?? '')) throw new ErrorDeConexion('Falta el identificador de la app (META_APP_ID) o no son solo dígitos.');
  if (!appSecret || appSecret.length < 8) throw new ErrorDeConexion('Falta el secreto de la app (META_APP_SECRET).');
  if (!code || code.length < 10 || /\s/.test(code)) throw new ErrorDeConexion('Falta el código de Meta (--code) o está incompleto.');
  if (!ID.test(waba ?? '')) throw new ErrorDeConexion('Falta la cuenta de WhatsApp (--waba) o no son solo dígitos.');
  if (!ID.test(telefono ?? '')) throw new ErrorDeConexion('Falta el identificador del número (--telefono) o no son solo dígitos.');
}

async function llamar(fetchFn, url, opciones, secretos, paso) {
  let respuesta;
  try {
    respuesta = await fetchFn(url, opciones);
  } catch (falla) {
    throw new ErrorDeConexion(`${paso}: no se pudo llegar a Meta (${taparSecretos(falla instanceof Error ? falla.message : falla, secretos)}).`);
  }
  let cuerpo = null;
  try {
    cuerpo = await respuesta.json();
  } catch {
    // Respuesta sin JSON: se informa solo el estado.
  }
  if (!respuesta.ok || cuerpo?.error) {
    const detalle = cuerpo?.error ? `${cuerpo.error.message ?? 'sin detalle'} (código ${cuerpo.error.code ?? '?'})` : `estado ${respuesta.status}`;
    throw new ErrorDeConexion(`${paso}: Meta respondió ${taparSecretos(detalle, secretos)}.`);
  }
  return cuerpo;
}

/**
 * Canjea el código, suscribe la app a la cuenta, revisa que el número quede en la API y en la app, y pide a Meta la
 * sincronización de contactos y la de historial (las dos, dentro de las 24 horas, y cada una se puede pedir una sola vez).
 * Devuelve el token y lo que pasó en cada paso, sin mostrar nada por su cuenta; `avisar` recibe los textos de avance.
 */
export async function conectarNumero(entradas, { fetch: fetchFn, avisar = () => {} }) {
  validarEntradas(entradas);
  const { version, appId, appSecret, code, waba, telefono } = entradas;
  const secretos = [appSecret, code];

  // 1. El código de un solo uso se cambia por el token del cliente. Va en el servidor, nunca en el navegador.
  avisar('1/5 Canjeando el código por el token…');
  const parametros = new URLSearchParams({ client_id: appId, client_secret: appSecret, code });
  const canje = await llamar(fetchFn, `${BASE}/${version}/oauth/access_token?${parametros}`, { method: 'GET' }, secretos, 'Canje del código');
  const token = canje?.access_token;
  if (typeof token !== 'string' || token.length < 20) throw new ErrorDeConexion('Canje del código: Meta no devolvió un token.');
  secretos.push(token);
  const autorizacion = { authorization: `Bearer ${token}` };

  // 2. La app recibe los avisos (webhooks) de esa cuenta. No se registra el número: ya está registrado (coexistencia).
  avisar('2/5 Suscribiendo la app a la cuenta de WhatsApp…');
  await llamar(fetchFn, `${BASE}/${version}/${waba}/subscribed_apps`, { method: 'POST', headers: autorizacion }, secretos, 'Suscripción de la app');

  // 3. Confirmar que el número sirve para la API y para la app a la vez.
  avisar('3/5 Revisando el número…');
  const numero = await llamar(fetchFn, `${BASE}/${version}/${telefono}?fields=is_on_biz_app,platform_type`, { method: 'GET', headers: autorizacion }, secretos, 'Revisión del número');
  const advertencias = [];
  if (numero.is_on_biz_app === false) {
    throw new ErrorDeConexion('El número no figura como conectado a la app WhatsApp Business (is_on_biz_app = false). No se sincroniza nada: revisa que elegiste conectar la app que ya usan, no un número nuevo.');
  }
  if (numero.is_on_biz_app === undefined) advertencias.push('Meta no informó is_on_biz_app; se sigue igual.');
  if (numero.platform_type && numero.platform_type !== 'CLOUD_API') advertencias.push(`platform_type es ${numero.platform_type} y se esperaba CLOUD_API.`);

  // 4 y 5. Sincronizaciones. Cada una se pide una vez; si no se piden, Meta desconecta el número a las 24 horas.
  const sincronizaciones = {};
  for (const [indice, tipo] of [['4/5', 'smb_app_state_sync'], ['5/5', 'history']]) {
    avisar(`${indice} Pidiendo la sincronización "${tipo}"…`);
    const r = await llamar(
      fetchFn,
      `${BASE}/${version}/${telefono}/smb_app_data`,
      { method: 'POST', headers: { ...autorizacion, 'content-type': 'application/json' }, body: JSON.stringify({ messaging_product: 'whatsapp', sync_type: tipo }) },
      secretos,
      `Sincronización ${tipo}`,
    );
    sincronizaciones[tipo] = typeof r?.request_id === 'string' ? r.request_id : null;
  }

  return { token, plataforma: numero.platform_type ?? null, enLaApp: numero.is_on_biz_app ?? null, sincronizaciones, advertencias };
}
