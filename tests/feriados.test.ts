import { afterEach, describe, expect, it, vi } from 'vitest';
import { cargarFeriados, parsearFeriados } from '../src/feriados';
import { olvidarTokens } from '../src/google';
import { olvidarHojas } from '../src/hojas';
import { entornoGoogle, lecturasDe, stubGoogle } from './ayudas';

afterEach(() => {
  olvidarHojas();
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
  it('lee la hoja FERIADOS y guarda el resultado en memoria', async () => {
    const llamadas = stubGoogle({ FERIADOS: [['2026-12-25', 'Navidad'], ['2027-01-01', 'Año Nuevo']] });
    const env = await entornoGoogle();
    expect([...(await cargarFeriados(env, 1000))].sort()).toEqual(['2026-12-25', '2027-01-01']);
    await cargarFeriados(env, 2000);
    expect(lecturasDe(llamadas, 'FERIADOS')).toBe(1);
  });

  it('vuelve a leer cuando pasó la duración de la memoria', async () => {
    const llamadas = stubGoogle({ FERIADOS: [['2026-12-25']] });
    const env = await entornoGoogle();
    await cargarFeriados(env, 1000);
    await cargarFeriados(env, 1000 + 7 * 3600);
    expect(lecturasDe(llamadas, 'FERIADOS')).toBe(2);
  });

  it('si Google falla devuelve lo último que se leyó', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await entornoGoogle();
    stubGoogle({ FERIADOS: [['2026-12-25']] });
    await cargarFeriados(env, 1000);
    stubGoogle({ FERIADOS: 'falla' });
    expect([...(await cargarFeriados(env, 1000 + 7 * 3600))]).toEqual(['2026-12-25']);
  });

  it('si no hay nada guardado y Google falla, devuelve vacío y lo anota', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubGoogle({ FERIADOS: 'falla' });
    expect((await cargarFeriados(await entornoGoogle(), 1000)).size).toBe(0);
    expect(error).toHaveBeenCalled();
  });

  it('una hoja vacía se vuelve a leer en un minuto, no en 6 horas (para notar que se corrigió)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const env = await entornoGoogle();
    const llamadas = stubGoogle({ FERIADOS: [] });
    await cargarFeriados(env, 1000);
    await cargarFeriados(env, 1030);
    expect(lecturasDe(llamadas, 'FERIADOS')).toBe(1);
    stubGoogle({ FERIADOS: [['2026-12-25', 'Navidad']] });
    expect([...(await cargarFeriados(env, 1061))]).toEqual(['2026-12-25']);
  });

  it('si ninguna fila trae una fecha válida (por ejemplo, fecha y nombre pegados en una celda), el aviso lo dice', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubGoogle({ FERIADOS: [['2026-01-01\tAño Nuevo'], ['2026-04-03\tViernes Santo']] });
    expect((await cargarFeriados(await entornoGoogle(), 1000)).size).toBe(0);
    expect(error.mock.calls.some((c) => String(c[0]).includes('2 filas leídas, ninguna con fecha'))).toBe(true);
  });

  it('una hoja vacía avisa en el log', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubGoogle({ FERIADOS: [] });
    expect((await cargarFeriados(await entornoGoogle(), 1000)).size).toBe(0);
    expect(error.mock.calls.some((c) => String(c[0]).includes('FERIADOS no aporta feriados'))).toBe(true);
  });

  it('sin credenciales no llama a Google', async () => {
    const llamadas = stubGoogle({ FERIADOS: [['2026-12-25']] });
    expect((await cargarFeriados({}, 1000)).size).toBe(0);
    expect(llamadas).toHaveLength(0);
  });
});
