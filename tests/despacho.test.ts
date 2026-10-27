import { describe, expect, it } from 'vitest';
import { calcularFechaEntrega, diaSemana, fechaHoraLocal, siguienteDiaDespacho } from '../src/despacho';

// Feriados de PRUEBA (ficticios). Los reales se leen de la hoja FERIADOS.
const SIN_FERIADOS = new Set<string>();

function entrega(isoConZona: string, feriados: ReadonlySet<string> = SIN_FERIADOS) {
  return calcularFechaEntrega(new Date(isoConZona), { feriados });
}

describe('calendario base', () => {
  it('2026-10-27 es martes y 2026-11-01 es domingo', () => {
    expect(diaSemana('2026-10-27')).toBe(2);
    expect(diaSemana('2026-11-01')).toBe(0);
  });

  it('convierte un instante UTC a la hora local de Santiago', () => {
    // 02:30 UTC del 28 = 23:30 del 27 en Santiago (UTC-3 en horario de verano)
    expect(fechaHoraLocal(new Date('2026-10-28T02:30:00Z'))).toEqual({ fecha: '2026-10-27', hora: 23, minuto: 30 });
  });
});

describe('corte de las 9:00', () => {
  it('martes 08:59 -> mismo día', () => {
    expect(entrega('2026-10-27T08:59:00-03:00')).toEqual({ fecha: '2026-10-27', mismoDia: true });
  });

  it('martes 09:00 exacto -> mismo día ("hasta las 9:00" es inclusivo)', () => {
    expect(entrega('2026-10-27T09:00:00-03:00')).toEqual({ fecha: '2026-10-27', mismoDia: true });
  });

  it('martes 09:01 -> miércoles', () => {
    expect(entrega('2026-10-27T09:01:00-03:00')).toEqual({ fecha: '2026-10-28', mismoDia: false });
  });

  it('pedido a las 23:30 hora Chile (ya es otro día en UTC) -> día siguiente', () => {
    expect(entrega('2026-10-28T02:30:00Z')).toEqual({ fecha: '2026-10-28', mismoDia: false });
  });

  it('horario de invierno (UTC-4): miércoles 08:30 -> mismo día', () => {
    expect(entrega('2026-07-15T12:30:00Z')).toEqual({ fecha: '2026-07-15', mismoDia: true });
  });
});

describe('sábados, domingos y feriados', () => {
  it('viernes 10:00 -> sábado (el sábado sí se despacha)', () => {
    expect(entrega('2026-10-30T10:00:00-03:00')).toEqual({ fecha: '2026-10-31', mismoDia: false });
  });

  it('sábado 08:00 -> mismo sábado', () => {
    expect(entrega('2026-10-31T08:00:00-03:00')).toEqual({ fecha: '2026-10-31', mismoDia: true });
  });

  it('sábado 10:00 -> lunes (el domingo no se despacha)', () => {
    expect(entrega('2026-10-31T10:00:00-03:00')).toEqual({ fecha: '2026-11-02', mismoDia: false });
  });

  it('domingo 07:00 -> lunes, aunque sea antes del corte', () => {
    expect(entrega('2026-11-01T07:00:00-03:00')).toEqual({ fecha: '2026-11-02', mismoDia: false });
  });

  it('feriado antes del corte -> siguiente día de despacho', () => {
    const feriados = new Set(['2026-10-28']);
    expect(entrega('2026-10-28T08:00:00-03:00', feriados)).toEqual({ fecha: '2026-10-29', mismoDia: false });
  });

  it('sábado tarde con lunes feriado -> martes', () => {
    const feriados = new Set(['2026-11-02']);
    expect(entrega('2026-10-31T12:00:00-03:00', feriados)).toEqual({ fecha: '2026-11-03', mismoDia: false });
  });

  it('falla en vez de colgarse si la hoja FERIADOS trae una racha imposible', () => {
    const feriados = new Set(Array.from({ length: 40 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 10, 2 + i));
      return d.toISOString().slice(0, 10);
    }));
    expect(() => siguienteDiaDespacho('2026-11-01', feriados)).toThrow();
  });
});
