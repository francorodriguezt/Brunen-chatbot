import { describe, expect, it } from 'vitest';
import { enlaceParaAvisar, textoDeCambio, textoDeCancelacion } from '../panel/admin/avisar-cliente.js';

// Todo ficticio.
const antes = { bidones: '3 de 20 L', fecha: 'jueves 19 de noviembre', total: '$9.900' };

describe('Avisar al cliente (D99)', () => {
  it('la cancelación saluda por el primer nombre y no dice el motivo interno', () => {
    expect(textoDeCancelacion({ nombre: 'Ana Prueba', ...antes })).toBe(
      'Hola Ana, te escribimos de Brunen. Tu pedido de 3 de 20 L para el jueves 19 de noviembre quedó cancelado. Si quieres volver a pedir, escríbenos por aquí.',
    );
    expect(textoDeCancelacion({ nombre: '', ...antes })).toMatch(/^Hola, te escribimos/);
    expect(textoDeCancelacion({ nombre: 'Ana', bidones: '', fecha: antes.fecha })).toContain('Tu pedido para el jueves 19 de noviembre');
  });

  it('el cambio nombra solo lo que el cliente nota', () => {
    expect(textoDeCambio({ nombre: 'Ana', antes, despues: { ...antes, fecha: 'viernes 20 de noviembre' } })).toBe(
      'Hola Ana, te escribimos de Brunen. Cambiamos tu pedido: se entrega el viernes 20 de noviembre. Si algo no te calza, respóndenos por aquí.',
    );
    expect(textoDeCambio({ nombre: 'Ana', antes, despues: { bidones: '4 de 20 L', fecha: antes.fecha, total: '$11.000' } })).toContain(
      'ahora es de 4 de 20 L y el total queda en $11.000.',
    );
    // Una nota para el repartidor o el pago no se le avisan.
    expect(textoDeCambio({ nombre: 'Ana', antes, despues: { ...antes } })).toBe('');
  });

  it('el enlace abre su chat con el texto listo; sin teléfono no hay enlace', () => {
    expect(enlaceParaAvisar('+56 9 1111 1111', 'Hola, ¿qué tal?')).toBe('https://wa.me/56911111111?text=Hola%2C%20%C2%BFqu%C3%A9%20tal%3F');
    expect(enlaceParaAvisar('', 'Hola')).toBeNull();
    expect(enlaceParaAvisar('56911111111', '')).toBeNull();
  });
});
