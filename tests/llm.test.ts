import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BaseDatos } from '../src/almacen';
import { procesarMensaje, type Env } from '../src/index';
import { interpretar } from '../src/interprete';
import { completarConRespuesta, interpretarConRespaldo, LLAMADAS_POR_DIA, MAX_CARACTERES } from '../src/llm';

// Todos los valores son ficticios: ninguna clave real entra al repo.
const CLAVE = 'gsk_clave_de_prueba';
const AHORA = 1793000000;

afterEach(() => vi.unstubAllGlobals());

/** Base D1 de mentira: `cambios` es lo que reporta cada escritura (0 = el tope ya se alcanzó). */
function baseFalsa(cambios: number | Error = 1) {
  const consultas: Array<{ sql: string; valores: unknown[] }> = [];
  const db: BaseDatos = {
    prepare: (sql) => ({
      bind: (...valores) => ({
        run: async () => {
          consultas.push({ sql, valores });
          if (cambios instanceof Error) throw cambios;
          return { meta: { changes: cambios } };
        },
      }),
    }),
  };
  return { db, consultas };
}

function respuestaGroq(contenido: unknown, status = 200): Response {
  const cuerpo = status === 200 ? { choices: [{ message: { content: typeof contenido === 'string' ? contenido : JSON.stringify(contenido) } }] } : { error: 'x' };
  return new Response(JSON.stringify(cuerpo), { status });
}

function stubFetch(respuesta: () => Response | Promise<Response>) {
  const fetchFalso = vi.fn(async () => respuesta());
  vi.stubGlobal('fetch', fetchFalso);
  return fetchFalso;
}

const REGLAS_DESCONOCIDO = interpretar('xyz abc qwerty');

describe('completarConRespuesta: validación de lo que devuelve el modelo', () => {
  it('acepta un pedido válido y conserva fecha y comuna que ya sacaron las reglas', () => {
    const reglas = interpretar('para el sábado en las condes qué onda'); // desconocido, pero con fecha y comuna
    const r = completarConRespuesta({ intencion: 'pedido', items: [{ tipo: '20L', cantidad: 2 }] }, reglas);
    expect(r).toEqual({
      intencion: 'pedido',
      items: [{ tipo: '20L', cantidad: 2 }],
      fecha_texto: 'sábado',
      comuna_mencionada: 'Las Condes',
    });
  });

  it('un pedido sin tamaño pregunta el tamaño; sin cantidad, la cantidad; sin nada, el pedido', () => {
    expect(completarConRespuesta({ intencion: 'pedido', items: [{ tipo: 'no_especificado', cantidad: 3 }] }, REGLAS_DESCONOCIDO)?.accion).toBe('preguntar_tipo');
    expect(completarConRespuesta({ intencion: 'pedido', items: [{ tipo: '12L', cantidad: null }] }, REGLAS_DESCONOCIDO)?.accion).toBe('preguntar_cantidad');
    expect(completarConRespuesta({ intencion: 'pedido', items: [] }, REGLAS_DESCONOCIDO)?.accion).toBe('preguntar_pedido');
  });

  it('reclamo, factura y proveedor siempre se derivan a una persona', () => {
    for (const intencion of ['reclamo', 'factura', 'proveedor']) {
      expect(completarConRespuesta({ intencion, items: [] }, REGLAS_DESCONOCIDO)?.accion).toBe('escalar');
    }
  });

  it('suma los ítems repetidos del mismo tipo', () => {
    const r = completarConRespuesta(
      { intencion: 'pedido', items: [{ tipo: '20L', cantidad: 2 }, { tipo: '20L', cantidad: 1 }] },
      REGLAS_DESCONOCIDO,
    );
    expect(r?.items).toEqual([{ tipo: '20L', cantidad: 3 }]);
  });

  it('envases: usa la cantidad indicada y no deja ítems de pedido', () => {
    const r = completarConRespuesta({ intencion: 'envases', items: [], envases_a_retirar: 3 }, REGLAS_DESCONOCIDO);
    expect(r).toEqual({ intencion: 'envases', items: [], envases_a_retirar: 3 });
  });

  it('pregunta: acepta el tipo y descarta uno inventado', () => {
    expect(completarConRespuesta({ intencion: 'pregunta', items: [], tipo_pregunta: 'horario' }, REGLAS_DESCONOCIDO)?.tipo_pregunta).toBe('horario');
    const inventado = completarConRespuesta({ intencion: 'pregunta', items: [], tipo_pregunta: 'clima' }, REGLAS_DESCONOCIDO);
    expect(inventado?.intencion).toBe('pregunta');
    expect(inventado?.tipo_pregunta).toBeUndefined();
  });

  it.each([
    ['nulo', null],
    ['texto', 'pedido'],
    ['número', 5],
    ['intención inventada', { intencion: 'comprar_todo', items: [] }],
    ['sin intención', { items: [] }],
    ['desconocido (no aporta nada)', { intencion: 'desconocido', items: [] }],
    ['ítems que no son lista', { intencion: 'pedido', items: 'dos de 20' }],
    ['tipo de bidón inventado', { intencion: 'pedido', items: [{ tipo: '15L', cantidad: 1 }] }],
    ['cantidad negativa', { intencion: 'pedido', items: [{ tipo: '20L', cantidad: -2 }] }],
    ['cantidad con decimales', { intencion: 'pedido', items: [{ tipo: '20L', cantidad: 1.5 }] }],
    ['cantidad cero', { intencion: 'pedido', items: [{ tipo: '20L', cantidad: 0 }] }],
    ['cantidad absurda', { intencion: 'pedido', items: [{ tipo: '20L', cantidad: 1000 }] }],
    ['cantidad como texto', { intencion: 'pedido', items: [{ tipo: '20L', cantidad: '2' }] }],
    ['demasiados ítems', { intencion: 'pedido', items: Array.from({ length: 6 }, () => ({ tipo: '20L', cantidad: 1 })) }],
  ])('rechaza una respuesta inválida: %s', (_nombre, crudo) => {
    expect(completarConRespuesta(crudo, REGLAS_DESCONOCIDO)).toBeNull();
  });
});

describe('interpretarConRespaldo', () => {
  it('si las reglas entienden el mensaje, no llama a Groq', async () => {
    const f = stubFetch(() => respuestaGroq({}));
    const r = await interpretarConRespaldo('quiero 2 de 20 para mañana', { GROQ_API_KEY: CLAVE }, AHORA);
    expect(r.conIa).toBe(false);
    expect(r.interpretacion.intencion).toBe('pedido');
    expect(f).not.toHaveBeenCalled();
  });

  it('sin clave de Groq, el resultado es el de las reglas', async () => {
    const f = stubFetch(() => respuestaGroq({}));
    const r = await interpretarConRespaldo('xyz abc qwerty', {}, AHORA);
    expect(r).toEqual({ interpretacion: REGLAS_DESCONOCIDO, conIa: false });
    expect(f).not.toHaveBeenCalled();
  });

  it('con un mensaje que las reglas no entienden, usa a Groq y marca que intervino la IA', async () => {
    const f = stubFetch(() => respuestaGroq({ intencion: 'pedido', items: [{ tipo: '20L', cantidad: 2 }] }));
    const texto = 'xyz necesito aguita pal finde';
    const r = await interpretarConRespaldo(texto, { GROQ_API_KEY: CLAVE }, AHORA);
    expect(r.conIa).toBe(true);
    expect(r.interpretacion.intencion).toBe('pedido');
    expect(r.interpretacion.items).toEqual([{ tipo: '20L', cantidad: 2 }]);

    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect((init.headers as Record<string, string>).Authorization).toBe(`Bearer ${CLAVE}`);
    const cuerpo = JSON.parse(init.body as string);
    expect(cuerpo.model).toBe('openai/gpt-oss-20b');
    expect(cuerpo.temperature).toBe(0);
    expect(cuerpo.response_format.type).toBe('json_schema');
    expect(cuerpo.response_format.json_schema.strict).toBe(true);
    // Solo viaja el texto del mensaje: ni teléfono ni nombre.
    const usuario = cuerpo.messages.find((m: { role: string }) => m.role === 'user');
    expect(usuario.content).toBe(texto);
  });

  it('un error de Groq (429, 500) deja el resultado de las reglas y no lanza', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const status of [429, 500, 401]) {
      stubFetch(() => respuestaGroq({}, status));
      const r = await interpretarConRespaldo('xyz abc qwerty', { GROQ_API_KEY: CLAVE }, AHORA);
      expect(r).toEqual({ interpretacion: REGLAS_DESCONOCIDO, conIa: false });
    }
  });

  it('si Groq no responde a tiempo o falla la red, deja el resultado de las reglas', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.stubGlobal('fetch', vi.fn(async () => { throw new DOMException('timeout', 'TimeoutError'); }));
    const r = await interpretarConRespaldo('xyz abc qwerty', { GROQ_API_KEY: CLAVE }, AHORA);
    expect(r.conIa).toBe(false);
  });

  it('si Groq devuelve algo que no es JSON válido o no cumple el contrato, deja las reglas', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    for (const contenido of ['esto no es json', { intencion: 'inventada', items: [] }, { intencion: 'desconocido', items: [] }]) {
      stubFetch(() => respuestaGroq(contenido));
      const r = await interpretarConRespaldo('xyz abc qwerty', { GROQ_API_KEY: CLAVE }, AHORA);
      expect(r).toEqual({ interpretacion: REGLAS_DESCONOCIDO, conIa: false });
    }
  });

  it('si Groq devuelve texto que no es JSON, el log no cita ese texto', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {});
    stubFetch(() => respuestaGroq('Av. Apoquindo 1234 depto 5 no es json'));
    await interpretarConRespaldo('xyz abc qwerty', { GROQ_API_KEY: CLAVE }, AHORA);
    expect(error).toHaveBeenCalled();
    expect(JSON.stringify(error.mock.calls)).not.toContain('Apoquindo');
  });

  it('no manda a Groq mensajes vacíos, sin letras o demasiado largos', async () => {
    const f = stubFetch(() => respuestaGroq({ intencion: 'saludo', items: [] }));
    for (const texto of ['', '   ', '👍', '???', 'a'.repeat(MAX_CARACTERES + 1)]) {
      const r = await interpretarConRespaldo(texto, { GROQ_API_KEY: CLAVE }, AHORA);
      expect(r.conIa).toBe(false);
    }
    expect(f).not.toHaveBeenCalled();
  });

  describe('tope diario', () => {
    it('reserva una llamada en D1 con el día en UTC y el tope, antes de llamar a Groq', async () => {
      const { db, consultas } = baseFalsa(1);
      stubFetch(() => respuestaGroq({ intencion: 'saludo', items: [] }));
      await interpretarConRespaldo('xyz abc qwerty', { GROQ_API_KEY: CLAVE, DB: db }, AHORA);
      expect(consultas).toHaveLength(1);
      expect(consultas[0]?.valores).toEqual(['2026-10-26', LLAMADAS_POR_DIA]);
    });

    it('con el tope alcanzado no llama a Groq', async () => {
      const { db } = baseFalsa(0);
      const f = stubFetch(() => respuestaGroq({ intencion: 'saludo', items: [] }));
      vi.spyOn(console, 'log').mockImplementation(() => {});
      const r = await interpretarConRespaldo('xyz abc qwerty', { GROQ_API_KEY: CLAVE, DB: db }, AHORA);
      expect(r.conIa).toBe(false);
      expect(f).not.toHaveBeenCalled();
    });

    it('si D1 falla (por ejemplo, falta la tabla), no llama a Groq: ante la duda no se gasta el cupo', async () => {
      const { db } = baseFalsa(new Error('no such table: uso_llm'));
      const f = stubFetch(() => respuestaGroq({ intencion: 'saludo', items: [] }));
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const r = await interpretarConRespaldo('xyz abc qwerty', { GROQ_API_KEY: CLAVE, DB: db }, AHORA);
      expect(r.conIa).toBe(false);
      expect(f).not.toHaveBeenCalled();
    });
  });
});

describe('modo prueba con el respaldo de IA', () => {
  const ENV: Env = {
    WHATSAPP_VERIFY_TOKEN: 'v',
    WHATSAPP_APP_SECRET: 's',
    WHATSAPP_TOKEN: 't',
    WHATSAPP_PHONE_NUMBER_ID: '000000000000000',
    GRAPH_API_VERSION: 'v99.0',
    NUMEROS_PERMITIDOS: '56900000001',
    GROQ_API_KEY: CLAVE,
  };

  it('responde lo que entendió y aclara que usó IA', async () => {
    const enviados: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string, init: RequestInit) => {
        if (url.includes('groq.com')) return respuestaGroq({ intencion: 'pedido', items: [{ tipo: '20L', cantidad: 2 }] });
        enviados.push((JSON.parse(init.body as string) as { text: { body: string } }).text.body);
        return new Response('{}', { status: 200 });
      }),
    );
    const r = await procesarMensaje({ id: 'wamid.IA1', de: '56900000001', timestamp: AHORA, tipo: 'text', texto: 'xyz necesito aguita pal finde' }, ENV);
    expect(r).toEqual({ resultado: 'respondido', intencion: 'pedido' });
    expect(enviados).toHaveLength(1);
    expect(enviados[0]).toContain('pedido');
    expect(enviados[0]).toContain('(con IA)');
  });

  it('un mensaje que las reglas entienden no menciona la IA', async () => {
    const enviados: string[] = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        enviados.push((JSON.parse(init.body as string) as { text: { body: string } }).text.body);
        return new Response('{}', { status: 200 });
      }),
    );
    await procesarMensaje({ id: 'wamid.IA2', de: '56900000001', timestamp: AHORA, tipo: 'text', texto: 'hola' }, ENV);
    expect(enviados[0]).not.toContain('IA');
  });
});
