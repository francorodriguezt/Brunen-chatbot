/**
 * Navegación del repartidor por carga (D67): un toque abre Google Maps con todas las paradas del viaje en orden, y la
 * app dice dónde recargar entre viajes (la planta o Actum, la que desvíe menos).
 *
 * Google no publica cuántas paradas acepta un enlace; en la práctica son unas 10, así que un viaje largo se parte en
 * tramos. Sin "origin", Maps parte desde donde está el teléfono. Una parada con su punto exacto va por coordenadas; si
 * no, por la dirección escrita (igual que el botón Navegar de cada parada, D61: la dirección sale de Brunen solo cuando
 * el repartidor toca el botón).
 */

import { ACTUM, PLANTA, distanciaKm, type Deposito, type Punto } from './ruta';

/** Paradas por enlace (destino incluido). */
export const PARADAS_POR_ENLACE = 10;

export interface ParadaNavegable {
  /** Solo el punto exacto; con uno aproximado (centro de la comuna) se usa la dirección escrita. */
  punto: Punto | null;
  direccion: string;
  comuna: string;
}

export const COORDENADAS_DE_DEPOSITO: Readonly<Record<Deposito, Punto>> = { planta: PLANTA, actum: ACTUM };

/** Entre dos viajes, el depósito que agrega menos camino: el último punto del viaje anterior y el primero del siguiente. */
export function depositoQueDesviaMenos(desde: Punto, hasta: Punto): Deposito {
  const rodeo = (d: Punto) => distanciaKm(desde, d) + distanciaKm(d, hasta);
  return rodeo(ACTUM) < rodeo(PLANTA) - 1e-9 ? 'actum' : 'planta';
}

/** 6 decimales son centímetros: más alarga el enlace sin ganar nada (y evita "-33.400999999999996"). */
const coordenadas = (p: Punto): string => `${Number(p.lat.toFixed(6))},${Number(p.lng.toFixed(6))}`;

const lugar = (p: ParadaNavegable): string =>
  p.punto ? coordenadas(p.punto) : `${[p.direccion, p.comuna].filter((t) => t.trim()).join(', ')}, Chile`;

/**
 * Enlaces de Google Maps para recorrer las paradas en orden. `antes` es una parada obligada al principio (el depósito
 * donde recargar). Cada enlace sigue donde terminó el anterior.
 */
export function enlacesDeMaps(paradas: readonly ParadaNavegable[], antes: Punto | null = null, porEnlace: number = PARADAS_POR_ENLACE): string[] {
  const lugares = [...(antes ? [coordenadas(antes)] : []), ...paradas.map(lugar)];
  const enlaces: string[] = [];
  for (let i = 0; i < lugares.length; i += porEnlace) {
    const tramo = lugares.slice(i, i + porEnlace);
    const destino = tramo[tramo.length - 1] as string;
    const intermedios = tramo.slice(0, -1);
    const parametros = new URLSearchParams({ api: '1', destination: destino, travelmode: 'driving' });
    // El tramo siguiente parte donde terminó este: su origen es el último lugar del tramo anterior.
    if (i > 0) parametros.set('origin', lugares[i - 1] as string);
    if (intermedios.length > 0) parametros.set('waypoints', intermedios.join('|'));
    enlaces.push(`https://www.google.com/maps/dir/?${parametros.toString()}`);
  }
  return enlaces;
}
