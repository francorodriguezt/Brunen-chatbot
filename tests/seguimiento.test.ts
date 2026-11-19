import { describe, expect, it } from 'vitest';
import { RepositorioEntregas } from '../src/entregas';
import type { PedidoARegistrar } from '../src/pedidos';
import { RepositorioPuntos } from '../src/puntos';
import { RepositorioD1 } from '../src/repositorio';
import {
  RepositorioSeguimiento,
  aprenderMinutosPorParada,
  calcularLlegadas,
  estimarElDia,
  validarPosiciones,
  ventanaDeLlegada,
} from '../src/seguimiento';
import { crearBaseSqlite } from './ayudas';

// Miércoles 18 de noviembre de 2026, 11:00 en Santiago (UTC-3). Todo ficticio.
const HOY = '2026-11-18';
const AHORA = Math.floor(new Date('2026-11-18T11:00:00-03:00').getTime() / 1000);
const NUNOA = { lat: -33.4569, lng: -70.5976 };
const MACUL = { lat: -33.487, lng: -70.599 };
const PROVIDENCIA = { lat: -33.4314, lng: -70.6093 };

function base() {
  const db = crearBaseSqlite();
  db.sql("INSERT INTO usuarios (id, rut, nombre, rol, clave_sal, clave_hash, creado_en, actualizado_en) VALUES (7, '222222222', 'Repartidor Prueba', 'repartidor', 's', 'h', 1, 1)");
  return { db, s: new RepositorioSeguimiento(db, () => 1) };
}

const posicion = (en: number, punto = NUNOA, precision = 15) => ({ ...punto, precision, en });

describe('lo que manda el teléfono (D80)', () => {
  it('descarta lo que no sirve sin rechazar el resto', () => {
    const r = validarPosiciones(
      [
        posicion(AHORA - 30),
        { ...posicion(AHORA - 20), lat: 10 }, // fuera de la Región Metropolitana
        posicion(AHORA - 10, NUNOA, 900), // GPS muy impreciso
        posicion(AHORA + 3600), // del futuro
        posicion(AHORA - 7 * 3600), // de hace más de 6 horas
        'basura',
      ],
      AHORA,
    );
    expect(r).toEqual([posicion(AHORA - 30)]);
    expect(validarPosiciones('no es una lista', AHORA)).toBeNull();
    expect(validarPosiciones(Array.from({ length: 31 }, () => posicion(AHORA)), AHORA)).toBeNull();
  });
});

describe('consentimiento y jornada (D80)', () => {
  it('sin consentimiento o sin jornada abierta no se guarda nada', async () => {
    const { s } = base();
    expect(await s.guardarPosiciones(7, [posicion(AHORA)], AHORA)).toBe('sin_consentimiento');
    await s.decidir(7, true, AHORA - 100);
    expect(await s.guardarPosiciones(7, [posicion(AHORA)], AHORA)).toBe('sin_jornada');
  });

  it('con consentimiento y la jornada abierta guarda solo lo de la jornada; al terminarla, deja de guardar', async () => {
    const { db, s } = base();
    await s.decidir(7, true, AHORA - 1000);
    const jornada = await s.iniciar(7, HOY, AHORA - 600);
    expect(await s.iniciar(7, HOY, AHORA - 500)).toEqual(jornada); // iniciar de nuevo sigue la misma
    expect(await s.guardarPosiciones(7, [posicion(AHORA - 900), posicion(AHORA - 300), posicion(AHORA)], AHORA)).toBe(2);
    await s.terminar(7, HOY, AHORA + 10);
    expect(await s.guardarPosiciones(7, [posicion(AHORA + 20)], AHORA + 30)).toBe('sin_jornada');
    expect(db.sql('SELECT COUNT(*) AS n FROM posiciones')).toEqual([{ n: 2 }]);
  });

  it('guarda envíos grandes por partes (D1 admite 100 valores por consulta)', async () => {
    const { db, s } = base();
    await s.decidir(7, true, AHORA - 1000);
    await s.iniciar(7, HOY, AHORA - 900);
    const veinte = Array.from({ length: 20 }, (_, i) => posicion(AHORA - 600 + i * 20));
    expect(await s.guardarPosiciones(7, veinte, AHORA)).toBe(20);
    expect(db.sql('SELECT COUNT(*) AS n FROM posiciones')).toEqual([{ n: 20 }]);
  });

  it('fuera del turno (de noche) no guarda aunque la jornada siga abierta', async () => {
    const { s } = base();
    const noche = Math.floor(new Date('2026-11-18T22:30:00-03:00').getTime() / 1000);
    await s.decidir(7, true, AHORA);
    await s.iniciar(7, HOY, AHORA);
    expect(await s.guardarPosiciones(7, [posicion(noche - 10)], noche)).toBe('sin_jornada');
  });

  it('retirar el consentimiento borra sus posiciones', async () => {
    const { db, s } = base();
    await s.decidir(7, true, AHORA - 1000);
    await s.iniciar(7, HOY, AHORA - 900);
    await s.guardarPosiciones(7, [posicion(AHORA - 60)], AHORA);
    await s.decidir(7, false, AHORA);
    expect(await s.tieneConsentimiento(7)).toBe(false);
    expect(db.sql('SELECT COUNT(*) AS n FROM posiciones')).toEqual([{ n: 0 }]);
  });

  it('la última posición de hoy trae el nombre y si la jornada sigue abierta; se borran las de más de 3 días', async () => {
    const { s } = base();
    await s.decidir(7, true, AHORA - 1000);
    await s.iniciar(7, HOY, AHORA - 900);
    await s.guardarPosiciones(7, [posicion(AHORA - 120, NUNOA), posicion(AHORA - 30, MACUL)], AHORA);
    expect(await s.ultimaDeHoy(HOY)).toMatchObject({ nombre: 'Repartidor Prueba', ...MACUL, en: AHORA - 30, jornadaAbierta: true });
    await s.limpiar(AHORA + 4 * 86400);
    expect(await s.ultimaDeHoy(HOY)).toBeNull();
  });
});

describe('hora de llegada por eventos (D80)', () => {
  it('suma el viaje y el tiempo en cada parada, en orden, y corta donde falta un punto', () => {
    const llegadas = calcularLlegadas(
      [{ id: 'A', punto: MACUL }, { id: 'B', punto: PROVIDENCIA }, { id: 'C', punto: null }, { id: 'D', punto: NUNOA }],
      { en: AHORA, punto: NUNOA },
      AHORA,
      5,
    );
    expect([...llegadas.keys()]).toEqual(['A', 'B']);
    const a = llegadas.get('A') as number;
    const b = llegadas.get('B') as number;
    expect(a).toBeGreaterThan(AHORA);
    expect(b - a).toBeGreaterThan(5 * 60); // al menos los 5 minutos en A, más el viaje
  });

  it('si la hora calculada ya pasó, todavía no llega: como pronto, en un minuto', () => {
    const llegadas = calcularLlegadas([{ id: 'A', punto: MACUL }], { en: AHORA - 3600, punto: NUNOA }, AHORA, 5);
    expect(llegadas.get('A')).toBe(AHORA + 60);
  });

  it('la ventana es de al menos ±10 minutos, en tramos de 5, y nunca empieza en el pasado', () => {
    const { desde, hasta } = ventanaDeLlegada(AHORA + 20 * 60, AHORA);
    expect(desde % 300).toBe(0);
    expect(hasta % 300).toBe(0);
    expect(desde).toBeGreaterThan(AHORA);
    expect(desde).toBeLessThanOrEqual(AHORA + 10 * 60);
    expect(hasta).toBeGreaterThanOrEqual(AHORA + 30 * 60);
  });

  it('aprende los minutos por parada con la mediana; con pocas muestras usa 5', () => {
    expect(aprenderMinutosPorParada([{ segundos: 900, km: 1 }])).toBe(5);
    // 1 km a 25 km/h son 2,4 minutos: lo que sobra es el tiempo en la parada (8 muestras de 10 minutos y una pausa larga).
    const muestras = [...Array.from({ length: 8 }, () => ({ segundos: (10 + 2.4) * 60, km: 1 })), { segundos: 90 * 60, km: 1 }];
    expect(aprenderMinutosPorParada(muestras)).toBe(10);
  });
});

describe('estimar el día (D80)', () => {
  function pedido(id: string, telefono: string, direccion: string): PedidoARegistrar {
    return {
      idPedido: id,
      telefono,
      nombre: `Cliente ${id}`,
      lineas: [{ tipo: '20L', cantidad: 2, precioUnitario: 3300, subtotal: 6600 }],
      fechaEntrega: HOY,
      estado: 'Pendiente_Confirmacion',
      comuna: 'Ñuñoa',
      direccion,
      notasRepartidor: '',
      envasesARetirar: 0,
      observaciones: '',
    };
  }

  async function dia() {
    const { db, s } = base();
    const r = new RepositorioD1(db);
    const puntos = new RepositorioPuntos(db);
    const paradas = [
      ['P261118-AAAAA', '56911111111', 'Calle Uno 1', NUNOA],
      ['P261118-BBBBB', '56922222222', 'Calle Dos 2', MACUL],
      ['P261118-CCCCC', '56933333333', 'Calle Tres 3', PROVIDENCIA],
    ] as const;
    for (const [id, telefono, direccion, punto] of paradas) {
      await r.guardarPedido(pedido(id, telefono, direccion), AHORA - 7200);
      await r.cambiarEstado(id, 'Confirmado', 'prueba', AHORA - 7000);
      await puntos.guardar(direccion, 'Ñuñoa', { ...punto, origen: 'manual' }, AHORA - 7000);
    }
    return { db, s, r };
  }

  it('sin ruta publicada no estima: no se sabe el orden', async () => {
    const { db } = await dia();
    expect((await estimarElDia(db, HOY, AHORA)).llegadas.size).toBe(0);
  });

  it('con la ruta publicada y una entrega reciente, estima las que faltan y dice cuál sigue', async () => {
    const { db, r } = await dia();
    await r.publicarOrdenDeRuta(HOY, ['P261118-AAAAA', 'P261118-BBBBB', 'P261118-CCCCC']);
    await new RepositorioEntregas(db).entregar('P261118-AAAAA', { vacios: 2, cobrado: false }, { fecha: HOY, quien: 'prueba', ahora: AHORA - 600 });
    const e = await estimarElDia(db, HOY, AHORA);
    expect(e.siguiente).toBe('P261118-BBBBB');
    expect([...e.llegadas.keys()]).toEqual(['P261118-BBBBB', 'P261118-CCCCC']);
    const b = e.llegadas.get('P261118-BBBBB');
    expect(b?.desde).toBeLessThan(b?.hasta as number);
  });

  it('con la última entrega de hace más de 90 minutos y sin posición, no estima', async () => {
    const { db, r } = await dia();
    await r.publicarOrdenDeRuta(HOY, ['P261118-AAAAA', 'P261118-BBBBB', 'P261118-CCCCC']);
    await new RepositorioEntregas(db).entregar('P261118-AAAAA', { vacios: 2, cobrado: false }, { fecha: HOY, quien: 'prueba', ahora: AHORA - 100 * 60 });
    expect((await estimarElDia(db, HOY, AHORA)).llegadas.size).toBe(0);
  });

  it('una posición en vivo más reciente que la última entrega manda', async () => {
    const { db, s, r } = await dia();
    await r.publicarOrdenDeRuta(HOY, ['P261118-AAAAA', 'P261118-BBBBB', 'P261118-CCCCC']);
    await s.decidir(7, true, AHORA - 7200);
    await s.iniciar(7, HOY, AHORA - 7200);
    await s.guardarPosiciones(7, [posicion(AHORA - 60, MACUL)], AHORA);
    const e = await estimarElDia(db, HOY, AHORA);
    expect(e.repartidor).toMatchObject({ ...MACUL, jornadaAbierta: true });
    expect(e.siguiente).toBe('P261118-AAAAA');
    expect(e.llegadas.size).toBe(3);
  });
});
