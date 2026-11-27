/**
 * Notificaciones push del panel (D115, respuesta 3): los avisos urgentes llegan al teléfono de la operadora y del dueño
 * aunque el panel esté cerrado. En un iPhone (iOS 16.4 o más) funciona con el panel agregado a la pantalla de inicio.
 *
 * Es el estándar Web Push, sin servicio de terceros ni costo:
 *  - El teléfono se suscribe y el panel guarda su dirección de envío y sus claves públicas (`suscripciones_push`).
 *  - El aviso se cifra de punta a punta (RFC 8291, aes128gcm): Apple o Google solo ven bytes. Aun así el texto es genérico
 *    ("Reclamo de un cliente"): nunca lleva nombres, teléfonos ni direcciones. El detalle se ve en el panel.
 *  - El servidor se identifica con una clave propia (VAPID, RFC 8292) firmada con ES256.
 *
 * Todo con WebCrypto, que ya trae Cloudflare Workers: no hay dependencias. Nada aquí lanza errores hacia quien llama:
 * un aviso que no sale no debe romper la atención al cliente.
 */

import type { Alerta } from './alertas';
import type { BaseDatos } from './almacen';

export interface EntornoPush {
  /** Clave pública VAPID (base64url, 65 bytes). No es secreta, pero va junto a la privada. */
  VAPID_PUBLIC_KEY?: string;
  /** Clave privada VAPID (base64url, 32 bytes). Secreto: `wrangler secret put`. */
  VAPID_PRIVATE_KEY?: string;
  /** Contacto del servidor para el servicio de envío: `mailto:` o `https:` (RFC 8292). Un correo del negocio, no personal. */
  VAPID_SUBJECT?: string;
}

export interface ConfigPush {
  clavePublica: string;
  clavePrivada: string;
  sujeto: string;
}

export interface SuscripcionPush {
  endpoint: string;
  p256dh: string;
  auth: string;
}

export interface AvisoPush {
  titulo: string;
  cuerpo: string;
  /** Un aviso nuevo con la misma etiqueta reemplaza al anterior en la pantalla. */
  etiqueta: string;
  /** Qué abrir al tocarlo. */
  url: string;
}

const MAXIMO_FALLAS = 10;
const VIGENCIA_JWT_SEGUNDOS = 12 * 3600;
const TTL_SEGUNDOS = 4 * 3600;
const TIEMPO_MAXIMO_MS = 8000;
/** Por correo; el dueño y la operadora, con teléfono y computador, no pasan de 3 o 4. */
export const MAXIMO_POR_CORREO = 5;

const codificador = new TextEncoder();

// ---- base64url ----

export function deBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  const limpio = texto.replace(/-/g, '+').replace(/_/g, '/');
  const binario = atob(limpio + '='.repeat((4 - (limpio.length % 4)) % 4));
  const salida = new Uint8Array(binario.length);
  for (let i = 0; i < binario.length; i++) salida[i] = binario.charCodeAt(i);
  return salida;
}

export function aBase64Url(bytes: Uint8Array): string {
  let binario = '';
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

const unir = (...partes: Uint8Array[]): Uint8Array<ArrayBuffer> => {
  const salida = new Uint8Array(partes.reduce((n, p) => n + p.length, 0));
  let i = 0;
  for (const p of partes) {
    salida.set(p, i);
    i += p.length;
  }
  return salida;
};

// ---- configuración y validación ----

/** Solo se envía si están las tres variables y las claves tienen el largo que corresponde. */
export function configPush(env: EntornoPush): ConfigPush | null {
  const clavePublica = env.VAPID_PUBLIC_KEY?.trim() ?? '';
  const clavePrivada = env.VAPID_PRIVATE_KEY?.trim() ?? '';
  const sujeto = env.VAPID_SUBJECT?.trim() ?? '';
  if (!clavePublica || !clavePrivada || !/^(mailto:[^\s@]+@[^\s@]+|https:\/\/[^\s]+)$/.test(sujeto)) return null;
  try {
    if (deBase64Url(clavePublica).length !== 65 || deBase64Url(clavePrivada).length !== 32) return null;
  } catch {
    return null;
  }
  return { clavePublica, clavePrivada, sujeto };
}

/**
 * Los servicios de envío de los navegadores. El servidor hace una solicitud a la dirección que le manda el teléfono:
 * sin esta lista, alguien con acceso al panel podría apuntarla a cualquier sitio.
 */
const SERVICIOS_DE_ENVIO: readonly RegExp[] = [
  /^web\.push\.apple\.com$/,
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];

export function endpointValido(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 600) return false;
  try {
    const url = new URL(endpoint);
    return url.protocol === 'https:' && !url.port && !url.username && !url.password && SERVICIOS_DE_ENVIO.some((r) => r.test(url.hostname));
  } catch {
    return false;
  }
}

/** Las claves del teléfono: la pública (65 bytes) y el secreto de autenticación (16 bytes), en base64url. */
export function clavesValidas(p256dh: unknown, auth: unknown): boolean {
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !/^[A-Za-z0-9_-]+$/.test(p256dh) || !/^[A-Za-z0-9_-]+$/.test(auth)) return false;
  try {
    const publica = deBase64Url(p256dh);
    return publica.length === 65 && publica[0] === 4 && deBase64Url(auth).length === 16;
  } catch {
    return false; // un largo imposible en base64 hace fallar la decodificación
  }
}

// ---- cifrado del aviso (RFC 8291) ----

async function hkdf(sal: Uint8Array<ArrayBuffer>, secreto: Uint8Array<ArrayBuffer>, info: Uint8Array<ArrayBuffer>, largo: number): Promise<Uint8Array<ArrayBuffer>> {
  const clave = await crypto.subtle.importKey('raw', secreto, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: sal, info }, clave, largo * 8));
}

/**
 * Cifra `texto` para un teléfono y devuelve el cuerpo completo del envío (cabecera + un solo registro cifrado).
 * `fijos` solo existe para que la prueba reproduzca el ejemplo del RFC 8291, Apéndice A.
 */
export async function cifrarAviso(
  texto: string,
  suscripcion: Pick<SuscripcionPush, 'p256dh' | 'auth'>,
  fijos?: { sal: Uint8Array<ArrayBuffer>; claveLocalPrivada: JsonWebKey },
): Promise<Uint8Array<ArrayBuffer>> {
  const clavePublicaTelefono = deBase64Url(suscripcion.p256dh);
  const secretoDeAutenticacion = deBase64Url(suscripcion.auth);
  const curva = { name: 'ECDH', namedCurve: 'P-256' } as const;

  let privadaLocal: CryptoKey;
  let publicaLocal: Uint8Array<ArrayBuffer>;
  if (fijos) {
    const { x, y } = fijos.claveLocalPrivada;
    privadaLocal = await crypto.subtle.importKey('jwk', fijos.claveLocalPrivada, curva, false, ['deriveBits']);
    publicaLocal = unir(new Uint8Array([4]), deBase64Url(x as string), deBase64Url(y as string));
  } else {
    const par = (await crypto.subtle.generateKey(curva, true, ['deriveBits'])) as CryptoKeyPair;
    privadaLocal = par.privateKey;
    publicaLocal = new Uint8Array((await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer);
  }
  const telefono = await crypto.subtle.importKey('raw', clavePublicaTelefono, curva, false, []);
  const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: telefono }, privadaLocal, 256));

  const sal = fijos?.sal ?? crypto.getRandomValues(new Uint8Array(16));
  const ikm = await hkdf(secretoDeAutenticacion, compartido, unir(codificador.encode('WebPush: info\0'), clavePublicaTelefono, publicaLocal), 32);
  const claveDeContenido = await hkdf(sal, ikm, codificador.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(sal, ikm, codificador.encode('Content-Encoding: nonce\0'), 12);

  // Un solo registro: el texto y el delimitador 0x02 de "último registro".
  const claro = unir(codificador.encode(texto), new Uint8Array([2]));
  const clave = await crypto.subtle.importKey('raw', claveDeContenido, 'AES-GCM', false, ['encrypt']);
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, clave, claro));

  const tamanoDeRegistro = new Uint8Array([0, 0, 0x10, 0]); // 4096
  return unir(sal, tamanoDeRegistro, new Uint8Array([publicaLocal.length]), publicaLocal, cifrado);
}

// ---- identificación del servidor (VAPID, RFC 8292) ----

export async function firmarVapid(endpoint: string, config: ConfigPush, ahoraSegundos: number): Promise<string> {
  const publica = deBase64Url(config.clavePublica);
  const clave = await crypto.subtle.importKey(
    'jwk',
    { kty: 'EC', crv: 'P-256', x: aBase64Url(publica.slice(1, 33)), y: aBase64Url(publica.slice(33, 65)), d: config.clavePrivada, ext: true },
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  );
  const parte = (objeto: unknown) => aBase64Url(codificador.encode(JSON.stringify(objeto)));
  const sinFirma = `${parte({ typ: 'JWT', alg: 'ES256' })}.${parte({ aud: new URL(endpoint).origin, exp: ahoraSegundos + VIGENCIA_JWT_SEGUNDOS, sub: config.sujeto })}`;
  // WebCrypto entrega la firma como r || s (64 bytes), que es justo el formato de ES256 en un JWT.
  const firma = new Uint8Array(await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, clave, codificador.encode(sinFirma)));
  return `vapid t=${sinFirma}.${aBase64Url(firma)}, k=${config.clavePublica}`;
}

// ---- envío ----

export type ResultadoDeEnvio = 'ok' | 'baja' | 'falla';

/** Un envío a un teléfono. 404 y 410 quieren decir que la suscripción ya no existe ('baja'). Nunca lanza errores. */
export async function enviarPush(config: ConfigPush, suscripcion: SuscripcionPush, aviso: AvisoPush, ahoraSegundos: number): Promise<ResultadoDeEnvio> {
  try {
    if (!endpointValido(suscripcion.endpoint)) return 'baja';
    const cuerpo = await cifrarAviso(JSON.stringify(aviso), suscripcion);
    const respuesta = await fetch(suscripcion.endpoint, {
      method: 'POST',
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
      headers: {
        Authorization: await firmarVapid(suscripcion.endpoint, config, ahoraSegundos),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        TTL: String(TTL_SEGUNDOS),
        Urgency: 'high',
      },
      body: cuerpo,
    });
    if (respuesta.ok) return 'ok';
    if (respuesta.status === 404 || respuesta.status === 410) return 'baja';
    console.error(`Aviso push: el servicio de envío respondió ${respuesta.status}`);
    return 'falla';
  } catch (error) {
    // Solo el nombre del error: el mensaje podría traer la dirección del teléfono.
    console.error('Aviso push: no se pudo enviar:', error instanceof Error ? error.name : 'error');
    return 'falla';
  }
}

// ---- suscripciones ----

export class RepositorioPush {
  constructor(private readonly db: BaseDatos) {}

  private async filas(sql: string, ...valores: unknown[]): Promise<Array<Record<string, unknown>>> {
    return ((await this.db.prepare(sql).bind(...valores).run()).results ?? []) as Array<Record<string, unknown>>;
  }

  /** Guarda (o actualiza) el dispositivo. Cada correo conserva como mucho `MAXIMO_POR_CORREO`: se borran los más viejos. */
  async guardar(s: SuscripcionPush, correo: string, ahoraSegundos: number): Promise<void> {
    await this.db
      .prepare(
        `INSERT INTO suscripciones_push (endpoint, p256dh, auth, correo, creado_en) VALUES (?1, ?2, ?3, ?4, ?5)
         ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth, correo = excluded.correo, fallas = 0`,
      )
      .bind(s.endpoint, s.p256dh, s.auth, correo, ahoraSegundos)
      .run();
    await this.db
      .prepare('DELETE FROM suscripciones_push WHERE correo = ?1 AND id NOT IN (SELECT id FROM suscripciones_push WHERE correo = ?1 ORDER BY creado_en DESC, id DESC LIMIT ?2)')
      .bind(correo, MAXIMO_POR_CORREO)
      .run();
  }

  async borrar(endpoint: string, correo?: string): Promise<void> {
    if (correo === undefined) await this.db.prepare('DELETE FROM suscripciones_push WHERE endpoint = ?1').bind(endpoint).run();
    else await this.db.prepare('DELETE FROM suscripciones_push WHERE endpoint = ?1 AND correo = ?2').bind(endpoint, correo).run();
  }

  async todas(correo?: string): Promise<SuscripcionPush[]> {
    const filas = correo === undefined ? await this.filas('SELECT endpoint, p256dh, auth FROM suscripciones_push ORDER BY id') : await this.filas('SELECT endpoint, p256dh, auth FROM suscripciones_push WHERE correo = ?1 ORDER BY id', correo);
    return filas.map((f) => ({ endpoint: String(f.endpoint), p256dh: String(f.p256dh), auth: String(f.auth) }));
  }

  async existe(endpoint: string, correo: string): Promise<boolean> {
    return (await this.filas('SELECT 1 AS uno FROM suscripciones_push WHERE endpoint = ?1 AND correo = ?2', endpoint, correo)).length > 0;
  }

  async anotarResultado(endpoint: string, resultado: ResultadoDeEnvio, ahoraSegundos: number): Promise<void> {
    if (resultado === 'baja') return void (await this.borrar(endpoint));
    if (resultado === 'ok') {
      await this.db.prepare('UPDATE suscripciones_push SET fallas = 0, ultimo_envio = ?2 WHERE endpoint = ?1').bind(endpoint, ahoraSegundos).run();
      return;
    }
    await this.db.prepare('UPDATE suscripciones_push SET fallas = fallas + 1 WHERE endpoint = ?1').bind(endpoint).run();
    await this.db.prepare('DELETE FROM suscripciones_push WHERE endpoint = ?1 AND fallas >= ?2').bind(endpoint, MAXIMO_FALLAS).run();
  }
}

/** Manda el aviso a todos los dispositivos (o a los de un correo) y limpia los que ya no existen. Devuelve cuántos recibieron. */
export async function enviarAvisoPush(db: BaseDatos, config: ConfigPush, aviso: AvisoPush, ahoraSegundos: number, correo?: string): Promise<number> {
  const repositorio = new RepositorioPush(db);
  let enviados = 0;
  for (const suscripcion of await repositorio.todas(correo)) {
    const resultado = await enviarPush(config, suscripcion, aviso, ahoraSegundos);
    await repositorio.anotarResultado(suscripcion.endpoint, resultado, ahoraSegundos);
    if (resultado === 'ok') enviados += 1;
  }
  return enviados;
}

// ---- qué se avisa ----

/** El texto de un aviso urgente en la pantalla del teléfono: por tipo, sin ningún dato del cliente. */
export function avisoDeAlerta(alerta: Alerta): AvisoPush {
  if (alerta.tipo === 'reclamo') return { titulo: 'Brunen: reclamo de un cliente', cuerpo: 'Ábrelo en el panel y respóndele.', etiqueta: 'brunen-reclamo', url: '/admin/' };
  return { titulo: 'Brunen: hay un aviso urgente', cuerpo: 'Algo necesita atención. Ábrelo en el panel.', etiqueta: 'brunen-urgente', url: '/admin/' };
}

/** Avisa por push una alerta urgente. Nunca lanza errores. Devuelve cuántos dispositivos lo recibieron. */
export async function avisarPorPush(env: EntornoPush & { DB?: BaseDatos }, alerta: Alerta, ahoraSegundos: number = Math.floor(Date.now() / 1000)): Promise<number> {
  const config = configPush(env);
  if (!config || !env.DB) return 0;
  try {
    return await enviarAvisoPush(env.DB, config, avisoDeAlerta(alerta), ahoraSegundos);
  } catch (error) {
    console.error('Aviso push: falló:', error instanceof Error ? error.name : 'error');
    return 0;
  }
}
