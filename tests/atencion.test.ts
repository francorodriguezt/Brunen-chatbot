import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { olvidarFallas } from '../src/atencion';
import type { BaseDatos } from '../src/almacen';
import { firmarHmacSha256 } from '../src/firma';
import { olvidarTokens } from '../src/google';
import { olvidarHojas } from '../src/hojas';
import worker, { procesarMensaje, type Contexto, type Env } from '../src/index';
import { RepositorioD1 } from '../src/repositorio';
import { FERIADOS_2026_2027, crearBaseSqlite, entornoGoogle, stubMundo } from './ayudas';

// Miércoles 28 de octubre de 2026, 10:00 en Chile. Solo se falsea la fecha: las esperas siguen siendo reales (de 0 ms).
const HORA = new Date('2026-10-28T10:00:00-03:00');
const CLIENTE = '56900000001'; // el número de prueba
const SECRETO = 'secreto-app-prueba';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HORA);
  vi.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
  olvidarHojas();
  olvidarTokens();
  olvidarFallas();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const HOJAS = {
  CLIENTES: [
    ['Telefono', 'Nombre', 'Direccion', 'Comuna', 'Tipo'],
    [CLIENTE, 'Ana Prueba', 'Calle Falsa 123', 'Ñuñoa', 'normal'],
  ],
  PRECIOS: [
    ['Tipo', 'Desde', 'Hasta', 'Precio'],
    ['20L', '1', '1', '4500'], ['20L', '2', '3', '3300'], ['20L', '4', '', '2750'],
    ['12L', '1', '1', '2500'], ['12L', '2', '', '2400'], ['10L', '1', '', '2200'],
  ],
  FERIADOS: [...FERIADOS_2026_2027].map((fecha) => [fecha, 'Feriado']),
  CONFIGURACION: [['BOT_ACTIVO', 'SI'], ['ESTADO_SERVICIO', 'normal'], ['MENSAJE_EXCEPCION', '']],
};

async function entorno(cambios: Partial<Env> = {}): Promise<Env & { DB: ReturnType<typeof crearBaseSqlite> }> {
  return {
    WHATSAPP_VERIFY_TOKEN: 'v',
    WHATSAPP_APP_SECRET: SECRETO,
    WHATSAPP_TOKEN: 't',
    WHATSAPP_PHONE_NUMBER_ID: '000000000000000',
    GRAPH_API_VERSION: 'v99.0',
    NUMEROS_PERMITIDOS: CLIENTE,
    FLUJO_PEDIDO: 'SI',
    ESPERA_AGRUPADOR_MS: '0',
    DB: crearBaseSqlite(),
    ...(await entornoGoogle()),
    ...cambios,
  } as Env & { DB: ReturnType<typeof crearBaseSqlite> };
}

let contador = 0;
const texto = (cuerpo: string, de = CLIENTE) => ({ id: `wamid.A${++contador}`, from: de, timestamp: '1793000000', type: 'text', text: { body: cuerpo } });

function payload(...mensajes: Array<Record<string, unknown>>) {
  return {
    object: 'whatsapp_business_account',
    entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', messages: mensajes } }] }],
  };
}

/** Un aviso de Meta firmado, procesado hasta el final (incluido lo que corre en segundo plano). */
async function enviarAviso(env: Env, ...mensajes: Array<Record<string, unknown>>) {
  const cuerpo = JSON.stringify(payload(...mensajes));
  const firma = await firmarHmacSha256(cuerpo, SECRETO);
  const pendientes: Promise<unknown>[] = [];
  const ctx: Contexto = { waitUntil: (p) => pendientes.push(p) };
  const respuesta = await worker.fetch(
    new Request('https://bot.example/webhook', { method: 'POST', headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${firma}` }, body: cuerpo }),
    env,
    ctx,
  );
  await Promise.all(pendientes);
  return respuesta;
}

type Fila = Record<string, unknown>;
const pedidosEn = (env: { DB: ReturnType<typeof crearBaseSqlite> }) => env.DB.sql('SELECT id, telefono, nombre, estado, total FROM pedidos') as Fila[];
const avisosEn = (env: { DB: ReturnType<typeof crearBaseSqlite> }) => env.DB.sql('SELECT tipo, telefono, estado FROM avisos ORDER BY id') as Fila[];

describe('el flujo de pedido conectado al Worker', () => {
  it('un pedido de un cliente conocido: una respuesta, un pedido y un aviso en D1, y nada por Telegram', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno({ TELEGRAM_BOT_TOKEN: '1:TOKEN', TELEGRAM_CHAT_ID: '777' });
    expect((await enviarAviso(env, texto('quiero 2 de 20 para el viernes'))).status).toBe(200);

    expect(mundo.enviados).toHaveLength(1);
    expect(mundo.enviados[0]?.texto).toBe(
      'Anotamos tu pedido:\n- 2 bidones de 20 L: $6.600\nEntrega estimada: viernes 30 de octubre.\nSi algo cambia, te avisamos por aquí.',
    );
    expect(pedidosEn(env)).toEqual([expect.objectContaining({ telefono: CLIENTE, nombre: 'Ana Prueba', estado: 'Pendiente_Confirmacion', total: 6600 })]);
    expect(avisosEn(env)).toEqual([{ tipo: 'pedido', telefono: CLIENTE, estado: 'abierto' }]);
    expect(mundo.telegram).toEqual([]); // un pedido normal no es urgente
  });

  it('el mismo mensaje procesado dos veces (reintento de Meta) deja un solo pedido, un solo aviso y una sola respuesta', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    const mensaje = texto('quiero 2 de 20');
    await enviarAviso(env, mensaje);
    await enviarAviso(env, mensaje);
    expect(pedidosEn(env)).toHaveLength(1);
    expect(avisosEn(env)).toHaveLength(1);
    expect(mundo.enviados).toHaveLength(1);
  });

  it('un reclamo: respuesta inmediata, aviso en D1 y Telegram, porque es urgente', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno({ TELEGRAM_BOT_TOKEN: '1:TOKEN', TELEGRAM_CHAT_ID: '777' });
    await enviarAviso(env, texto('el bidón de ayer venía con el sello roto'));

    expect(mundo.enviados[0]?.texto).toContain('Lamentamos el inconveniente');
    expect(avisosEn(env)).toEqual([{ tipo: 'reclamo', telefono: CLIENTE, estado: 'abierto' }]);
    expect(pedidosEn(env)).toEqual([]);
    expect(mundo.telegram).toHaveLength(1);
    expect(mundo.telegram[0]?.metodo).toBe('sendMessage');
    expect(String(mundo.telegram[0]?.cuerpo.text)).toContain('Reclamo');
    expect(String(mundo.telegram[0]?.cuerpo.text)).toContain('el bidón de ayer venía con el sello roto');
  });

  it('sin Telegram configurado, un reclamo igual se guarda y se responde', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await enviarAviso(env, texto('el bidón llegó roto'));
    expect(mundo.enviados).toHaveLength(1);
    expect(avisosEn(env)).toHaveLength(1);
    expect(mundo.telegram).toEqual([]);
  });

  it('si Telegram falla, el cliente igual recibe su respuesta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const mundo = stubMundo({ hojas: HOJAS, telegram: 500 });
    const env = await entorno({ TELEGRAM_BOT_TOKEN: '1:TOKEN', TELEGRAM_CHAT_ID: '777' });
    await enviarAviso(env, texto('el bidón llegó roto'));
    expect(mundo.enviados).toHaveLength(1);
  });

  it('un pedido que pide revisión queda como aviso para revisar y no promete el precio', async () => {
    const mundo = stubMundo({ hojas: { ...HOJAS, CLIENTES: [HOJAS.CLIENTES[0] as string[], [CLIENTE, 'Empresa Demo', 'Av. Inventada 456', 'Las Condes', 'empresa']] } });
    const env = await entorno();
    await enviarAviso(env, texto('quiero 5 de 20'));
    expect(mundo.enviados[0]?.texto).not.toContain('$');
    expect(avisosEn(env)).toEqual([{ tipo: 'pedido_revision', telefono: CLIENTE, estado: 'abierto' }]);
    expect(pedidosEn(env)[0]).toMatchObject({ estado: 'Pendiente_Confirmacion' });
  });

  it('un cliente que no está en la hoja: se anota el pedido y una persona coordina', async () => {
    const mundo = stubMundo({ hojas: { ...HOJAS, CLIENTES: [HOJAS.CLIENTES[0] as string[]] } });
    const env = await entorno();
    await enviarAviso(env, texto('quiero 2 de 20'));
    expect(mundo.enviados[0]?.texto).toContain('Como es tu primer pedido');
    expect(avisosEn(env)[0]?.tipo).toBe('cliente_nuevo');
    expect(pedidosEn(env)[0]).toMatchObject({ nombre: '', estado: 'Pendiente_Confirmacion' });
  });

  it('si no se puede leer la hoja de clientes: aviso de error por Telegram, nada se promete y no se anota el pedido', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const mundo = stubMundo({ hojas: { ...HOJAS, CLIENTES: 'falla' } });
    const env = await entorno({ TELEGRAM_BOT_TOKEN: '1:TOKEN', TELEGRAM_CHAT_ID: '777' });
    await enviarAviso(env, texto('quiero 2 de 20'));
    expect(mundo.enviados[0]?.texto).toBe('Recibimos tu mensaje. Una persona del equipo te responderá en breve.');
    expect(pedidosEn(env)).toEqual([]);
    expect(avisosEn(env)).toEqual([{ tipo: 'error', telefono: CLIENTE, estado: 'abierto' }]);
    expect(mundo.telegram).toHaveLength(1);
  });
});

describe('mensajes seguidos del mismo cliente', () => {
  it('dos mensajes en el mismo aviso de Meta reciben una sola respuesta y forman un solo pedido', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await enviarAviso(env, texto('quiero 4 bidones'), texto('de 20'));
    expect(mundo.enviados).toHaveLength(1);
    expect(mundo.enviados[0]?.texto).toContain('- 4 bidones de 20 L: $11.000');
    expect(pedidosEn(env)).toHaveLength(1);
    expect(env.DB.sql('SELECT * FROM mensajes_pendientes')).toEqual([]); // no queda ningún texto guardado
  });

  it('un mensaje de otro número en el mismo aviso se atiende aparte', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno({ NUMEROS_PERMITIDOS: `${CLIENTE},56900000002` });
    await enviarAviso(env, texto('hola'), texto('hola', '56900000002'));
    expect(mundo.enviados.map((e) => e.para).sort()).toEqual([CLIENTE, '56900000002']);
  });

  it('la pregunta del bot y la respuesta corta en avisos distintos: el pedido a medias se recuerda', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await enviarAviso(env, texto('quiero 4 bidones'));
    expect(mundo.enviados[0]?.texto).toBe('¿De cuántos litros son los bidones: 20, 12 o 10?');
    await enviarAviso(env, texto('20'));
    expect(mundo.enviados[1]?.texto).toContain('- 4 bidones de 20 L: $11.000');
    expect(pedidosEn(env)).toHaveLength(1);
  });
});

describe('lo que no es texto', () => {
  it('un audio: se pide amablemente que escriban, sin aviso', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await enviarAviso(env, { id: 'wamid.AU1', from: CLIENTE, timestamp: '1793000000', type: 'audio' });
    expect(mundo.enviados[0]?.texto).toBe('Por ahora no puedo escuchar audios. ¿Me lo escribes, por favor?');
    expect(avisosEn(env)).toEqual([]);
  });

  it('una imagen: se responde y queda un aviso de posible comprobante', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await enviarAviso(env, { id: 'wamid.IM1', from: CLIENTE, timestamp: '1793000000', type: 'image' });
    expect(mundo.enviados[0]?.texto).toBe('Recibimos tu imagen. Una persona del equipo la revisará.');
    expect(avisosEn(env)).toEqual([{ tipo: 'pago', telefono: CLIENTE, estado: 'abierto' }]);
  });

  it('una reacción o un sticker no se responden ni generan aviso', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await enviarAviso(env, { id: 'wamid.RE1', from: CLIENTE, timestamp: '1793000000', type: 'reaction' }, { id: 'wamid.ST1', from: CLIENTE, timestamp: '1793000000', type: 'sticker' });
    expect(mundo.enviados).toEqual([]);
    expect(avisosEn(env)).toEqual([]);
  });

  it('otro tipo (por ejemplo una ubicación) lo ve una persona', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await enviarAviso(env, { id: 'wamid.LO1', from: CLIENTE, timestamp: '1793000000', type: 'location' });
    expect(mundo.enviados[0]?.texto).toBe('Recibimos tu mensaje. Una persona del equipo te responderá en breve.');
    expect(avisosEn(env)).toEqual([{ tipo: 'escalamiento', telefono: CLIENTE, estado: 'abierto' }]);
  });
});

describe('cuando algo falla por dentro', () => {
  /** Una base que falla al guardar pedidos y avisos, como si D1 estuviera caída para escribir. */
  function dbQueFalla(db: BaseDatos): BaseDatos {
    return {
      prepare: (sql) => {
        const real = db.prepare(sql);
        return {
          bind: (...valores) => ({
            run: async () => {
              if (/INSERT (OR IGNORE )?INTO (pedidos|avisos)/.test(sql)) throw new Error('D1 no responde');
              return real.bind(...valores).run();
            },
          }),
        };
      },
    };
  }

  it('si no se puede guardar el pedido, al cliente no se le dice que quedó anotado y la falla sale por Telegram', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const mundo = stubMundo({ hojas: HOJAS });
    const base = await entorno({ TELEGRAM_BOT_TOKEN: '1:TOKEN', TELEGRAM_CHAT_ID: '777' });
    const env = { ...base, DB: dbQueFalla(base.DB) } as Env;
    await enviarAviso(env, texto('quiero 2 de 20'));
    expect(mundo.enviados).toHaveLength(1);
    expect(mundo.enviados[0]?.texto).toBe('Recibimos tu mensaje. Una persona del equipo te responderá en breve.');
    expect(mundo.telegram).toHaveLength(1);
    expect(String(mundo.telegram[0]?.cuerpo.text)).toContain('No se pudo guardar en D1');
  });

  it('si WhatsApp rechaza el token: el mensaje se suelta para el reintento, el pedido ya quedó guardado y se avisa por Telegram una sola vez por hora', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const mundo = stubMundo({ hojas: HOJAS, whatsapp: 401 });
    const env = await entorno({ TELEGRAM_BOT_TOKEN: '1:TOKEN', TELEGRAM_CHAT_ID: '777' });
    await enviarAviso(env, texto('quiero 2 de 20'));
    await enviarAviso(env, texto('quiero 3 de 20'));
    expect(pedidosEn(env)).toHaveLength(2); // se guardan antes de responder
    const fallas = mundo.telegram.filter((t) => String(t.cuerpo.text).includes('token de WhatsApp'));
    expect(fallas).toHaveLength(1);
    expect(avisosEn(env).filter((a) => a.tipo === 'error')).toHaveLength(1);
  });

  it('tras el fallo del envío, el reintento de Meta no duplica el pedido y esta vez sí responde', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await entorno();
    const mensaje = texto('quiero 2 de 20');
    stubMundo({ hojas: HOJAS, whatsapp: 500 });
    await enviarAviso(env, mensaje);
    olvidarHojas();
    olvidarTokens();
    const mundo = stubMundo({ hojas: HOJAS });
    await enviarAviso(env, mensaje);
    expect(pedidosEn(env)).toHaveLength(1);
    expect(avisosEn(env)).toHaveLength(1);
    expect(mundo.enviados).toHaveLength(1);
  });
});

describe('el interruptor y los límites de la prueba', () => {
  it('sin FLUJO_PEDIDO el bot sigue en modo prueba y no escribe en D1', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno({ FLUJO_PEDIDO: undefined });
    await enviarAviso(env, texto('quiero 2 de 20'));
    expect(mundo.enviados[0]?.texto).toMatch(/^Modo prueba\. Entendí: pedido/);
    expect(pedidosEn(env)).toEqual([]);
    expect(avisosEn(env)).toEqual([]);
  });

  it('con FLUJO_PEDIDO pero sin base de datos, sigue en modo prueba', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = { ...(await entorno()), DB: undefined } as Env;
    await enviarAviso(env, texto('hola'));
    expect(mundo.enviados[0]?.texto).toMatch(/^Modo prueba\./);
  });

  it('un número que no es de prueba no recibe respuesta ni queda nada guardado de lo que escribió', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await enviarAviso(env, texto('quiero 2 de 20', '56999999999'));
    expect(mundo.enviados).toEqual([]);
    expect(pedidosEn(env)).toEqual([]);
    expect(env.DB.sql('SELECT * FROM mensajes_pendientes')).toEqual([]);
  });

  it('BOT_ACTIVO = NO apaga también el flujo', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno({ BOT_ACTIVO: 'NO' });
    await enviarAviso(env, texto('quiero 2 de 20'));
    expect(mundo.enviados).toEqual([]);
    expect(pedidosEn(env)).toEqual([]);
  });

  it('procesarMensaje de un solo mensaje espera por su cuenta y responde', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    const r = await procesarMensaje({ id: 'wamid.SOLO', de: CLIENTE, timestamp: 1793000000, tipo: 'text', texto: 'hola' }, env);
    expect(r).toEqual({ resultado: 'respondido', intencion: 'saludo' });
    expect(mundo.enviados[0]?.texto).toMatch(/^¡Hola Ana!/);
  });

  it('un "gracias" no se responde y queda anotado como "sin respuesta" en la planilla', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await enviarAviso(env, texto('ok perfecto gracias'));
    expect(mundo.enviados).toEqual([]);
    expect(mundo.anotadasEnPlanilla.some((fila) => fila.includes('sin_respuesta'))).toBe(true);
  });

  it('el mensaje que se juntó con otro queda anotado como "agrupado" en la planilla', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await enviarAviso(env, texto('quiero 4 bidones'), texto('de 20'));
    expect(mundo.anotadasEnPlanilla.some((fila) => fila.includes('agrupado'))).toBe(true);
  });
});

describe('lo que ve el panel después', () => {
  it('lo guardado por el bot se puede confirmar con el repositorio, que es lo que usa el panel', async () => {
    stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await enviarAviso(env, texto('quiero 2 de 20'));
    const repositorio = new RepositorioD1(env.DB);
    const [pedido] = await repositorio.listarPedidos({ estados: ['Pendiente_Confirmacion'] });
    expect(pedido?.lineas).toEqual([{ tipo: '20L', cantidad: 2, precioUnitario: 3300, subtotal: 6600 }]);
    const confirmado = await repositorio.cambiarEstado(pedido?.id ?? '', 'Confirmado', 'operadora@brunen.test', 1793000100);
    expect(confirmado).toMatchObject({ ok: true, valor: { estado: 'Confirmado', confirmadoPor: 'operadora@brunen.test' } });
    expect(await repositorio.resumen()).toMatchObject({ porConfirmar: 0, avisosAbiertos: 1 });
  });
});
