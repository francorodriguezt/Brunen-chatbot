import { describe, expect, it } from 'vitest';
import { ACTUM, CAPACIDAD_POR_VIAJE, PLANTA, distanciaKm, evaluarOrden, optimizar, puntoDeParada, type ParadaParaRuta, type Punto } from '../src/ruta';

// Todo ficticio salvo las dos plantas del negocio.
/** Un punto a `km` kilómetros al este de otro (1° de longitud ≈ 111,32 km × cos(latitud)). */
const alEste = (p: Punto, km: number): Punto => ({ lat: p.lat, lng: p.lng + km / (111.32 * Math.cos((p.lat * Math.PI) / 180)) });
const alNorte = (p: Punto, km: number): Punto => ({ lat: p.lat + km / 111.2, lng: p.lng });

const parada = (id: string, punto: Punto, bidones = 5): ParadaParaRuta => ({ id, punto, bidones });

describe('distancia', () => {
  it('entre las dos plantas son unos 7 km en línea recta, y entre un punto y él mismo es 0', () => {
    const recta = distanciaKm(PLANTA, ACTUM, 1);
    expect(recta).toBeGreaterThan(7.0);
    expect(recta).toBeLessThan(7.6);
    expect(distanciaKm(PLANTA, PLANTA)).toBe(0);
  });

  it('por calle es más larga que en línea recta: se multiplica por un factor de rodeo', () => {
    expect(distanciaKm(PLANTA, ACTUM)).toBeCloseTo(distanciaKm(PLANTA, ACTUM, 1) * 1.3, 5);
  });
});

describe('punto de una parada', () => {
  it('usa el punto exacto si se conoce, y si no, el centro aproximado de su comuna', () => {
    expect(puntoDeParada({ lat: -33.45, lng: -70.6 }, 'Ñuñoa')).toEqual({ punto: { lat: -33.45, lng: -70.6 }, aproximado: false });
    const aprox = puntoDeParada(null, 'nunoa');
    expect(aprox?.aproximado).toBe(true);
    expect(aprox?.punto.lat).toBeLessThan(-33.3);
    expect(aprox?.punto.lat).toBeGreaterThan(-33.6);
  });

  it('sin punto y con una comuna desconocida no se inventa una ubicación', () => {
    expect(puntoDeParada(null, 'Maipú')).toBeNull();
    expect(puntoDeParada(null, '')).toBeNull();
  });
});

describe('ordenar la ruta', () => {
  it('sin paradas devuelve un plan vacío', () => {
    expect(optimizar([])).toMatchObject({ orden: [], cargas: [], km: 0 });
  });

  it('paradas en línea recta desde la planta: va de la más cerca a la más lejos y vuelve', () => {
    const a = alNorte(PLANTA, 1);
    const b = alNorte(PLANTA, 3);
    const c = alNorte(PLANTA, 6);
    const plan = optimizar([parada('C', c), parada('A', a), parada('B', b)]);
    // Ida y vuelta por la misma recta: el orden creciente o el decreciente cuestan lo mismo, pero nunca uno mezclado.
    expect(['A,B,C', 'C,B,A']).toContain(plan.orden.join(','));
    expect(plan.km).toBeCloseTo(distanciaKm(PLANTA, c) * 2, 0);
  });

  it('nunca es peor que probar todos los órdenes posibles (hasta 7 paradas)', () => {
    let semilla = 7;
    const azar = () => ((semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let caso = 0; caso < 12; caso++) {
      const paradas = Array.from({ length: 7 }, (_, i) => parada(`P${i}`, { lat: PLANTA.lat + (azar() - 0.5) * 0.12, lng: PLANTA.lng + (azar() - 0.5) * 0.12 }, 3));
      const permutaciones = (lista: string[]): string[][] => (lista.length <= 1 ? [lista] : lista.flatMap((x, i) => permutaciones([...lista.slice(0, i), ...lista.slice(i + 1)]).map((r) => [x, ...r])));
      const mejor = Math.min(...permutaciones(paradas.map((p) => p.id)).map((orden) => evaluarOrden(paradas, orden).km));
      expect(optimizar(paradas).km).toBeLessThanOrEqual(mejor * 1.03 + 1e-9);
    }
  });

  it('da lo mismo dos veces con los mismos datos', () => {
    const paradas = [alEste(PLANTA, 4), alNorte(PLANTA, 2), alEste(alNorte(PLANTA, 5), 3), alEste(PLANTA, -2)].map((p, i) => parada(`P${i}`, p));
    expect(optimizar(paradas)).toEqual(optimizar(paradas));
  });

  it('usa todas las paradas exactamente una vez', () => {
    const paradas = Array.from({ length: 14 }, (_, i) => parada(`P${i}`, alEste(alNorte(PLANTA, (i * 7) % 9), (i * 3) % 11), 4));
    expect([...optimizar(paradas).orden].sort()).toEqual(paradas.map((p) => p.id).sort());
  });
});

describe('cargas y recarga a mitad de ruta', () => {
  it('parte las paradas en viajes de hasta 65 bidones, sin cambiar el orden de la ruta', () => {
    const paradas = [30, 30, 30].map((b, i) => parada(`P${i}`, alNorte(PLANTA, 1 + i), b));
    const plan = optimizar(paradas);
    expect(CAPACIDAD_POR_VIAJE).toBe(65);
    expect(plan.cargas.map((c) => c.bidones)).toEqual([60, 30]);
    expect(plan.cargas.flatMap((c) => c.paradas)).toEqual(plan.orden);
    expect(plan.cargas[0]?.recargaEn).toBeNull(); // el primer viaje sale cargado de la planta
    expect(plan.cargas[1]?.recargaEn).not.toBeNull();
  });

  it('recarga en Actum cuando el corte cae al lado de Actum, y en la planta cuando cae al lado de la planta', () => {
    const cercaDeActum = [parada('E1', alEste(ACTUM, 0.3), 40), parada('E2', alEste(ACTUM, 1), 40)];
    expect(optimizar(cercaDeActum).cargas[1]?.recargaEn).toBe('actum');
    const cercaDeLaPlanta = [parada('W1', alEste(PLANTA, 0.3), 40), parada('W2', alEste(PLANTA, 1), 40)];
    expect(optimizar(cercaDeLaPlanta).cargas[1]?.recargaEn).toBe('planta');
  });

  it('un pedido más grande que el furgón va solo en su viaje y queda marcado', () => {
    const plan = optimizar([parada('A', alNorte(PLANTA, 1), 10), parada('G', alNorte(PLANTA, 2), 80), parada('B', alNorte(PLANTA, 3), 10)]);
    const grande = plan.cargas.find((c) => c.paradas.includes('G'));
    expect(grande).toMatchObject({ paradas: ['G'], bidones: 80, excedeFurgon: true });
  });

  it('el kilometraje incluye la ida a la recarga y la vuelta, y el tiempo suma las paradas', () => {
    const plan = optimizar([parada('E1', alEste(ACTUM, 0.3), 40), parada('E2', alEste(ACTUM, 1), 40)]);
    expect(plan.tramos[0]?.desde).toBe('planta');
    expect(plan.tramos.at(-1)?.hasta).toBe('planta');
    expect(plan.tramos.some((t) => t.hasta === 'actum')).toBe(true);
    expect(plan.km).toBeCloseTo(plan.tramos.reduce((s, t) => s + t.km, 0), 5);
    expect(plan.minutos).toBeGreaterThan((plan.km / 25) * 60);
  });
});

describe('evaluar un orden dado (para mover paradas a mano)', () => {
  it('calcula los kilómetros del orden que se le pasa, sin reordenar', () => {
    const paradas = [parada('A', alNorte(PLANTA, 1)), parada('B', alNorte(PLANTA, 5)), parada('C', alNorte(PLANTA, 2))];
    const malo = evaluarOrden(paradas, ['B', 'A', 'C']);
    const bueno = evaluarOrden(paradas, ['A', 'C', 'B']);
    expect(malo.orden).toEqual(['B', 'A', 'C']);
    expect(malo.km).toBeGreaterThan(bueno.km);
  });

  it('rechaza un orden que no usa exactamente las mismas paradas', () => {
    const paradas = [parada('A', alNorte(PLANTA, 1)), parada('B', alNorte(PLANTA, 2))];
    expect(() => evaluarOrden(paradas, ['A'])).toThrow();
    expect(() => evaluarOrden(paradas, ['A', 'A'])).toThrow();
    expect(() => evaluarOrden(paradas, ['A', 'X'])).toThrow();
  });
});
