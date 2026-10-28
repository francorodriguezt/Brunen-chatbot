import { describe, expect, it } from 'vitest';
import type { EstadoConversacion } from '../src/conversacion';
import { fusionarConEstado, responderEnContexto } from '../src/contexto';
import { interpretar } from '../src/interprete';

const SIN_TAMANO: EstadoConversacion = { espera: 'tipo', items: [{ tipo: 'no_especificado', cantidad: 4 }], fecha_texto: 'viernes' };
const SIN_CANTIDAD: EstadoConversacion = { espera: 'cantidad', items: [{ tipo: '20L', cantidad: null }] };
const SIN_NADA: EstadoConversacion = { espera: 'pedido', items: [] };

const interpretacionDe = (texto: string, estado: EstadoConversacion) => {
  const r = responderEnContexto(texto, estado);
  return r?.tipo === 'interpretacion' ? r.interpretacion : null;
};

describe('responderEnContexto: el bot preguntó el tamaño', () => {
  it.each(['20', 'de 20', 'los de 20', 'de 20 litros', '20 lts', 'de veinte', 'Los de 20, por favor', '20!', 'quiero 20'])(
    'entiende "%s" como 20 litros',
    (texto) => {
      expect(interpretacionDe(texto, SIN_TAMANO)).toEqual({
        intencion: 'pedido',
        items: [{ tipo: '20L', cantidad: 4 }],
        fecha_texto: 'viernes',
      });
    },
  );

  it('entiende 12 y 10 litros', () => {
    expect(interpretacionDe('12', SIN_TAMANO)?.items).toEqual([{ tipo: '12L', cantidad: 4 }]);
    expect(interpretacionDe('los de 10 litros', SIN_TAMANO)?.items).toEqual([{ tipo: '10L', cantidad: 4 }]);
  });

  it('conserva la fecha y la comuna que ya había dicho', () => {
    const estado: EstadoConversacion = { ...SIN_TAMANO, comuna_mencionada: 'Providencia' };
    expect(interpretacionDe('20', estado)).toMatchObject({ fecha_texto: 'viernes', comuna_mencionada: 'Providencia' });
  });

  it('si además faltaba la cantidad, sigue preguntando la cantidad', () => {
    const estado: EstadoConversacion = { espera: 'tipo', items: [{ tipo: 'no_especificado', cantidad: null }] };
    expect(interpretacionDe('20', estado)).toMatchObject({ items: [{ tipo: '20L', cantidad: null }], accion: 'preguntar_cantidad' });
  });

  it('un tamaño dado a un ítem sin tamaño se suma al ítem del mismo tamaño que ya había', () => {
    const estado: EstadoConversacion = { espera: 'tipo', items: [{ tipo: '20L', cantidad: 2 }, { tipo: 'no_especificado', cantidad: 3 }] };
    expect(interpretacionDe('de 20', estado)?.items).toEqual([{ tipo: '20L', cantidad: 5 }]);
  });

  it.each(['mañana a las 10', 'para el 12', '20 y 12', 'cuanto sale', 'quiero 2 de 20', 'hola', 'no sé'])(
    'no confunde "%s" con una respuesta de tamaño',
    (texto) => {
      expect(responderEnContexto(texto, SIN_TAMANO)).toBeNull();
    },
  );
});

describe('responderEnContexto: el bot preguntó la cantidad', () => {
  it.each([['2', 2], ['dos', 2], ['son 3', 3], ['necesito 4 bidones', 4], ['uno', 1], ['un par', 2], ['5 por favor', 5]])(
    'entiende "%s" como %i bidones',
    (texto, cantidad) => {
      expect(interpretacionDe(texto, SIN_CANTIDAD)).toEqual({ intencion: 'pedido', items: [{ tipo: '20L', cantidad }] });
    },
  );

  it('no decide si hay dos tamaños sin cantidad: no sabe a cuál se refiere', () => {
    const estado: EstadoConversacion = { espera: 'cantidad', items: [{ tipo: '20L', cantidad: null }, { tipo: '12L', cantidad: null }] };
    expect(responderEnContexto('2', estado)).toBeNull();
  });

  it('completa solo el ítem que faltaba', () => {
    const estado: EstadoConversacion = { espera: 'cantidad', items: [{ tipo: '20L', cantidad: 2 }, { tipo: '12L', cantidad: null }] };
    expect(interpretacionDe('3', estado)?.items).toEqual([{ tipo: '20L', cantidad: 2 }, { tipo: '12L', cantidad: 3 }]);
  });

  it.each(['cuantos hay', 'hola', 'mañana', '1000', '2 de 20'])('no confunde "%s" con una cantidad', (texto) => {
    expect(responderEnContexto(texto, SIN_CANTIDAD)).toBeNull();
  });
});

describe('responderEnContexto: cancelar y otros casos', () => {
  it.each(['no', 'No gracias', 'nada', 'cancela', 'olvídalo', 'ya no', 'mejor no', 'dejalo'])('"%s" cancela el pedido a medias', (texto) => {
    for (const estado of [SIN_TAMANO, SIN_CANTIDAD, SIN_NADA]) expect(responderEnContexto(texto, estado)).toEqual({ tipo: 'cancelar' });
  });

  it('si esperaba un pedido completo, deja que el camino normal lo interprete', () => {
    expect(responderEnContexto('2 de 20', SIN_NADA)).toBeNull();
    expect(responderEnContexto('20', SIN_NADA)).toBeNull();
  });
});

describe('fusionarConEstado', () => {
  it('un pedido nuevo hereda la fecha y la comuna del pedido a medias', () => {
    const nuevo = interpretar('quiero 2 de 20');
    expect(fusionarConEstado(nuevo, { ...SIN_TAMANO, comuna_mencionada: 'Macul' })).toMatchObject({
      fecha_texto: 'viernes',
      comuna_mencionada: 'Macul',
    });
  });

  it('lo que el cliente dice ahora gana sobre lo anterior', () => {
    const nuevo = interpretar('quiero 2 de 20 para el sábado');
    expect(fusionarConEstado(nuevo, SIN_TAMANO).fecha_texto).toBe('sábado');
  });

  it('solo se aplica a pedidos y con estado', () => {
    const pregunta = interpretar('cuanto sale el bidon de 20?');
    expect(fusionarConEstado(pregunta, SIN_TAMANO)).toBe(pregunta);
    const pedido = interpretar('quiero 2 de 20');
    expect(fusionarConEstado(pedido, null)).toBe(pedido);
  });
});
