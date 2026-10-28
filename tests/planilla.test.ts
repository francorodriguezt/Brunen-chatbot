import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import worker, { type Contexto, type Env } from '../src/index';
import { firmarHmacSha256 } from '../src/firma';
import { olvidarTokens } from '../src/google';
import { planillaDe } from '../src/planilla';

// Todos los valores son ficticios; la clave se genera en la prueba.
let claveJson: string;
let env: Env;

beforeAll(async () => {
  const par = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const base64 = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey))));
  const pem = `-----BEGIN PRIVATE KEY-----\n${(base64.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----\n`;
  claveJson = JSON.stringify({ client_email: 'bot@proyecto.iam.gserviceaccount.com', private_key: pem });
  env = {
    WHATSAPP_VERIFY_TOKEN: 'v',
    WHATSAPP_APP_SECRET: 'secreto-app-prueba',
    WHATSAPP_TOKEN: 't',
    WHATSAPP_PHONE_NUMBER_ID: '1',
    GRAPH_API_VERSION: 'v99.0',
    NUMEROS_PERMITIDOS: '56900000001',
    GOOGLE_SERVICE_ACCOUNT_JSON: claveJson,
    GOOGLE_SHEET_ID: 'PLANILLA1',
  };
});

afterEach(() => {
  olvidarTokens();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

interface Anexo { hoja: string; filas: string[][] }

/** Meta y Google de mentira. `meta` decide la respuesta a WhatsApp; `google` la de Sheets. */
function stubs(meta: () => Response, google: () => Response = () => new Response('{}', { status: 200 })) {
  const anexos: Anexo[] = [];
  vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
    if (url.startsWith('https://graph.facebook.com')) return meta();
    if (url.startsWith('https://oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'tk', expires_in: 3600 }), { status: 200 });
    const hoja = decodeURIComponent(/values\/([^!]+)!/.exec(url)?.[1] ?? '');
    anexos.push({ hoja, filas: (JSON.parse(String(init?.body)) as { values: string[][] }).values });
    return google();
  });
  return anexos;
}

async function enviar(de: string, id: string, entorno: Env = env) {
  const mensaje = { id, from: de, timestamp: '1793000000', type: 'text', text: { body: 'texto privado del cliente' } };
  const cuerpo = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ id: 'W', changes: [{ field: 'messages', value: { messages: [mensaje] } }] }] });
  const firma = await firmarHmacSha256(cuerpo, entorno.WHATSAPP_APP_SECRET);
  const pendientes: Promise<unknown>[] = [];
  const ctx: Contexto = { waitUntil: (p) => pendientes.push(p) };
  const respuesta = await worker.fetch(
    new Request('https://bot.example/webhook', { method: 'POST', headers: { 'x-hub-signature-256': `sha256=${firma}` }, body: cuerpo }),
    entorno,
    ctx,
  );
  await Promise.all(pendientes);
  return respuesta;
}

describe('registro en la planilla', () => {
  it('anota el mensaje con el teléfono enmascarado y sin su texto', async () => {
    const anexos = stubs(() => new Response('{}', { status: 200 }));
    await enviar('56900000001', 'wamid.A');
    const mensajes = anexos.find((a) => a.hoja === 'MENSAJES_PROCESADOS');
    expect(mensajes?.filas).toHaveLength(1);
    const [fila] = mensajes?.filas ?? [];
    expect(fila?.slice(1)).toEqual(['wamid.A', '*******0001', 'text', 'respondido', 'desconocido']);
    expect(JSON.stringify(anexos)).not.toContain('texto privado');
    expect(JSON.stringify(anexos)).not.toContain('56900000001');
    expect(anexos.some((a) => a.hoja === 'ERRORES')).toBe(false);
  });

  it('un número no permitido queda anotado como ignorado', async () => {
    const anexos = stubs(() => new Response('{}', { status: 200 }));
    await enviar('56911112222', 'wamid.B');
    expect(anexos.find((a) => a.hoja === 'MENSAJES_PROCESADOS')?.filas[0]?.[4]).toBe('ignorado_modo_prueba');
  });

  it('un fallo al responder queda en ERRORES y en MENSAJES_PROCESADOS', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const anexos = stubs(() => new Response('{"error":{"code":190}}', { status: 401 }));
    await enviar('56900000001', 'wamid.C');
    expect(anexos.find((a) => a.hoja === 'MENSAJES_PROCESADOS')?.filas[0]?.[4]).toBe('error');
    const error = anexos.find((a) => a.hoja === 'ERRORES')?.filas[0];
    expect(error?.[1]).toBe('webhook');
    expect(error?.[2]).toBe('wamid.C');
    expect(error?.[3]).toContain('401');
  });

  it('si Google falla, el cliente igual recibe su respuesta y Meta su 200', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const meta = vi.fn(() => new Response('{}', { status: 200 }));
    stubs(meta, () => new Response('caído', { status: 500 }));
    const respuesta = await enviar('56900000001', 'wamid.D');
    expect(respuesta.status).toBe(200);
    expect(meta).toHaveBeenCalledOnce();
    expect(error.mock.calls.some((c) => String(c[0]).includes('No se pudo registrar en la planilla'))).toBe(true);
  });

  it('sin credenciales de Google no se llama a Google', async () => {
    const anexos = stubs(() => new Response('{}', { status: 200 }));
    await enviar('56900000001', 'wamid.E', { ...env, GOOGLE_SERVICE_ACCOUNT_JSON: undefined });
    expect(anexos).toHaveLength(0);
  });
});

describe('planillaDe', () => {
  it('una clave inválida no rompe: se anota y no se registra', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(planillaDe({ GOOGLE_SERVICE_ACCOUNT_JSON: 'no es json', GOOGLE_SHEET_ID: 'P' })).toBeNull();
    expect(planillaDe({ GOOGLE_SERVICE_ACCOUNT_JSON: '{"client_email":"a"}', GOOGLE_SHEET_ID: 'P' })).toBeNull();
    expect(error).toHaveBeenCalledTimes(2);
  });

  it('sin variables devuelve null sin ruido', () => {
    expect(planillaDe({})).toBeNull();
  });
});
