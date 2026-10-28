import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Contexto, type Env } from '../src/index';
import { firmarHmacSha256, verificarFirma } from '../src/firma';
import { enmascararTelefono, enviarTexto, ErrorWhatsApp, extraerMensajes } from '../src/whatsapp';

// Todos los valores son ficticios: ningún token ni teléfono real entra al repo.
const ENV: Env = {
  WHATSAPP_VERIFY_TOKEN: 'token-verificacion-prueba',
  WHATSAPP_APP_SECRET: 'secreto-app-prueba',
  WHATSAPP_TOKEN: 'token-acceso-prueba',
  WHATSAPP_PHONE_NUMBER_ID: '000000000000000',
  GRAPH_API_VERSION: 'v99.0',
  NUMEROS_PERMITIDOS: '56900000001',
};

function payloadTexto(de: string, texto: string, id = 'wamid.PRUEBA1') {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA_ID',
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              messages: [{ id, from: de, timestamp: '1793000000', type: 'text', text: { body: texto } }],
            },
          },
        ],
      },
    ],
  };
}

function contexto() {
  const pendientes: Promise<unknown>[] = [];
  const ctx: Contexto = { waitUntil: (p) => pendientes.push(p) };
  return { ctx, terminar: () => Promise.all(pendientes) };
}

async function postFirmado(payload: unknown, secreto = ENV.WHATSAPP_APP_SECRET) {
  const cuerpo = JSON.stringify(payload);
  const firma = await firmarHmacSha256(cuerpo, secreto);
  return new Request('https://bot.example/webhook', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${firma}` },
    body: cuerpo,
  });
}

afterEach(() => vi.unstubAllGlobals());

describe('verificación del webhook (GET)', () => {
  it('devuelve el challenge con el token correcto', async () => {
    const url = 'https://bot.example/webhook?hub.mode=subscribe&hub.verify_token=token-verificacion-prueba&hub.challenge=12345';
    const res = await worker.fetch(new Request(url), ENV, contexto().ctx);
    expect(res.status).toBe(200);
    expect(await res.text()).toBe('12345');
  });

  it('rechaza un token incorrecto', async () => {
    const url = 'https://bot.example/webhook?hub.mode=subscribe&hub.verify_token=otro&hub.challenge=12345';
    const res = await worker.fetch(new Request(url), ENV, contexto().ctx);
    expect(res.status).toBe(403);
  });
});

describe('firma X-Hub-Signature-256', () => {
  it('acepta la firma correcta y rechaza una alterada', async () => {
    const cuerpo = '{"hola":"mundo"}';
    const firma = await firmarHmacSha256(cuerpo, 'secreto');
    expect(await verificarFirma(cuerpo, `sha256=${firma}`, 'secreto')).toBe(true);
    expect(await verificarFirma(cuerpo + ' ', `sha256=${firma}`, 'secreto')).toBe(false);
    expect(await verificarFirma(cuerpo, `sha256=${firma}`, 'otro-secreto')).toBe(false);
    expect(await verificarFirma(cuerpo, null, 'secreto')).toBe(false);
  });

  it('el webhook responde 401 si la firma no calza', async () => {
    const req = await postFirmado(payloadTexto('56900000001', 'hola'), 'secreto-falso');
    const res = await worker.fetch(req, ENV, contexto().ctx);
    expect(res.status).toBe(401);
  });
});

describe('recepción de mensajes (POST)', () => {
  it('responde 200 y contesta lo que entendió a un número de prueba', async () => {
    const fetchFalso = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);
    const { ctx, terminar } = contexto();

    const res = await worker.fetch(await postFirmado(payloadTexto('56900000001', '2 bidones de 20')), ENV, ctx);
    expect(res.status).toBe(200);
    await terminar();

    expect(fetchFalso).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFalso.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://graph.facebook.com/v99.0/000000000000000/messages');
    const enviado = JSON.parse(String(init.body));
    expect(enviado.to).toBe('56900000001');
    // Un pedido suma la fecha de entrega propuesta (la fecha exacta depende del día en que corra la prueba).
    expect(enviado.text.body).toMatch(/^Modo prueba\. Entendí: pedido · 2 de 20 L · entrega propuesta /);
  });

  it('modo prueba: no le responde a números fuera de la lista', async () => {
    const fetchFalso = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);
    const { ctx, terminar } = contexto();

    const res = await worker.fetch(await postFirmado(payloadTexto('56911112222', 'hola')), ENV, ctx);
    expect(res.status).toBe(200);
    await terminar();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('BOT_ACTIVO=NO apaga las respuestas', async () => {
    const fetchFalso = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);
    const { ctx, terminar } = contexto();

    await worker.fetch(await postFirmado(payloadTexto('56900000001', 'hola')), { ...ENV, BOT_ACTIVO: 'NO' }, ctx);
    await terminar();
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('un error de Meta no rompe la respuesta 200 al webhook', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"x"}', { status: 500 })));
    const errores = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { ctx, terminar } = contexto();

    const res = await worker.fetch(await postFirmado(payloadTexto('56900000001', 'hola')), ENV, ctx);
    expect(res.status).toBe(200);
    await terminar();
    expect(errores).toHaveBeenCalled();
    errores.mockRestore();
  });

  it('ignora notificaciones de estado (statuses) sin mensajes', () => {
    const soloEstados = {
      object: 'whatsapp_business_account',
      entry: [{ changes: [{ field: 'messages', value: { statuses: [{ id: 'wamid.X', status: 'delivered' }] } }] }],
    };
    expect(extraerMensajes(soloEstados)).toEqual([]);
  });
});

describe('versión de la Graph API', () => {
  it('rechaza el valor de relleno v00.0 de wrangler.toml sin llamar a Meta', async () => {
    const fetchFalso = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', fetchFalso);
    const config = { token: 't', phoneNumberId: '0', graphApiVersion: 'v00.0' };
    await expect(enviarTexto(config, '56900000001', 'hola')).rejects.toThrow(ErrorWhatsApp);
    expect(fetchFalso).not.toHaveBeenCalled();
  });

  it('rechaza formatos mal escritos', async () => {
    for (const version of ['v0.5', '22.0', 'v22', 'V22.0', ' v22.0']) {
      const config = { token: 't', phoneNumberId: '0', graphApiVersion: version };
      await expect(enviarTexto(config, '56900000001', 'hola')).rejects.toThrow(ErrorWhatsApp);
    }
  });
});

describe('privacidad en logs', () => {
  it('enmascara el teléfono', () => {
    expect(enmascararTelefono('56912345678')).toBe('*******5678');
  });
});

describe('rutas', () => {
  it('/salud responde ok', async () => {
    const res = await worker.fetch(new Request('https://bot.example/salud'), ENV, contexto().ctx);
    expect(await res.text()).toBe('ok');
  });

  it('otra ruta -> 404', async () => {
    const res = await worker.fetch(new Request('https://bot.example/otra'), ENV, contexto().ctx);
    expect(res.status).toBe(404);
  });
});
