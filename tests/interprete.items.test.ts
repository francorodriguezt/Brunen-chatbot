import { describe, expect, it } from 'vitest';
import { extraerFecha, extraerItems } from '../src/interprete';

describe('extraerItems', () => {
  it.each([
    ['2 bidones de 20', [{ tipo: '20L', cantidad: 2 }]],
    ['dos de veinte litros', [{ tipo: '20L', cantidad: 2 }]],
    ['Hola, me puede traer 2 bidones de 20 mañana?', [{ tipo: '20L', cantidad: 2 }]],
    ['3 de 20 y 1 de 12 porfa', [{ tipo: '20L', cantidad: 3 }, { tipo: '12L', cantidad: 1 }]],
    ['un bidon de 10', [{ tipo: '10L', cantidad: 1 }]],
    ['necesito 12 bidones de 12', [{ tipo: '12L', cantidad: 12 }]],
    ['12 de 20', [{ tipo: '20L', cantidad: 12 }]],
    ['un par de bidones de 20', [{ tipo: '20L', cantidad: 2 }]],
    ['2 vidones de 20', [{ tipo: '20L', cantidad: 2 }]],
    ['5 bidonez de 12 lts', [{ tipo: '12L', cantidad: 5 }]],
    ['bidon de 20 x 3', [{ tipo: '20L', cantidad: 3 }]],
    ['quiero 4 bidones', [{ tipo: 'no_especificado', cantidad: 4 }]],
    ['dos de 20 y tres bidones', [{ tipo: '20L', cantidad: 2 }, { tipo: 'no_especificado', cantidad: 3 }]],
    // Un solo bidón nombrado sin número es uno; en plural no dicen cuántos.
    ['bidon de 20', [{ tipo: '20L', cantidad: 1 }]],
    ['bidones de 20', [{ tipo: '20L', cantidad: null }]],
    ['20 litros', [{ tipo: '20L', cantidad: null }]],
    // Mismo tipo dos veces: suma.
    ['2 de 20 y 1 de 20', [{ tipo: '20L', cantidad: 3 }]],
    // Una fecha no es un pedido.
    ['para el 12 de agosto 3 de 20', [{ tipo: '20L', cantidad: 3 }]],
    ['el 20 de noviembre quiero 2 de 12', [{ tipo: '12L', cantidad: 2 }]],
    ['0 bidones', []],
    ['hola', []],
    ['lo de siempre', []],
    ['', []],
  ] as const)('%j', (texto, esperado) => {
    expect(extraerItems(texto)).toEqual(esperado);
  });
});

describe('extraerFecha', () => {
  it.each([
    ['mañana', 'mañana'],
    ['Para mañana por favor', 'mañana'],
    ['pasado mañana', 'pasado mañana'],
    ['hoy mismo', 'hoy'],
    ['el lunes', 'lunes'],
    ['para el miércoles', 'miércoles'],
    ['sabado', 'sábado'],
    ['15 de noviembre', '15 de noviembre'],
    ['para el 15/11', '15/11'],
    ['para el 20', 'el 20'],
    ['para el 15 de noviembre', '15 de noviembre'],
    ['mañana lunes', 'mañana'],
    // "en la mañana" es una hora del día, no el día siguiente.
    ['en la mañana', undefined],
    ['esta mañana', undefined],
    ['mañana en la mañana', 'mañana'],
    ['hola', undefined],
    ['', undefined],
  ])('%j -> %j', (texto, esperado) => {
    expect(extraerFecha(texto)).toBe(esperado);
  });
});
