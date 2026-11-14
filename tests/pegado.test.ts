import { describe, expect, it } from 'vitest';
import { leerPedidoPegado } from '../src/pegado';

// Miércoles 28 de octubre de 2026, 10:00 en Santiago: ya pasó el corte, lo más pronto es el jueves 29. Todo ficticio.
const MIERCOLES_10 = new Date('2026-10-28T10:00:00-03:00');

describe('pedido rápido: leer un mensaje pegado desde WhatsApp (D64)', () => {
  it('saca el teléfono del encabezado de WhatsApp Web y el pedido del texto', async () => {
    const p = await leerPedidoPegado('[10:32, 28/10/2026] +56 9 1111 2222: hola, 3 de 20 para el viernes, pago en efectivo', MIERCOLES_10);
    expect(p).toMatchObject({
      texto: 'hola, 3 de 20 para el viernes, pago en efectivo',
      telefono: '56911112222',
      nombre: null,
      lineas: [{ tipo: '20L', cantidad: 3 }],
      fecha: '2026-10-30',
      fechaTexto: 'viernes',
      formaPago: 'efectivo',
      avisos: [],
    });
  });

  it('con el contacto guardado toma el nombre; junta varios mensajes seguidos', async () => {
    const pegado = '[10:30, 28/10/2026] Ana Prueba: hola\n[10:31, 28/10/2026] Ana Prueba: necesito 2 de 20 y 1 de 12\n[10:31, 28/10/2026] Ana Prueba: a Ñuñoa';
    const p = await leerPedidoPegado(pegado, MIERCOLES_10);
    expect(p.nombre).toBe('Ana Prueba');
    expect(p.telefono).toBeNull();
    expect(p.lineas).toEqual([{ tipo: '20L', cantidad: 2 }, { tipo: '12L', cantidad: 1 }]);
    expect(p.comuna).toBe('Ñuñoa');
    expect(p.avisos).toContain('No encontré el teléfono: escríbelo para reconocer al cliente.');
  });

  it('el formato de un chat exportado también sirve, y un teléfono escrito en el texto se reconoce', async () => {
    const p = await leerPedidoPegado('28/10/26, 10:32 - Juan Ficticio: 2x20 porfa, mi número es 9 3333 4444', MIERCOLES_10);
    expect(p).toMatchObject({ nombre: 'Juan Ficticio', telefono: '56933334444', lineas: [{ tipo: '20L', cantidad: 2 }] });
  });

  it('un texto suelto, sin encabezado, se lee igual y propone el primer día posible', async () => {
    const p = await leerPedidoPegado('quiero 4 bidones', MIERCOLES_10);
    expect(p.fecha).toBe('2026-10-29');
    expect(p.lineas).toEqual([{ tipo: 'no_especificado', cantidad: 4 }]);
    expect(p.avisos).toContain('No dijo de cuántos litros: elige el bidón.');
  });

  it('avisa lo que hay que revisar: un cambio de pedido, un día ya pasado, una carga inicial', async () => {
    expect((await leerPedidoPegado('cancelar pedido', MIERCOLES_10)).avisos[0]).toContain('cancelar o cambiar un pedido');
    expect((await leerPedidoPegado('2 de 20 para hoy', MIERCOLES_10)).avisos.join(' ')).toContain('ya pasó el corte');
    expect((await leerPedidoPegado('2 de 20 con envase nuevo', MIERCOLES_10)).pideEnvase).toBe(true);
  });

  it('un texto enorme se corta: no es un pedido', async () => {
    const p = await leerPedidoPegado(`2 de 20 ${'x'.repeat(5000)}`, MIERCOLES_10);
    expect(p.texto.length).toBeLessThanOrEqual(2000);
  });
});
