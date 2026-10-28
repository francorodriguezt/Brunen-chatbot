import { afterEach, describe, expect, it, vi } from 'vitest';
import worker, { type Contexto, type Env } from '../src/index';
import { AlmacenD1, AlmacenEnMemoria, almacenDe, esMensajeNuevo, type BaseDatos } from '../src/almacen';
import { firmarHmacSha256 } from '../src/firma';

// Todos los valores son ficticios.
const ENV: Env = {
  WHATSAPP_VERIFY_TOKEN: 'token-verificacion-prueba',
  WHATSAPP_APP_SECRET: 'secreto-app-prueba',
  WHATSAPP_TOKEN: 'token-acceso-prueba',
  WHATSAPP_PHONE_NUMBER_ID: '000000000000000',
  GRAPH_API_VERSION: 'v99.0',
  NUMEROS_PERMITIDOS: '56900000001',
};

/** D1 de mentira: guarda las filas en un Map y entiende solo las dos consultas del almacén. */
class D1Falsa implements BaseDatos {
  readonly filas = new Map<string, number>();

  prepare(sql: string) {
    return {
      bind: (...valores: unknown[]) => ({
        run: async () => {
          if (sql.startsWith('INSERT OR IGNORE')) {
            const [id, instante] = valores as [string, number];
            if (this.filas.has(id)) return { meta: { changes: 0 } };
            this.filas.set(id, instante);
            return { meta: { changes: 1 } };
          }
          if (sql.startsWith('DELETE')) {
            const [limite] = valores as [number];
            let borradas = 0;
            for (const [id, instante] of this.filas) {
              if (instante < limite) {
                this.filas.delete(id);
                borradas++;
              }
            }
            return { meta: { changes: borradas } };
          }
          throw new Error(`Consulta no prevista: ${sql}`);
        },
      }),
    };
  }
}

describe('AlmacenD1', () => {
  it('registra un mensaje nuevo y reconoce el repetido', async () => {
    const almacen = new AlmacenD1(new D1Falsa(), () => 1);
    expect(await almacen.registrarSiEsNuevo('wamid.A', 1000)).toBe(true);
    expect(await almacen.registrarSiEsNuevo('wamid.A', 1001)).toBe(false);
    expect(await almacen.registrarSiEsNuevo('wamid.B', 1002)).toBe(true);
  });

  it('borra los registros de más de 7 días cuando toca limpiar', async () => {
    const db = new D1Falsa();
    const dias = 24 * 3600;
    await new AlmacenD1(db, () => 1).registrarSiEsNuevo('wamid.VIEJO', 1000);
    await new AlmacenD1(db, () => 0).registrarSiEsNuevo('wamid.NUEVO', 1000 + 8 * dias);
    expect([...db.filas.keys()]).toEqual(['wamid.NUEVO']);
  });

  it('no limpia en cada mensaje', async () => {
    const db = new D1Falsa();
    await new AlmacenD1(db, () => 1).registrarSiEsNuevo('wamid.VIEJO', 1000);
    await new AlmacenD1(db, () => 1).registrarSiEsNuevo('wamid.NUEVO', 1000 + 30 * 24 * 3600);
    expect(db.filas.size).toBe(2);
  });
});

describe('almacenDe y esMensajeNuevo', () => {
  afterEach(() => vi.restoreAllMocks());

  it('sin base D1 no hay almacén (no se deduplica)', () => {
    expect(almacenDe({})).toBeNull();
    expect(almacenDe({ DB: new D1Falsa() })).toBeInstanceOf(AlmacenD1);
  });

  it('el almacén en memoria sirve para desarrollo', async () => {
    const almacen = new AlmacenEnMemoria();
    expect(await almacen.registrarSiEsNuevo('wamid.A')).toBe(true);
    expect(await almacen.registrarSiEsNuevo('wamid.A')).toBe(false);
  });

  it('si la base falla, el mensaje se procesa igual y el error se registra', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const roto = { registrarSiEsNuevo: async () => { throw new Error('D1 caída'); } };
    expect(await esMensajeNuevo(roto, 'wamid.A')).toBe(true);
    expect(error).toHaveBeenCalledOnce();
  });
});

describe('el webhook con deduplicación', () => {
  afterEach(() => vi.unstubAllGlobals());

  async function enviar(env: Env, id: string) {
    const payload = {
      object: 'whatsapp_business_account',
      entry: [{ id: 'WABA', changes: [{ field: 'messages', value: { messages: [{ id, from: '56900000001', timestamp: '1793000000', type: 'text', text: { body: 'hola' } }] } }] }],
    };
    const cuerpo = JSON.stringify(payload);
    const firma = await firmarHmacSha256(cuerpo, env.WHATSAPP_APP_SECRET);
    const pendientes: Promise<unknown>[] = [];
    const ctx: Contexto = { waitUntil: (p) => pendientes.push(p) };
    const peticion = new Request('https://bot.example/webhook', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-hub-signature-256': `sha256=${firma}` },
      body: cuerpo,
    });
    const respuesta = await worker.fetch(peticion, env, ctx);
    await Promise.all(pendientes);
    return respuesta;
  }

  it('con D1, el mismo wamid enviado dos veces responde una sola vez', async () => {
    const meta = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', meta);
    const env: Env = { ...ENV, DB: new D1Falsa() };
    expect((await enviar(env, 'wamid.REPETIDO')).status).toBe(200);
    expect((await enviar(env, 'wamid.REPETIDO')).status).toBe(200);
    expect(meta).toHaveBeenCalledTimes(1);
  });

  it('con D1, dos wamid distintos responden dos veces', async () => {
    const meta = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', meta);
    const env: Env = { ...ENV, DB: new D1Falsa() };
    await enviar(env, 'wamid.UNO');
    await enviar(env, 'wamid.DOS');
    expect(meta).toHaveBeenCalledTimes(2);
  });

  it('sin D1 todo sigue igual que antes (no se deduplica)', async () => {
    const meta = vi.fn(async () => new Response('{}', { status: 200 }));
    vi.stubGlobal('fetch', meta);
    await enviar(ENV, 'wamid.REPETIDO');
    await enviar(ENV, 'wamid.REPETIDO');
    expect(meta).toHaveBeenCalledTimes(2);
  });
});
