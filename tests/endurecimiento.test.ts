import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Contexto, type Env } from '../src/index';
import { firmarHmacSha256 } from '../src/firma';
import { enviarTexto, LIMITE_TEXTO } from '../src/whatsapp';

// Todos los valores son ficticios.
const ENV: Env = {
  WHATSAPP_VERIFY_TOKEN: 'token-verificacion-prueba',
  WHATSAPP_APP_SECRET: 'secreto-app-prueba',
  WHATSAPP_TOKEN: 'token-acceso-prueba',
  WHATSAPP_PHONE_NUMBER_ID: '000000000000000',
  GRAPH_API_VERSION: 'v99.0',
  NUMEROS_PERMITIDOS: '56900000001',
};
const CONFIG = { token: 't', phoneNumberId: '1', graphApiVersion: 'v99.0' };

function contexto() {
  const pendientes: Promise<unknown>[] = [];
  const ctx: Contexto = { waitUntil: (p) => pendientes.push(p) };
  return { ctx, terminar: () => Promise.all(pendientes) };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('rechazo temprano en POST /webhook', () => {
  it('sin cabecera de firma responde 401', async () => {
    const peticion = new Request('https://bot.example/webhook', { method: 'POST', body: '{}' });
    const respuesta = await worker.fetch(peticion, ENV, contexto().ctx);
    expect(respuesta.status).toBe(401);
  });

  it('un cuerpo declarado como enorme responde 413 sin leerlo', async () => {
    const peticion = new Request('https://bot.example/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': 'sha256=abc', 'content-length': String(10 * 1024 * 1024) },
      body: '{}',
    });
    const respuesta = await worker.fetch(peticion, ENV, contexto().ctx);
    expect(respuesta.status).toBe(413);
  });

  it('un cuerpo real que supera el tope responde 413', async () => {
    const peticion = new Request('https://bot.example/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': 'sha256=abc' },
      body: 'x'.repeat(300 * 1024),
    });
    const respuesta = await worker.fetch(peticion, ENV, contexto().ctx);
    expect(respuesta.status).toBe(413);
  });
});

describe('/salud y verificación', () => {
  it('/salud responde también a HEAD, sin cuerpo', async () => {
    const respuesta = await worker.fetch(new Request('https://bot.example/salud', { method: 'HEAD' }), ENV, contexto().ctx);
    expect(respuesta.status).toBe(200);
    expect(await respuesta.text()).toBe('');
  });

  it('el verify token sigue funcionando y rechaza uno de otro largo', async () => {
    const base = 'https://bot.example/webhook?hub.mode=subscribe&hub.challenge=77&hub.verify_token=';
    const buena = await worker.fetch(new Request(base + ENV.WHATSAPP_VERIFY_TOKEN), ENV, contexto().ctx);
    const corta = await worker.fetch(new Request(base + 'x'), ENV, contexto().ctx);
    expect(buena.status).toBe(200);
    expect(corta.status).toBe(403);
  });
});

describe('un aviso de estado que falla no rompe el 200', () => {
  it('responde 200 aunque registrar el estado lance una excepción', async () => {
    vi.spyOn(console, 'error').mockImplementationOnce(() => {
      throw new Error('registro roto');
    });
    const estado = { id: 'wamid.A', status: 'failed', recipient_id: '56900000001' };
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { statuses: [estado] } }] }],
    };
    const cuerpo = JSON.stringify(payload);
    const firma = await firmarHmacSha256(cuerpo, ENV.WHATSAPP_APP_SECRET);
    const peticion = new Request('https://bot.example/webhook', {
      method: 'POST',
      headers: { 'x-hub-signature-256': `sha256=${firma}` },
      body: cuerpo,
    });
    const respuesta = await worker.fetch(peticion, ENV, contexto().ctx);
    expect(respuesta.status).toBe(200);
  });
});

describe('envío a Meta', () => {
  it('lleva un plazo máximo de espera', async () => {
    const meta = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', meta);
    await enviarTexto(CONFIG, '56900000001', 'hola');
    expect(meta.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it('recorta los textos que superan el límite de WhatsApp', async () => {
    const meta = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', meta);
    await enviarTexto(CONFIG, '56900000001', 'a'.repeat(LIMITE_TEXTO + 500));
    const enviado = JSON.parse(String(meta.mock.calls[0]?.[1]?.body)) as { text: { body: string } };
    expect(enviado.text.body).toHaveLength(LIMITE_TEXTO);
    expect(enviado.text.body.endsWith('…')).toBe(true);
  });

  it('no toca los textos que caben', async () => {
    const meta = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', meta);
    await enviarTexto(CONFIG, '56900000001', 'hola');
    const enviado = JSON.parse(String(meta.mock.calls[0]?.[1]?.body)) as { text: { body: string } };
    expect(enviado.text.body).toBe('hola');
  });
});
