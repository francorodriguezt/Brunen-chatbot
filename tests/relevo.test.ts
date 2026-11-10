import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BaseDatos } from '../src/almacen';
import { olvidarFallas } from '../src/atencion';
import { firmarHmacSha256 } from '../src/firma';
import { olvidarTokens } from '../src/google';
import { olvidarHojas } from '../src/hojas';
import worker, { type Contexto, type Env } from '../src/index';
import { anotarEsperaDelCliente, cerrarPausasVencidas, conversacionTomada, pausaPorPersona, registrarEcos } from '../src/relevo';
import { tareaProgramada } from '../src/vigia';
import { extraerEcos, extraerMensajes } from '../src/whatsapp';
import { FERIADOS_2026_2027, crearBaseSqlite, entornoGoogle, stubMundo } from './ayudas';

// Martes 10 de noviembre de 2026, 10:00 en Chile. Todos los teléfonos son ficticios.
const HORA = new Date('2026-11-10T10:00:00-03:00');
const T = Math.floor(HORA.getTime() / 1000);
const UNA_HORA = 3600;
const NEGOCIO = '56900000000';
const ANA = '56900000001';
const PEDRO = '56900000002';
const SECRETO = 'secreto-app-prueba';

type Base = ReturnType<typeof crearBaseSqlite>;

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

let contador = 0;

/** El aviso que Meta manda cuando una persona escribe desde la app WhatsApp Business (campo `smb_message_echoes`). */
function payloadEco(opciones: { para?: string; contactos?: unknown[]; mensaje?: Record<string, unknown>; hora?: number } = {}) {
  const para = 'para' in opciones ? opciones.para : ANA;
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: 'WABA',
        changes: [
          {
            field: 'smb_message_echoes',
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: NEGOCIO, phone_number_id: '000000000000000' },
              ...(opciones.contactos && { contacts: opciones.contactos }),
              message_echoes: [
                {
                  from: NEGOCIO,
                  ...(para && { to: para }),
                  to_user_id: 'CL.BSUID1',
                  id: `wamid.ECO${++contador}`,
                  timestamp: String(opciones.hora ?? T),
                  type: 'text',
                  text: { body: 'Hola, te confirmo para mañana' },
                  ...opciones.mensaje,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

describe('extraerEcos: lo que una persona envía desde la app', () => {
  it('lee a qué cliente le escribió, el identificador del mensaje y la hora', () => {
    const [eco] = extraerEcos(payloadEco());
    expect(eco).toMatchObject({ para: ANA, timestamp: T, tipo: 'text' });
    expect(eco?.id).toMatch(/^wamid\.ECO/);
  });

  it('el teléfono queda solo con dígitos, igual que el de los mensajes de los clientes', () => {
    expect(extraerEcos(payloadEco({ para: '+56 9 0000 0001' })).map((e) => e.para)).toEqual([ANA]);
  });

  it('si el mensaje no trae el teléfono, lo toma de los contactos', () => {
    expect(extraerEcos(payloadEco({ para: undefined, contactos: [{ wa_id: PEDRO, user_id: 'CL.BSUID1' }] })).map((e) => e.para)).toEqual([PEDRO]);
  });

  it('si Meta no entrega el teléfono (el cliente usa nombre de usuario), ese eco se salta', () => {
    expect(extraerEcos(payloadEco({ para: undefined, contactos: [{ user_id: 'CL.BSUID1', profile: { username: 'ana' } }] }))).toEqual([]);
  });

  it('una edición o un borrado hechos desde la app también cuentan como actividad de una persona', () => {
    expect(extraerEcos(payloadEco({ mensaje: { type: 'edit', edit: { original_message_id: 'wamid.X' } } })).map((e) => e.tipo)).toEqual(['edit']);
    expect(extraerEcos(payloadEco({ mensaje: { type: 'revoke', revoke: { original_message_id: 'wamid.X' } } })).map((e) => e.tipo)).toEqual(['revoke']);
  });

  it('ignora los avisos que no son ecos, y lo que no tiene forma de aviso', () => {
    const deCliente = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: { messages: [{ id: 'wamid.1', from: ANA, type: 'text', text: { body: 'hola' } }] } }] }] };
    const historial = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'history', value: { history: [{ threads: [] }] } }] }] };
    for (const otro of [deCliente, historial, null, 'texto', {}, { object: 'otro', entry: [] }]) expect(extraerEcos(otro)).toEqual([]);
  });

  it('un eco sin identificador se descarta', () => {
    expect(extraerEcos(payloadEco({ mensaje: { id: undefined } }))).toEqual([]);
  });
});

describe('extraerMensajes con el número compartido', () => {
  it('un eco no es un mensaje de un cliente', () => {
    expect(extraerMensajes(payloadEco())).toEqual([]);
  });

  it('solo cuentan los avisos del campo "messages", aunque otro campo trajera una lista con ese nombre', () => {
    const raro = { object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'history', value: { messages: [{ id: 'wamid.VIEJO', from: ANA, type: 'text', text: { body: 'un mensaje de hace un mes' } }] } }] }] };
    expect(extraerMensajes(raro)).toEqual([]);
  });
});

describe('pausaPorPersona: cuánto calla el bot después de que escribe una persona', () => {
  it('una hora si no se configura', () => {
    expect(pausaPorPersona({})).toBe(UNA_HORA);
  });

  it('se puede cambiar, y con 0 el bot no se calla nunca', () => {
    expect(pausaPorPersona({ PAUSA_POR_PERSONA_MINUTOS: '30' })).toBe(1800);
    expect(pausaPorPersona({ PAUSA_POR_PERSONA_MINUTOS: '0' })).toBe(0);
  });

  it.each(['', 'una hora', '-5', '1.5', '100000'])('un valor que no sirve (%j) deja la hora por defecto', (valor) => {
    expect(pausaPorPersona({ PAUSA_POR_PERSONA_MINUTOS: valor })).toBe(UNA_HORA);
  });
});

const eco = (para: string, timestamp: number) => ({ id: `wamid.E${++contador}`, para, timestamp, tipo: 'text' });

describe('registrarEcos y conversacionTomada', () => {
  it('después de que una persona le escribe, la conversación con ese cliente queda tomada durante la pausa', async () => {
    const db = crearBaseSqlite();
    expect(await registrarEcos(db, [eco(ANA, T)], UNA_HORA, T)).toBe(1);
    expect(await conversacionTomada(db, ANA, T + 10)).toBe(true);
    expect(await conversacionTomada(db, ANA, T + UNA_HORA - 1)).toBe(true);
    expect(await conversacionTomada(db, ANA, T + UNA_HORA)).toBe(false);
    expect(await conversacionTomada(db, PEDRO, T + 10)).toBe(false);
  });

  it('cada mensaje nuevo de la persona alarga la pausa', async () => {
    const db = crearBaseSqlite();
    await registrarEcos(db, [eco(ANA, T)], UNA_HORA, T);
    await registrarEcos(db, [eco(ANA, T + 1800)], UNA_HORA, T + 1800);
    expect(await conversacionTomada(db, ANA, T + 5000)).toBe(true);
    expect(await conversacionTomada(db, ANA, T + 1800 + UNA_HORA)).toBe(false);
  });

  it('varios ecos del mismo aviso para el mismo cliente cuentan como una conversación', async () => {
    const db = crearBaseSqlite();
    expect(await registrarEcos(db, [eco(ANA, T), eco(ANA, T + 5), eco(PEDRO, T)], UNA_HORA, T + 5)).toBe(2);
    expect(await conversacionTomada(db, ANA, T + UNA_HORA + 4)).toBe(true);
  });

  it('un eco antiguo que llega tarde no acorta la pausa', async () => {
    const db = crearBaseSqlite();
    await registrarEcos(db, [eco(ANA, T)], UNA_HORA, T);
    await registrarEcos(db, [eco(ANA, T - 1800)], UNA_HORA, T + 10);
    expect(await conversacionTomada(db, ANA, T + UNA_HORA - 1)).toBe(true);
  });

  it('un eco tan antiguo que su pausa ya terminó no deja nada', async () => {
    const db = crearBaseSqlite();
    expect(await registrarEcos(db, [eco(ANA, T - 2 * UNA_HORA)], UNA_HORA, T)).toBe(0);
    expect(db.sql('SELECT * FROM conversaciones_tomadas')).toEqual([]);
  });

  it.each([0, Number.NaN, T + 9999])('si la hora del eco no sirve (%s), se usa la hora en que llegó', async (hora) => {
    const db = crearBaseSqlite();
    await registrarEcos(db, [eco(ANA, hora)], UNA_HORA, T);
    expect(await conversacionTomada(db, ANA, T + UNA_HORA - 1)).toBe(true);
    expect(await conversacionTomada(db, ANA, T + UNA_HORA)).toBe(false);
  });

  it('al tomar la conversación se olvida lo que el bot le había preguntado a ese cliente, y solo a ese', async () => {
    const db = crearBaseSqlite();
    for (const telefono of [ANA, PEDRO]) await db.prepare('INSERT INTO conversaciones (telefono, estado, actualizado_en) VALUES (?1, ?2, ?3)').bind(telefono, '{"espera":"tipo","items":[]}', T - 60).run();
    await registrarEcos(db, [eco(ANA, T)], UNA_HORA, T);
    expect(db.sql('SELECT telefono FROM conversaciones')).toEqual([{ telefono: PEDRO }]);
  });

  it('con la pausa en 0 no anota nada', async () => {
    const db = crearBaseSqlite();
    expect(await registrarEcos(db, [eco(ANA, T)], 0, T)).toBe(0);
    expect(await conversacionTomada(db, ANA, T + 1)).toBe(false);
  });
});

describe('el cliente que quedó esperando durante la pausa', () => {
  it('una pausa que terminó sin que el cliente escribiera se borra y no deja nada que avisar', async () => {
    const db = crearBaseSqlite();
    await registrarEcos(db, [eco(ANA, T)], UNA_HORA, T);
    expect(await cerrarPausasVencidas(db, T + UNA_HORA)).toEqual([]);
    expect(db.sql('SELECT * FROM conversaciones_tomadas')).toEqual([]);
  });

  it('si el cliente escribió durante la pausa y nadie le respondió, al terminar queda para avisar', async () => {
    const db = crearBaseSqlite();
    await registrarEcos(db, [eco(ANA, T)], UNA_HORA, T);
    await anotarEsperaDelCliente(db, ANA, T + 600);
    expect(await cerrarPausasVencidas(db, T + UNA_HORA)).toEqual([{ telefono: ANA, esperaDesde: T + 600 }]);
    expect(db.sql('SELECT * FROM conversaciones_tomadas')).toEqual([]);
  });

  it('se guarda el primer momento en que quedó esperando, no el último', async () => {
    const db = crearBaseSqlite();
    await registrarEcos(db, [eco(ANA, T)], UNA_HORA, T);
    await anotarEsperaDelCliente(db, ANA, T + 600);
    await anotarEsperaDelCliente(db, ANA, T + 900);
    expect(await cerrarPausasVencidas(db, T + UNA_HORA)).toEqual([{ telefono: ANA, esperaDesde: T + 600 }]);
  });

  it('si la persona le respondió después, ya no espera', async () => {
    const db = crearBaseSqlite();
    await registrarEcos(db, [eco(ANA, T)], UNA_HORA, T);
    await anotarEsperaDelCliente(db, ANA, T + 600);
    await registrarEcos(db, [eco(ANA, T + 700)], UNA_HORA, T + 700);
    expect(await cerrarPausasVencidas(db, T + 700 + UNA_HORA)).toEqual([]);
  });

  it('las pausas que siguen vigentes no se tocan', async () => {
    const db = crearBaseSqlite();
    await registrarEcos(db, [eco(ANA, T)], UNA_HORA, T);
    await anotarEsperaDelCliente(db, ANA, T + 600);
    expect(await cerrarPausasVencidas(db, T + 900)).toEqual([]);
    expect(await conversacionTomada(db, ANA, T + 900)).toBe(true);
  });

  it('anotar la espera de un cliente que no está en pausa no hace nada', async () => {
    const db = crearBaseSqlite();
    await anotarEsperaDelCliente(db, ANA, T);
    expect(db.sql('SELECT * FROM conversaciones_tomadas')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------------------------------------------------

const HOJAS = {
  CLIENTES: [
    ['Telefono', 'Nombre', 'Direccion', 'Comuna', 'Tipo'],
    [ANA, 'Ana Prueba', 'Calle Falsa 123', 'Ñuñoa', 'normal'],
    [PEDRO, 'Pedro Muestra', 'Avenida Ficticia 987', 'Macul', 'normal'],
  ],
  PRECIOS: [
    ['Tipo', 'Desde', 'Hasta', 'Precio'],
    ['20L', '1', '1', '4500'], ['20L', '2', '3', '3300'], ['20L', '4', '', '2750'],
    ['12L', '1', '1', '2500'], ['12L', '2', '', '2400'], ['10L', '1', '', '2200'],
  ],
  FERIADOS: [...FERIADOS_2026_2027].map((fecha) => [fecha, 'Feriado']),
  CONFIGURACION: [['BOT_ACTIVO', 'SI'], ['ESTADO_SERVICIO', 'normal'], ['MENSAJE_EXCEPCION', '']],
};

async function entorno(cambios: Partial<Env> = {}): Promise<Env & { DB: Base }> {
  return {
    WHATSAPP_VERIFY_TOKEN: 'v',
    WHATSAPP_APP_SECRET: SECRETO,
    WHATSAPP_TOKEN: 't',
    WHATSAPP_PHONE_NUMBER_ID: '000000000000000',
    GRAPH_API_VERSION: 'v99.0',
    NUMEROS_PERMITIDOS: `${ANA},${PEDRO}`,
    FLUJO_PEDIDO: 'SI',
    ESPERA_AGRUPADOR_MS: '0',
    DB: crearBaseSqlite(),
    ...(await entornoGoogle()),
    ...cambios,
  } as Env & { DB: Base };
}

/** Un aviso de Meta firmado, procesado hasta el final (incluido lo que corre en segundo plano). */
async function recibir(env: Env, payload: unknown) {
  const cuerpo = JSON.stringify(payload);
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

const deCliente = (mensaje: Record<string, unknown>, de = ANA) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', messages: [{ id: `wamid.C${++contador}`, from: de, timestamp: String(T), ...mensaje }] } }] }],
});
const texto = (cuerpo: string, de = ANA) => deCliente({ type: 'text', text: { body: cuerpo } }, de);
const espera = (env: { DB: Base }) => env.DB.sql('SELECT telefono, espera_desde FROM conversaciones_tomadas ORDER BY telefono');

describe('el Worker con el número compartido entre el bot y la app', () => {
  it('cuando una persona le escribe a un cliente desde la app, el bot no le responde ni le anota pedidos', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    expect((await recibir(env, payloadEco())).status).toBe(200);
    await recibir(env, texto('quiero 2 de 20'));
    expect(mundo.enviados).toEqual([]);
    expect(env.DB.sql('SELECT id FROM pedidos')).toEqual([]);
    expect(env.DB.sql('SELECT tipo FROM avisos')).toEqual([]);
  });

  it('a los demás clientes les sigue respondiendo', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await recibir(env, payloadEco({ para: ANA }));
    await recibir(env, texto('quiero 2 de 20', PEDRO));
    expect(mundo.enviados.map((m) => m.para)).toEqual([PEDRO]);
  });

  it('pasada la hora de pausa, vuelve a atender a ese cliente', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await recibir(env, payloadEco());
    vi.setSystemTime(new Date(HORA.getTime() + 61 * 60_000));
    await recibir(env, texto('quiero 2 de 20'));
    expect(mundo.enviados.map((m) => m.para)).toEqual([ANA]);
  });

  it('con PAUSA_POR_PERSONA_MINUTOS en 0 el bot responde aunque una persona haya escrito', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno({ PAUSA_POR_PERSONA_MINUTOS: '0' });
    await recibir(env, payloadEco());
    await recibir(env, texto('quiero 2 de 20'));
    expect(mundo.enviados).toHaveLength(1);
  });

  it('un eco no se responde ni se anota como mensaje de un cliente', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await recibir(env, payloadEco());
    expect(mundo.enviados).toEqual([]);
    expect(env.DB.sql('SELECT wamid FROM mensajes_procesados')).toEqual([]);
  });

  it('lo que el cliente escribe durante la pausa queda marcado como atendido: el vigía no lo confunde con un mensaje colgado', async () => {
    stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await recibir(env, payloadEco());
    await recibir(env, texto('quiero 2 de 20'));
    expect(env.DB.sql('SELECT atendido_en FROM mensajes_procesados')).toEqual([{ atendido_en: T }]);
  });

  it('un "gracias" durante la pausa no deja a nadie esperando; un pedido sí', async () => {
    stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await recibir(env, payloadEco());
    await recibir(env, texto('gracias'));
    expect(espera(env)).toEqual([{ telefono: ANA, espera_desde: null }]);
    await recibir(env, texto('quiero 2 de 20'));
    expect(espera(env)).toEqual([{ telefono: ANA, espera_desde: T }]);
  });

  it('una imagen durante la pausa tampoco recibe respuesta del bot, y queda esperando a una persona', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await recibir(env, payloadEco());
    await recibir(env, deCliente({ type: 'image', image: { id: 'MEDIA1' } }));
    expect(mundo.enviados).toEqual([]);
    expect(env.DB.sql('SELECT tipo FROM avisos')).toEqual([]);
    expect(espera(env)).toEqual([{ telefono: ANA, espera_desde: T }]);
  });

  it('una reacción durante la pausa no deja a nadie esperando', async () => {
    stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await recibir(env, payloadEco());
    await recibir(env, deCliente({ type: 'reaction', reaction: { emoji: '👍' } }));
    expect(espera(env)).toEqual([{ telefono: ANA, espera_desde: null }]);
  });

  it('un número que el bot no atiende (modo prueba) no queda anotado como esperando', async () => {
    stubMundo({ hojas: HOJAS });
    const env = await entorno({ NUMEROS_PERMITIDOS: PEDRO });
    await recibir(env, payloadEco({ para: ANA }));
    await recibir(env, texto('quiero 2 de 20', ANA));
    expect(espera(env)).toEqual([{ telefono: ANA, espera_desde: null }]);
  });

  it('si no se puede revisar la pausa porque la base falla, el bot atiende: mejor responder de más que dejar a alguien sin respuesta', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await recibir(env, payloadEco());
    const fallando: BaseDatos = {
      prepare: (sql) => (sql.includes('conversaciones_tomadas') ? { bind: () => ({ run: async () => { throw new Error('D1 caída'); } }) } : env.DB.prepare(sql)),
    };
    await recibir({ ...env, DB: fallando }, texto('quiero 2 de 20'));
    expect(mundo.enviados).toHaveLength(1);
  });

  it('si no se puede anotar el eco, el webhook igual responde 200', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubMundo({ hojas: HOJAS });
    const rota: BaseDatos = { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('D1 caída'); } }) }) };
    expect((await recibir({ ...(await entorno()), DB: rota }, payloadEco())).status).toBe(200);
  });
});

describe('el vigía y las pausas', () => {
  const avisos = (env: { DB: Base }) => env.DB.sql('SELECT tipo, telefono, resumen FROM avisos ORDER BY id') as Array<{ tipo: string; telefono: string; resumen: string }>;

  it('si la pausa termina con el cliente esperando, deja un aviso para una persona, sin Telegram', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno({ TELEGRAM_BOT_TOKEN: '1:TOKEN', TELEGRAM_CHAT_ID: '777' });
    await registrarEcos(env.DB, [eco(ANA, T)], UNA_HORA, T);
    await anotarEsperaDelCliente(env.DB, ANA, T + 600);
    await tareaProgramada(env, new Date((T + UNA_HORA + 60) * 1000));
    expect(avisos(env)).toEqual([
      { tipo: 'escalamiento', telefono: ANA, resumen: 'Escribió a las 10:10 mientras una persona atendía su conversación, y después nadie le respondió. Revisa su chat.' },
    ]);
    expect(mundo.telegram).toEqual([]);
  });

  it('no repite el aviso en la corrida siguiente', async () => {
    stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await registrarEcos(env.DB, [eco(ANA, T)], UNA_HORA, T);
    await anotarEsperaDelCliente(env.DB, ANA, T + 600);
    await tareaProgramada(env, new Date((T + UNA_HORA + 60) * 1000));
    await tareaProgramada(env, new Date((T + UNA_HORA + 360) * 1000));
    expect(avisos(env)).toHaveLength(1);
  });

  it('una pausa que terminó sin nadie esperando no deja aviso', async () => {
    stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await registrarEcos(env.DB, [eco(ANA, T)], UNA_HORA, T);
    await tareaProgramada(env, new Date((T + UNA_HORA + 60) * 1000));
    expect(avisos(env)).toEqual([]);
    expect(env.DB.sql('SELECT * FROM conversaciones_tomadas')).toEqual([]);
  });
});
