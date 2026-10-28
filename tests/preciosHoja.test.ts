import { afterEach, describe, expect, it, vi } from 'vitest';
import { olvidarTokens } from '../src/google';
import { olvidarHojas } from '../src/hojas';
import { TABLA_PRECIOS, cotizarPedido } from '../src/precios';
import { cargarTablaPrecios, parsearTablaPrecios } from '../src/preciosHoja';
import { entornoGoogle, stubGoogle } from './ayudas';

afterEach(() => {
  olvidarHojas();
  olvidarTokens();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const ENCABEZADO = ['Tipo', 'Desde', 'Hasta', 'Precio'];
// La hoja tal como la deja `npm run preparar-planilla`.
const HOJA_BUENA: string[][] = [
  ENCABEZADO,
  ['20L', '1', '1', '4500'],
  ['20L', '2', '3', '3300'],
  ['20L', '4', '', '2750'],
  ['12L', '1', '1', '2500'],
  ['12L', '2', '', '2400'],
  ['10L', '1', '', '2200'],
];

describe('parsearTablaPrecios', () => {
  it('la hoja del proyecto da la misma tabla que el documento de conocimiento', () => {
    const { tabla, problemas } = parsearTablaPrecios(HOJA_BUENA);
    expect(problemas).toEqual([]);
    expect(tabla).toEqual(TABLA_PRECIOS);
  });

  it('entiende los precios con formato de pesos y los tipos escritos de otras formas', () => {
    const { tabla, problemas } = parsearTablaPrecios([
      ENCABEZADO,
      ['20', '1', '', '$4.500'],
      [' 12 l ', '1', '', '2.500'],
      ['10 Litros', '1', '', '2200'],
    ]);
    expect(problemas).toEqual([]);
    expect(tabla.map((t) => [t.tipo, t.precio])).toEqual([['20L', 4500], ['12L', 2500], ['10L', 2200]]);
  });

  it('un cambio de precio en la hoja se refleja en la cotización', () => {
    const subida = HOJA_BUENA.map((fila) => (fila[0] === '20L' && fila[1] === '2' ? ['20L', '2', '3', '3400'] : fila));
    const { tabla } = parsearTablaPrecios(subida);
    expect(cotizarPedido([{ tipo: '20L', cantidad: 2 }], { tipo: 'normal' }, tabla).total).toBe(6800);
  });

  it('ignora las filas en blanco', () => {
    const { problemas } = parsearTablaPrecios([...HOJA_BUENA, ['', '', '', ''], []]);
    expect(problemas).toEqual([]);
  });

  it.each([
    ['un tipo que no existe', [['15L', '1', '', '3000']], 'no es 10, 12 ni 20 litros'],
    ['un precio ilegible', [['20L', '1', '', 'gratis']], 'el precio no es válido'],
    ['un precio cero', [['20L', '1', '', '0']], 'el precio no es válido'],
    ['"Desde" vacío', [['20L', '', '', '4500']], '"Desde" debe ser'],
    ['"Hasta" menor que "Desde"', [['20L', '5', '3', '4500']], '"Hasta" es menor'],
  ])('avisa de %s', (_nombre, filas, texto) => {
    const { problemas } = parsearTablaPrecios([ENCABEZADO, ...filas]);
    expect(problemas.join(' ')).toContain(texto);
  });

  it('detecta tramos con huecos, que se pisan o sin el tramo "o más"', () => {
    const hueco = parsearTablaPrecios([ENCABEZADO, ['20L', '1', '1', '4500'], ['20L', '3', '', '3300']]);
    expect(hueco.problemas.join(' ')).toContain('debería empezar en 2');
    const pisa = parsearTablaPrecios([ENCABEZADO, ['20L', '1', '3', '4500'], ['20L', '2', '', '3300']]);
    expect(pisa.problemas.join(' ')).toContain('debería empezar en 4');
    const sinAbierto = parsearTablaPrecios([ENCABEZADO, ['20L', '1', '3', '4500']]);
    expect(sinAbierto.problemas.join(' ')).toContain('falta el tramo "o más"');
    const noEmpiezaEnUno = parsearTablaPrecios([ENCABEZADO, ['20L', '2', '', '3300']]);
    expect(noEmpiezaEnUno.problemas.join(' ')).toContain('debería empezar en 1');
  });
});

describe('cargarTablaPrecios', () => {
  it('con una hoja correcta usa la de la hoja', async () => {
    stubGoogle({ PRECIOS: HOJA_BUENA });
    const r = await cargarTablaPrecios(await entornoGoogle(), 1000);
    expect(r).toEqual({ tabla: TABLA_PRECIOS, origen: 'hoja', problemas: [] });
  });

  it('con una hoja con errores usa el respaldo y lo marca (el flujo debe mandar el pedido a revisión)', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubGoogle({ PRECIOS: [ENCABEZADO, ['20L', '1', '1', '4500'], ['20L', '3', '', '3300']] });
    const r = await cargarTablaPrecios(await entornoGoogle(), 1000);
    expect(r.origen).toBe('respaldo');
    expect(r.tabla).toBe(TABLA_PRECIOS);
    expect(r.problemas.length).toBeGreaterThan(0);
    expect(error).toHaveBeenCalled();
  });

  it('con la hoja vacía usa el respaldo', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubGoogle({ PRECIOS: [ENCABEZADO] });
    const r = await cargarTablaPrecios(await entornoGoogle(), 1000);
    expect(r.origen).toBe('respaldo');
    expect(r.problemas).toEqual(['La hoja PRECIOS está vacía.']);
  });

  it('si Google falla usa el respaldo y lo dice', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    stubGoogle({ PRECIOS: 'falla' });
    const r = await cargarTablaPrecios(await entornoGoogle(), 1000);
    expect(r).toMatchObject({ origen: 'respaldo', problemas: ['No se pudo leer la hoja PRECIOS.'] });
  });

  it('sin credenciales usa el respaldo', async () => {
    expect((await cargarTablaPrecios({}, 1000)).origen).toBe('respaldo');
  });

  it('si la hoja se corrige, al minuto el bot usa la nueva', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await entornoGoogle();
    stubGoogle({ PRECIOS: [ENCABEZADO] });
    expect((await cargarTablaPrecios(env, 1000)).origen).toBe('respaldo');
    stubGoogle({ PRECIOS: HOJA_BUENA });
    expect((await cargarTablaPrecios(env, 1061)).origen).toBe('hoja');
  });
});
