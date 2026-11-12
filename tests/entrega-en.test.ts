import { describe, expect, it } from 'vitest';
import { decidir, type EntradaMotor } from '../src/motor';
import { interpretar } from '../src/interprete';

/** Lo mínimo para que el motor decida sobre un mensaje suelto de un cliente conocido. */
function entrada(texto: string): EntradaMotor {
  return {
    interpretacion: interpretar(texto),
    texto,
    telefono: '56911111111',
    wamid: 'wamid.X',
    ahora: new Date('2026-10-28T15:00:00Z'),
    cliente: { estado: 'conocido', cliente: { telefono: '56911111111', nombre: 'Ana Prueba', direccion: 'Calle Falsa 123', comuna: 'Ñuñoa', tipo: 'normal', precioEspecial20L: null, envasesPendientes: 0, avisoHora: false, credito: '', notas: '', estado: 'activo', avisos: [] } },
    ultimoPedido: null,
    precios: [],
    entrega: { fecha: '2026-10-29', mismoDia: false, feriadosAlDia: true },
    servicio: { reducido: false, mensajeExcepcion: '' },
  } as unknown as EntradaMotor;
}

describe('cuando el cliente responde con su dirección nueva (D55)', () => {
  it.each([['me cambié, ahora vivo en Av. Nueva 45, Providencia'], ['la nueva es Pasaje Uno 9 depto 302, Macul'], ['nos mudamos a Calle Dos 15 Ñuñoa']])(
    '"%s" llega a una persona, dicho claro, y no se anota como pedido',
    (texto) => {
      const d = decidir(entrada(texto));
      expect(d.pedido).toBeUndefined();
      expect(d.alerta?.resumen).toContain('cambió de dirección');
    },
  );

  it('un mensaje que no se entiende sigue con el aviso de siempre', () => {
    expect(decidir(entrada('blablabla qwerty')).alerta?.resumen).toBe('El bot no entendió el mensaje');
  });
});
