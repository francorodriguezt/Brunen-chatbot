import { describe, expect, it } from 'vitest';
import { firmaDeCambios, textoDeCambios } from '../panel/repartidor/cambios.js';

// Todo ficticio.
describe('aviso de cambios sin publicar en la app del repartidor (D102)', () => {
  it('nombra a quién se agregó al final y quién ya no va', () => {
    expect(textoDeCambios({ agregadas: [{ nombre: 'Ana Prueba', comuna: 'Ñuñoa' }], quitadas: [] })).toBe('Se agregó Ana Prueba (Ñuñoa) al final.');
    expect(
      textoDeCambios({
        agregadas: [{ nombre: 'Ana', comuna: 'Ñuñoa' }, { nombre: 'Luis', comuna: '' }],
        quitadas: [{ nombre: 'Pedro', comuna: 'Macul' }, { nombre: '', comuna: '' }],
      }),
    ).toBe('Se agregaron Ana (Ñuñoa) y Luis al final. Ya no van Pedro (Macul) y un cliente.');
  });
  it('sin cambios no hay texto ni firma; otro cambio da otra firma', () => {
    expect(textoDeCambios(null)).toBe('');
    expect(firmaDeCambios('2026-11-27', { agregadas: [], quitadas: [] })).toBe('');
    const una = firmaDeCambios('2026-11-27', { agregadas: [{ nombre: 'Ana', comuna: '' }], quitadas: [] });
    const otra = firmaDeCambios('2026-11-27', { agregadas: [{ nombre: 'Ana', comuna: '' }, { nombre: 'Luis', comuna: '' }], quitadas: [] });
    expect(una).not.toBe('');
    expect(una).not.toBe(otra);
  });
});
