import { describe, expect, it, vi } from 'vitest';
import { proponerEntrega } from '../src/entrega';
import { procesarMensaje, type Env } from '../src/index';
import { describirEntrega } from '../src/resumen';

// Feriados nacionales de Chile 2026 y 2027, como quedaron cargados en la hoja FERIADOS
// (calendario público; ver D25). Es solo dato de prueba: el código los lee de la hoja.
const FERIADOS = new Set([
  '2026-01-01', '2026-04-03', '2026-04-04', '2026-05-01', '2026-05-21', '2026-06-21', '2026-06-29', '2026-07-16',
  '2026-08-15', '2026-09-18', '2026-09-19', '2026-10-12', '2026-10-31', '2026-11-01', '2026-12-08', '2026-12-25',
  '2027-01-01', '2027-03-26', '2027-03-27', '2027-05-01', '2027-05-21', '2027-06-21', '2027-06-28', '2027-07-16',
  '2027-08-15', '2027-09-17', '2027-09-18', '2027-09-19', '2027-10-11', '2027-10-31', '2027-11-01', '2027-12-08',
  '2027-12-25',
]);
const SOLO_2026 = new Set([...FERIADOS].filter((f) => f.startsWith('2026')));

const cargar = (feriados: Set<string>) => vi.fn(async () => feriados);
// Chile está en UTC-3 (horario de verano) desde septiembre hasta abril.
const verano = (fechaHora: string) => new Date(`${fechaHora}-03:00`);
const proponer = (fechaHora: string, opciones: { feriados?: Set<string>; solicitada?: string } = {}) =>
  proponerEntrega({}, verano(fechaHora), { cargar: cargar(opciones.feriados ?? FERIADOS), solicitada: opciones.solicitada });

describe('proponerEntrega con los feriados de la hoja', () => {
  it('un pedido de viernes después de las 9:00 salta el sábado feriado y el domingo', async () => {
    expect(await proponer('2026-10-30T10:00:00')).toEqual({ fecha: '2026-11-02', mismoDia: false, feriadosAlDia: true });
  });

  it('un pedido de lunes antes de las 9:00 sale el mismo día, aunque el martes sea feriado', async () => {
    const r = await proponer('2026-12-07T08:30:00');
    expect(r.fecha).toBe('2026-12-07');
    expect(r.mismoDia).toBe(true);
  });

  it('un pedido de lunes después de las 9:00 salta el martes feriado (Inmaculada Concepción)', async () => {
    expect((await proponer('2026-12-07T10:00:00')).fecha).toBe('2026-12-09');
  });

  it('la víspera de Navidad pasa al sábado 26', async () => {
    expect((await proponer('2026-12-24T10:00:00')).fecha).toBe('2026-12-26');
  });

  it('un pedido hecho en un feriado antes de las 9:00 no sale ese día', async () => {
    expect(await proponer('2026-12-25T08:00:00')).toMatchObject({ fecha: '2026-12-26', mismoDia: false });
  });

  it('Semana Santa 2027: el sábado santo no se despacha', async () => {
    // Jueves 25 de marzo de 2027 a las 10:00 (verano, UTC-3): viernes y sábado son feriado, domingo no hay.
    expect((await proponer('2027-03-25T10:00:00')).fecha).toBe('2027-03-29');
  });

  it('pasa a la función que carga los feriados el entorno y la hora del pedido', async () => {
    const cargador = cargar(FERIADOS);
    const env = { GOOGLE_SHEET_ID: 'PLANILLA1' };
    const instante = verano('2026-10-30T10:00:00');
    await proponerEntrega(env, instante, { cargar: cargador });
    expect(cargador).toHaveBeenCalledWith(env, Math.floor(instante.getTime() / 1000));
  });

  it('con la hoja vacía calcula con la regla de lunes a sábado y avisa que los feriados no están al día', async () => {
    expect(await proponer('2026-10-30T10:00:00', { feriados: new Set() })).toEqual({ fecha: '2026-10-31', mismoDia: false, feriadosAlDia: false });
  });

  it('avisa cuando la entrega cae en un año sin feriados cargados (hay que renovar la hoja)', async () => {
    // Jueves 31 de diciembre de 2026 después de las 9:00: la entrega propuesta es en 2027.
    const r = await proponer('2026-12-31T10:00:00', { feriados: SOLO_2026 });
    expect(r.fecha).toBe('2027-01-01');
    expect(r.feriadosAlDia).toBe(false);
  });

  it('con los feriados de 2027 cargados, el 1 de enero no se despacha', async () => {
    expect(await proponer('2026-12-31T10:00:00')).toEqual({ fecha: '2027-01-02', mismoDia: false, feriadosAlDia: true });
  });
});

describe('proponerEntrega cuando el cliente pide un día', () => {
  // Miércoles 28 de octubre de 2026 a las 10:00: ya pasó el corte, lo más pronto es el jueves 29.
  const MIERCOLES = '2026-10-28T10:00:00';

  it('respeta el día pedido si se puede', async () => {
    const r = await proponer(MIERCOLES, { solicitada: 'viernes' });
    expect(r).toEqual({ fecha: '2026-10-30', mismoDia: false, feriadosAlDia: true, pedida: 'viernes' });
  });

  it('"mañana" coincide con lo más pronto', async () => {
    expect(await proponer(MIERCOLES, { solicitada: 'mañana' })).toMatchObject({ fecha: '2026-10-29' });
  });

  it('"hoy" después del corte no alcanza: propone lo más pronto y lo explica', async () => {
    expect(await proponer(MIERCOLES, { solicitada: 'hoy' })).toMatchObject({ fecha: '2026-10-29', motivoAjuste: 'muy_pronto', pedida: 'hoy' });
  });

  it('"hoy" antes de las 9:00 sale hoy', async () => {
    expect(await proponer('2026-10-28T08:30:00', { solicitada: 'hoy' })).toEqual({ fecha: '2026-10-28', mismoDia: true, feriadosAlDia: true, pedida: 'hoy' });
  });

  it('un domingo no se despacha: se pasa al lunes y se explica', async () => {
    expect(await proponer(MIERCOLES, { solicitada: 'domingo' })).toMatchObject({ fecha: '2026-11-02', motivoAjuste: 'sin_despacho' });
  });

  it('un feriado en sábado tampoco: se pasa al siguiente día de despacho', async () => {
    expect(await proponer(MIERCOLES, { solicitada: '31/10' })).toMatchObject({ fecha: '2026-11-02', motivoAjuste: 'sin_despacho' });
  });

  it('una fecha lejana que cae en domingo pasa al lunes', async () => {
    expect(await proponer(MIERCOLES, { solicitada: '15 de noviembre' })).toMatchObject({ fecha: '2026-11-16', motivoAjuste: 'sin_despacho' });
  });

  it('"el 3" es el próximo día 3', async () => {
    expect(await proponer(MIERCOLES, { solicitada: 'el 3' })).toMatchObject({ fecha: '2026-11-03' });
  });

  it('si no entiende el día pedido, propone lo más pronto y lo avisa', async () => {
    expect(await proponer(MIERCOLES, { solicitada: 'cuando puedan' })).toMatchObject({ fecha: '2026-10-29', motivoAjuste: 'no_entendida', pedida: 'cuando puedan' });
  });

  it('sin día pedido no agrega nada', async () => {
    expect(await proponer(MIERCOLES)).toEqual({ fecha: '2026-10-29', mismoDia: false, feriadosAlDia: true });
  });
});

describe('modo prueba: el pedido responde con la entrega propuesta', () => {
  const ENV: Env = {
    WHATSAPP_VERIFY_TOKEN: 'v',
    WHATSAPP_APP_SECRET: 's',
    WHATSAPP_TOKEN: 't',
    WHATSAPP_PHONE_NUMBER_ID: '000000000000000',
    GRAPH_API_VERSION: 'v99.0',
    NUMEROS_PERMITIDOS: '56900000001',
  };

  async function responder(texto: string): Promise<string> {
    let enviado = '';
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init: RequestInit) => {
        enviado = (JSON.parse(init.body as string) as { text: { body: string } }).text.body;
        return new Response('{}', { status: 200 });
      }),
    );
    await procesarMensaje({ id: 'wamid.E1', de: '56900000001', timestamp: 1793000000, tipo: 'text', texto }, ENV);
    vi.unstubAllGlobals();
    return enviado;
  }

  it('un pedido incluye la fecha propuesta y avisa que los feriados no están cargados si no hay hoja', async () => {
    const respuesta = await responder('quiero 2 de 20');
    expect(respuesta).toMatch(/entrega propuesta (hoy )?(lunes|martes|miércoles|jueves|viernes|sábado) \d{1,2} de \w+/);
    expect(respuesta).toContain('feriados sin cargar');
  });

  it('un saludo no calcula ninguna entrega', async () => {
    expect(await responder('hola')).not.toContain('entrega');
  });
});

describe('describirEntrega', () => {
  it('escribe el día de la semana y el mes en español', () => {
    expect(describirEntrega({ fecha: '2026-11-02', mismoDia: false, feriadosAlDia: true })).toBe('entrega propuesta lunes 2 de noviembre');
    expect(describirEntrega({ fecha: '2026-12-26', mismoDia: true, feriadosAlDia: true })).toBe('entrega propuesta hoy sábado 26 de diciembre');
  });

  it('avisa cuando los feriados no están al día', () => {
    expect(describirEntrega({ fecha: '2027-01-02', mismoDia: false, feriadosAlDia: false })).toBe(
      'entrega propuesta sábado 2 de enero (feriados sin cargar)',
    );
  });

  it('explica por qué la fecha no es la que pidió el cliente', () => {
    const base = { fecha: '2026-11-02', mismoDia: false, feriadosAlDia: true };
    expect(describirEntrega({ ...base, pedida: 'domingo', motivoAjuste: 'sin_despacho' })).toBe(
      'entrega propuesta lunes 2 de noviembre (pidió domingo: ese día no hay despacho)',
    );
    expect(describirEntrega({ ...base, pedida: 'hoy', motivoAjuste: 'muy_pronto' })).toBe(
      'entrega propuesta lunes 2 de noviembre (pidió hoy: no alcanza)',
    );
    expect(describirEntrega({ ...base, pedida: 'cuando puedan', motivoAjuste: 'no_entendida' })).toBe(
      'entrega propuesta lunes 2 de noviembre (no entendí la fecha "cuando puedan")',
    );
  });

  it('junta los avisos en un solo paréntesis', () => {
    expect(describirEntrega({ fecha: '2026-11-02', mismoDia: false, feriadosAlDia: false, pedida: 'hoy', motivoAjuste: 'muy_pronto' })).toBe(
      'entrega propuesta lunes 2 de noviembre (pidió hoy: no alcanza; feriados sin cargar)',
    );
  });
});
