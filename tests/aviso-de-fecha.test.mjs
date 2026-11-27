import { describe, expect, it } from 'vitest';
import { avisoDeFecha } from '../panel/admin/aviso-de-fecha.js';

const HOY = '2026-11-27'; // viernes

describe('aviso al elegir la fecha de entrega (D101)', () => {
  it('un día de semana desde hoy no tiene aviso', () => {
    expect(avisoDeFecha('2026-11-27', HOY)).toBe('');
    expect(avisoDeFecha('2026-11-30', HOY)).toBe('');
  });
  it('avisa el domingo, el sábado corto, el pasado y los días sin reparto', () => {
    expect(avisoDeFecha('2026-11-29', HOY)).toBe('Es domingo: no hay reparto.');
    expect(avisoDeFecha('2026-11-28', HOY)).toBe('Es sábado: el reparto es hasta las 15:00.');
    expect(avisoDeFecha('2026-11-26', HOY)).toBe('Esa fecha ya pasó.');
    expect(avisoDeFecha('2026-12-02', HOY, { '2026-12-02': 'mantención del furgón' })).toBe('Ese día está marcado sin reparto (mantención del furgón).');
    expect(avisoDeFecha('2026-12-02', HOY, { '2026-12-02': '' })).toBe('Ese día está marcado sin reparto.');
  });
  it('una fecha vacía no avisa nada', () => {
    expect(avisoDeFecha('', HOY)).toBe('');
  });
});
