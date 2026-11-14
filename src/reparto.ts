/**
 * Reparto del día (fase P2 del panel). Responde a las dos primeras prioridades del dueño: dejar de armar a mano la
 * base del día siguiente y tener la lista del repartidor lista para copiar a la app de rutas.
 *
 * Parte de los pedidos guardados en D1 (los que ve el panel) y solo arma datos: no lee ni escribe nada. Las paradas
 * salen ordenadas por comuna y dirección, para que los vecinos queden juntos; la app de rutas hace el orden final.
 *
 * Tres salidas con los mismos datos: el texto para mandarle al repartidor por WhatsApp, las filas para pegar en Excel
 * (separadas por tabuladores) y el archivo CSV para descargar. Las columnas son provisionales: se ajustan cuando se
 * conozca el archivo de importación de la app de rutas (ver `docs/PENDIENTES.md`).
 */

import { fechaEnPalabras } from './fechas';
import { formatearCLP, type TipoBidon } from './precios';
import type { EstadoDePedido, PedidoGuardado } from './repositorio';

/** De mayor a menor: así se cargan y así los nombra el negocio. */
const TAMANOS: readonly TipoBidon[] = ['20L', '12L', '10L'];
const litros = (tipo: TipoBidon): string => tipo.replace('L', ' L');

const SALEN_A_REPARTO: ReadonlySet<EstadoDePedido> = new Set<EstadoDePedido>(['Confirmado', 'En_Ruta', 'Entregado']);
const POR_CONFIRMAR: ReadonlySet<EstadoDePedido> = new Set<EstadoDePedido>(['Pendiente_Confirmacion', 'Fuera_de_zona']);
const ESTADO_EN_PALABRAS: Readonly<Partial<Record<EstadoDePedido, string>>> = { Confirmado: 'Confirmado', En_Ruta: 'En ruta', Entregado: 'Entregado' };

export interface ParadaDeReparto {
  orden: number;
  idPedido: string;
  estado: EstadoDePedido;
  telefono: string;
  nombre: string;
  direccion: string;
  comuna: string;
  /** Cuántos bidones de cada tamaño se dejan en esta parada. */
  bidones: Record<TipoBidon, number>;
  totalBidones: number;
  envasesARetirar: number;
  notas: string;
  /** Lo que se cobra; null si al pedido le falta algún precio. */
  total: number | null;
  /** Lo que el repartidor cobra en la puerta: pedidos en efectivo todavía sin pagar. null si no cobra nada ahí. */
  cobrarEnEfectivo: number | null;
  /** Versión del pedido: la pantalla la devuelve al marcarlo en ruta o entregado, para no pisar un cambio ajeno. */
  actualizadoEn: number;
  /** En qué viaje del furgón va (1, 2...): el furgón lleva como máximo `CAPACIDAD_FURGON` bidones (fase C, D60). */
  carga: number;
}

/** Un viaje del furgón: las paradas `desde`..`hasta` (por su número de orden). */
export interface CargaDelFurgon {
  numero: number;
  desde: number;
  hasta: number;
  totalBidones: number;
  /** Un solo pedido con más bidones de los que caben: hay que repartirlo en dos viajes a mano. */
  excedeFurgon: boolean;
}

/**
 * Bidones que caben en el furgón (el dueño y Constanza, 2026-11-10). Cuenta igual un bidón de 20, 12 o 10 L mientras no se
 * sepa cuántos de cada tamaño caben (pregunta pendiente). En 267 de 504 días del Excel se pasó de 65: lo normal es
 * hacer más de un viaje en el día.
 */
export const CAPACIDAD_FURGON = 65;

export interface RepartoDelDia {
  fecha: string;
  paradas: ParadaDeReparto[];
  /** Lo que hay que subir al furgón: los bidones de todas las paradas, por tamaño. */
  carga: Record<TipoBidon, number>;
  totalBidones: number;
  envasesARetirar: number;
  /** Paradas que ya se entregaron. */
  entregadas: number;
  /** Pedidos de ese día que nadie ha confirmado todavía: no están en la lista. */
  sinConfirmar: number;
  /** Los viajes del furgón, en el orden de las paradas. */
  cargas: CargaDelFurgon[];
  /** true si alguien publicó el orden de la ruta de este día; si no, las paradas van por comuna y dirección. */
  publicada: boolean;
}

/**
 * Parte las paradas en viajes de hasta `capacidad` bidones, sin cambiar su orden: cuando la siguiente parada no cabe,
 * empieza otro viaje. Un pedido más grande que el furgón va solo en su viaje y queda marcado.
 */
export function armarCargas(paradas: ParadaDeReparto[], capacidad: number = CAPACIDAD_FURGON): CargaDelFurgon[] {
  const cargas: CargaDelFurgon[] = [];
  let actual: CargaDelFurgon | null = null;
  for (const parada of paradas) {
    if (!actual || (actual.totalBidones > 0 && actual.totalBidones + parada.totalBidones > capacidad)) {
      actual = { numero: cargas.length + 1, desde: parada.orden, hasta: parada.orden, totalBidones: 0, excedeFurgon: false };
      cargas.push(actual);
    }
    actual.hasta = parada.orden;
    actual.totalBidones += parada.totalBidones;
    actual.excedeFurgon = actual.totalBidones > capacidad;
    parada.carga = actual.numero;
  }
  return cargas;
}

let comparador: Intl.Collator | undefined;
/** Orden de diccionario en español (la Ñ después de la N), sin distinguir mayúsculas y con "Calle 9" antes que "Calle 10". */
const comparar = (a: string, b: string): number => (comparador ??= new Intl.Collator('es', { numeric: true, sensitivity: 'base' })).compare(a, b);

const sinBidones = (): Record<TipoBidon, number> => ({ '20L': 0, '12L': 0, '10L': 0 });

/** Los pedidos de un día (YYYY-MM-DD) que salen a reparto. La fecha que cuenta es la confirmada; si no hay, la que propuso el bot. */
export function armarReparto(pedidos: readonly PedidoGuardado[], fecha: string): RepartoDelDia {
  const paradas: ParadaDeReparto[] = [];
  let sinConfirmar = 0;
  for (const pedido of pedidos) {
    if ((pedido.fechaConfirmada ?? pedido.fechaEntrega) !== fecha) continue;
    if (POR_CONFIRMAR.has(pedido.estado)) sinConfirmar += 1;
    if (!SALEN_A_REPARTO.has(pedido.estado)) continue;
    const bidones = sinBidones();
    for (const linea of pedido.lineas) bidones[linea.tipo] += linea.cantidad;
    paradas.push({
      orden: 0,
      idPedido: pedido.id,
      estado: pedido.estado,
      telefono: pedido.telefono,
      nombre: pedido.nombre,
      direccion: pedido.direccion,
      comuna: pedido.comuna,
      bidones,
      totalBidones: TAMANOS.reduce((suma, tipo) => suma + bidones[tipo], 0),
      envasesARetirar: pedido.envasesARetirar,
      notas: pedido.notasRepartidor,
      total: pedido.total,
      cobrarEnEfectivo: pedido.formaPago === 'efectivo' && pedido.estadoPago !== 'pagado' ? pedido.total : null,
      actualizadoEn: pedido.actualizadoEn,
      carga: 1,
    });
  }
  // La ruta publicada manda; lo que llegó después de publicar va al final, por comuna y dirección.
  const posicion = new Map(pedidos.map((p) => [p.id, p.ordenRuta]));
  paradas.sort((a, b) => {
    const pa = posicion.get(a.idPedido) ?? null;
    const pb = posicion.get(b.idPedido) ?? null;
    if (pa !== null && pb !== null && pa !== pb) return pa - pb;
    if ((pa === null) !== (pb === null)) return pa === null ? 1 : -1;
    return comparar(a.comuna, b.comuna) || comparar(a.direccion, b.direccion) || comparar(a.idPedido, b.idPedido);
  });
  const publicada = paradas.some((parada) => posicion.get(parada.idPedido) != null);
  paradas.forEach((parada, i) => (parada.orden = i + 1));
  const cargas = armarCargas(paradas);

  const carga = sinBidones();
  for (const parada of paradas) for (const tipo of TAMANOS) carga[tipo] += parada.bidones[tipo];
  return {
    fecha,
    paradas,
    carga,
    totalBidones: TAMANOS.reduce((suma, tipo) => suma + carga[tipo], 0),
    envasesARetirar: paradas.reduce((suma, parada) => suma + parada.envasesARetirar, 0),
    entregadas: paradas.filter((parada) => parada.estado === 'Entregado').length,
    sinConfirmar,
    cargas,
    publicada,
  };
}

const plural = (cantidad: number, uno: string, varios: string): string => `${cantidad} ${cantidad === 1 ? uno : varios}`;
const envases = (cantidad: number): string => plural(cantidad, 'envase', 'envases');

/**
 * El mensaje de una parada, con el formato que hoy se escribe a mano para el repartidor (D64, conocimiento §17): número y
 * nombre; dirección con comuna y notas; teléfono; cantidad y, si paga en efectivo, cuánto cobrar. Uno por parada, para
 * mandarlos por WhatsApp en el orden de la ruta mientras la aplicación del repartidor convive con la de hoy.
 */
export function mensajeDeParada(p: ParadaDeReparto): string {
  const bidones = TAMANOS.filter((tipo) => p.bidones[tipo] > 0).map((tipo) => `${p.bidones[tipo]} de ${litros(tipo)}`).join(' y ');
  return [
    `${p.orden}. ${p.nombre || 'Sin nombre'}`,
    [[p.direccion, p.comuna].filter(Boolean).join(', ') || 'Sin dirección', p.notas].filter(Boolean).join('. '),
    p.telefono ? `+${p.telefono}` : '',
    [bidones, p.envasesARetirar > 0 ? `retirar ${envases(p.envasesARetirar)}` : '', p.cobrarEnEfectivo !== null ? `*efectivo ${formatearCLP(p.cobrarEnEfectivo)}*` : '']
      .filter(Boolean)
      .join(' · '),
  ]
    .filter(Boolean)
    .join('\n');
}

/** Texto para copiar y mandar al repartidor: el día, la carga y una línea por parada. */
export function textoDeReparto(reparto: RepartoDelDia): string {
  const titulo = `Reparto del ${fechaEnPalabras(reparto.fecha)}`;
  if (reparto.paradas.length === 0) return `${titulo}\nSin entregas confirmadas para este día.`;

  const desglose = TAMANOS.filter((tipo) => reparto.carga[tipo] > 0).map((tipo) => `${reparto.carga[tipo]} de ${litros(tipo)}`).join(', ');
  const resumen = [
    plural(reparto.paradas.length, 'parada', 'paradas'),
    `${plural(reparto.totalBidones, 'bidón', 'bidones')} (${desglose})`,
    reparto.envasesARetirar > 0 ? `retirar ${envases(reparto.envasesARetirar)}` : '',
    reparto.cargas.length > 1 ? `${reparto.cargas.length} cargas (el furgón lleva ${CAPACIDAD_FURGON})` : '',
  ].filter(Boolean);

  const conCargas = reparto.cargas.length > 1;
  const lineas = reparto.paradas.flatMap((p) => {
    const carga = conCargas ? reparto.cargas.find((c) => c.desde === p.orden) : undefined;
    const encabezado = carga ? [`— Carga ${carga.numero}: ${carga.totalBidones} bidones${carga.excedeFurgon ? ' (no cabe en un viaje)' : ''} —`] : [];
    return [...encabezado, [
      `${p.orden}. ${[p.direccion, p.comuna].filter(Boolean).join(', ') || 'sin dirección'}`,
      p.nombre,
      TAMANOS.filter((tipo) => p.bidones[tipo] > 0).map((tipo) => `${p.bidones[tipo]} × ${litros(tipo)}`).join(', '),
      p.total === null ? 'sin precio' : formatearCLP(p.total),
      p.cobrarEnEfectivo !== null ? `*efectivo ${formatearCLP(p.cobrarEnEfectivo)}*` : '',
      p.telefono ? `+${p.telefono}` : '',
      p.notas,
      p.envasesARetirar > 0 ? `Retirar ${envases(p.envasesARetirar)}` : '',
      p.estado === 'Entregado' ? 'ENTREGADO' : '',
    ]
      .filter(Boolean)
      .join(' · ')];
  });
  return [titulo, resumen.join(' · '), '', ...lineas].join('\n');
}

const ENCABEZADO = ['Orden', 'Pedido', 'Nombre', 'Teléfono', 'Dirección', 'Comuna', '20 L', '12 L', '10 L', 'Bidones', 'Envases por retirar', 'Total', 'Notas', 'Estado'] as const;

/**
 * Lo que escribe un cliente (su nombre, su dirección) termina en una celda de Excel: si empieza con =, +, - o @, Excel lo
 * leería como una fórmula. Con un apóstrofo adelante queda como texto.
 */
const comoTexto = (valor: string): string => (/^[=+\-@]/.test(valor) ? `'${valor}` : valor);

/** Encabezado y una fila por parada. El teléfono va sin "+" y el total sin "$", para que Excel los lea como número. */
function tablaDeReparto(reparto: RepartoDelDia): string[][] {
  return [
    [...ENCABEZADO],
    ...reparto.paradas.map((p) => [
      String(p.orden),
      p.idPedido,
      comoTexto(p.nombre),
      p.telefono.replace(/\D/g, ''),
      comoTexto(p.direccion),
      comoTexto(p.comuna),
      ...TAMANOS.map((tipo) => String(p.bidones[tipo])),
      String(p.totalBidones),
      String(p.envasesARetirar),
      p.total === null ? '' : String(p.total),
      comoTexto(p.notas),
      ESTADO_EN_PALABRAS[p.estado] ?? p.estado,
    ]),
  ];
}

/** Para pegar en Excel o en Google Sheets: columnas separadas por tabuladores. */
export function tsvDeReparto(reparto: RepartoDelDia): string {
  return tablaDeReparto(reparto)
    .map((fila) => fila.map((celda) => celda.replace(/[\t\r\n]+/g, ' ')).join('\t'))
    .join('\n');
}

/**
 * Archivo CSV para descargar. Excel en español separa con punto y coma, y necesita la marca del inicio (BOM) para leer
 * bien los acentos.
 */
export function csvDeReparto(reparto: RepartoDelDia): string {
  const celda = (valor: string): string => (/[";\r\n]/.test(valor) ? `"${valor.replace(/"/g, '""')}"` : valor);
  return `﻿${tablaDeReparto(reparto)
    .map((fila) => `${fila.map(celda).join(';')}\r\n`)
    .join('')}`;
}
