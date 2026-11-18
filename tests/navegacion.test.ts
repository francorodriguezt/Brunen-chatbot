import { describe, expect, it } from 'vitest';
import { COORDENADAS_DE_DEPOSITO, depositoQueDesviaMenos, enlacesDeMaps, type ParadaNavegable } from '../src/navegacion';

// Puntos ficticios en Santiago.
const parada = (i: number, exacta = true): ParadaNavegable => ({
  punto: exacta ? { lat: -33.4 - i / 1000, lng: -70.6 - i / 1000 } : null,
  direccion: `Calle Ficticia ${i}`,
  comuna: 'Ñuñoa',
});
const leer = (enlace: string) => new URL(enlace).searchParams;

describe('navegación por viaje (D67)', () => {
  it('un viaje corto abre Maps desde donde está el teléfono, con las paradas en orden', () => {
    const [enlace, ...resto] = enlacesDeMaps([parada(1), parada(2), parada(3)]);
    expect(resto).toEqual([]);
    const p = leer(enlace as string);
    expect(p.get('origin')).toBeNull();
    expect(p.get('waypoints')).toBe('-33.401,-70.601|-33.402,-70.602');
    expect(p.get('destination')).toBe('-33.403,-70.603');
    expect(p.get('travelmode')).toBe('driving');
  });

  it('sin punto exacto usa la dirección escrita, y la recarga va primero', () => {
    const [enlace] = enlacesDeMaps([parada(1, false)], COORDENADAS_DE_DEPOSITO.actum);
    const p = leer(enlace as string);
    expect(p.get('waypoints')).toBe(`${COORDENADAS_DE_DEPOSITO.actum.lat},${COORDENADAS_DE_DEPOSITO.actum.lng}`);
    expect(p.get('destination')).toBe('Calle Ficticia 1, Ñuñoa, Chile');
  });

  it('un viaje largo se parte en tramos de 10 lugares y cada tramo sigue donde terminó el anterior', () => {
    const enlaces = enlacesDeMaps(Array.from({ length: 23 }, (_, i) => parada(i + 1)));
    expect(enlaces).toHaveLength(3);
    expect(leer(enlaces[0] as string).get('waypoints')?.split('|')).toHaveLength(9);
    expect(leer(enlaces[1] as string).get('origin')).toBe(leer(enlaces[0] as string).get('destination'));
    expect(leer(enlaces[2] as string).get('destination')).toBe('-33.423,-70.623');
    expect(enlacesDeMaps([])).toEqual([]);
  });

  it('recarga donde desvía menos: cerca de Las Condes, Actum; cerca del centro, la planta', () => {
    expect(depositoQueDesviaMenos({ lat: -33.41, lng: -70.57 }, { lat: -33.4, lng: -70.55 })).toBe('actum');
    expect(depositoQueDesviaMenos({ lat: -33.47, lng: -70.63 }, { lat: -33.48, lng: -70.64 })).toBe('planta');
  });
});
