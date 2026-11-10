import { describe, expect, it } from 'vitest';
import { generarIdPedido } from '../src/pedidos';

describe('generarIdPedido', () => {
  it('tiene la fecha del pedido y 5 caracteres', () => {
    expect(generarIdPedido('wamid.HBgLNTY5', '2026-10-28')).toMatch(/^P261028-[0-9A-Z]{5}$/);
    expect(generarIdPedido('wamid.HBgLNTY5', '2027-01-05')).toMatch(/^P270105-[0-9A-Z]{5}$/);
  });

  it('el mismo mensaje da siempre el mismo ID', () => {
    expect(generarIdPedido('wamid.ABC', '2026-10-28')).toBe(generarIdPedido('wamid.ABC', '2026-10-28'));
  });

  it('mensajes distintos dan IDs distintos (sin choques en 5.000 pedidos de un día)', () => {
    const ids = new Set(Array.from({ length: 5000 }, (_, i) => generarIdPedido(`wamid.HBgLNTY5MTIzNDU2Nzg5FQIAEhgg${i}`, '2026-10-28')));
    expect(ids.size).toBe(5000);
  });
});
