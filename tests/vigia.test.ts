import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AlmacenD1 } from '../src/almacen';
import { olvidarFallas } from '../src/atencion';
import { olvidarTokens } from '../src/google';
import { olvidarHojas } from '../src/hojas';
import worker, { type Contexto, type Env } from '../src/index';
import { mensajesSinAtender, revisionDiaria, vigilar } from '../src/vigia';
import { crearBaseSqlite, entornoGoogle, stubMundo } from './ayudas';

// Martes 10 de noviembre de 2026, 10:00 en Chile. Los teléfonos son ficticios.
const AHORA = new Date('2026-11-10T10:00:00-03:00');
const T = Math.floor(AHORA.getTime() / 1000);
const ANA = '56911111111';
const PEDRO = '56922222222';
const HOJAS = { CONFIGURACION: [['BOT_ACTIVO', 'SI']] };

type Base = ReturnType<typeof crearBaseSqlite>;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(AHORA);
  vi.spyOn(console, 'error').mockImplementation(() => {});
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

async function entorno(cambios: Partial<Env> = {}): Promise<Env & { DB: Base }> {
  return {
    WHATSAPP_VERIFY_TOKEN: 'v',
    WHATSAPP_APP_SECRET: 's',
    WHATSAPP_TOKEN: 't',
    WHATSAPP_PHONE_NUMBER_ID: '000000000000000',
    GRAPH_API_VERSION: 'v99.0',
    FLUJO_PEDIDO: 'SI',
    TELEGRAM_BOT_TOKEN: '1:TOKEN',
    TELEGRAM_CHAT_ID: '777',
    DB: crearBaseSqlite(),
    ...(await entornoGoogle()),
    ...cambios,
  } as Env & { DB: Base };
}

/** Un mensaje que llegó hace `haceSegundos` y cuya atención nunca terminó (el Worker se interrumpió). */
const recibido = (db: Base, wamid: string, telefono: string, haceSegundos: number) => new AlmacenD1(db).registrarSiEsNuevo(wamid, T - haceSegundos, telefono);
const avisosEn = (db: Base) => db.sql('SELECT tipo, telefono, resumen, estado FROM avisos ORDER BY id') as Array<{ tipo: string; telefono: string; resumen: string; estado: string }>;

describe('mensajesSinAtender', () => {
  it('trae solo los que llevan más de dos minutos sin terminar, de las últimas 24 horas y con teléfono', async () => {
    const db = crearBaseSqlite();
    await recibido(db, 'w.colgado', ANA, 300);
    await recibido(db, 'w.reciente', ANA, 30); // todavía puede estar en proceso
    await recibido(db, 'w.atendido', PEDRO, 300);
    await new AlmacenD1(db).marcarAtendidos(['w.atendido'], T - 290);
    await recibido(db, 'w.antiguo', PEDRO, 2 * 24 * 3600); // demasiado viejo para avisar
    await recibido(db, 'w.sin-telefono', '', 300); // anotado por una versión anterior del bot
    expect(await mensajesSinAtender(db, T)).toEqual([{ wamid: 'w.colgado', telefono: ANA, recibidoEn: T - 300 }]);
  });
});

describe('vigilar: ningún mensaje se pierde en silencio', () => {
  it('deja un aviso con el teléfono del cliente y la hora, y lo manda por Telegram', async () => {
    const mundo = stubMundo();
    const env = await entorno();
    await recibido(env.DB, 'w.1', ANA, 300);
    expect(await vigilar(env, AHORA)).toBe(1);
    const avisos = avisosEn(env.DB);
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ tipo: 'error', telefono: ANA, estado: 'abierto' });
    expect(avisos[0]?.resumen).toBe('El bot no terminó de atender un mensaje de este cliente (recibido a las 09:55). Revisa su chat y respóndele si hace falta.');
    expect(mundo.telegram).toHaveLength(1);
    expect(String(mundo.telegram[0]?.cuerpo.text)).toContain('no terminó de atender');
  });

  it('varios mensajes del mismo cliente dan un solo aviso, que dice cuántos fueron', async () => {
    stubMundo();
    const env = await entorno();
    await recibido(env.DB, 'w.1', ANA, 400);
    await recibido(env.DB, 'w.2', ANA, 300);
    expect(await vigilar(env, AHORA)).toBe(1);
    expect(avisosEn(env.DB).map((a) => a.resumen)).toEqual(['El bot no terminó de atender 2 mensajes de este cliente (el primero, recibido a las 09:53). Revisa su chat y respóndele si hace falta.']);
  });

  it('no repite el aviso en la pasada siguiente: los mensajes quedan marcados', async () => {
    const mundo = stubMundo();
    const env = await entorno();
    await recibido(env.DB, 'w.1', ANA, 300);
    await vigilar(env, AHORA);
    expect(await vigilar(env, new Date(AHORA.getTime() + 5 * 60_000))).toBe(0);
    expect(avisosEn(env.DB)).toHaveLength(1);
    expect(mundo.telegram).toHaveLength(1);
    expect(await mensajesSinAtender(env.DB, T + 300)).toEqual([]);
  });

  it('si no hay nada colgado, no hace nada', async () => {
    const mundo = stubMundo();
    const env = await entorno();
    await recibido(env.DB, 'w.1', ANA, 300);
    await new AlmacenD1(env.DB).marcarAtendidos(['w.1'], T - 295);
    expect(await vigilar(env, AHORA)).toBe(0);
    expect([avisosEn(env.DB), mundo.telegram]).toEqual([[], []]);
  });

  it('con muchos clientes afectados, todos quedan en el panel y Telegram recibe los tres primeros más un resumen', async () => {
    const mundo = stubMundo();
    const env = await entorno();
    for (let i = 1; i <= 5; i++) await recibido(env.DB, `w.${i}`, `5690000000${i}`, 300 + i);
    expect(await vigilar(env, AHORA)).toBe(5);
    expect(avisosEn(env.DB)).toHaveLength(5);
    expect(mundo.telegram).toHaveLength(4);
    expect(String(mundo.telegram[3]?.cuerpo.text)).toContain('2 clientes más');
  });

  it('sin Telegram configurado, el aviso queda igual en el panel', async () => {
    stubMundo();
    const env = await entorno({ TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined });
    await recibido(env.DB, 'w.1', ANA, 300);
    expect(await vigilar(env, AHORA)).toBe(1);
    expect(avisosEn(env.DB)).toHaveLength(1);
  });

  it('sin base de datos no hace nada', async () => {
    stubMundo();
    expect(await vigilar({ ...(await entorno()), DB: undefined }, AHORA)).toBe(0);
  });

  it('si la base falla, no lanza errores', async () => {
    stubMundo();
    const rota = { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('D1 caída'); } }) }) };
    expect(await vigilar({ ...(await entorno()), DB: rota }, AHORA)).toBe(0);
  });
});

describe('revisionDiaria: enterarse antes que el cliente', () => {
  it('si el token de WhatsApp dejó de servir, deja un aviso de falla', async () => {
    const mundo = stubMundo({ hojas: HOJAS, whatsapp: 401 });
    const env = await entorno();
    await revisionDiaria(env, AHORA);
    expect(avisosEn(env.DB).map((a) => [a.tipo, a.telefono])).toEqual([['error', '']]);
    expect(avisosEn(env.DB)[0]?.resumen).toContain('token de WhatsApp');
    expect(mundo.enviados).toEqual([]); // revisar el token no le escribe a nadie
  });

  it('si la planilla no se puede leer, deja un aviso de falla', async () => {
    stubMundo({ hojas: { CONFIGURACION: 'falla' } });
    const env = await entorno();
    await revisionDiaria(env, AHORA);
    expect(avisosEn(env.DB).map((a) => a.resumen)).toEqual([expect.stringContaining('planilla')]);
  });

  it('si todo funciona, no deja ningún aviso', async () => {
    const mundo = stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await revisionDiaria(env, AHORA);
    expect([avisosEn(env.DB), mundo.telegram]).toEqual([[], []]);
  });

  it('un tropiezo de Meta que no es del token (un error 500) no levanta una falsa alarma', async () => {
    stubMundo({ hojas: HOJAS, whatsapp: 500 });
    const env = await entorno();
    await revisionDiaria(env, AHORA);
    expect(avisosEn(env.DB)).toEqual([]);
  });
});

describe('la tarea programada del Worker (cada 5 minutos)', () => {
  async function correr(env: Env, instante: Date) {
    const pendientes: Promise<unknown>[] = [];
    const ctx: Contexto = { waitUntil: (p) => pendientes.push(p) };
    await worker.scheduled({ scheduledTime: instante.getTime(), cron: '*/5 * * * *' }, env, ctx);
    await Promise.all(pendientes);
  }

  it('pasa el vigía en cada corrida', async () => {
    stubMundo({ hojas: HOJAS });
    const env = await entorno();
    await recibido(env.DB, 'w.1', ANA, 300);
    await correr(env, AHORA);
    expect(avisosEn(env.DB)).toHaveLength(1);
  });

  it('la revisión diaria corre una sola vez al día, a las 7:30 de Santiago', async () => {
    stubMundo({ hojas: HOJAS, whatsapp: 401 });
    const env = await entorno();
    await correr(env, new Date('2026-11-10T07:25:00-03:00'));
    await correr(env, new Date('2026-11-10T07:35:00-03:00'));
    await correr(env, AHORA);
    expect(avisosEn(env.DB)).toEqual([]);
    await correr(env, new Date('2026-11-10T07:30:00-03:00'));
    expect(avisosEn(env.DB)).toHaveLength(1);
  });

  it('crea los pedidos fijos que tocan (D59)', async () => {
    stubMundo({ hojas: HOJAS });
    const env = await entorno();
    env.DB.sql(`INSERT INTO clientes (id, nombre, creado_en, actualizado_en) VALUES (1, 'Empresa Prueba', ${T}, ${T})`);
    env.DB.sql(`INSERT INTO telefonos_cliente (telefono, cliente_id, agregado_en) VALUES ('${ANA}', 1, ${T})`);
    env.DB.sql(`INSERT INTO pedidos_fijos (cliente_id, telefono, lineas, cada_dias, proxima_fecha, activo, creado_en, actualizado_en)
                VALUES (1, '${ANA}', '[{"tipo":"20L","cantidad":10}]', 7, '2026-11-11', 1, ${T}, ${T})`);
    await correr(env, AHORA);
    expect(env.DB.sql("SELECT fecha_entrega, estado FROM pedidos WHERE id LIKE 'F%'")).toEqual([{ fecha_entrega: '2026-11-11', estado: 'Pendiente_Confirmacion' }]);
  });

  it('una falla dentro de la tarea no la deja caída', async () => {
    stubMundo({ hojas: HOJAS });
    const rota = { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('D1 caída'); } }) }) };
    await expect(correr({ ...(await entorno()), DB: rota }, AHORA)).resolves.toBeUndefined();
  });
});
