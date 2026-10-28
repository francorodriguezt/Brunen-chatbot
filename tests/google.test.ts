import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ClienteSheets, ErrorGoogle, firmarJwt, olvidarTokens, type CuentaServicio } from '../src/google';

// Clave generada en la prueba: no es ninguna clave real.
let cuenta: CuentaServicio;
let clavePublica: CryptoKey;

function aPem(pkcs8: ArrayBuffer): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(pkcs8)));
  const lineas = base64.match(/.{1,64}/g) ?? [];
  return `-----BEGIN PRIVATE KEY-----\n${lineas.join('\n')}\n-----END PRIVATE KEY-----\n`;
}

function desdeBase64Url(texto: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(texto.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
}

beforeAll(async () => {
  const par = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  clavePublica = par.publicKey;
  cuenta = { client_email: 'bot@proyecto.iam.gserviceaccount.com', private_key: aPem(await crypto.subtle.exportKey('pkcs8', par.privateKey)) };
});

afterEach(() => {
  olvidarTokens();
  vi.unstubAllGlobals();
});

describe('firmarJwt', () => {
  it('arma un JWT RS256 que se verifica con la clave pública', async () => {
    const jwt = await firmarJwt(cuenta, 1_800_000_000);
    const [cabecera, carga, firma] = jwt.split('.') as [string, string, string];
    expect(JSON.parse(new TextDecoder().decode(desdeBase64Url(cabecera)))).toEqual({ alg: 'RS256', typ: 'JWT' });
    expect(JSON.parse(new TextDecoder().decode(desdeBase64Url(carga)))).toEqual({
      iss: cuenta.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    const valida = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', clavePublica, desdeBase64Url(firma), new TextEncoder().encode(`${cabecera}.${carga}`));
    expect(valida).toBe(true);
  });

  it('una clave mal formada falla con un error claro', async () => {
    await expect(firmarJwt({ ...cuenta, private_key: 'no es una clave' }, 1)).rejects.toThrow();
  });
});

describe('ClienteSheets', () => {
  function stubGoogle(respuestaSheets: () => Response = () => new Response('{}', { status: 200 })) {
    const llamadas: Array<{ url: string; init?: RequestInit }> = [];
    const stub = vi.fn(async (url: string, init?: RequestInit) => {
      llamadas.push({ url, init });
      if (url.startsWith('https://oauth2.googleapis.com/token')) {
        return new Response(JSON.stringify({ access_token: 'token-falso', expires_in: 3600 }), { status: 200 });
      }
      return respuestaSheets();
    });
    vi.stubGlobal('fetch', stub);
    return llamadas;
  }

  it('agrega filas con el token de acceso y sin pisar las existentes', async () => {
    const llamadas = stubGoogle();
    await new ClienteSheets(cuenta, 'PLANILLA1').agregarFilas('ERRORES', [['2026-10-28 12:00', 'webhook', 'wamid.A', 'falló']], 1000);
    const envio = llamadas[1];
    expect(envio?.url).toContain('/spreadsheets/PLANILLA1/values/ERRORES!A1:append');
    expect(envio?.url).toContain('insertDataOption=INSERT_ROWS');
    expect((envio?.init?.headers as Record<string, string>).Authorization).toBe('Bearer token-falso');
    expect(JSON.parse(String(envio?.init?.body))).toEqual({ values: [['2026-10-28 12:00', 'webhook', 'wamid.A', 'falló']] });
  });

  it('reutiliza el token mientras no esté por vencer', async () => {
    const llamadas = stubGoogle();
    const cliente = new ClienteSheets(cuenta, 'PLANILLA1');
    await cliente.agregarFilas('ERRORES', [['a']], 1000);
    await cliente.agregarFilas('ERRORES', [['b']], 1500);
    expect(llamadas.filter((l) => l.url.startsWith('https://oauth2.googleapis.com')).length).toBe(1);
    await cliente.agregarFilas('ERRORES', [['c']], 1000 + 3600); // ya venció
    expect(llamadas.filter((l) => l.url.startsWith('https://oauth2.googleapis.com')).length).toBe(2);
  });

  it('no llama a Google si no hay filas', async () => {
    const llamadas = stubGoogle();
    await new ClienteSheets(cuenta, 'PLANILLA1').agregarFilas('ERRORES', []);
    expect(llamadas).toHaveLength(0);
  });

  it('un error de Sheets se convierte en ErrorGoogle con el estado', async () => {
    stubGoogle(() => new Response('{"error":{"message":"The caller does not have permission"}}', { status: 403 }));
    const fallo = await new ClienteSheets(cuenta, 'P').agregarFilas('ERRORES', [['a']], 1000).catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ErrorGoogle);
    expect((fallo as ErrorGoogle).status).toBe(403);
  });

  it('si Google rechaza la firma, no hay token y el error lo dice', async () => {
    vi.stubGlobal('fetch', async () => new Response('{"error":"invalid_grant"}', { status: 400 }));
    const fallo = await new ClienteSheets(cuenta, 'P').agregarFilas('ERRORES', [['a']], 1000).catch((e: unknown) => e);
    expect((fallo as ErrorGoogle).message).toContain('invalid_grant');
  });
});
