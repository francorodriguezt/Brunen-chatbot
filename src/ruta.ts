/**
 * Ruta eficiente del repartidor (fase C, D63): de la planta, por todas las paradas del día, hasta volver a la planta,
 * con la recarga en la planta o en Actum cuando el furgón se queda sin bidones.
 *
 * Todo se calcula aquí, sin enviar nada a ningún servicio (D32, D62): las distancias son en línea recta por un factor de
 * rodeo, no por calle. Sirve para ORDENAR las paradas bien; los kilómetros y los minutos son referenciales.
 *
 * El orden se busca con el vecino más cercano y se mejora con 2-opt y mover una parada de lugar. Para las 30 paradas
 * como máximo de un día es instantáneo y no tiene cupo. En 7 paradas queda a menos del 3 % del mejor orden posible.
 */

import { detectarComuna } from './comunas';

export interface Punto {
  lat: number;
  lng: number;
}

/** Donde parte y termina la ruta (Padre Orellana 1989, Santiago). Coordenadas buscadas una vez en OpenStreetMap. */
export const PLANTA: Punto = { lat: -33.4703, lng: -70.6289 };
/** Recarga a mitad de ruta (Isabel La Católica 5019, Las Condes). */
export const ACTUM: Punto = { lat: -33.4261, lng: -70.5713 };

/** Bidones que lleva el furgón en cada viaje (el dueño, 2026-11-10). */
export const CAPACIDAD_POR_VIAJE = 65;
/** Por calle se anda, en promedio, 1,3 veces la línea recta en una ciudad (valor típico, no medido en Santiago). */
export const FACTOR_DE_RODEO = 1.3;
/** Referenciales hasta que el dueño confirme la hora de salida y cuánto se demora en cada parada. */
export const VELOCIDAD_KMH = 25;
export const MINUTOS_POR_PARADA = 5;
export const MINUTOS_DE_RECARGA = 15;

export type Deposito = 'planta' | 'actum';
const DEPOSITOS: ReadonlyArray<readonly [Deposito, Punto]> = [
  ['planta', PLANTA],
  ['actum', ACTUM],
];

/**
 * Centro aproximado de cada comuna que se atiende, para ubicar sin datos una parada cuyo punto exacto todavía no se
 * conoce. Es una aproximación: la pantalla las marca como "aproximadas" y se corrigen al entregar o con un pin.
 */
const CENTRO_DE_COMUNA: Readonly<Record<string, Punto>> = {
  'Ñuñoa': { lat: -33.4569, lng: -70.5976 },
  Macul: { lat: -33.49, lng: -70.594 },
  'San Joaquín': { lat: -33.495, lng: -70.623 },
  'Peñalolén': { lat: -33.485, lng: -70.54 },
  'Santiago Centro': { lat: -33.4489, lng: -70.6693 },
  Providencia: { lat: -33.432, lng: -70.612 },
  'Las Condes': { lat: -33.408, lng: -70.567 },
  Vitacura: { lat: -33.385, lng: -70.578 },
  'Lo Barnechea': { lat: -33.35, lng: -70.52 },
  Recoleta: { lat: -33.405, lng: -70.64 },
  Huechuraba: { lat: -33.365, lng: -70.635 },
  'La Reina': { lat: -33.445, lng: -70.535 },
};

/** El punto de una parada: el exacto si se conoce; si no, el centro de su comuna (aproximado); si no, ninguno. */
export function puntoDeParada(exacto: Punto | null, comuna: string): { punto: Punto; aproximado: boolean } | null {
  if (exacto) return { punto: exacto, aproximado: false };
  const centro = CENTRO_DE_COMUNA[detectarComuna(comuna)?.nombre ?? ''];
  return centro ? { punto: centro, aproximado: true } : null;
}

const aRadianes = (grados: number): number => (grados * Math.PI) / 180;

/** Kilómetros entre dos puntos (fórmula de haversine) por el factor de rodeo. Con `factor` = 1 es la línea recta. */
export function distanciaKm(a: Punto, b: Punto, factor: number = FACTOR_DE_RODEO): number {
  const dLat = aRadianes(b.lat - a.lat);
  const dLng = aRadianes(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(aRadianes(a.lat)) * Math.cos(aRadianes(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.min(1, Math.sqrt(h))) * factor;
}

export interface ParadaParaRuta {
  id: string;
  punto: Punto;
  bidones: number;
}

export interface TramoDeRuta {
  /** 'planta', 'actum' o el id de una parada. */
  desde: string;
  hasta: string;
  km: number;
}

export interface CargaDeRuta {
  numero: number;
  /** Ids de las paradas de este viaje, en orden. */
  paradas: string[];
  bidones: number;
  /** Un solo pedido con más bidones de los que caben: hay que repartirlo en dos viajes a mano. */
  excedeFurgon: boolean;
  /** Dónde se recarga antes de este viaje; null en el primero, que sale cargado de la planta. */
  recargaEn: Deposito | null;
}

export interface PlanDeRuta {
  orden: string[];
  cargas: CargaDeRuta[];
  tramos: TramoDeRuta[];
  km: number;
  minutos: number;
}

/** Calcula las cargas, los tramos y los kilómetros de un orden dado. Parte las cargas donde el furgón se queda sin bidones. */
function planDe(paradas: readonly ParadaParaRuta[], capacidad: number): PlanDeRuta {
  // Se llena el furgón en el orden de la ruta; cuando la siguiente parada no cabe, empieza otro viaje.
  const viajes: ParadaParaRuta[][] = [];
  let enViaje = 0;
  for (const parada of paradas) {
    if (viajes.length === 0 || enViaje + parada.bidones > capacidad) {
      viajes.push([]);
      enViaje = 0;
    }
    (viajes[viajes.length - 1] as ParadaParaRuta[]).push(parada);
    enViaje += parada.bidones;
  }
  const cargas: CargaDeRuta[] = viajes.map((viaje, i) => {
    const bidones = viaje.reduce((suma, p) => suma + p.bidones, 0);
    return { numero: i + 1, paradas: viaje.map((p) => p.id), bidones, excedeFurgon: bidones > capacidad, recargaEn: null };
  });

  const tramos: TramoDeRuta[] = [];
  const tramo = (desde: string, a: Punto, hasta: string, b: Punto): void => void tramos.push({ desde, hasta, km: distanciaKm(a, b) });
  let ultimo: { id: string; punto: Punto } = { id: 'planta', punto: PLANTA };
  viajes.forEach((viaje, i) => {
    const primero = viaje[0] as ParadaParaRuta;
    if (i > 0) {
      // Entre dos viajes se recarga donde sobre menos camino: en la planta o en Actum.
      let mejor = DEPOSITOS[0] as (typeof DEPOSITOS)[number];
      for (const deposito of DEPOSITOS) {
        if (distanciaKm(ultimo.punto, deposito[1]) + distanciaKm(deposito[1], primero.punto) < distanciaKm(ultimo.punto, mejor[1]) + distanciaKm(mejor[1], primero.punto) - 1e-9) mejor = deposito;
      }
      tramo(ultimo.id, ultimo.punto, mejor[0], mejor[1]);
      ultimo = { id: mejor[0], punto: mejor[1] };
      (cargas[i] as CargaDeRuta).recargaEn = mejor[0];
    }
    for (const parada of viaje) {
      tramo(ultimo.id, ultimo.punto, parada.id, parada.punto);
      ultimo = { id: parada.id, punto: parada.punto };
    }
  });
  if (paradas.length > 0) tramo(ultimo.id, ultimo.punto, 'planta', PLANTA);

  const km = tramos.reduce((suma, t) => suma + t.km, 0);
  const recargas = Math.max(0, cargas.length - 1);
  const minutos = Math.round((km / VELOCIDAD_KMH) * 60 + paradas.length * MINUTOS_POR_PARADA + recargas * MINUTOS_DE_RECARGA);
  return { orden: paradas.map((p) => p.id), cargas, tramos, km, minutos };
}

/** El plan de las paradas en el orden que se le da, sin reordenar. Lanza un error si el orden no usa cada parada una vez. */
export function evaluarOrden(paradas: readonly ParadaParaRuta[], orden: readonly string[], capacidad: number = CAPACIDAD_POR_VIAJE): PlanDeRuta {
  const porId = new Map(paradas.map((p) => [p.id, p]));
  if (orden.length !== paradas.length || new Set(orden).size !== orden.length || orden.some((id) => !porId.has(id))) {
    throw new Error('El orden no usa cada parada exactamente una vez');
  }
  return planDe(orden.map((id) => porId.get(id) as ParadaParaRuta), capacidad);
}

const MAXIMO_DE_PASADAS = 60;
const MEJORA_MINIMA_KM = 1e-6;

/**
 * Busca un orden corto: vecino más cercano desde la planta y mejoras locales (2-opt y mover una parada) hasta que ya no
 * ayuden. Corre dentro del Worker, que en el plan gratis tiene 10 ms de CPU por solicitud: las distancias se calculan una
 * sola vez en una tabla y cada intento se mide sobre un arreglo reutilizado, sin armar el plan completo. Da los mismos
 * kilómetros que `planDe` (el mismo reparto en viajes y la misma recarga), pero sin crear objetos.
 */
export function optimizar(paradas: readonly ParadaParaRuta[], capacidad: number = CAPACIDAD_POR_VIAJE): PlanDeRuta {
  if (paradas.length === 0) return planDe([], capacidad);

  // Con empate, por id, para que dé siempre lo mismo.
  const lista = [...paradas].sort((a, b) => (a.id < b.id ? -1 : 1));
  const n = lista.length;
  const bidones = lista.map((p) => p.bidones);
  const aPlanta = lista.map((p) => distanciaKm(PLANTA, p.punto));
  const aActum = lista.map((p) => distanciaKm(ACTUM, p.punto));
  const entre = new Float64Array(n * n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const d = distanciaKm((lista[i] as ParadaParaRuta).punto, (lista[j] as ParadaParaRuta).punto);
      entre[i * n + j] = d;
      entre[j * n + i] = d;
    }
  }

  /** Los kilómetros de un orden, como en `planDe`: viajes llenados en orden y recarga en el depósito que menos desvía. */
  const kmDe = (orden: ArrayLike<number>): number => {
    let anterior = orden[0] as number;
    let km = aPlanta[anterior] as number;
    let enViaje = bidones[anterior] as number;
    for (let k = 1; k < n; k++) {
      const actual = orden[k] as number;
      const b = bidones[actual] as number;
      if (enViaje + b > capacidad) {
        km += Math.min((aPlanta[anterior] as number) + (aPlanta[actual] as number), (aActum[anterior] as number) + (aActum[actual] as number));
        enViaje = b;
      } else {
        km += entre[anterior * n + actual] as number;
        enViaje += b;
      }
      anterior = actual;
    }
    return km + (aPlanta[anterior] as number);
  };

  // Vecino más cercano desde la planta.
  const orden = new Int32Array(n);
  const usada = new Uint8Array(n);
  let aqui = -1;
  for (let k = 0; k < n; k++) {
    let mejor = -1;
    let mejorDistancia = Infinity;
    for (let i = 0; i < n; i++) {
      if (usada[i]) continue;
      const d = aqui < 0 ? (aPlanta[i] as number) : (entre[aqui * n + i] as number);
      if (d < mejorDistancia - 1e-9) {
        mejor = i;
        mejorDistancia = d;
      }
    }
    orden[k] = mejor;
    usada[mejor] = 1;
    aqui = mejor;
  }

  const candidato = new Int32Array(n);
  let mejorCosto = kmDe(orden);
  for (let pasada = 0; pasada < MAXIMO_DE_PASADAS; pasada++) {
    let mejoro = false;
    // 2-opt: invertir un tramo del recorrido.
    for (let i = 0; i < n - 1; i++) {
      for (let j = i + 1; j < n; j++) {
        candidato.set(orden);
        for (let a = i, b = j; a <= j; a++, b--) candidato[a] = orden[b] as number;
        const c = kmDe(candidato);
        if (c < mejorCosto - MEJORA_MINIMA_KM) {
          orden.set(candidato);
          mejorCosto = c;
          mejoro = true;
        }
      }
    }
    // Mover una parada a otro lugar del recorrido.
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (i === j) continue;
        // Sacar la de la posición i y ponerla en la posición j del recorrido que queda.
        const movida = orden[i] as number;
        let escrito = 0;
        for (let k = 0; k < n; k++) {
          if (k === i) continue;
          if (escrito === j) candidato[escrito++] = movida;
          candidato[escrito++] = orden[k] as number;
        }
        if (escrito === j) candidato[escrito] = movida;
        const c = kmDe(candidato);
        if (c < mejorCosto - MEJORA_MINIMA_KM) {
          orden.set(candidato);
          mejorCosto = c;
          mejoro = true;
        }
      }
    }
    if (!mejoro) break;
  }
  return planDe(Array.from(orden, (i) => lista[i] as ParadaParaRuta), capacidad);
}
