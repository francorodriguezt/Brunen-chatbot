import { afterEach, describe, expect, it, vi } from 'vitest';
import { olvidarTokens } from '../src/google';
import { aEnteroCLP, claveDeColumna, filasConEncabezado, leerHoja, olvidarHojas } from '../src/hojas';
import { entornoGoogle, lecturasDe, stubGoogle } from './ayudas';

afterEach(() => {
  olvidarHojas();
  olvidarTokens();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const contarFilas = (nombre = 'DEMO') => ({
  nombre,
  rango: `${nombre}!A1:B`,
  parsear: (filas: string[][]) => filas.length,
  duracionSegundos: 600,
});

describe('leerHoja', () => {
  it('recuerda el resultado y no vuelve a leer hasta que vence', async () => {
    const llamadas = stubGoogle({ DEMO: [['a'], ['b']] });
    const env = await entornoGoogle();
    expect(await leerHoja(env, contarFilas(), 1000)).toBe(2);
    expect(await leerHoja(env, contarFilas(), 1500)).toBe(2);
    expect(lecturasDe(llamadas, 'DEMO')).toBe(1);
    await leerHoja(env, contarFilas(), 1601);
    expect(lecturasDe(llamadas, 'DEMO')).toBe(2);
  });

  it('cada hoja y cada planilla tienen su propia memoria', async () => {
    const llamadas = stubGoogle({ UNA: [['x']], OTRA: [['x'], ['y'], ['z']] });
    const env = await entornoGoogle();
    expect(await leerHoja(env, contarFilas('UNA'), 1000)).toBe(1);
    expect(await leerHoja(env, contarFilas('OTRA'), 1000)).toBe(3);
    expect(await leerHoja({ ...env, GOOGLE_SHEET_ID: 'OTRA_PLANILLA' }, contarFilas('UNA'), 1000)).toBe(1);
    expect(lecturasDe(llamadas, 'UNA')).toBe(2);
  });

  it('sin credenciales devuelve undefined y no llama a Google', async () => {
    const llamadas = stubGoogle({ DEMO: [['a']] });
    expect(await leerHoja({}, contarFilas(), 1000)).toBeUndefined();
    expect(await leerHoja({ GOOGLE_SHEET_ID: 'X' }, contarFilas(), 1000)).toBeUndefined();
    expect(llamadas).toHaveLength(0);
  });

  it('un fallo devuelve lo último que se leyó y no se reintenta en cada llamada', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await entornoGoogle();
    stubGoogle({ DEMO: [['a']] });
    await leerHoja(env, contarFilas(), 1000);
    const llamadas = stubGoogle({ DEMO: 'falla' });
    expect(await leerHoja(env, contarFilas(), 1700)).toBe(1);
    expect(await leerHoja(env, contarFilas(), 1730)).toBe(1);
    expect(lecturasDe(llamadas, 'DEMO')).toBe(1);
  });

  it('un fallo sin nada guardado devuelve undefined', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubGoogle({ DEMO: 'falla' });
    expect(await leerHoja(await entornoGoogle(), contarFilas(), 1000)).toBeUndefined();
    expect(String(error.mock.calls[0]?.[0])).toContain('No se pudo leer DEMO');
  });

  it('un resultado vacío se recuerda solo un minuto y se avisa con el texto de la hoja', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await entornoGoogle();
    const opciones = { ...contarFilas(), esVacio: (n: number) => n === 0, avisoVacio: (filas: string[][]) => `vacía (${filas.length})` };
    const llamadas = stubGoogle({ DEMO: [] });
    expect(await leerHoja(env, opciones, 1000)).toBe(0);
    expect(error.mock.calls.some((c) => c[0] === 'vacía (0)')).toBe(true);
    await leerHoja(env, opciones, 1030);
    expect(lecturasDe(llamadas, 'DEMO')).toBe(1);
    stubGoogle({ DEMO: [['a']] });
    expect(await leerHoja(env, opciones, 1061)).toBe(1);
  });

  it('el error de lectura no incluye la clave ni el contenido de la hoja', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubGoogle({ DEMO: 'falla' });
    await leerHoja(await entornoGoogle(), contarFilas(), 1000);
    expect(JSON.stringify(error.mock.calls)).not.toContain('PRIVATE KEY');
  });
});

describe('claveDeColumna', () => {
  it('deja el nombre sin tildes, mayúsculas ni signos', () => {
    expect(claveDeColumna('Precio_Especial_20L')).toBe('precio_especial_20l');
    expect(claveDeColumna(' Dirección ')).toBe('direccion');
    expect(claveDeColumna('Fecha Último Pedido')).toBe('fecha_ultimo_pedido');
  });
});

describe('filasConEncabezado', () => {
  it('asigna cada dato a su columna por el nombre del encabezado, aunque cambie el orden', () => {
    const filas = [['Nombre', 'Telefono', 'Comuna'], ['Ana', '56911111111', 'Ñuñoa'], ['Luis', '56922222222']];
    expect(filasConEncabezado(filas)).toEqual([
      { nombre: 'Ana', telefono: '56911111111', comuna: 'Ñuñoa' },
      { nombre: 'Luis', telefono: '56922222222', comuna: '' },
    ]);
  });

  it('sin filas o solo con encabezado no hay registros', () => {
    expect(filasConEncabezado([])).toEqual([]);
    expect(filasConEncabezado([['A', 'B']])).toEqual([]);
  });

  it('ignora las columnas sin nombre', () => {
    expect(filasConEncabezado([['A', '', 'C'], ['1', '2', '3']])).toEqual([{ a: '1', c: '3' }]);
  });
});

describe('aEnteroCLP', () => {
  it('entiende los montos como los escribe la gente', () => {
    expect(aEnteroCLP('4500')).toBe(4500);
    expect(aEnteroCLP('$4.500')).toBe(4500);
    expect(aEnteroCLP(' $ 3.300 ')).toBe(3300);
  });

  it('vacío o sin dígitos es null', () => {
    expect(aEnteroCLP('')).toBeNull();
    expect(aEnteroCLP(undefined)).toBeNull();
    expect(aEnteroCLP('sin precio')).toBeNull();
  });
});

describe('lecturas a la vez', () => {
  it('varias hojas pedidas juntas con el Worker recién arrancado piden un solo token (firmar el JWT gasta CPU)', async () => {
    const llamadas = stubGoogle({ UNA: [['x']], OTRA: [['x']], TERCERA: [['x']] });
    const env = await entornoGoogle();
    await Promise.all(['UNA', 'OTRA', 'TERCERA'].map((hoja) => leerHoja(env, contarFilas(hoja), 1000)));
    expect(llamadas.filter((u) => u.startsWith('https://oauth2.googleapis.com'))).toHaveLength(1);
  });

  it('la misma hoja pedida dos veces a la vez se lee una sola vez', async () => {
    const llamadas = stubGoogle({ DEMO: [['a'], ['b']] });
    const env = await entornoGoogle();
    const [uno, dos] = await Promise.all([leerHoja(env, contarFilas(), 1000), leerHoja(env, contarFilas(), 1000)]);
    expect([uno, dos]).toEqual([2, 2]);
    expect(lecturasDe(llamadas, 'DEMO')).toBe(1);
  });

  it('si el token falla, todos los que esperaban lo saben y el siguiente intento vuelve a pedirlo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await entornoGoogle();
    let intentos = 0;
    vi.stubGlobal('fetch', async (url: string) => {
      if (url.startsWith('https://oauth2.googleapis.com')) {
        intentos++;
        return new Response('{"error":"invalid_grant"}', { status: 400 });
      }
      return new Response('{"values":[]}', { status: 200 });
    });
    const resultados = await Promise.all([leerHoja(env, contarFilas('UNA'), 1000), leerHoja(env, contarFilas('OTRA'), 1000)]);
    expect(resultados).toEqual([undefined, undefined]);
    expect(intentos).toBe(1);
    olvidarHojas();
    await leerHoja(env, contarFilas('UNA'), 1100);
    expect(intentos).toBe(2);
  });
});

describe('clave de Google dañada', () => {
  it('el aviso del log no repite ningún trozo de la clave', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = { GOOGLE_SERVICE_ACCOUNT_JSON: '{"private_key": "SECRETO-QUE-NO-DEBE-SALIR" <<<', GOOGLE_SHEET_ID: 'X' };
    expect(await leerHoja(env, contarFilas(), 1000)).toBeUndefined();
    expect(JSON.stringify(error.mock.calls)).toContain('no es un JSON válido');
    expect(JSON.stringify(error.mock.calls)).not.toContain('SECRETO');
  });
});
