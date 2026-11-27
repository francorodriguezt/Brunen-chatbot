import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAXIMO_POR_CORREO,
  RepositorioPush,
  aBase64Url,
  avisarPorPush,
  avisoDeAlerta,
  cifrarAviso,
  clavesValidas,
  configPush,
  deBase64Url,
  endpointValido,
  enviarAvisoPush,
  enviarPush,
  firmarVapid,
} from '../src/push';
import { crearBaseSqlite } from './ayudas';

// Todo ficticio: las claves y los dispositivos se generan en cada prueba.
afterEach(() => vi.unstubAllGlobals());

const AHORA = 1794582000;
const ENDPOINT = 'https://web.push.apple.com/QOpuyzPYtkbBNO4yUn9hUBTr0iuoy7xrVGtlpD1jHkKi';

async function claveDeTelefono() {
  const par = (await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits'])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  const publica = new Uint8Array((await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer);
  const auth = crypto.getRandomValues(new Uint8Array(16));
  return { jwk, privada: par.privateKey, suscripcion: { endpoint: ENDPOINT, p256dh: aBase64Url(publica), auth: aBase64Url(auth) } };
}

async function claveVapid() {
  const par = (await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify'])) as CryptoKeyPair;
  const jwk = await crypto.subtle.exportKey('jwk', par.privateKey);
  const publica = new Uint8Array((await crypto.subtle.exportKey('raw', par.publicKey)) as ArrayBuffer);
  return { clavePublica: aBase64Url(publica), clavePrivada: jwk.d as string, sujeto: 'mailto:avisos@ejemplo.test', verificar: par.publicKey };
}

describe('cifrarAviso (RFC 8291)', () => {
  it('reproduce el ejemplo del Apéndice A del RFC, byte por byte', async () => {
    const claveLocalPrivada: JsonWebKey = {
      kty: 'EC',
      crv: 'P-256',
      d: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
      x: aBase64Url(deBase64Url('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8').slice(1, 33)),
      y: aBase64Url(deBase64Url('BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8').slice(33, 65)),
    };
    const cuerpo = await cifrarAviso(
      'When I grow up, I want to be a watermelon',
      { p256dh: 'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4', auth: 'BTBZMqHH6r4Tts7J_aSIgg' },
      { sal: deBase64Url('DGv6ra1nlYgDCS1FRnbzlw'), claveLocalPrivada },
    );
    expect(aBase64Url(cuerpo)).toBe(
      'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
    );
  });

  it('lo que cifra, el teléfono lo puede descifrar (con una implementación aparte del lado receptor)', async () => {
    const telefono = await claveDeTelefono();
    const texto = JSON.stringify({ titulo: 'Brunen', cuerpo: 'Prueba con tildes: ñandú' });
    const cuerpo = await cifrarAviso(texto, telefono.suscripcion);

    // Cabecera: sal (16) + tamaño de registro (4) + largo de clave (1) + clave del servidor (65) + texto cifrado.
    const sal = cuerpo.slice(0, 16);
    expect(Array.from(cuerpo.slice(16, 20))).toEqual([0, 0, 16, 0]);
    expect(cuerpo[20]).toBe(65);
    const publicaServidor = cuerpo.slice(21, 86);
    const cifrado = cuerpo.slice(86);

    const servidor = await crypto.subtle.importKey('raw', publicaServidor, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
    const compartido = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: servidor }, telefono.privada, 256));
    const hkdf = async (salt: Uint8Array<ArrayBuffer>, ikm: Uint8Array<ArrayBuffer>, info: string, bytes: number) =>
      new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info: new TextEncoder().encode(info) }, await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']), bytes * 8));
    const infoClave = new Uint8Array([...new TextEncoder().encode('WebPush: info\0'), ...deBase64Url(telefono.suscripcion.p256dh), ...publicaServidor]);
    const ikm = new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt: deBase64Url(telefono.suscripcion.auth), info: infoClave }, await crypto.subtle.importKey('raw', compartido, 'HKDF', false, ['deriveBits']), 256));
    const cek = await hkdf(sal, ikm, 'Content-Encoding: aes128gcm\0', 16);
    const nonce = await hkdf(sal, ikm, 'Content-Encoding: nonce\0', 12);
    const claro = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce }, await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['decrypt']), cifrado));

    expect(claro.at(-1)).toBe(2); // delimitador de último registro
    expect(new TextDecoder().decode(claro.slice(0, -1))).toBe(texto);
  });

  it('cada envío usa una sal y una clave nuevas', async () => {
    const telefono = await claveDeTelefono();
    const a = await cifrarAviso('hola', telefono.suscripcion);
    const b = await cifrarAviso('hola', telefono.suscripcion);
    expect(aBase64Url(a)).not.toBe(aBase64Url(b));
  });
});

describe('firmarVapid', () => {
  it('firma un JWT ES256 con la audiencia del servicio, el contacto y una vigencia corta, y la clave pública verifica', async () => {
    const vapid = await claveVapid();
    const cabecera = await firmarVapid(ENDPOINT, vapid, AHORA);
    const [, jwt, clave] = /^vapid t=([^,]+), k=(.+)$/.exec(cabecera) as RegExpExecArray;
    expect(clave).toBe(vapid.clavePublica);
    const [h, c, f] = (jwt as string).split('.') as [string, string, string];
    expect(JSON.parse(new TextDecoder().decode(deBase64Url(h)))).toEqual({ typ: 'JWT', alg: 'ES256' });
    expect(JSON.parse(new TextDecoder().decode(deBase64Url(c)))).toEqual({ aud: 'https://web.push.apple.com', exp: AHORA + 12 * 3600, sub: 'mailto:avisos@ejemplo.test' });
    const valida = await crypto.subtle.verify({ name: 'ECDSA', hash: 'SHA-256' }, vapid.verificar, deBase64Url(f), new TextEncoder().encode(`${h}.${c}`));
    expect(valida).toBe(true);
  });
});

describe('validaciones', () => {
  it('solo acepta los servicios de envío de los navegadores, por https y sin puerto', () => {
    expect(endpointValido(ENDPOINT)).toBe(true);
    expect(endpointValido('https://fcm.googleapis.com/fcm/send/abc')).toBe(true);
    expect(endpointValido('https://updates.push.services.mozilla.com/wpush/v2/abc')).toBe(true);
    expect(endpointValido('https://par01.notify.windows.com/w/?token=abc')).toBe(true);
    for (const malo of ['http://web.push.apple.com/x', 'https://ejemplo.test/x', 'https://web.push.apple.com.malo.test/x', 'https://web.push.apple.com:8443/x', 'https://usuario@web.push.apple.com/x', 'https://127.0.0.1/x', 'no es una dirección', 42, null]) {
      expect(endpointValido(malo)).toBe(false);
    }
  });

  it('las claves del teléfono tienen que tener el largo y la forma correctos', async () => {
    const { suscripcion } = await claveDeTelefono();
    expect(clavesValidas(suscripcion.p256dh, suscripcion.auth)).toBe(true);
    expect(clavesValidas('abc', suscripcion.auth)).toBe(false);
    expect(clavesValidas(suscripcion.p256dh, 'abc')).toBe(false);
    expect(clavesValidas(1, 2)).toBe(false);
    expect(clavesValidas(suscripcion.p256dh + '!', suscripcion.auth)).toBe(false);
    expect(clavesValidas('corta', suscripcion.auth)).toBe(false); // largo imposible en base64
    expect(clavesValidas(suscripcion.p256dh, 'a')).toBe(false);
  });

  it('configPush exige las tres variables bien formadas', async () => {
    const v = await claveVapid();
    const ok = { VAPID_PUBLIC_KEY: v.clavePublica, VAPID_PRIVATE_KEY: v.clavePrivada, VAPID_SUBJECT: v.sujeto };
    expect(configPush(ok)).toEqual({ clavePublica: v.clavePublica, clavePrivada: v.clavePrivada, sujeto: v.sujeto });
    expect(configPush({})).toBeNull();
    expect(configPush({ ...ok, VAPID_SUBJECT: '' })).toBeNull();
    expect(configPush({ ...ok, VAPID_SUBJECT: 'sin-formato' })).toBeNull();
    expect(configPush({ ...ok, VAPID_PRIVATE_KEY: 'corta' })).toBeNull();
    expect(configPush({ ...ok, VAPID_PUBLIC_KEY: 'corta' })).toBeNull();
  });
});

describe('enviarPush', () => {
  function stubServicio(estado: number) {
    const f = vi.fn(async () => new Response(null, { status: estado }));
    vi.stubGlobal('fetch', f);
    return f;
  }

  it('manda el aviso cifrado con las cabeceras de Web Push y VAPID', async () => {
    const vapid = await claveVapid();
    const telefono = await claveDeTelefono();
    const f = stubServicio(201);
    const aviso = avisoDeAlerta({ tipo: 'reclamo', telefono: '56911111111', nombre: 'Ana Prueba', resumen: 'Se quejó de algo', motivos: [] });
    expect(await enviarPush(vapid, telefono.suscripcion, aviso, AHORA)).toBe('ok');

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(ENDPOINT);
    const cabeceras = init.headers as Record<string, string>;
    expect(cabeceras['Content-Encoding']).toBe('aes128gcm');
    expect(cabeceras.Urgency).toBe('high');
    expect(cabeceras.TTL).toBe(String(4 * 3600));
    expect(cabeceras.Authorization).toMatch(/^vapid t=.+, k=.+$/);
    expect((init.body as Uint8Array).length).toBeGreaterThan(86);
    // Lo que viaja no se puede leer: ni el nombre ni el teléfono aparecen en el cuerpo.
    const cuerpo = new TextDecoder('latin1').decode(init.body as Uint8Array);
    expect(cuerpo).not.toContain('Ana');
    expect(cuerpo).not.toContain('56911111111');
  });

  it('404 y 410 son una baja; otros errores y una caída son una falla; una dirección ajena ni se intenta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const vapid = await claveVapid();
    const { suscripcion } = await claveDeTelefono();
    const aviso = avisoDeAlerta({ tipo: 'error', telefono: '', resumen: 'x', motivos: [] });
    stubServicio(410);
    expect(await enviarPush(vapid, suscripcion, aviso, AHORA)).toBe('baja');
    stubServicio(404);
    expect(await enviarPush(vapid, suscripcion, aviso, AHORA)).toBe('baja');
    stubServicio(500);
    expect(await enviarPush(vapid, suscripcion, aviso, AHORA)).toBe('falla');
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('red caída: https://web.push.apple.com/secreto'); }));
    expect(await enviarPush(vapid, suscripcion, aviso, AHORA)).toBe('falla');
    // El log no cita el mensaje del error: podría traer la dirección del teléfono.
    expect(JSON.stringify((console.error as ReturnType<typeof vi.fn>).mock.calls)).not.toContain('secreto');
    const f = stubServicio(201);
    expect(await enviarPush(vapid, { ...suscripcion, endpoint: 'https://ejemplo.test/x' }, aviso, AHORA)).toBe('baja');
    expect(f).not.toHaveBeenCalled();
  });
});

describe('RepositorioPush y envío a todos', () => {
  it('guarda, actualiza por dirección y deja como mucho cinco por correo', async () => {
    const db = crearBaseSqlite();
    const repo = new RepositorioPush(db);
    const s = (n: number) => ({ endpoint: `https://web.push.apple.com/${n}`, p256dh: 'p', auth: 'a' });
    for (let n = 1; n <= MAXIMO_POR_CORREO + 2; n++) await repo.guardar(s(n), 'ana@ejemplo.test', AHORA + n);
    await repo.guardar(s(100), 'luis@ejemplo.test', AHORA);
    expect((await repo.todas('ana@ejemplo.test')).map((x) => x.endpoint)).toEqual([3, 4, 5, 6, 7].map((n) => `https://web.push.apple.com/${n}`));
    expect(await repo.todas('luis@ejemplo.test')).toHaveLength(1);
    expect(await repo.todas()).toHaveLength(6);
    await repo.guardar({ ...s(7), p256dh: 'nueva' }, 'ana@ejemplo.test', AHORA + 50);
    expect((await repo.todas('ana@ejemplo.test')).find((x) => x.endpoint.endsWith('/7'))?.p256dh).toBe('nueva');
  });

  it('borrar de un correo no toca los dispositivos de otro', async () => {
    const db = crearBaseSqlite();
    const repo = new RepositorioPush(db);
    await repo.guardar({ endpoint: 'https://web.push.apple.com/1', p256dh: 'p', auth: 'a' }, 'ana@ejemplo.test', AHORA);
    await repo.borrar('https://web.push.apple.com/1', 'luis@ejemplo.test');
    expect(await repo.existe('https://web.push.apple.com/1', 'ana@ejemplo.test')).toBe(true);
    await repo.borrar('https://web.push.apple.com/1', 'ana@ejemplo.test');
    expect(await repo.existe('https://web.push.apple.com/1', 'ana@ejemplo.test')).toBe(false);
  });

  it('envía a todos, borra los que ya no existen y cuenta cuántos lo recibieron', async () => {
    const db = crearBaseSqlite();
    const vapid = await claveVapid();
    const a = await claveDeTelefono();
    const b = await claveDeTelefono();
    const repo = new RepositorioPush(db);
    await repo.guardar({ ...a.suscripcion, endpoint: 'https://web.push.apple.com/vivo' }, 'ana@ejemplo.test', AHORA);
    await repo.guardar({ ...b.suscripcion, endpoint: 'https://web.push.apple.com/muerto' }, 'luis@ejemplo.test', AHORA);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => new Response(null, { status: url.endsWith('/muerto') ? 410 : 201 })));
    const aviso = avisoDeAlerta({ tipo: 'error', telefono: '', resumen: 'x', motivos: [] });
    expect(await enviarAvisoPush(db, vapid, aviso, AHORA)).toBe(1);
    expect((await repo.todas()).map((x) => x.endpoint)).toEqual(['https://web.push.apple.com/vivo']);
    expect(db.sql('SELECT fallas, ultimo_envio FROM suscripciones_push')).toEqual([{ fallas: 0, ultimo_envio: AHORA }]);
  });

  it('tras diez fallas seguidas borra el dispositivo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const db = crearBaseSqlite();
    const vapid = await claveVapid();
    const { suscripcion } = await claveDeTelefono();
    await new RepositorioPush(db).guardar(suscripcion, 'ana@ejemplo.test', AHORA);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 503 })));
    const aviso = avisoDeAlerta({ tipo: 'error', telefono: '', resumen: 'x', motivos: [] });
    for (let i = 0; i < 9; i++) await enviarAvisoPush(db, vapid, aviso, AHORA);
    expect(await new RepositorioPush(db).todas()).toHaveLength(1);
    await enviarAvisoPush(db, vapid, aviso, AHORA);
    expect(await new RepositorioPush(db).todas()).toHaveLength(0);
  });
});

describe('avisarPorPush y el texto del aviso', () => {
  it('el texto es genérico: no lleva nombre, teléfono ni el resumen del aviso', () => {
    const alerta = { tipo: 'reclamo' as const, telefono: '56911111111', nombre: 'Ana Prueba', resumen: 'Calle Falsa 123 no llegó', motivos: [], texto: 'no me llegó' };
    const texto = JSON.stringify(avisoDeAlerta(alerta));
    for (const dato of ['Ana', '56911111111', 'Calle Falsa', 'llegó']) expect(texto).not.toContain(dato);
    expect(avisoDeAlerta(alerta).titulo).toContain('reclamo');
    expect(avisoDeAlerta({ ...alerta, tipo: 'error' }).titulo).toContain('urgente');
  });

  it('sin claves configuradas o sin base, no hace nada y no lanza', async () => {
    const f = vi.fn();
    vi.stubGlobal('fetch', f);
    expect(await avisarPorPush({ DB: crearBaseSqlite() }, { tipo: 'error', telefono: '', resumen: 'x', motivos: [] })).toBe(0);
    expect(f).not.toHaveBeenCalled();
  });

  it('con las claves, avisa a los dispositivos guardados', async () => {
    const db = crearBaseSqlite();
    const v = await claveVapid();
    const { suscripcion } = await claveDeTelefono();
    await new RepositorioPush(db).guardar(suscripcion, 'ana@ejemplo.test', AHORA);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 201 })));
    const env = { DB: db, VAPID_PUBLIC_KEY: v.clavePublica, VAPID_PRIVATE_KEY: v.clavePrivada, VAPID_SUBJECT: v.sujeto };
    expect(await avisarPorPush(env, { tipo: 'reclamo', telefono: '5691', resumen: 'x', motivos: [] }, AHORA)).toBe(1);
  });
});
