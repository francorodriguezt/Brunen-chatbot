import { describe, expect, it } from 'vitest';
import {
  ErrorPrecio,
  cotizarCargaInicial,
  cotizarPedido,
  formatearCLP,
  precioPorTramo,
} from '../src/precios';

// Casos tomados de docs/conocimiento_brunen.md (secciones 2 y 3). Datos de clientes: ficticios.

describe('tramos por tipo y cantidad', () => {
  it.each([
    ['20L', 1, 4500, 4500],
    ['20L', 2, 3300, 6600],
    ['20L', 3, 3300, 9900],
    ['20L', 4, 2750, 11000],
    ['20L', 5, 2750, 13750],
    ['12L', 1, 2500, 2500],
    ['12L', 2, 2400, 4800],
    ['12L', 3, 2400, 7200],
    ['10L', 1, 2200, 2200],
    ['10L', 4, 2200, 8800],
  ] as const)('%s x %i -> $%i c/u, total $%i', (tipo, cantidad, unitario, total) => {
    expect(precioPorTramo(tipo, cantidad)).toBe(unitario);
    const c = cotizarPedido([{ tipo, cantidad }]);
    expect(c.total).toBe(total);
    expect(c.requiereRevision).toBe(false);
    expect(c.lineas[0]?.regla).toBe('tramo');
  });
});

describe('clientes con condiciones especiales', () => {
  it('cliente especial ($3.500) pide 1 de 20 L', () => {
    const c = cotizarPedido([{ tipo: '20L', cantidad: 1 }], { tipo: 'especial', precioEspecial20L: 3500 });
    expect(c.total).toBe(3500);
    expect(c.lineas[0]?.regla).toBe('especial');
    expect(c.requiereRevision).toBe(false);
  });

  it('cliente especial ($3.000) pide 5 de 20 L: el especial gana aunque el tramo sea más barato', () => {
    const c = cotizarPedido([{ tipo: '20L', cantidad: 5 }], { tipo: 'especial', precioEspecial20L: 3000 });
    expect(c.total).toBe(15000);
  });

  it('cliente especial pide 12 L: tramo y revisión (precio especial solo definido para 20 L)', () => {
    const c = cotizarPedido([{ tipo: '12L', cantidad: 1 }], { tipo: 'especial', precioEspecial20L: 3500 });
    expect(c.total).toBe(2500);
    expect(c.requiereRevision).toBe(true);
  });

  it('cliente especial sin precio registrado: tramo y revisión', () => {
    const c = cotizarPedido([{ tipo: '20L', cantidad: 1 }], { tipo: 'especial', precioEspecial20L: null });
    expect(c.total).toBe(4500);
    expect(c.requiereRevision).toBe(true);
  });

  it('mayorista: $1.250 por bidón de 20 L', () => {
    const c = cotizarPedido([{ tipo: '20L', cantidad: 10 }], { tipo: 'mayorista' });
    expect(c.total).toBe(12500);
    expect(c.lineas[0]?.regla).toBe('mayorista');
    expect(c.requiereRevision).toBe(false);
  });

  it.each([
    ['12L', 3, 3300],
    ['10L', 2, 2200],
  ] as const)('mayorista pide %s x %i: $1.100 c/u y sin revisión (D36)', (tipo, cantidad, total) => {
    const c = cotizarPedido([{ tipo, cantidad }], { tipo: 'mayorista' });
    expect(c.total).toBe(total);
    expect(c.lineas[0]).toMatchObject({ precioUnitario: 1100, regla: 'mayorista' });
    expect(c.requiereRevision).toBe(false);
    expect(c.motivos).toEqual([]);
  });

  it('mayorista con 20 L y 12 L en el mismo pedido: $1.250 y $1.100 por bidón', () => {
    const c = cotizarPedido(
      [
        { tipo: '20L', cantidad: 4 },
        { tipo: '12L', cantidad: 2 },
      ],
      { tipo: 'mayorista' },
    );
    expect(c.total).toBe(4 * 1250 + 2 * 1100);
    expect(c.requiereRevision).toBe(false);
  });

  it('empresa con plan mensual: siempre a revisión', () => {
    const c = cotizarPedido([{ tipo: '20L', cantidad: 4 }], { tipo: 'empresa' });
    expect(c.total).toBe(11000);
    expect(c.requiereRevision).toBe(true);
  });
});

describe('pedidos mezclados', () => {
  it('2 de 20 L + 1 de 12 L: cada tipo por separado, los tramos no se suman', () => {
    const c = cotizarPedido([
      { tipo: '20L', cantidad: 2 },
      { tipo: '12L', cantidad: 1 },
    ]);
    expect(c.total).toBe(6600 + 2500);
    expect(c.lineas).toHaveLength(2);
    expect(c.requiereRevision).toBe(false);
    expect(c.motivos.some((m) => m.startsWith('Pedido mezclado'))).toBe(true);
  });

  it('el mismo tipo repetido se agrupa: 2 + 2 de 20 L = tramo de 4', () => {
    const c = cotizarPedido([
      { tipo: '20L', cantidad: 2 },
      { tipo: '20L', cantidad: 2 },
    ]);
    expect(c.lineas).toHaveLength(1);
    expect(c.total).toBe(11000);
  });
});

describe('cliente nuevo: carga inicial (respuestas del dueño, D36)', () => {
  it.each([
    [1, 5500],
    [2, 10000],
    [3, 15000],
    [4, 20000],
  ])('20 L, %i envase(s) -> $%i', (envases, total) => {
    const c = cotizarCargaInicial('20L', envases);
    expect(c.total).toBe(total);
    expect(c.requiereRevision).toBe(false);
  });

  it.each(['12L', '10L'] as const)('%s: 1 envase $4.500 y 2 envases $8.000', (tipo) => {
    expect(cotizarCargaInicial(tipo, 1)).toMatchObject({ total: 4500, requiereRevision: false });
    expect(cotizarCargaInicial(tipo, 2)).toMatchObject({ total: 8000, requiereRevision: false });
  });

  it.each(['12L', '10L'] as const)('%s con 3 o más envases: sin precio definido, a revisión (PENDIENTE)', (tipo) => {
    const c = cotizarCargaInicial(tipo, 3);
    expect(c.total).toBeNull();
    expect(c.requiereRevision).toBe(true);
    expect(c.motivo).toContain('PENDIENTE');
  });

  it.each([
    ['20L', 3250],
    ['12L', 2000],
    ['10L', 2000],
  ] as const)('mayorista, %s: 1 envase -> $%i', (tipo, precio) => {
    expect(cotizarCargaInicial(tipo, 1, 'mayorista')).toMatchObject({ total: precio, requiereRevision: false });
  });

  it('mayorista con 2 o más envases: se calcula por envase pero va a revisión hasta confirmar que el precio es por envase', () => {
    const c = cotizarCargaInicial('20L', 4, 'mayorista');
    expect(c.total).toBe(4 * 3250);
    expect(c.requiereRevision).toBe(true);
    expect(c.motivo).toContain('por envase');
  });

  it('empresa con plan mensual: sin precio, a revisión', () => {
    const c = cotizarCargaInicial('20L', 1, 'empresa');
    expect(c.total).toBeNull();
    expect(c.requiereRevision).toBe(true);
  });

  it('cliente con precio especial: precio de lista, pero a revisión', () => {
    const c = cotizarCargaInicial('20L', 1, 'especial');
    expect(c.total).toBe(5500);
    expect(c.requiereRevision).toBe(true);
  });

  it.each([0, -1, 1.5, Number.NaN])('rechaza %s envases', (envases) => {
    expect(() => cotizarCargaInicial('20L', envases)).toThrow(ErrorPrecio);
  });
});

describe('validaciones', () => {
  it.each([0, -1, 1.5, Number.NaN])('rechaza cantidad %s', (cantidad) => {
    expect(() => cotizarPedido([{ tipo: '20L', cantidad }])).toThrow(ErrorPrecio);
  });

  it('rechaza un pedido vacío', () => {
    expect(() => cotizarPedido([])).toThrow(ErrorPrecio);
  });
});

describe('formatearCLP', () => {
  it.each([
    [0, '$0'],
    [950, '$950'],
    [9900, '$9.900'],
    [13750, '$13.750'],
    [1250000, '$1.250.000'],
  ])('%i -> %s', (monto, texto) => {
    expect(formatearCLP(monto)).toBe(texto);
  });
});
