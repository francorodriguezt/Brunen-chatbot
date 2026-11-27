/**
 * Alertas del reparto (D98): dos avisos en el panel para enterarse a tiempo de que algo pasa en la calle.
 *
 *  - "Sin señal": la jornada del repartidor está abierta y su teléfono no manda la ubicación hace más de N minutos
 *    (20 por defecto). Puede estar sin señal, con la app cerrada o con el teléfono apagado: la oficina lo llama.
 *  - "Ruta no iniciada": a cierta hora (10:30 por defecto) hay entregas para hoy y nadie tocó "Iniciar ruta".
 *
 * Los umbrales se cambian en la hoja CONFIGURACION (`ALERTA_SIN_SENAL_MINUTOS`, `ALERTA_RUTA_NO_INICIADA`), y con
 * "NO" se apaga cada una. Van solo al panel, no por Telegram: no son reclamos ni fallas del sistema (D32).
 *
 * Las decisiones están en funciones puras (`revisarSinSenal`, `revisarRutaNoIniciada`) para probarlas sin base. El
 * vigía (cada 5 minutos) junta los datos y guarda los avisos con un origen que no se repite.
 */

import type { Alerta } from './alertas';
import type { BaseDatos } from './almacen';
import { fechaHoraLocal } from './despacho';
import { armarReparto } from './reparto';
import { RepositorioD1 } from './repositorio';
import { VERSION_DEL_CONSENTIMIENTO } from './seguimiento';

export interface UmbralesReparto {
  /** Minutos sin ubicación con la jornada abierta; null = apagada. */
  sinSenalMinutos: number | null;
  /** Hora local desde la que se avisa si nadie inició la ruta; null = apagada. */
  rutaNoIniciada: { hora: number; minuto: number } | null;
}

export const UMBRALES_POR_DEFECTO: UmbralesReparto = { sinSenalMinutos: 20, rutaNoIniciada: { hora: 10, minuto: 30 } };

/** Menos que esto daría avisos por un túnel o un ascensor; más de 4 horas ya no sirve como alerta. */
const MINIMO_SIN_SENAL = 5;
const MAXIMO_SIN_SENAL = 240;
/** El seguimiento solo corre de 6:00 a 22:00 (D80): fuera de ese horario no llegan posiciones y no es raro. */
const SEGUIMIENTO_DESDE = 6;
const SEGUIMIENTO_HASTA = 22;
/** Pasada esta hora ya terminó el horario de despacho (lunes a viernes hasta las 18:00): avisar no sirve. */
const RUTA_NO_INICIADA_HASTA = 18;
/** La app "está en uso" si alguien inició una jornada en los últimos 14 días: sin eso, el reparto va por Optiroute (D49). */
const DIAS_EN_USO = 14;

const esApagado = (valor: string): boolean => /^(no|apagad[ao]|off|0)$/i.test(valor.trim());

/** "20", "20 min" o "NO". Lo que no se entiende deja el valor por defecto. */
export function parsearSinSenal(valor: string | undefined): number | null {
  if (valor === undefined || valor.trim() === '') return UMBRALES_POR_DEFECTO.sinSenalMinutos;
  if (esApagado(valor)) return null;
  const numero = /^\s*(\d{1,3})\s*(min|minutos)?\s*$/i.exec(valor);
  const minutos = numero ? Number(numero[1]) : NaN;
  return minutos >= MINIMO_SIN_SENAL && minutos <= MAXIMO_SIN_SENAL ? minutos : UMBRALES_POR_DEFECTO.sinSenalMinutos;
}

/** "10:30", "10.30", "10" o "NO". Lo que no se entiende deja el valor por defecto. */
export function parsearRutaNoIniciada(valor: string | undefined): { hora: number; minuto: number } | null {
  if (valor === undefined || valor.trim() === '') return UMBRALES_POR_DEFECTO.rutaNoIniciada;
  if (esApagado(valor)) return null;
  const partes = /^\s*(\d{1,2})(?:[:.h](\d{2}))?\s*(hrs?|horas)?\s*$/i.exec(valor);
  if (!partes) return UMBRALES_POR_DEFECTO.rutaNoIniciada;
  const hora = Number(partes[1]);
  const minuto = Number(partes[2] ?? 0);
  if (hora < SEGUIMIENTO_DESDE || hora >= RUTA_NO_INICIADA_HASTA || minuto > 59) return UMBRALES_POR_DEFECTO.rutaNoIniciada;
  return { hora, minuto };
}

const dos = (n: number): string => String(n).padStart(2, '0');

export interface JornadaAbierta {
  id: number;
  nombre: string;
  iniciadaEn: number;
  /** Segundos Unix de la última posición de esta jornada; null si todavía no llega ninguna. */
  ultimaPosicion: number | null;
  /** Si aceptó compartir su ubicación: sin consentimiento nunca llegan posiciones y no se avisa. */
  consentimiento: boolean;
}

export interface AvisoDeReparto {
  alerta: Alerta;
  /** Clave para no repetir el aviso: el mismo corte de señal o el mismo día dan un solo aviso. */
  origen: string;
}

/** Un aviso por jornada abierta cuyo teléfono lleva más de N minutos callado. */
export function revisarSinSenal(
  jornadas: readonly JornadaAbierta[],
  umbrales: UmbralesReparto,
  local: { hora: number },
  ahoraSegundos: number,
): AvisoDeReparto[] {
  const minutos = umbrales.sinSenalMinutos;
  if (minutos === null || local.hora < SEGUIMIENTO_DESDE || local.hora >= SEGUIMIENTO_HASTA) return [];
  const avisos: AvisoDeReparto[] = [];
  for (const jornada of jornadas) {
    if (!jornada.consentimiento) continue;
    const desde = jornada.ultimaPosicion ?? jornada.iniciadaEn;
    const callado = Math.floor((ahoraSegundos - desde) / 60);
    if (callado < minutos) continue;
    const quien = jornada.nombre.trim() || 'el repartidor';
    const resumen =
      jornada.ultimaPosicion === null
        ? `Inició la ruta hace ${callado} minutos y todavía no llega la ubicación de ${quien}. Puede tener la app cerrada o el permiso de ubicación apagado: llámalo.`
        : `No llega la ubicación de ${quien} hace ${callado} minutos, con la jornada abierta. Puede estar sin señal, con la app cerrada o con el teléfono apagado: llámalo.`;
    // Un aviso por cada corte: si vuelve la señal y se corta de nuevo, es otro aviso.
    avisos.push({ alerta: { tipo: 'escalamiento', telefono: '', nombre: jornada.nombre, resumen, motivos: [] }, origen: `sin-senal:${jornada.id}:${desde}` });
  }
  return avisos;
}

export interface EstadoDelDia {
  fecha: string;
  /** Entregas confirmadas de hoy que faltan (sin contar las ya entregadas). */
  entregasPendientes: number;
  /** Si alguien inició una jornada hoy (abierta o ya terminada). */
  jornadaIniciada: boolean;
  /** Si la app del repartidor se usó en los últimos días. */
  appEnUso: boolean;
}

/** Un aviso al día si a la hora indicada hay entregas y nadie inició la ruta. */
export function revisarRutaNoIniciada(dia: EstadoDelDia, umbrales: UmbralesReparto, local: { hora: number; minuto: number }): AvisoDeReparto | null {
  const desde = umbrales.rutaNoIniciada;
  if (desde === null || !dia.appEnUso || dia.jornadaIniciada || dia.entregasPendientes === 0) return null;
  const minutosAhora = local.hora * 60 + local.minuto;
  if (minutosAhora < desde.hora * 60 + desde.minuto || local.hora >= RUTA_NO_INICIADA_HASTA) return null;
  const entregas = dia.entregasPendientes === 1 ? 'una entrega' : `${dia.entregasPendientes} entregas`;
  return {
    alerta: {
      tipo: 'escalamiento',
      telefono: '',
      resumen: `Son las ${dos(local.hora)}:${dos(local.minuto)}, hay ${entregas} para hoy y nadie tocó "Iniciar ruta" en la app del repartidor. Confírmale la ruta o pregúntale si ya salió.`,
      motivos: [],
    },
    origen: `ruta-no-iniciada:${dia.fecha}`,
  };
}

type Fila = Record<string, unknown>;

async function filas(db: BaseDatos, sql: string, ...valores: unknown[]): Promise<Fila[]> {
  return ((await db.prepare(sql).bind(...valores).run()).results ?? []) as Fila[];
}

/** Las jornadas abiertas de hoy, con su última posición y si el repartidor dio su consentimiento vigente. */
export async function jornadasAbiertas(db: BaseDatos, hoy: string): Promise<JornadaAbierta[]> {
  const resultado = await filas(
    db,
    `SELECT j.id, j.iniciada_en, u.nombre,
            (SELECT MAX(p.en) FROM posiciones p WHERE p.jornada_id = j.id) AS ultima,
            (SELECT c.aceptado_en FROM consentimientos_ubicacion c WHERE c.usuario_id = j.usuario_id AND c.version = ?2) AS aceptado
     FROM jornadas j JOIN usuarios u ON u.id = j.usuario_id
     WHERE j.fecha = ?1 AND j.terminada_en IS NULL AND u.activo = 1`,
    hoy,
    VERSION_DEL_CONSENTIMIENTO,
  );
  return resultado.map((fila) => ({
    id: Number(fila.id),
    nombre: String(fila.nombre ?? ''),
    iniciadaEn: Number(fila.iniciada_en),
    ultimaPosicion: fila.ultima === null || fila.ultima === undefined ? null : Number(fila.ultima),
    consentimiento: fila.aceptado !== null && fila.aceptado !== undefined,
  }));
}

/** Lo que hace falta saber de hoy para "ruta no iniciada". */
export async function estadoDelDia(db: BaseDatos, hoy: string, ahoraSegundos: number): Promise<EstadoDelDia> {
  const [hoyJornada] = await filas(db, 'SELECT COUNT(*) AS n FROM jornadas WHERE fecha = ?1', hoy);
  const [recientes] = await filas(db, 'SELECT COUNT(*) AS n FROM jornadas WHERE iniciada_en >= ?1', ahoraSegundos - DIAS_EN_USO * 86400);
  const reparto = armarReparto(await new RepositorioD1(db).pedidosDelDia(hoy), hoy);
  return {
    fecha: hoy,
    entregasPendientes: reparto.paradas.filter((parada) => parada.estado !== 'Entregado').length,
    jornadaIniciada: Number(hoyJornada?.n ?? 0) > 0,
    appEnUso: Number(recientes?.n ?? 0) > 0,
  };
}

/**
 * Cierra el aviso "sin señal" cuando la ubicación volvió a llegar (D105): no se acumulan avisos viejos en el panel y
 * queda dicho a qué hora volvió.
 */
async function cerrarSiVolvio(db: BaseDatos, jornadas: readonly JornadaAbierta[], umbrales: UmbralesReparto, ahoraSegundos: number): Promise<void> {
  const minutos = umbrales.sinSenalMinutos;
  if (minutos === null) return;
  for (const jornada of jornadas) {
    const ultima = jornada.ultimaPosicion;
    if (ultima === null || ahoraSegundos - ultima >= minutos * 60) continue;
    const { hora, minuto } = fechaHoraLocal(new Date(ultima * 1000));
    await db
      .prepare("UPDATE avisos SET estado = 'resuelto', resuelto_por = 'Sistema', resuelto_en = ?1, resumen = resumen || ?2 WHERE origen LIKE ?3 AND estado = 'abierto'")
      .bind(ahoraSegundos, ` Volvió la señal a las ${dos(hora)}:${dos(minuto)}.`, `sin-senal:${jornada.id}:%`)
      .run();
  }
}

/**
 * Revisa las dos alertas y guarda las nuevas en el panel. Devuelve cuántos avisos nuevos quedaron. Nunca lanza
 * errores: sin las tablas de seguimiento (antes de la migración 0015) simplemente no avisa.
 */
export async function vigilarReparto(
  db: BaseDatos,
  umbrales: UmbralesReparto,
  local: { fecha: string; hora: number; minuto: number },
  ahoraSegundos: number,
): Promise<number> {
  try {
    const jornadas = await jornadasAbiertas(db, local.fecha);
    await cerrarSiVolvio(db, jornadas, umbrales, ahoraSegundos);
    const avisos = revisarSinSenal(jornadas, umbrales, local, ahoraSegundos);
    if (umbrales.rutaNoIniciada !== null && local.hora * 60 + local.minuto >= umbrales.rutaNoIniciada.hora * 60 + umbrales.rutaNoIniciada.minuto) {
      const aviso = revisarRutaNoIniciada(await estadoDelDia(db, local.fecha, ahoraSegundos), umbrales, local);
      if (aviso) avisos.push(aviso);
    }
    const repositorio = new RepositorioD1(db);
    let nuevos = 0;
    for (const { alerta, origen } of avisos) if (await repositorio.guardarAviso(alerta, origen, ahoraSegundos)) nuevos += 1;
    return nuevos;
  } catch (falla) {
    console.error('El vigía no pudo revisar el reparto:', falla instanceof Error ? falla.message : falla);
    return 0;
  }
}
