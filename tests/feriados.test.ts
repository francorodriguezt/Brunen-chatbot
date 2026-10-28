import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cargarFeriados, olvidarFeriados, parsearFeriados } from '../src/feriados';
import { olvidarTokens } from '../src/google';

let claveJson: string;

beforeAll(async () => {
  const par = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
    true,
    ['sign', 'verify'],
  );
  const base64 = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey))));
  const pem = `-----BEGIN PRIVATE KEY-----\n${(base64.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----\n`;
  claveJson = JSON.stringify({ client_email: 'bot@proyecto.iam.gserviceaccount.com', private_key: pem });
});

afterEach(() => {
  olvidarFeriados();
  olvidarTokens();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('parsearFeriados', () => {
  it('se queda con las fechas válidas y descarta el resto', () => {
    const filas = [['2026-12-25', 'Navidad'], [' 2026-01-01 ', 'Año Nuevo'], ['2026-13-45', 'imposible'], ['25-12-2026', 'formato malo'], [''], ['2026-12-25', 'repetida']];
    expect([...parsearFeriados(filas)].sort()).toEqual(['2026-01-01', '2026-12-25']);
  });

  it('una hoja vacía da un conjunto vacío', () => {
    expect(parsearFeriados([]).size).toBe(0);
  });

  it('rechaza fechas que no existen en el calendario', () => {
    expect(parsearFeriados([['2026-02-30']]).size).toBe(0);
  });
});

describe('cargarFeriados', () => {
  function stub(valores: string[][] | 'falla') {
    const llamadas: string[] = [];
    vi.stubGlobal('fetch', async (url: string) => {
      llamadas.push(url);
      if (url.startsWith('https://oauth2.googleapis.com')) return new Response(JSON.stringify({ access_token: 'tk', expires_in: 3600 }), { status: 200 });
      if (valores === 'falla') return new Response('caído', { status: 500 });
      return new Response(JSON.stringify({ values: valores }), { status: 200 });
    });
    return llamadas;
  }
  const env = () => ({ GOOGLE_SERVICE_ACCOUNT_JSON: claveJson, GOOGLE_SHEET_ID: 'PLANILLA1' });

  it('lee la hoja FERIADOS y guarda el resultado en memoria', async () => {
    const llamadas = stub([['2026-12-25', 'Navidad'], ['2027-01-01', 'Año Nuevo']]);
    expect([...(await cargarFeriados(env(), 1000))].sort()).toEqual(['2026-12-25', '2027-01-01']);
    await cargarFeriados(env(), 2000);
    expect(llamadas.filter((u) => u.includes('/values/FERIADOS')).length).toBe(1);
  });

  it('vuelve a leer cuando pasó la duración de la memoria', async () => {
    const llamadas = stub([['2026-12-25']]);
    await cargarFeriados(env(), 1000);
    await cargarFeriados(env(), 1000 + 7 * 3600);
    expect(llamadas.filter((u) => u.includes('/values/FERIADOS')).length).toBe(2);
  });

  it('si Google falla devuelve lo último que se leyó', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stub([['2026-12-25']]);
    await cargarFeriados(env(), 1000);
    stub('falla');
    expect([...(await cargarFeriados(env(), 1000 + 7 * 3600))]).toEqual(['2026-12-25']);
  });

  it('si no hay nada guardado y Google falla, devuelve vacío y lo anota', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stub('falla');
    expect((await cargarFeriados(env(), 1000)).size).toBe(0);
    expect(error).toHaveBeenCalled();
  });

  it('una hoja vacía se vuelve a leer en un minuto, no en 6 horas (para notar que se corrigió)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const llamadas = stub([]);
    await cargarFeriados(env(), 1000);
    await cargarFeriados(env(), 1030);
    expect(llamadas.filter((u) => u.includes('/values/FERIADOS')).length).toBe(1);
    stub([['2026-12-25', 'Navidad']]);
    expect([...(await cargarFeriados(env(), 1061))]).toEqual(['2026-12-25']);
  });

  it('si ninguna fila trae una fecha válida (por ejemplo, fecha y nombre pegados en una celda), el aviso lo dice', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stub([['2026-01-01	Año Nuevo'], ['2026-04-03	Viernes Santo']]);
    expect((await cargarFeriados(env(), 1000)).size).toBe(0);
    expect(error.mock.calls.some((c) => String(c[0]).includes('2 filas leídas, ninguna con fecha'))).toBe(true);
  });

  it('una hoja vacía avisa en el log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stub([]);
    expect((await cargarFeriados(env(), 1000)).size).toBe(0);
    expect(error.mock.calls.some((c) => String(c[0]).includes('FERIADOS no aporta feriados'))).toBe(true);
  });

  it('sin credenciales no llama a Google', async () => {
    const llamadas = stub([['2026-12-25']]);
    expect((await cargarFeriados({}, 1000)).size).toBe(0);
    expect(llamadas).toHaveLength(0);
  });
});
