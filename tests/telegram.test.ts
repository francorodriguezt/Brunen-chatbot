import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Alerta } from '../src/alertas';
import {
  configTelegram,
  enviarAlerta,
  escaparHtml,
  esChatAutorizado,
  extraerAccionBoton,
  formatearAlerta,
  quitarBotones,
  responderBoton,
  secretoValido,
  telefonoLegible,
} from '../src/telegram';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Valores ficticios: ningún token ni teléfono real.
const CONFIG = { token: '123456:TOKEN-DE-PRUEBA', chatId: '777' };
const PEDIDO: Alerta = {
  tipo: 'pedido',
  telefono: '56911111111',
  nombre: 'Ana Prueba',
  resumen: '2 bidones de 20 L · Ñuñoa',
  motivos: [],
  idPedido: 'P261028-3K7Q9',
};

function stubTelegram(estado = 200) {
  const llamadas = vi.fn(async (_url: string, _init: RequestInit) => new Response('{"ok":true}', { status: estado }));
  vi.stubGlobal('fetch', llamadas);
  return llamadas;
}
const cuerpoDe = (llamadas: ReturnType<typeof stubTelegram>, i = 0) => JSON.parse((llamadas.mock.calls[i]?.[1] as RequestInit).body as string);

describe('configTelegram', () => {
  it('solo hay configuración si están el token y el chat', () => {
    expect(configTelegram({ TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: 'c' })).toEqual({ token: 't', chatId: 'c' });
    expect(configTelegram({ TELEGRAM_BOT_TOKEN: 't' })).toBeNull();
    expect(configTelegram({})).toBeNull();
  });
});

describe('formatearAlerta', () => {
  it('un pedido lleva el cliente, el contacto de WhatsApp y los botones Confirmar y Cambiar', () => {
    const { texto, botones } = formatearAlerta(PEDIDO);
    expect(texto).toBe(
      '<b>🟢 Pedido nuevo</b> · <code>P261028-3K7Q9</code>\nAna Prueba · <a href="https://wa.me/56911111111">+56 9 1111 1111</a>\n2 bidones de 20 L · Ñuñoa',
    );
    expect(botones).toEqual([
      [
        { text: '✅ Confirmar', callback_data: 'c:P261028-3K7Q9' },
        { text: '✏️ Cambiar', callback_data: 'x:P261028-3K7Q9' },
      ],
    ]);
  });

  it('los motivos de revisión y lo que escribió el cliente salen en el aviso', () => {
    const { texto } = formatearAlerta({ ...PEDIDO, tipo: 'pedido_revision', motivos: ['Cantidad inusual', 'Fecha por confirmar'], texto: 'quiero 25 de 20' });
    expect(texto).toContain('<b>🟡 Pedido para revisar</b>');
    expect(texto).toContain('⚠ Cantidad inusual\n⚠ Fecha por confirmar');
    expect(texto.endsWith('<i>“quiero 25 de 20”</i>')).toBe(true);
  });

  it('el texto del cliente y los nombres no pueden inyectar HTML', () => {
    const { texto } = formatearAlerta({ ...PEDIDO, nombre: 'Ana <b>x</b>', texto: '<a href="x">hola</a> & chao', resumen: 'a < b' });
    expect(texto).not.toContain('<b>x</b>');
    expect(texto).toContain('Ana &lt;b&gt;x&lt;/b&gt;');
    expect(texto).toContain('&lt;a href="x"&gt;hola&lt;/a&gt; &amp; chao');
    expect(texto).toContain('a &lt; b');
  });

  it('un reclamo o una pregunta no llevan botones de confirmación', () => {
    for (const tipo of ['reclamo', 'factura', 'pago', 'no_entendido', 'error', 'fuera_de_zona', 'envases'] as const) {
      expect(formatearAlerta({ ...PEDIDO, tipo }).botones).toEqual([]);
    }
  });

  it('un pedido de cliente nuevo también se puede confirmar', () => {
    expect(formatearAlerta({ ...PEDIDO, tipo: 'cliente_nuevo' }).botones).toHaveLength(1);
  });

  it('sin ID de pedido no hay botones (no habría qué confirmar)', () => {
    expect(formatearAlerta({ ...PEDIDO, idPedido: undefined }).botones).toEqual([]);
  });

  it('un mensaje larguísimo se recorta y el aviso no pasa el máximo de Telegram', () => {
    const { texto } = formatearAlerta({ ...PEDIDO, texto: 'x'.repeat(10_000), motivos: Array.from({ length: 200 }, () => 'motivo largo '.repeat(20)) });
    expect(texto.length).toBeLessThanOrEqual(4096);
  });

  it('el ID de cada botón cabe en los 64 bytes que admite Telegram', () => {
    const { botones } = formatearAlerta(PEDIDO);
    for (const boton of botones.flat()) expect(new TextEncoder().encode(boton.callback_data).length).toBeLessThanOrEqual(64);
  });
});

describe('telefonoLegible y escaparHtml', () => {
  it('da formato a los celulares chilenos y deja los otros con su +', () => {
    expect(telefonoLegible('56987654321')).toBe('+56 9 8765 4321');
    expect(telefonoLegible('5491123456789')).toBe('+5491123456789');
  });

  it('escapa solo los tres caracteres que exige Telegram', () => {
    expect(escaparHtml('a & b < c > d "e"')).toBe('a &amp; b &lt; c &gt; d "e"');
  });
});

describe('enviarAlerta', () => {
  it('envía el aviso al chat de la operadora, con los botones', async () => {
    const llamadas = stubTelegram();
    expect(await enviarAlerta(CONFIG, PEDIDO)).toBe(true);
    expect(llamadas.mock.calls[0]?.[0]).toBe('https://api.telegram.org/bot123456:TOKEN-DE-PRUEBA/sendMessage');
    expect(cuerpoDe(llamadas)).toMatchObject({
      chat_id: '777',
      parse_mode: 'HTML',
      disable_web_page_preview: true,
      reply_markup: { inline_keyboard: [[{ callback_data: 'c:P261028-3K7Q9' }, { callback_data: 'x:P261028-3K7Q9' }]] },
    });
  });

  it('un aviso sin botones no manda teclado', async () => {
    const llamadas = stubTelegram();
    await enviarAlerta(CONFIG, { ...PEDIDO, tipo: 'reclamo' });
    expect(cuerpoDe(llamadas).reply_markup).toBeUndefined();
  });

  it('sin configuración no hace nada', async () => {
    const llamadas = stubTelegram();
    expect(await enviarAlerta(null, PEDIDO)).toBe(false);
    expect(llamadas).not.toHaveBeenCalled();
  });

  it('si Telegram rechaza el aviso devuelve false y el log no lleva el token ni el contenido', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubTelegram(400);
    expect(await enviarAlerta(CONFIG, { ...PEDIDO, texto: 'mensaje secreto del cliente' })).toBe(false);
    expect(String(error.mock.calls[0]?.[0])).toBe('Telegram sendMessage respondió 400');
    expect(JSON.stringify(error.mock.calls)).not.toContain('TOKEN-DE-PRUEBA');
    expect(JSON.stringify(error.mock.calls)).not.toContain('secreto');
  });

  it('si falla la red o se agota el tiempo, no lanza errores', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new DOMException('timeout', 'TimeoutError');
    }));
    expect(await enviarAlerta(CONFIG, PEDIDO)).toBe(false);
    expect(JSON.stringify(error.mock.calls)).not.toContain('TOKEN-DE-PRUEBA');
  });
});

describe('extraerAccionBoton', () => {
  const update = (data: string, extra: Record<string, unknown> = {}) => ({
    update_id: 1,
    callback_query: { id: 'cb1', data, from: { id: 5, first_name: 'Constanza' }, message: { message_id: 42, chat: { id: 777 } }, ...extra },
  });

  it('lee el botón Confirmar y quién lo tocó', () => {
    expect(extraerAccionBoton(update('c:P261028-3K7Q9'))).toEqual({
      accion: 'confirmar',
      idPedido: 'P261028-3K7Q9',
      quien: 'Constanza',
      chatId: '777',
      mensajeId: 42,
      callbackId: 'cb1',
    });
  });

  it('lee el botón Cambiar', () => {
    expect(extraerAccionBoton(update('x:P261028-3K7Q9'))?.accion).toBe('cambiar');
  });

  it('usa el nombre de usuario si no hay nombre, y un nombre genérico si no hay ninguno', () => {
    expect(extraerAccionBoton(update('c:P261028-3K7Q9', { from: { username: 'cons' } }))?.quien).toBe('cons');
    expect(extraerAccionBoton(update('c:P261028-3K7Q9', { from: {} }))?.quien).toBe('operadora');
  });

  it('descarta lo que no es un botón nuestro', () => {
    expect(extraerAccionBoton(null)).toBeNull();
    expect(extraerAccionBoton({ message: { text: 'hola' } })).toBeNull();
    expect(extraerAccionBoton(update('otra cosa'))).toBeNull();
    expect(extraerAccionBoton(update('c:no-es-un-id'))).toBeNull();
    expect(extraerAccionBoton(update('c:P261028-3K7Q9; DROP'))).toBeNull();
    expect(extraerAccionBoton(update('c:P261028-3K7Q9', { message: undefined }))).toBeNull();
  });
});

describe('seguridad de los botones', () => {
  it('solo se obedecen los botones tocados en el chat de la operadora', () => {
    const accion = { accion: 'confirmar' as const, idPedido: 'P261028-3K7Q9', quien: 'x', chatId: '777', mensajeId: 1, callbackId: 'c' };
    expect(esChatAutorizado(accion, CONFIG)).toBe(true);
    expect(esChatAutorizado({ ...accion, chatId: '999' }, CONFIG)).toBe(false);
  });

  it('el secreto del webhook se compara completo y no acepta vacío', () => {
    expect(secretoValido('secreto-largo', 'secreto-largo')).toBe(true);
    expect(secretoValido('otro', 'secreto-largo')).toBe(false);
    expect(secretoValido(null, 'secreto-largo')).toBe(false);
    expect(secretoValido('', '')).toBe(false);
  });
});

describe('responderBoton y quitarBotones', () => {
  const accion = { accion: 'confirmar' as const, idPedido: 'P261028-3K7Q9', quien: 'Constanza', chatId: '777', mensajeId: 42, callbackId: 'cb1' };

  it('avisa a Telegram que el botón se recibió', async () => {
    const llamadas = stubTelegram();
    expect(await responderBoton(CONFIG, accion, 'Confirmado')).toBe(true);
    expect(String(llamadas.mock.calls[0]?.[0])).toMatch(/\/answerCallbackQuery$/);
    expect(cuerpoDe(llamadas)).toEqual({ callback_query_id: 'cb1', text: 'Confirmado' });
  });

  it('quita los botones del aviso para que no se toquen dos veces', async () => {
    const llamadas = stubTelegram();
    expect(await quitarBotones(CONFIG, accion)).toBe(true);
    expect(String(llamadas.mock.calls[0]?.[0])).toMatch(/\/editMessageReplyMarkup$/);
    expect(cuerpoDe(llamadas)).toEqual({ chat_id: '777', message_id: 42, reply_markup: { inline_keyboard: [] } });
  });
});
