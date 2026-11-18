import { afterEach, describe, expect, it, vi } from 'vitest';
import { MAXIMO_AUDIO_BYTES, pistaDePedido, reenviarComprobante, transcribir, type IA } from '../src/medios';
import { descargarMedio, extraerMensajes } from '../src/whatsapp';

afterEach(() => vi.unstubAllGlobals());

// Todo ficticio.
const payload = (mensaje: Record<string, unknown>) => ({
  object: 'whatsapp_business_account',
  entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'wamid.X', from: '56911111111', timestamp: '1', ...mensaje }] } }] }],
});

describe('fotos, archivos y audios del cliente (D68)', () => {
  it('el mensaje trae el identificador del medio y el texto que escribió junto a la foto', () => {
    const [foto] = extraerMensajes(payload({ type: 'image', image: { id: 'MEDIA1', mime_type: 'image/jpeg', caption: 'ya transferí' } }));
    expect(foto).toMatchObject({ tipo: 'image', medio: { id: 'MEDIA1', mime: 'image/jpeg' }, pie: 'ya transferí' });
    const [pdf] = extraerMensajes(payload({ type: 'document', document: { id: 'MEDIA2', mime_type: 'application/pdf', filename: 'comprobante.pdf' } }));
    expect(pdf?.medio).toEqual({ id: 'MEDIA2', mime: 'application/pdf', nombre: 'comprobante.pdf' });
    const [audio] = extraerMensajes(payload({ type: 'audio', audio: { id: 'MEDIA3', mime_type: 'audio/ogg; codecs=opus' } }));
    expect(audio?.medio?.id).toBe('MEDIA3');
  });

  it('descarga el medio en dos pasos con el token, y rechaza uno demasiado grande', async () => {
    const llamadas: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      llamadas.push(url);
      if (url.includes('graph.facebook.com')) return new Response(JSON.stringify({ url: 'https://lookaside.example/archivo', mime_type: 'image/jpeg', file_size: 3 }));
      return new Response(new Uint8Array([1, 2, 3]));
    });
    const config = { token: 't', phoneNumberId: 'p', graphApiVersion: 'v99.0' };
    const medio = await descargarMedio(config, 'MEDIA1');
    expect(medio?.mime).toBe('image/jpeg');
    expect(medio?.datos.byteLength).toBe(3);
    expect(llamadas).toEqual(['https://graph.facebook.com/v99.0/MEDIA1', 'https://lookaside.example/archivo']);
    expect(await descargarMedio(config, 'MEDIA1', 2)).toBeNull();
  });

  it('transcribe con Whisper en Workers AI, en español; si falla o es muy largo, no hay texto', async () => {
    const entradas: Array<Record<string, unknown>> = [];
    const ia: IA = { run: async (_m, entrada) => (entradas.push(entrada), { text: ' Hola, quiero 3 de 20 para mañana ' }) };
    expect(await transcribir(ia, new Uint8Array([104, 111, 108, 97]).buffer)).toBe('Hola, quiero 3 de 20 para mañana');
    expect(entradas[0]).toEqual({ audio: 'aG9sYQ==', language: 'es' });
    expect(await transcribir({ run: async () => { throw new Error('sin cupo'); } }, new Uint8Array([1]).buffer)).toBeNull();
    expect(await transcribir(ia, new ArrayBuffer(MAXIMO_AUDIO_BYTES + 1))).toBeNull();
    expect(await transcribir(undefined, new Uint8Array([1]).buffer)).toBeNull();
  });

  it('si el audio parece un pedido, el aviso lo dice', () => {
    expect(pistaDePedido('hola, quiero 3 de 20 para mañana')).toBe('Parece un pedido: 3 bidones de 20 L, para mañana.');
    expect(pistaDePedido('me llegó el bidón roto')).toBeNull();
  });

  it('reenvía el comprobante al grupo como foto, con el nombre y lo que escribió el cliente (escapado)', async () => {
    let enviado: { url: string; cuerpo: FormData } | null = null;
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => ((enviado = { url, cuerpo: init.body as FormData }), new Response('{}')));
    const ok = await reenviarComprobante({ token: 'T', chatId: '-100' }, { datos: new Uint8Array([1]).buffer, mime: 'image/jpeg' }, { telefono: '56911111111', nombre: 'Ana <Prueba>', pie: 'pagué' });
    expect(ok).toBe(true);
    expect(enviado!.url).toBe('https://api.telegram.org/botT/sendPhoto');
    const pie = String(enviado!.cuerpo.get('caption'));
    expect(pie).toContain('Ana &lt;Prueba&gt;');
    expect(pie).toContain('revisa que la transferencia sea real'.replace('revisa', 'Revisa'));
    expect(enviado!.cuerpo.get('photo')).toBeInstanceOf(Blob);
  });

  it('un PDF va como documento, y sin Telegram configurado no se manda nada', async () => {
    let metodo = '';
    vi.stubGlobal('fetch', async (url: string) => ((metodo = url.split('/').pop() ?? ''), new Response('{}')));
    await reenviarComprobante({ token: 'T', chatId: '-100' }, { datos: new Uint8Array([1]).buffer, mime: 'application/pdf' }, { telefono: '56911111111' });
    expect(metodo).toBe('sendDocument');
    expect(await reenviarComprobante(null, { datos: new Uint8Array([1]).buffer, mime: 'image/jpeg' }, { telefono: '56911111111' })).toBe(false);
  });
});
