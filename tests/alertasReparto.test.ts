import { describe, expect, it, vi } from 'vitest';
import {
  UMBRALES_POR_DEFECTO,
  parsearRutaNoIniciada,
  parsearSinSenal,
  revisarRutaNoIniciada,
  revisarSinSenal,
  vigilarReparto,
  type JornadaAbierta,
} from '../src/alertasReparto';
import { parsearConfiguracion } from '../src/configuracion';
import type { PedidoARegistrar } from '../src/pedidos';
import { RepositorioD1 } from '../src/repositorio';
import { RepositorioSeguimiento } from '../src/seguimiento';
import { crearBaseSqlite } from './ayudas';

// Miércoles 18 de noviembre de 2026 en Santiago (UTC-3). Todo ficticio.
const HOY = '2026-11-18';
const a = (hora: string) => Math.floor(new Date(`${HOY}T${hora}:00-03:00`).getTime() / 1000);
const local = (hora: number, minuto = 0) => ({ fecha: HOY, hora, minuto });

describe('umbrales desde la hoja CONFIGURACION (D98)', () => {
  it('sin nada escrito valen 20 minutos y 10:30', () => {
    expect(parsearConfiguracion([]).reparto).toEqual(UMBRALES_POR_DEFECTO);
    expect(UMBRALES_POR_DEFECTO).toEqual({ sinSenalMinutos: 20, rutaNoIniciada: { hora: 10, minuto: 30 } });
  });

  it('lee los valores, los apaga con NO y deja el por defecto si no se entiende', () => {
    const r = parsearConfiguracion([
      ['ALERTA_SIN_SENAL_MINUTOS', '30 min'],
      ['ALERTA_RUTA_NO_INICIADA', '11.15'],
    ]).reparto;
    expect(r).toEqual({ sinSenalMinutos: 30, rutaNoIniciada: { hora: 11, minuto: 15 } });
    expect(parsearSinSenal('NO')).toBeNull();
    expect(parsearSinSenal('2')).toBe(20); // demasiado corto: un túnel no es una alerta
    expect(parsearSinSenal('veinte')).toBe(20);
    expect(parsearRutaNoIniciada('no')).toBeNull();
    expect(parsearRutaNoIniciada('11')).toEqual({ hora: 11, minuto: 0 });
    expect(parsearRutaNoIniciada('25:00')).toEqual({ hora: 10, minuto: 30 });
    expect(parsearRutaNoIniciada('19:00')).toEqual({ hora: 10, minuto: 30 }); // después del horario de despacho
  });
});

describe('sin señal', () => {
  const jornada = (cambios: Partial<JornadaAbierta> = {}): JornadaAbierta => ({
    id: 1,
    nombre: 'Repartidor Prueba',
    iniciadaEn: a('09:00'),
    ultimaPosicion: a('10:00'),
    consentimiento: true,
    ...cambios,
  });

  it('avisa cuando pasan los minutos sin ubicación, no antes', () => {
    expect(revisarSinSenal([jornada()], UMBRALES_POR_DEFECTO, local(10, 19), a('10:19'))).toEqual([]);
    const [aviso] = revisarSinSenal([jornada()], UMBRALES_POR_DEFECTO, local(10, 25), a('10:25'));
    expect(aviso?.alerta.resumen).toContain('hace 25 minutos');
    expect(aviso?.origen).toBe(`sin-senal:1:${a('10:00')}`);
  });

  it('si nunca llegó una posición, cuenta desde que inició la ruta y lo dice', () => {
    const [aviso] = revisarSinSenal([jornada({ ultimaPosicion: null })], UMBRALES_POR_DEFECTO, local(9, 30), a('09:30'));
    expect(aviso?.alerta.resumen).toContain('todavía no llega la ubicación');
  });

  it('no avisa sin consentimiento, fuera de 6:00 a 22:00 ni si está apagada', () => {
    expect(revisarSinSenal([jornada({ consentimiento: false })], UMBRALES_POR_DEFECTO, local(11), a('11:00'))).toEqual([]);
    expect(revisarSinSenal([jornada()], UMBRALES_POR_DEFECTO, local(22, 10), a('22:10'))).toEqual([]);
    expect(revisarSinSenal([jornada()], { ...UMBRALES_POR_DEFECTO, sinSenalMinutos: null }, local(11), a('11:00'))).toEqual([]);
  });
});

describe('ruta no iniciada', () => {
  const dia = { fecha: HOY, entregasPendientes: 5, jornadaIniciada: false, appEnUso: true };

  it('avisa desde las 10:30 si hay entregas y nadie inició, una vez al día', () => {
    expect(revisarRutaNoIniciada(dia, UMBRALES_POR_DEFECTO, local(10, 25))).toBeNull();
    const aviso = revisarRutaNoIniciada(dia, UMBRALES_POR_DEFECTO, local(10, 30));
    expect(aviso?.alerta.resumen).toContain('5 entregas');
    expect(aviso?.origen).toBe(`ruta-no-iniciada:${HOY}`);
  });

  it('no avisa sin entregas, con la jornada iniciada, después de las 18:00 ni si la app no se usa todavía', () => {
    expect(revisarRutaNoIniciada({ ...dia, entregasPendientes: 0 }, UMBRALES_POR_DEFECTO, local(11))).toBeNull();
    expect(revisarRutaNoIniciada({ ...dia, jornadaIniciada: true }, UMBRALES_POR_DEFECTO, local(11))).toBeNull();
    expect(revisarRutaNoIniciada(dia, UMBRALES_POR_DEFECTO, local(18, 5))).toBeNull();
    // Mientras el reparto vaya por Optiroute (D49), nadie toca "Iniciar ruta": no se avisa todos los días.
    expect(revisarRutaNoIniciada({ ...dia, appEnUso: false }, UMBRALES_POR_DEFECTO, local(11))).toBeNull();
  });
});

describe('vigilarReparto con la base', () => {
  function pedido(id: string, telefono: string): PedidoARegistrar {
    return {
      idPedido: id,
      telefono,
      nombre: `Cliente ${id}`,
      lineas: [{ tipo: '20L', cantidad: 2, precioUnitario: 3300, subtotal: 6600 }],
      fechaEntrega: HOY,
      estado: 'Pendiente_Confirmacion',
      comuna: 'Ñuñoa',
      direccion: 'Calle Uno 1',
      notasRepartidor: '',
      envasesARetirar: 0,
      observaciones: '',
    };
  }

  async function base() {
    const db = crearBaseSqlite();
    db.sql("INSERT INTO usuarios (id, rut, nombre, rol, clave_sal, clave_hash, creado_en, actualizado_en) VALUES (7, '222222222', 'Repartidor Prueba', 'repartidor', 's', 'h', 1, 1)");
    const r = new RepositorioD1(db);
    for (const [id, telefono] of [['P261118-AAAAA', '56911111111'], ['P261118-BBBBB', '56922222222']] as const) {
      await r.guardarPedido(pedido(id, telefono), a('08:00'));
      await r.cambiarEstado(id, 'Confirmado', 'prueba', a('08:10'));
    }
    return { db, s: new RepositorioSeguimiento(db, () => 1) };
  }
  const avisos = (db: ReturnType<typeof crearBaseSqlite>) => db.sql('SELECT tipo, resumen, origen FROM avisos ORDER BY id') as Array<{ tipo: string; resumen: string; origen: string }>;

  it('ruta no iniciada: un solo aviso aunque el vigía pase muchas veces; la app ya se usó esta semana', async () => {
    const { db, s } = await base();
    const ayer = await s.iniciar(7, '2026-11-17', a('09:00') - 86400);
    await s.terminar(7, ayer.fecha, a('17:00') - 86400);
    expect(await vigilarReparto(db, UMBRALES_POR_DEFECTO, local(10, 30), a('10:30'))).toBe(1);
    expect(await vigilarReparto(db, UMBRALES_POR_DEFECTO, local(10, 35), a('10:35'))).toBe(0);
    expect(avisos(db)).toEqual([expect.objectContaining({ tipo: 'escalamiento', origen: `ruta-no-iniciada:${HOY}` })]);
    expect(avisos(db)[0]?.resumen).toContain('2 entregas');
  });

  it('sin señal: avisa una vez por corte y otra si vuelve y se corta de nuevo', async () => {
    const { db, s } = await base();
    await s.decidir(7, true, a('08:50'));
    await s.iniciar(7, HOY, a('09:00'));
    await s.guardarPosiciones(7, [{ lat: -33.4569, lng: -70.5976, precision: 15, en: a('09:05') }], a('09:05'));
    expect(await vigilarReparto(db, UMBRALES_POR_DEFECTO, local(9, 20), a('09:20'))).toBe(0);
    expect(await vigilarReparto(db, UMBRALES_POR_DEFECTO, local(9, 30), a('09:30'))).toBe(1);
    expect(await vigilarReparto(db, UMBRALES_POR_DEFECTO, local(9, 35), a('09:35'))).toBe(0);
    await s.guardarPosiciones(7, [{ lat: -33.4569, lng: -70.5976, precision: 15, en: a('09:40') }], a('09:40'));
    expect(await vigilarReparto(db, UMBRALES_POR_DEFECTO, local(10, 5), a('10:05'))).toBe(1);
    expect(avisos(db).map((x) => x.origen)).toEqual([expect.stringMatching(/^sin-senal:/), expect.stringMatching(/^sin-senal:/)]);
  });

  it('con la jornada terminada no avisa sin señal ni ruta no iniciada', async () => {
    const { db, s } = await base();
    await s.decidir(7, true, a('08:50'));
    await s.iniciar(7, HOY, a('09:00'));
    await s.terminar(7, HOY, a('09:10'));
    expect(await vigilarReparto(db, UMBRALES_POR_DEFECTO, local(11), a('11:00'))).toBe(0);
  });

  it('si la base falla, no lanza el error', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const rota = { prepare: () => ({ bind: () => ({ run: async () => { throw new Error('caída'); } }) }) };
    expect(await vigilarReparto(rota, UMBRALES_POR_DEFECTO, local(11), a('11:00'))).toBe(0);
    vi.restoreAllMocks();
  });
});
