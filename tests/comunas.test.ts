import { describe, expect, it } from 'vitest';
import { COMUNAS_ATENDIDAS, OTRAS_COMUNAS_RM, detectarComuna, esComunaAtendida } from '../src/comunas';

describe('listas de comunas', () => {
  it('son las 12 atendidas y las 40 restantes de las 52 de la Región Metropolitana, sin repetir', () => {
    expect(COMUNAS_ATENDIDAS).toHaveLength(12);
    expect(OTRAS_COMUNAS_RM).toHaveLength(40);
    expect(new Set([...COMUNAS_ATENDIDAS, ...OTRAS_COMUNAS_RM]).size).toBe(52);
  });
});

describe('detectarComuna', () => {
  it.each([
    ['entregan en Ñuñoa?', 'Ñuñoa'],
    ['dos de 20 para nunoa', 'Ñuñoa'],
    ['vivo en Peñalolen', 'Peñalolén'],
    ['PROVIDENCIA', 'Providencia'],
    ['voy a Las Condes', 'Las Condes'],
    ['en la reina', 'La Reina'],
    ['San Joaquin porfa', 'San Joaquín'],
    ['llegan a lo barnechea?', 'Lo Barnechea'],
    ['macul', 'Macul'],
    ['Vitacura', 'Vitacura'],
    ['recoleta', 'Recoleta'],
    ['huechuraba', 'Huechuraba'],
  ])('%j -> comuna atendida %s', (texto, nombre) => {
    expect(detectarComuna(texto)).toEqual({ nombre, atendida: true });
  });

  it.each([
    ['llegan a Maipú?', 'Maipú'],
    ['soy de maipu', 'Maipú'],
    ['La Florida', 'La Florida'],
    ['puente alto', 'Puente Alto'],
    ['San Bernardo', 'San Bernardo'],
    ['estacion central', 'Estación Central'],
  ])('%j -> comuna fuera de zona %s', (texto, nombre) => {
    expect(detectarComuna(texto)).toEqual({ nombre, atendida: false });
  });

  it('entiende "santiago" y "stgo" como Santiago Centro', () => {
    expect(detectarComuna('para santiago')).toEqual({ nombre: 'Santiago Centro', atendida: true });
    expect(detectarComuna('stgo centro')).toEqual({ nombre: 'Santiago Centro', atendida: true });
    expect(detectarComuna('santiago centro')).toEqual({ nombre: 'Santiago Centro', atendida: true });
  });

  it('con varias comunas gana una atendida: una calle con nombre de comuna no la reemplaza (D39)', () => {
    expect(detectarComuna('de Maipú a Ñuñoa')?.nombre).toBe('Ñuñoa');
    expect(detectarComuna('Av. Independencia 1500, Recoleta')).toEqual({ nombre: 'Recoleta', atendida: true });
    expect(detectarComuna('Pasaje San Pedro 123, Ñuñoa')).toEqual({ nombre: 'Ñuñoa', atendida: true });
    expect(detectarComuna('Ñuñoa, calle San Pedro 12')).toEqual({ nombre: 'Ñuñoa', atendida: true });
  });

  it('entre varias atendidas gana la última, que es donde se escribe la comuna de una dirección (D39)', () => {
    expect(detectarComuna('Av. Las Condes 12000, Lo Barnechea')?.nombre).toBe('Lo Barnechea');
    expect(detectarComuna('Av. Vitacura 5000, Las Condes')?.nombre).toBe('Las Condes');
    expect(detectarComuna('Calle Santiago Apóstol 123, Macul')?.nombre).toBe('Macul');
  });

  it('si ninguna es atendida, gana la última', () => {
    expect(detectarComuna('Av. Independencia 1500, Maipú')).toEqual({ nombre: 'Maipú', atendida: false });
  });

  it('solo reconoce palabras completas', () => {
    expect(detectarComuna('reina')).toBeNull();
    expect(detectarComuna('maculado')).toBeNull();
    expect(detectarComuna('el buinar')).toBeNull();
  });

  it('devuelve null si no hay comuna', () => {
    expect(detectarComuna('hola, 2 bidones de 20')).toBeNull();
    expect(detectarComuna('')).toBeNull();
  });
});

describe('esComunaAtendida', () => {
  it('distingue las 12 atendidas del resto', () => {
    expect(esComunaAtendida('Providencia')).toBe(true);
    expect(esComunaAtendida('Maipú')).toBe(false);
    expect(esComunaAtendida('Narnia')).toBe(false);
  });
});
