import { describe, expect, it } from 'vitest';
import { normalizar, numerosACifras, preparar } from '../src/texto';

describe('normalizar', () => {
  it.each([
    ['Hola, me puede traer 2 bidones de 20 mañana?', 'hola me puede traer 2 bidones de 20 manana?'],
    ['DOS BIDÓNES de 20LTS!!', 'dos bidones de 20 lts'],
    ['dos de veinte litros para Ñuñoa', 'dos de veinte litros para nunoa'],
    ['2x20', '2 x 20'],
    ['x2 de 12L.', 'x 2 de 12 l'],
    ['  lo   de\nsiempre  ', 'lo de siempre'],
    ['¿cuánto sale el bidón de 20?', 'cuanto sale el bidon de 20?'],
    ['15/11 por favor 🙏', '15/11 por favor'],
    ['', ''],
    ['👍', ''],
  ])('%j -> %j', (entrada, esperado) => {
    expect(normalizar(entrada)).toBe(esperado);
  });
});

describe('numerosACifras', () => {
  it.each([
    ['dos de veinte litros', '2 de 20 litros'],
    ['un par de bidones de doce', '2 bidones de 12'],
    ['una de 20 y tres de 12', '1 de 20 y 3 de 12'],
    ['veintidos bidones', '22 bidones'],
    ['quiero un bidon', 'quiero 1 bidon'],
    // Solo palabras completas: no se tocan las que contienen un número.
    ['dosis unidad tresillo', 'dosis unidad tresillo'],
  ])('%j -> %j', (entrada, esperado) => {
    expect(numerosACifras(entrada)).toBe(esperado);
  });
});

describe('preparar', () => {
  it('normaliza y pasa a cifras en un solo paso', () => {
    expect(preparar('Dos BIDONES de Veinte Litros para Ñuñoa')).toBe('2 bidones de 20 litros para nunoa');
  });
});
