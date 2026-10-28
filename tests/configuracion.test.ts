import { afterEach, describe, expect, it, vi } from 'vitest';
import { leerBotActivo, leerServicio, parsearBotActivo, parsearConfiguracion } from '../src/configuracion';
import { olvidarTokens } from '../src/google';
import { olvidarHojas } from '../src/hojas';
import { procesarMensaje, type Env } from '../src/index';
import { crearClaveJson, entornoGoogle, lecturasDe, stubGoogle } from './ayudas';

afterEach(() => {
  olvidarHojas();
  olvidarTokens();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parsearBotActivo', () => {
  it('NO apaga el bot y SI lo deja encendido, sin importar mayúsculas, tildes ni espacios', () => {
    expect(parsearBotActivo([['BOT_ACTIVO', 'NO']])).toBe(false);
    expect(parsearBotActivo([['bot_activo', ' no ']])).toBe(false);
    expect(parsearBotActivo([['BOT_ACTIVO', 'SI']])).toBe(true);
    expect(parsearBotActivo([['BOT_ACTIVO', 'Sí']])).toBe(true);
  });

  it('ignora las otras variables y busca la fila correcta', () => {
    expect(parsearBotActivo([['ESTADO_SERVICIO', 'normal'], ['BOT_ACTIVO', 'NO'], ['MENSAJE_EXCEPCION', '']])).toBe(false);
  });

  it('sin fila o con un valor que no es SI ni NO, no decide (null)', () => {
    expect(parsearBotActivo([])).toBeNull();
    expect(parsearBotActivo([['ESTADO_SERVICIO', 'normal']])).toBeNull();
    expect(parsearBotActivo([['BOT_ACTIVO', '']])).toBeNull();
    expect(parsearBotActivo([['BOT_ACTIVO', 'quizas']])).toBeNull();
    expect(parsearBotActivo([['BOT_ACTIVO']])).toBeNull();
  });
});

describe('leerBotActivo', () => {
  const lecturas = (llamadas: string[]) => lecturasDe(llamadas, 'CONFIGURACION');
  const stub = (valores: string[][] | 'falla') => stubGoogle({ CONFIGURACION: valores });

  it('lee la hoja CONFIGURACION y guarda el resultado un minuto', async () => {
    const llamadas = stub([['BOT_ACTIVO', 'NO']]);
    expect(await leerBotActivo(await entornoGoogle(), 1000)).toBe(false);
    expect(await leerBotActivo(await entornoGoogle(), 1030)).toBe(false);
    expect(lecturas(llamadas)).toBe(1);
    await leerBotActivo(await entornoGoogle(), 1061);
    expect(lecturas(llamadas)).toBe(2);
  });

  it('un cambio en la hoja se nota en el siguiente minuto', async () => {
    stub([['BOT_ACTIVO', 'NO']]);
    expect(await leerBotActivo(await entornoGoogle(), 1000)).toBe(false);
    stub([['BOT_ACTIVO', 'SI']]);
    expect(await leerBotActivo(await entornoGoogle(), 1061)).toBe(true);
  });

  it('si Google falla devuelve lo último que se leyó, y no insiste en cada mensaje', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stub([['BOT_ACTIVO', 'NO']]);
    await leerBotActivo(await entornoGoogle(), 1000);
    const llamadas = stub('falla');
    expect(await leerBotActivo(await entornoGoogle(), 1061)).toBe(false);
    expect(await leerBotActivo(await entornoGoogle(), 1062)).toBe(false);
    expect(lecturas(llamadas)).toBe(1);
  });

  it('si no hay nada guardado y Google falla, no decide (null) y lo anota', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stub('falla');
    expect(await leerBotActivo(await entornoGoogle(), 1000)).toBeNull();
    expect(error).toHaveBeenCalled();
  });

  it('sin credenciales no llama a Google', async () => {
    const llamadas = stub([['BOT_ACTIVO', 'NO']]);
    expect(await leerBotActivo({}, 1000)).toBeNull();
    expect(llamadas).toHaveLength(0);
  });
});

describe('el bot respeta BOT_ACTIVO de la planilla', () => {
  const ENV: Env = {
    WHATSAPP_VERIFY_TOKEN: 'v',
    WHATSAPP_APP_SECRET: 's',
    WHATSAPP_TOKEN: 't',
    WHATSAPP_PHONE_NUMBER_ID: '000000000000000',
    GRAPH_API_VERSION: 'v99.0',
    NUMEROS_PERMITIDOS: '56900000001',
  };
  const mensaje = { id: 'wamid.CFG1', de: '56900000001', timestamp: 1793000000, tipo: 'text', texto: 'hola' };

  function stubTodo(valorBot: string) {
    const enviados: string[] = [];
    vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
      if (url.startsWith('https://oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'tk', expires_in: 3600 }), { status: 200 });
      if (url.includes('sheets.googleapis.com')) return new Response(JSON.stringify({ values: [['BOT_ACTIVO', valorBot]] }), { status: 200 });
      enviados.push(String(init.body));
      return new Response('{}', { status: 200 });
    });
    return enviados;
  }

  it('con NO en la planilla no responde', async () => {
    const enviados = stubTodo('NO');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await procesarMensaje(mensaje, { ...ENV, GOOGLE_SERVICE_ACCOUNT_JSON: await crearClaveJson(), GOOGLE_SHEET_ID: 'PLANILLA1' });
    expect(r.resultado).toBe('ignorado_bot_apagado');
    expect(enviados).toHaveLength(0);
  });

  it('con SI en la planilla responde', async () => {
    const enviados = stubTodo('SI');
    const r = await procesarMensaje(mensaje, { ...ENV, GOOGLE_SERVICE_ACCOUNT_JSON: await crearClaveJson(), GOOGLE_SHEET_ID: 'PLANILLA1' });
    expect(r.resultado).toBe('respondido');
    expect(enviados).toHaveLength(1);
  });

  it('la variable BOT_ACTIVO=NO del Worker apaga el bot aunque la planilla diga SI, sin leer la planilla', async () => {
    const enviados = stubTodo('SI');
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const r = await procesarMensaje(mensaje, { ...ENV, BOT_ACTIVO: 'NO', GOOGLE_SERVICE_ACCOUNT_JSON: await crearClaveJson(), GOOGLE_SHEET_ID: 'PLANILLA1' });
    expect(r.resultado).toBe('ignorado_bot_apagado');
    expect(enviados).toHaveLength(0);
  });
});

describe('parsearConfiguracion', () => {
  it('lee el interruptor, el estado del servicio y el aviso de contingencia', () => {
    const r = parsearConfiguracion([
      ['BOT_ACTIVO', 'SI'],
      ['ESTADO_SERVICIO', 'reducido'],
      ['MENSAJE_EXCEPCION', '  Hoy hay retrasos.  '],
    ]);
    expect(r).toEqual({ botActivo: true, servicio: { reducido: true, mensajeExcepcion: 'Hoy hay retrasos.' } });
  });

  it('el servicio es normal salvo que diga reducido (sin importar mayúsculas)', () => {
    expect(parsearConfiguracion([['ESTADO_SERVICIO', 'normal']]).servicio.reducido).toBe(false);
    expect(parsearConfiguracion([['estado_servicio', 'REDUCIDO']]).servicio.reducido).toBe(true);
    expect(parsearConfiguracion([]).servicio).toEqual({ reducido: false, mensajeExcepcion: '' });
  });
});

describe('leerServicio', () => {
  it('lee el servicio de la misma hoja que el interruptor, con una sola lectura', async () => {
    const llamadas = stubGoogle({ CONFIGURACION: [['BOT_ACTIVO', 'SI'], ['ESTADO_SERVICIO', 'reducido'], ['MENSAJE_EXCEPCION', 'Retrasos hoy']] });
    const env = await entornoGoogle();
    expect(await leerServicio(env, 1000)).toEqual({ reducido: true, mensajeExcepcion: 'Retrasos hoy' });
    expect(await leerBotActivo(env, 1010)).toBe(true);
    expect(lecturasDe(llamadas, 'CONFIGURACION')).toBe(1);
  });

  it('sin hoja legible no agrega ningún aviso', async () => {
    expect(await leerServicio({}, 1000)).toEqual({ reducido: false, mensajeExcepcion: '' });
  });
});
