/**
 * Puntos del mapa (fase C, D63): una coordenada por dirección. No vienen de ningún servicio externo (D32, D62):
 *  - `manual`: una persona puso el pin en el mapa del panel. Es la verdad: el teléfono nunca la pisa.
 *  - `repartidor`: el teléfono la aprende al tocar "Entregado", si el GPS es preciso (75 m o menos). Una lectura nueva
 *    reemplaza a la anterior solo si es igual o más precisa.
 * Esquema: migrations/0012_puntos_y_orden_de_ruta.sql.
 */

import type { BaseDatos } from './almacen';
import { claveDeDireccion } from './identidad';
import type { Punto } from './ruta';

/** Con más margen de error que esto el GPS no sirve para ubicar una puerta. */
export const PRECISION_MAXIMA_M = 75;
/** Con un punto del teléfono menos preciso que esto, el repartidor puede volver a ubicar la dirección al entregar. */
export const PRECISION_BUENA_M = 25;
const POR_CONSULTA = 90; // D1 admite hasta 100 valores por consulta

/** Región Metropolitana, con margen: lo que cae fuera es un error de tipeo o un GPS roto. */
const LAT_MIN = -34.4;
const LAT_MAX = -32.8;
const LNG_MIN = -71.8;
const LNG_MAX = -69.7;

export type OrigenDePunto = 'manual' | 'repartidor';

export interface PuntoGuardado extends Punto {
  origen: OrigenDePunto;
  precisionM: number | null;
}

export type ResultadoDeGuardar = 'guardado' | 'ignorado' | 'invalido';

/** La dirección y la comuna escritas de cualquier forma dan la misma clave. */
export const claveDePunto = claveDeDireccion;

const enLaRegion = ({ lat, lng }: Punto): boolean =>
  Number.isFinite(lat) && Number.isFinite(lng) && lat >= LAT_MIN && lat <= LAT_MAX && lng >= LNG_MIN && lng <= LNG_MAX;

export class RepositorioPuntos {
  constructor(private readonly db: BaseDatos) {}

  async guardar(
    direccion: string,
    comuna: string,
    dato: Punto & { origen: OrigenDePunto; precisionM?: number },
    ahoraSegundos: number,
  ): Promise<ResultadoDeGuardar> {
    if (!direccion.trim() || !enLaRegion(dato)) return 'invalido';
    const clave = claveDePunto(direccion, comuna);
    const lat = Math.round(dato.lat * 1e6) / 1e6;
    const lng = Math.round(dato.lng * 1e6) / 1e6;
    if (dato.origen === 'manual') {
      await this.db
        .prepare(
          `INSERT INTO puntos (clave, lat, lng, origen, precision_m, actualizado_en) VALUES (?1, ?2, ?3, 'manual', NULL, ?4)
           ON CONFLICT (clave) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, origen = 'manual', precision_m = NULL, actualizado_en = excluded.actualizado_en`,
        )
        .bind(clave, lat, lng, ahoraSegundos)
        .run();
      return 'guardado';
    }
    const precision = dato.precisionM;
    if (typeof precision !== 'number' || !Number.isFinite(precision) || precision < 0 || precision > PRECISION_MAXIMA_M) return 'ignorado';
    const cambios =
      (
        await this.db
          .prepare(
            `INSERT INTO puntos (clave, lat, lng, origen, precision_m, actualizado_en) VALUES (?1, ?2, ?3, 'repartidor', ?4, ?5)
             ON CONFLICT (clave) DO UPDATE SET lat = excluded.lat, lng = excluded.lng, precision_m = excluded.precision_m, actualizado_en = excluded.actualizado_en
             WHERE puntos.origen = 'repartidor' AND excluded.precision_m <= COALESCE(puntos.precision_m, 1000000)`,
          )
          .bind(clave, lat, lng, Math.round(precision), ahoraSegundos)
          .run()
      ).meta?.changes ?? 0;
    return cambios > 0 ? 'guardado' : 'ignorado';
  }

  /** Los puntos conocidos de esas direcciones, por su clave. Las que no tienen punto no aparecen. */
  async deDirecciones(direcciones: ReadonlyArray<{ direccion: string; comuna: string }>): Promise<Map<string, PuntoGuardado>> {
    const claves = [...new Set(direcciones.filter((d) => d.direccion.trim()).map((d) => claveDePunto(d.direccion, d.comuna)))];
    const encontrados = new Map<string, PuntoGuardado>();
    for (let i = 0; i < claves.length; i += POR_CONSULTA) {
      const grupo = claves.slice(i, i + POR_CONSULTA);
      const filas = ((
        await this.db
          .prepare(`SELECT clave, lat, lng, origen, precision_m FROM puntos WHERE clave IN (${grupo.map((_, n) => `?${n + 1}`).join(', ')})`)
          .bind(...grupo)
          .run()
      ).results ?? []) as Array<Record<string, unknown>>;
      for (const f of filas) {
        encontrados.set(String(f.clave), {
          lat: Number(f.lat),
          lng: Number(f.lng),
          origen: f.origen === 'manual' ? 'manual' : 'repartidor',
          precisionM: typeof f.precision_m === 'number' ? f.precision_m : null,
        });
      }
    }
    return encontrados;
  }
}
