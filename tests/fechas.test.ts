import { describe, expect, it } from 'vitest';
import { resolverFechaTexto } from '../src/fechas';

// Miércoles 28 de octubre de 2026.
const HOY = '2026-10-28';

describe('resolverFechaTexto', () => {
  it('hoy, mañana y pasado mañana', () => {
    expect(resolverFechaTexto('hoy', HOY)).toBe('2026-10-28');
    expect(resolverFechaTexto('mañana', HOY)).toBe('2026-10-29');
    expect(resolverFechaTexto('pasado mañana', HOY)).toBe('2026-10-30');
  });

  it('un día de la semana es el próximo que viene, nunca hoy', () => {
    expect(resolverFechaTexto('viernes', HOY)).toBe('2026-10-30');
    expect(resolverFechaTexto('sábado', HOY)).toBe('2026-10-31');
    expect(resolverFechaTexto('domingo', HOY)).toBe('2026-11-01');
    expect(resolverFechaTexto('lunes', HOY)).toBe('2026-11-02');
    expect(resolverFechaTexto('miércoles', HOY)).toBe('2026-11-04'); // hoy es miércoles: en 7 días
  });

  it('entiende el artículo y las tildes', () => {
    expect(resolverFechaTexto('el viernes', HOY)).toBe('2026-10-30');
    expect(resolverFechaTexto('para el sabado', HOY)).toBe('2026-10-31');
    expect(resolverFechaTexto('Miercoles', HOY)).toBe('2026-11-04');
    expect(resolverFechaTexto('el próximo lunes', HOY)).toBe('2026-11-02');
  });

  it('día y mes: la próxima vez que cae, hoy incluido', () => {
    expect(resolverFechaTexto('15 de noviembre', HOY)).toBe('2026-11-15');
    expect(resolverFechaTexto('28 de octubre', HOY)).toBe('2026-10-28');
    expect(resolverFechaTexto('27 de octubre', HOY)).toBe('2027-10-27'); // ya pasó este año
    expect(resolverFechaTexto('5 de setiembre', HOY)).toBe('2027-09-05');
    expect(resolverFechaTexto('el 15 de noviembre', HOY)).toBe('2026-11-15');
  });

  it('día/mes con barras, como se escribe en Chile', () => {
    expect(resolverFechaTexto('15/11', HOY)).toBe('2026-11-15');
    expect(resolverFechaTexto('3/12', HOY)).toBe('2026-12-03');
    expect(resolverFechaTexto('15/11/2026', HOY)).toBe('2026-11-15');
    expect(resolverFechaTexto('15/11/26', HOY)).toBe('2026-11-15');
    expect(resolverFechaTexto('2/1', HOY)).toBe('2027-01-02');
  });

  it('una fecha con año que ya pasó no sirve', () => {
    expect(resolverFechaTexto('15/11/2025', HOY)).toBeNull();
  });

  it('"el 20" es el próximo día 20 desde mañana', () => {
    expect(resolverFechaTexto('el 20', HOY)).toBe('2026-11-20');
    expect(resolverFechaTexto('el 30', HOY)).toBe('2026-10-30');
    expect(resolverFechaTexto('el 28', HOY)).toBe('2026-11-28'); // hoy es 28: el próximo
    expect(resolverFechaTexto('el dia 5', HOY)).toBe('2026-11-05');
  });

  it('"el 31" salta al mes que sí tiene ese día', () => {
    expect(resolverFechaTexto('el 31', '2026-11-02')).toBe('2026-12-31'); // noviembre no tiene 31
  });

  it('cruza el fin de año', () => {
    expect(resolverFechaTexto('el 5', '2026-12-30')).toBe('2027-01-05');
  });

  it('las fechas que no existen en el calendario dan null', () => {
    expect(resolverFechaTexto('31 de abril', HOY)).toBeNull();
    expect(resolverFechaTexto('30/02', HOY)).toBeNull();
    expect(resolverFechaTexto('45 de noviembre', HOY)).toBeNull();
  });

  it('lo que no se entiende da null', () => {
    for (const texto of ['', 'cuando puedan', 'la otra semana', '15 de marzoo', 'ayer']) {
      expect(resolverFechaTexto(texto, HOY)).toBeNull();
    }
  });
});
