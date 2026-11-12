import { describe, expect, it } from 'vitest';
import * as textos from '../src/textos';

describe('textos al cliente', () => {
  it('saluda por el primer nombre', () => {
    expect(textos.saludo('Ana María Prueba')).toMatch(/^¡Hola Ana! /);
    expect(textos.saludo()).toMatch(/^¡Hola! /);
    expect(textos.saludo('  ')).toMatch(/^¡Hola! /);
  });

  it('pregunta lo que falta', () => {
    expect(textos.preguntarCantidad([{ tipo: '12L', cantidad: null }])).toBe('¿Cuántos bidones de 12 L necesitas?');
    expect(textos.preguntarCantidad([{ tipo: 'no_especificado', cantidad: null }])).toBe('¿Cuántos bidones necesitas?');
  });

  it('los envases van en singular y plural', () => {
    expect(textos.envasesAnotados(1)).toBe('Anotado: retiramos 1 envase vacío en tu próxima entrega.');
    expect(textos.envasesAnotados(3)).toBe('Anotado: retiramos 3 envases vacíos en tu próxima entrega.');
    expect(textos.envasesAnotados()).toBe('Anotado: retiramos tus envases vacíos en la próxima entrega.');
  });

  it('la zona dice si llegan o no a la comuna, siempre con la lista de las atendidas', () => {
    expect(textos.zona('Ñuñoa')).toMatch(/^Sí, despachamos a Ñuñoa\. Atendemos: Ñuñoa, Macul, San Joaquín, Peñalolén, Santiago Centro/);
    expect(textos.zona('Maipú')).toMatch(/^Por ahora no despachamos a Maipú\. Atendemos: /);
    expect(textos.zona()).toMatch(/^Atendemos estas comunas: .*La Reina\. El despacho es gratis\.$/);
  });

  it('los precios salen de la tabla que se le pasa, no de números fijos', () => {
    const texto = textos.precios([
      { tipo: '20L', desde: 1, hasta: null, precio: 5000 },
      { tipo: '12L', desde: 1, hasta: 1, precio: 3000 },
      { tipo: '12L', desde: 2, hasta: null, precio: 2900 },
    ]);
    expect(texto).toBe('Estos son nuestros valores:\n- Bidón 20 L: $5.000 c/u\n- Bidón 12 L: 1: $3.000 · 2 o más: $2.900 c/u\nEl despacho es gratis.');
  });

  it('un pedido con el valor pendiente no muestra montos', () => {
    const texto = textos.pedidoAnotado({
      lineas: [{ tipo: '20L', cantidad: 1, subtotal: 4500 }],
      total: null,
      entrega: { fecha: '2026-10-29', mismoDia: false, feriadosAlDia: true },
      fechaSegura: true,
    });
    expect(texto).toBe('Anotamos tu pedido:\n- 1 bidón de 20 L\nEl valor te lo confirmamos a la brevedad.\nEntrega estimada: jueves 29 de octubre.\nSi algo cambia, te avisamos por aquí.');
  });

  it('con una sola respuesta no hay frases sueltas: todo va en un mensaje', () => {
    const texto = textos.pedidoAnotado({
      lineas: [{ tipo: '20L', cantidad: 2, subtotal: 6600 }],
      total: 6600,
      entrega: { fecha: '2026-10-29', mismoDia: false, feriadosAlDia: true },
      fechaSegura: true,
    });
    expect(texto.split('\n').length).toBeLessThanOrEqual(5);
  });

  describe('Entrega en (D55)', () => {
    const base = { lineas: [{ tipo: '20L' as const, cantidad: 2, subtotal: 6600 }], total: 6600, entrega: { fecha: '2026-10-29', mismoDia: false, feriadosAlDia: true }, fechaSegura: true };

    it('muestra la dirección y la comuna, e invita a escribir la nueva si cambió', () => {
      expect(textos.pedidoAnotado({ ...base, direccion: 'Calle Falsa 123', comuna: 'Ñuñoa' })).toContain('Entrega en: Calle Falsa 123, Ñuñoa. Si cambiaste de dirección, escríbenos la nueva.');
    });

    it('no repite la comuna si ya viene en la dirección, aunque cambien las tildes', () => {
      expect(textos.pedidoAnotado({ ...base, direccion: 'Av. Grecia 12, Nunoa.', comuna: 'Ñuñoa' })).toContain('Entrega en: Av. Grecia 12, Nunoa. Si cambiaste');
    });

    it('no le repite al cliente lo que va entre paréntesis ni un texto larguísimo: pueden ser notas internas del Excel', () => {
      const conNota = textos.pedidoAnotado({ ...base, direccion: 'Av. Grecia 12 depto 4 (ojo: debe 2 bidones)', comuna: 'Ñuñoa' });
      expect(conNota).toContain('Entrega en: Av. Grecia 12 depto 4, Ñuñoa.');
      expect(conNota).not.toContain('debe');
      const larga = textos.pedidoAnotado({ ...base, direccion: 'Calle Larga 1 ' + 'x'.repeat(200), comuna: 'Ñuñoa' });
      expect(larga.split('\n').find((l) => l.startsWith('Entrega en'))!.length).toBeLessThan(200);
    });

    it('sin dirección no dice nada de la entrega', () => {
      expect(textos.pedidoAnotado({ ...base, direccion: '  ', comuna: 'Ñuñoa' })).not.toContain('Entrega en');
      expect(textos.pedidoAnotado(base)).not.toContain('Entrega en');
    });

    it('sigue siendo un solo mensaje, corto', () => {
      const texto = textos.pedidoAnotado({ ...base, direccion: 'Calle Falsa 123', comuna: 'Ñuñoa' });
      expect(texto.split('\n').length).toBeLessThanOrEqual(6);
      expect(texto.length).toBeLessThan(400);
    });
  });

  it('nunca supera el máximo de WhatsApp aun con muchas líneas', () => {
    const lineas = (['20L', '12L', '10L'] as const).map((tipo) => ({ tipo, cantidad: 999, subtotal: 999000 }));
    const texto = textos.pedidoAnotado({ lineas, total: 2997000, entrega: { fecha: '2026-10-29', mismoDia: false, feriadosAlDia: true }, fechaSegura: true });
    expect(texto.length).toBeLessThan(4096);
  });
});
