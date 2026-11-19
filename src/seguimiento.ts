/**
 * Seguimiento del repartidor (fase E, D80), sin otra app: lo que el navegador permite (D79).
 *
 *  - Consentimiento: lo da en su app, una vez, y lo puede retirar. Sin él no se guarda ninguna posición.
 *  - Jornada: "Iniciar ruta" y "Terminar jornada". Solo durante una jornada abierta de hoy, entre las 6:00 y las 22:00,
 *    se aceptan posiciones: nunca fuera del turno.
 *  - Posiciones: las manda el teléfono mientras la app está abierta y a la vista (el navegador no deja medir en segundo
 *    plano). Se borran a los 3 días.
 *  - Hora de llegada por eventos: la última entrega marcada (hora y lugar) o la última posición fresca, más el tiempo de
 *    viaje hasta cada parada que falta, en el orden de la ruta publicada. El tiempo en cada parada se aprende de las
 *    entregas de las últimas dos semanas. Nunca es una promesa: es una ventana ("entre las 12:05 y las 12:25").
 */

import type { BaseDatos } from './almacen';
import { fechaHoraLocal } from './despacho';
import { RepositorioEntregas } from './entregas';
import { RepositorioPuntos, claveDePunto, enLaRegion } from './puntos';
import { armarReparto } from './reparto';
import { RepositorioD1 } from './repositorio';
import { MINUTOS_POR_PARADA, VELOCIDAD_KMH, distanciaKm, puntoDeParada, type Punto } from './ruta';

/** La versión del texto que acepta el repartidor: si el texto cambia, se le vuelve a preguntar. */
export const VERSION_DEL_CONSENTIMIENTO = '2026-11-18';
export const DIAS_DE_HISTORIAL = 3;
export const MAX_POSICIONES_POR_ENVIO = 30;
const FILAS_POR_INSERCION = 15; // 15 filas × 6 valores = 90: D1 admite hasta 100 valores por consulta
const PRECISION_MAXIMA_M = 500;
const HORA_DESDE = 6;
const HORA_HASTA = 22;
/** Una referencia (entrega o posición) más vieja que esto no sirve para estimar la llegada. */
export const REFERENCIA_VIGENTE_S = 90 * 60;
/** Una posición más vieja que esto ya no se muestra como "en vivo". */
export const POSICION_EN_VIVO_S = 15 * 60;
const DIAS_PARA_APRENDER = 14;
const MUESTRAS_MINIMAS = 8;
const PROBABILIDAD_LIMPIEZA = 0.02;

const numero = (v: unknown): number => (typeof v === 'number' ? v : Number(v) || 0);
const numeroONulo = (v: unknown): number | null => (typeof v === 'number' ? v : null);

export interface PosicionRecibida {
  lat: number;
  lng: number;
  /** Margen de error que informó el teléfono, en metros. */
  precision: number;
  /** Cuándo la midió el teléfono (segundos Unix). */
  en: number;
}

export interface Jornada {
  id: number;
  fecha: string;
  iniciadaEn: number;
  terminadaEn: number | null;
}

export interface PosicionDelRepartidor {
  nombre: string;
  lat: number;
  lng: number;
  precisionM: number | null;
  en: number;
  jornadaAbierta: boolean;
}

/** Lee lo que mandó el teléfono. Descarta lo que no sirve sin rechazar el resto (null si no es una lista). */
export function validarPosiciones(crudo: unknown, ahoraSegundos: number): PosicionRecibida[] | null {
  if (!Array.isArray(crudo) || crudo.length > MAX_POSICIONES_POR_ENVIO) return null;
  const validas: PosicionRecibida[] = [];
  for (const p of crudo) {
    if (typeof p !== 'object' || p === null) continue;
    const { lat, lng, precision, en } = p as Record<string, unknown>;
    if (typeof lat !== 'number' || typeof lng !== 'number' || typeof precision !== 'number' || typeof en !== 'number') continue;
    if (!enLaRegion({ lat, lng }) || !Number.isFinite(precision) || precision < 0 || precision > PRECISION_MAXIMA_M) continue;
    // Medidas de hasta 6 horas atrás (se guardaron sin señal) y nunca del futuro (con un minuto de margen por el reloj).
    if (!Number.isInteger(en) || en < ahoraSegundos - 6 * 3600 || en > ahoraSegundos + 60) continue;
    validas.push({ lat: Math.round(lat * 1e6) / 1e6, lng: Math.round(lng * 1e6) / 1e6, precision: Math.round(precision), en });
  }
  return validas;
}

export class RepositorioSeguimiento {
  constructor(
    readonly db: BaseDatos,
    private readonly azar: () => number = Math.random,
  ) {}

  private async filas(sql: string, ...valores: unknown[]): Promise<Array<Record<string, unknown>>> {
    return ((await this.db.prepare(sql).bind(...valores).run()).results ?? []) as Array<Record<string, unknown>>;
  }

  /** true si dio su consentimiento para la versión vigente del texto y no lo retiró. */
  async tieneConsentimiento(usuarioId: number): Promise<boolean> {
    const [fila] = await this.filas('SELECT aceptado_en, version FROM consentimientos_ubicacion WHERE usuario_id = ?1', usuarioId);
    return Boolean(fila && numeroONulo(fila.aceptado_en) !== null && fila.version === VERSION_DEL_CONSENTIMIENTO);
  }

  /** Aceptar o retirar. Al retirar se borran sus posiciones guardadas: no queda nada de su recorrido. */
  async decidir(usuarioId: number, acepta: boolean, ahoraSegundos: number): Promise<void> {
    if (acepta) {
      await this.db
        .prepare(
          `INSERT INTO consentimientos_ubicacion (usuario_id, aceptado_en, retirado_en, version) VALUES (?1, ?2, NULL, ?3)
           ON CONFLICT (usuario_id) DO UPDATE SET aceptado_en = ?2, retirado_en = NULL, version = ?3`,
        )
        .bind(usuarioId, ahoraSegundos, VERSION_DEL_CONSENTIMIENTO)
        .run();
      return;
    }
    await this.db
      .prepare(
        `INSERT INTO consentimientos_ubicacion (usuario_id, aceptado_en, retirado_en, version) VALUES (?1, NULL, ?2, '')
         ON CONFLICT (usuario_id) DO UPDATE SET aceptado_en = NULL, retirado_en = ?2`,
      )
      .bind(usuarioId, ahoraSegundos)
      .run();
    await this.db.prepare('DELETE FROM posiciones WHERE usuario_id = ?1').bind(usuarioId).run();
  }

  /** La última jornada de hoy de ese repartidor (abierta o terminada), o null. */
  async jornadaDeHoy(usuarioId: number, hoy: string): Promise<Jornada | null> {
    const [fila] = await this.filas(
      'SELECT id, fecha, iniciada_en, terminada_en FROM jornadas WHERE usuario_id = ?1 AND fecha = ?2 ORDER BY id DESC LIMIT 1',
      usuarioId,
      hoy,
    );
    return fila ? { id: numero(fila.id), fecha: String(fila.fecha), iniciadaEn: numero(fila.iniciada_en), terminadaEn: numeroONulo(fila.terminada_en) } : null;
  }

  /** "Iniciar ruta": si ya hay una abierta hoy, sigue esa. */
  async iniciar(usuarioId: number, hoy: string, ahoraSegundos: number): Promise<Jornada> {
    const actual = await this.jornadaDeHoy(usuarioId, hoy);
    if (actual && actual.terminadaEn === null) return actual;
    await this.db.prepare('INSERT INTO jornadas (usuario_id, fecha, iniciada_en) VALUES (?1, ?2, ?3)').bind(usuarioId, hoy, ahoraSegundos).run();
    return (await this.jornadaDeHoy(usuarioId, hoy)) as Jornada;
  }

  /** "Terminar jornada": desde ahí no se aceptan posiciones hasta que inicie otra. */
  async terminar(usuarioId: number, hoy: string, ahoraSegundos: number): Promise<void> {
    await this.db.prepare('UPDATE jornadas SET terminada_en = ?3 WHERE usuario_id = ?1 AND fecha = ?2 AND terminada_en IS NULL').bind(usuarioId, hoy, ahoraSegundos).run();
  }

  /**
   * Guarda las posiciones válidas si hay consentimiento, una jornada abierta de hoy y es horario de turno. Devuelve
   * cuántas guardó; 'sin_consentimiento' o 'sin_jornada' si no corresponde guardar ninguna.
   */
  async guardarPosiciones(
    usuarioId: number,
    posiciones: readonly PosicionRecibida[],
    ahoraSegundos: number,
  ): Promise<number | 'sin_consentimiento' | 'sin_jornada'> {
    if (!(await this.tieneConsentimiento(usuarioId))) return 'sin_consentimiento';
    const local = fechaHoraLocal(new Date(ahoraSegundos * 1000));
    const jornada = await this.jornadaDeHoy(usuarioId, local.fecha);
    if (!jornada || jornada.terminadaEn !== null || local.hora < HORA_DESDE || local.hora >= HORA_HASTA) return 'sin_jornada';
    // Solo lo medido durante esta jornada (lo de antes de "Iniciar ruta" no se guarda).
    const deLaJornada = posiciones.filter((p) => p.en >= jornada.iniciadaEn - 60);
    for (let i = 0; i < deLaJornada.length; i += FILAS_POR_INSERCION) {
      const grupo = deLaJornada.slice(i, i + FILAS_POR_INSERCION);
      const valores = grupo.map((_, n) => `(?${n * 6 + 1}, ?${n * 6 + 2}, ?${n * 6 + 3}, ?${n * 6 + 4}, ?${n * 6 + 5}, ?${n * 6 + 6})`).join(', ');
      await this.db
        .prepare(`INSERT INTO posiciones (usuario_id, jornada_id, en, lat, lng, precision_m) VALUES ${valores}`)
        .bind(...grupo.flatMap((p) => [usuarioId, jornada.id, p.en, p.lat, p.lng, p.precision]))
        .run();
    }
    if (this.azar() < PROBABILIDAD_LIMPIEZA) await this.limpiar(ahoraSegundos);
    return deLaJornada.length;
  }

  /** La posición más reciente de hoy de cualquier repartidor (hoy hay uno solo), con su nombre. */
  async ultimaDeHoy(hoy: string): Promise<PosicionDelRepartidor | null> {
    const [fila] = await this.filas(
      `SELECT p.lat, p.lng, p.precision_m, p.en, u.nombre, j.terminada_en
       FROM posiciones p JOIN jornadas j ON j.id = p.jornada_id JOIN usuarios u ON u.id = p.usuario_id
       WHERE j.fecha = ?1 ORDER BY p.en DESC LIMIT 1`,
      hoy,
    );
    if (!fila) return null;
    return {
      nombre: String(fila.nombre ?? ''),
      lat: numero(fila.lat),
      lng: numero(fila.lng),
      precisionM: numeroONulo(fila.precision_m),
      en: numero(fila.en),
      jornadaAbierta: numeroONulo(fila.terminada_en) === null,
    };
  }

  /** Borra las posiciones de más de 3 días. */
  async limpiar(ahoraSegundos: number): Promise<void> {
    await this.db.prepare('DELETE FROM posiciones WHERE en < ?1').bind(ahoraSegundos - DIAS_DE_HISTORIAL * 86400).run();
  }
}

// ---- Hora de llegada por eventos ----

export interface ParadaParaEstimar {
  id: string;
  punto: Punto | null;
}

export interface Referencia {
  /** Segundos Unix. */
  en: number;
  punto: Punto;
}

/**
 * A qué hora llegaría a cada parada que falta, en orden, desde la referencia (última entrega o posición). Si una parada
 * no tiene punto, desde ahí no se sabe: se corta. Ninguna llegada queda antes de "ahora".
 */
export function calcularLlegadas(
  paradas: readonly ParadaParaEstimar[],
  referencia: Referencia,
  ahoraSegundos: number,
  minutosPorParada: number,
  velocidadKmh: number = VELOCIDAD_KMH,
): Map<string, number> {
  const llegadas = new Map<string, number>();
  let t = referencia.en;
  let desde = referencia.punto;
  for (const parada of paradas) {
    if (!parada.punto) break;
    t += (distanciaKm(desde, parada.punto) / velocidadKmh) * 3600;
    t = Math.max(t, ahoraSegundos + 60); // si ya se pasó la hora calculada, todavía no llega: como pronto, en un minuto
    llegadas.set(parada.id, Math.round(t));
    t += minutosPorParada * 60;
    desde = parada.punto;
  }
  return llegadas;
}

/** "Entre las 12:05 y las 12:25": un margen de al menos 10 minutos, o un cuarto de lo que falta, en tramos de 5 minutos. */
export function ventanaDeLlegada(llegaEn: number, ahoraSegundos: number): { desde: number; hasta: number } {
  const minutos = Math.max(0, (llegaEn - ahoraSegundos) / 60);
  const margen = Math.max(10, Math.round(minutos / 4)) * 60;
  const cinco = 5 * 60;
  const desde = Math.max(Math.ceil((ahoraSegundos + 60) / cinco) * cinco, Math.floor((llegaEn - margen) / cinco) * cinco);
  const hasta = Math.max(desde + 2 * cinco, Math.ceil((llegaEn + margen) / cinco) * cinco);
  return { desde, hasta };
}

/**
 * Minutos que se va en cada parada, aprendidos de pares de entregas seguidas: lo que pasó entre una y otra, menos lo
 * que se tarda en llegar. La mediana, para que un almuerzo o una recarga no la distorsionen. Con pocas muestras, el valor
 * por defecto.
 */
export function aprenderMinutosPorParada(muestras: ReadonlyArray<{ segundos: number; km: number }>, velocidadKmh: number = VELOCIDAD_KMH): number {
  const valores = muestras
    .map((m) => m.segundos / 60 - (m.km / velocidadKmh) * 60)
    .filter((v) => v >= 0 && v <= 60)
    .sort((a, b) => a - b);
  if (valores.length < MUESTRAS_MINIMAS) return MINUTOS_POR_PARADA;
  const medio = Math.floor(valores.length / 2);
  const mediana = valores.length % 2 === 1 ? (valores[medio] as number) : ((valores[medio - 1] as number) + (valores[medio] as number)) / 2;
  return Math.min(25, Math.max(2, Math.round(mediana)));
}

/** Pares de entregas seguidas de las últimas dos semanas, con su distancia (solo direcciones con punto conocido). */
async function muestrasDeEntregas(db: BaseDatos, ahoraSegundos: number): Promise<Array<{ segundos: number; km: number }>> {
  const filas = ((
    await db
      .prepare(
        `SELECT direccion, comuna, entregado_en FROM pedidos WHERE entregado_en >= ?1 AND estado = 'Entregado' AND direccion != ''
         ORDER BY entregado_en LIMIT 800`,
      )
      .bind(ahoraSegundos - DIAS_PARA_APRENDER * 86400)
      .run()
  ).results ?? []) as Array<{ direccion: string; comuna: string; entregado_en: number }>;
  if (filas.length < 2) return [];
  const puntos = await new RepositorioPuntos(db).deDirecciones(filas);
  const muestras: Array<{ segundos: number; km: number }> = [];
  for (let i = 1; i < filas.length; i++) {
    const antes = filas[i - 1] as (typeof filas)[number];
    const ahora = filas[i] as (typeof filas)[number];
    const segundos = ahora.entregado_en - antes.entregado_en;
    if (segundos <= 0 || segundos > 2 * 3600) continue; // de otro día, o con una pausa larga entre medio
    const a = puntos.get(claveDePunto(antes.direccion, antes.comuna));
    const b = puntos.get(claveDePunto(ahora.direccion, ahora.comuna));
    if (a && b) muestras.push({ segundos, km: distanciaKm(a, b) });
  }
  return muestras;
}

export interface EstimacionDelDia {
  /** Por pedido que falta: cuándo llegaría y la ventana que se puede decir. */
  llegadas: Map<string, { llegaEn: number; desde: number; hasta: number }>;
  /** El pedido que sigue (al que va en camino), si se sabe. */
  siguiente: string | null;
  repartidor: PosicionDelRepartidor | null;
  minutosPorParada: number;
}

/**
 * Las horas de llegada de hoy. Solo con la ruta publicada (sin ella no se sabe el orden) y con una referencia reciente
 * (una entrega o una posición de los últimos 90 minutos). Si algo falta, `llegadas` va vacío.
 */
export async function estimarElDia(db: BaseDatos, hoy: string, ahoraSegundos: number): Promise<EstimacionDelDia> {
  const seguimiento = new RepositorioSeguimiento(db);
  const repartidor = await seguimiento.ultimaDeHoy(hoy);
  const vacia: EstimacionDelDia = { llegadas: new Map(), siguiente: null, repartidor, minutosPorParada: MINUTOS_POR_PARADA };

  const pedidos = await new RepositorioD1(db).pedidosDelDia(hoy);
  const reparto = armarReparto(pedidos, hoy);
  if (!reparto.publicada) return vacia;
  const entregas = await new RepositorioEntregas(db).deDia(hoy);
  const puntos = await new RepositorioPuntos(db).deDirecciones(reparto.paradas);
  const puntoDe = (p: { direccion: string; comuna: string }): Punto | null =>
    puntoDeParada(p.direccion.trim() ? (puntos.get(claveDePunto(p.direccion, p.comuna)) ?? null) : null, p.comuna)?.punto ?? null;

  // La última entrega marcada hoy (su hora y su lugar) y la última posición: manda la más reciente.
  let referencia: Referencia | null = null;
  for (const parada of reparto.paradas) {
    const en = entregas.get(parada.idPedido)?.entregadoEn ?? null;
    const punto = puntoDe(parada);
    if (parada.estado === 'Entregado' && en !== null && punto && (!referencia || en > referencia.en)) referencia = { en, punto };
  }
  if (repartidor && repartidor.jornadaAbierta && (!referencia || repartidor.en > referencia.en)) {
    referencia = { en: repartidor.en, punto: { lat: repartidor.lat, lng: repartidor.lng } };
  }
  if (!referencia || ahoraSegundos - referencia.en > REFERENCIA_VIGENTE_S) return vacia;

  const pendientes = reparto.paradas.filter((p) => p.estado !== 'Entregado' && !entregas.get(p.idPedido)?.noEntregado);
  const minutosPorParada = aprenderMinutosPorParada(await muestrasDeEntregas(db, ahoraSegundos));
  const horas = calcularLlegadas(
    pendientes.map((p) => ({ id: p.idPedido, punto: puntoDe(p) })),
    referencia,
    ahoraSegundos,
    minutosPorParada,
  );
  const llegadas = new Map([...horas].map(([id, llegaEn]) => [id, { llegaEn, ...ventanaDeLlegada(llegaEn, ahoraSegundos) }]));
  return { llegadas, siguiente: pendientes[0]?.idPedido ?? null, repartidor, minutosPorParada };
}
