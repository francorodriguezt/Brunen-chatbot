import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Contexto, type Env, registrarEstados } from '../src/index';
import { firmarHmacSha256 } from '../src/firma';
import { enviarTexto, ErrorWhatsApp, esErrorDeToken, extraerEstados } from '../src/whatsapp';

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

function avisoDeEstado(estados: unknown[]) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', statuses: estados } }] }],
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('extraerEstados', () => {
  it('lee entregas correctas y fallidas, con el código de error', () => {
    const payload = avisoDeEstado([
      { id: 'wamid.A', status: 'delivered', recipient_id: '56900000001' },
      { id: 'wamid.B', status: 'failed', recipient_id: '56900000001', errors: [{ code: 131047, title: 'Re-engagement message' }] },
    ]);
    expect(extraerEstados(payload)).toEqual([
      { id: 'wamid.A', para: '56900000001', estado: 'delivered', codigoError: undefined, tituloError: undefined },
      { id: 'wamid.B', para: '56900000001', estado: 'failed', codigoError: 131047, tituloError: 'Re-engagement message' },
    ]);
  });

  it('ignora datos incompletos y payloads que no son de WhatsApp', () => {
    expect(extraerEstados(avisoDeEstado([{ status: 'sent' }]))).toEqual([]);
    expect(extraerEstados({ object: 'page' })).toEqual([]);
    expect(extraerEstados(null)).toEqual([]);
  });
});

describe('registrarEstados', () => {
  it('solo registra los fallidos y nunca muestra el teléfono completo', () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    registrarEstados([
      { id: 'wamid.A', para: '56900000001', estado: 'read' },
      { id: 'wamid.B', para: '56900000001', estado: 'failed', codigoError: 131047, tituloError: 'Re-engagement message' },
    ]);
    expect(error).toHaveBeenCalledOnce();
    const texto = String(error.mock.calls[0]?.[0]);
    expect(texto).toContain('131047');
    expect(texto).toContain('*******0001');
    expect(texto).not.toContain('56900000001');
  });
});

describe('token vencido', () => {
  it('reconoce el error 190 de Meta y el HTTP 401', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { code: 190, message: 'Session has expired' } }), { status: 401 }));
    const fallo = await enviarTexto(CONFIG, '56900000001', 'hola').catch((e: unknown) => e);
    expect(fallo).toBeInstanceOf(ErrorWhatsApp);
    expect((fallo as ErrorWhatsApp).codigoMeta).toBe(190);
    expect(esErrorDeToken(fallo)).toBe(true);
  });

  it('otro error de Meta no se toma por token vencido', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { code: 131047 } }), { status: 400 }));
    const fallo = await enviarTexto(CONFIG, '56900000001', 'hola').catch((e: unknown) => e);
    expect(esErrorDeToken(fallo)).toBe(false);
    expect(esErrorDeToken(new Error('otro'))).toBe(false);
  });

  it('un cuerpo que no es JSON no rompe el manejo del error', async () => {
    vi.stubGlobal('fetch', async () => new Response('Bad Gateway', { status: 502 }));
    const fallo = await enviarTexto(CONFIG, '56900000001', 'hola').catch((e: unknown) => e);
    expect((fallo as ErrorWhatsApp).codigoMeta).toBeUndefined();
    expect((fallo as ErrorWhatsApp).status).toBe(502);
  });

  it('el webhook avisa claramente en el registro cuando el token venció', async () => {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ error: { code: 190 } }), { status: 401 }));
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messages: [{ id: 'wamid.X', from: '56900000001', timestamp: '1793000000', type: 'text', text: { body: 'hola' } }] } }] }],
    };
    const cuerpo = JSON.stringify(payload);
    const firma = await firmarHmacSha256(cuerpo, ENV.WHATSAPP_APP_SECRET);
    const pendientes: Promise<unknown>[] = [];
    const ctx: Contexto = { waitUntil: (p) => pendientes.push(p) };
    const respuesta = await worker.fetch(
      new Request('https://bot.example/webhook', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${firma}` },
        body: cuerpo,
      }),
      ENV,
      ctx,
    );
    await Promise.all(pendientes);
    expect(respuesta.status).toBe(200); // aunque falle el envío, Meta recibe su 200
    expect(error.mock.calls.some((llamada) => String(llamada[0]).includes('TOKEN DE WHATSAPP VENCIDO'))).toBe(true);
  });
});
