import { describe, expect, it } from 'vitest';
import { interpretar } from '../src/interprete';
import { describirInterpretacion } from '../src/resumen';

describe('describirInterpretacion', () => {
  it.each([
    ['2 bidones de 20', 'Modo prueba. Entendí: pedido · 2 de 20 L'],
    ['3 de 20 y 1 de 12 para mañana', 'Modo prueba. Entendí: pedido · 3 de 20 L · 1 de 12 L · para mañana'],
    ['quiero 4 bidones', 'Modo prueba. Entendí: pedido · 4 de sin tamaño · preguntaría de qué tamaño'],
    ['bidones de 20', 'Modo prueba. Entendí: pedido · ? de 20 L · preguntaría cuántos'],
    ['llegan a Maipú?', 'Modo prueba. Entendí: pregunta · sobre zona · comuna Maipú'],
    ['cuanto sale el bidon de 20?', 'Modo prueba. Entendí: pregunta · sobre precio · 1 de 20 L'],
    ['el bidón venía roto', 'Modo prueba. Entendí: reclamo · derivar a una persona'],
    ['gracias', 'Modo prueba. Entendí: cierre (no se respondería)'],
    ['asdf qwer', 'Modo prueba. Entendí: no lo entendí'],
    ['tengo 3 bidones vacios para devolver', 'Modo prueba. Entendí: devolución de envases · 3 envases'],
  ])('%s', (mensaje, esperado) => {
    expect(describirInterpretacion(interpretar(mensaje))).toBe(esperado);
  });
});
