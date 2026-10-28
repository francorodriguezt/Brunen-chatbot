import { describe, expect, it } from 'vitest';
import { interpretar } from '../src/interprete';
import mensajes from './mensajes.json';

// Cada mensaje real que el bot entienda mal se agrega (anonimizado) a tests/mensajes.json.
describe('interpretar: casos de tests/mensajes.json', () => {
  it.each(mensajes.casos.map((caso) => [caso.mensaje, caso.esperado] as const))('%s', (mensaje, esperado) => {
    expect(interpretar(mensaje)).toMatchObject(esperado);
  });
});

describe('interpretar: forma exacta del resultado', () => {
  it('un pedido completo no trae acción ni claves de más', () => {
    expect(interpretar('Hola, me puede traer 2 bidones de 20 mañana?')).toEqual({
      intencion: 'pedido',
      items: [{ tipo: '20L', cantidad: 2 }],
      fecha_texto: 'mañana',
    });
  });

  it('un pedido sin tipo pide el tipo', () => {
    expect(interpretar('quiero 4 bidones')).toEqual({
      intencion: 'pedido',
      items: [{ tipo: 'no_especificado', cantidad: 4 }],
      accion: 'preguntar_tipo',
    });
  });

  it('un reclamo se escala y conserva lo que pidió, para que la persona lo vea', () => {
    expect(interpretar('el bidón de ayer venía con el sello roto')).toEqual({
      intencion: 'reclamo',
      items: [],
      accion: 'escalar',
    });
  });

  it('una comuna fuera de zona se informa tal cual; decidir qué hacer es de la etapa de pedidos', () => {
    expect(interpretar('2 de 20 para Maipú')).toEqual({
      intencion: 'pedido',
      items: [{ tipo: '20L', cantidad: 2 }],
      comuna_mencionada: 'Maipú',
    });
  });
});

describe('interpretar: prioridades', () => {
  it('reclamo y factura ganan sobre el pedido', () => {
    expect(interpretar('quiero 2 de 20 y necesito la factura').intencion).toBe('factura');
    expect(interpretar('quiero 2 de 20, el último venía roto').intencion).toBe('reclamo');
  });

  it('con un reclamo y una factura en el mismo mensaje gana el reclamo', () => {
    expect(interpretar('me llegó roto y necesito factura').intencion).toBe('reclamo');
  });

  it('una pregunta sin verbo de pedir no es un pedido aunque nombre bidones', () => {
    expect(interpretar('cuanto sale el bidon de 20?').intencion).toBe('pregunta');
  });

  it('"lo de siempre" con bidones nombrados es un pedido', () => {
    expect(interpretar('lo de siempre, 3 de 20').intencion).toBe('pedido');
  });

  it('un saludo con contenido se clasifica por el contenido', () => {
    expect(interpretar('hola, necesito 2 de 20').intencion).toBe('pedido');
    expect(interpretar('hola, cuanto sale el de 12?').intencion).toBe('pregunta');
  });
});

describe('interpretar: robustez', () => {
  it('texto vacío o solo signos queda desconocido', () => {
    expect(interpretar('').intencion).toBe('desconocido');
    expect(interpretar('   ').intencion).toBe('desconocido');
    expect(interpretar('???').intencion).toBe('desconocido');
  });

  it('tolera mayúsculas, tildes faltantes y espacios de más', () => {
    expect(interpretar('  QUIERO   DOS   VIDONES   DE   VEINTE  ')).toEqual({
      intencion: 'pedido',
      items: [{ tipo: '20L', cantidad: 2 }],
    });
  });

  it('un mensaje enorme se procesa rápido y sin fallar', () => {
    const largo = '2 de 20 y '.repeat(2000);
    const inicio = performance.now();
    const resultado = interpretar(largo);
    expect(performance.now() - inicio).toBeLessThan(500);
    expect(resultado.intencion).toBe('pedido');
    expect(resultado.items).toEqual([{ tipo: '20L', cantidad: 4000 }]);
  });
});

describe('interpretar: repetir pedido solo con frases específicas', () => {
  it.each([
    'cuánto me cobraron la semana pasada?',
    'la semana pasada llegó tarde',
    'cuánto sale lo mismo de siempre?',
    'la última vez no vino nadie',
  ])('%s no es repetir_pedido', (mensaje) => {
    expect(interpretar(mensaje).intencion).not.toBe('repetir_pedido');
  });

  it.each(['repite el pedido', 'lo de la semana pasada', 'lo mismo de siempre', 'como siempre'])(
    '%s sí es repetir_pedido',
    (mensaje) => {
      expect(interpretar(mensaje).intencion).toBe('repetir_pedido');
    },
  );
});
