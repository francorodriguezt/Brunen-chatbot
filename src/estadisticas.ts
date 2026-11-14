/**
 * Bidones entregados por día, semana y mes, y vacíos que faltan por retirar (D65). Es lo que el dueño pidió ver en el
 * panel (2026-10-29): "bidones entregados por día, semana y mes" y "envases pendientes de retiro por cliente".
 *
 * Cuenta solo los pedidos entregados, por su día de entrega. Los vacíos que faltan son la diferencia entre los que había
 * que retirar y los que el repartidor marcó al entregar (D61): los pedidos entregados a mano en el panel, sin esa marca,
 * no cuentan como faltantes.
 */

import { diaSemana, sumarDias } from './despacho';
import type { TipoBidon } from './precios';

export const TIPOS: readonly TipoBidon[] = ['20L', '12L', '10L'];
/** Días que se muestran uno por uno. */
export const DIAS_EN_DETALLE = 14;

/** Lo mínimo de cada pedido entregado. */
export interface EntregaParaContar {
  dia: string;
  telefono: string;
  nombre: string;
  lineas: ReadonlyArray<{ tipo: string; cantidad: number }>;
  envasesARetirar: number;
  vaciosRetirados: number | null;
}

export type Bidones = Record<TipoBidon, number> & { total: number };

export interface VaciosPorRetirar {
  telefono: string;
  nombre: string;
  faltan: number;
  /** El último día en que faltaron. */
  ultimoDia: string;
}

export interface Estadisticas {
  hasta: string;
  dia: Bidones;
  semana: Bidones;
  mes: Bidones;
  mesAnterior: Bidones;
  /** Los últimos días, del más antiguo al más nuevo (para un gráfico de barras). */
  dias: Array<{ fecha: string; bidones: Bidones }>;
  vacios: VaciosPorRetirar[];
}

const cero = (): Bidones => ({ '20L': 0, '12L': 0, '10L': 0, total: 0 });

/** Desde cuándo hay que leer para responder `hasta`: el primer día del mes anterior, o antes si la semana empieza antes. */
export function desdeParaEstadisticas(hasta: string): string {
  const mesAnterior = primerDiaDelMesAnterior(hasta);
  const lunes = lunesDeLaSemana(hasta);
  const detalle = sumarDias(hasta, -(DIAS_EN_DETALLE - 1));
  return [mesAnterior, lunes, detalle].sort()[0] as string;
}

export function lunesDeLaSemana(fecha: string): string {
  return sumarDias(fecha, -((diaSemana(fecha) + 6) % 7));
}

function primerDiaDelMesAnterior(fecha: string): string {
  const [ano, mes] = fecha.split('-').map(Number) as [number, number];
  return mes === 1 ? `${ano - 1}-12-01` : `${ano}-${String(mes - 1).padStart(2, '0')}-01`;
}

function sumar(destino: Bidones, lineas: EntregaParaContar['lineas']): void {
  for (const linea of lineas) {
    if (!(TIPOS as readonly string[]).includes(linea.tipo) || !Number.isFinite(linea.cantidad) || linea.cantidad <= 0) continue;
    destino[linea.tipo as TipoBidon] += linea.cantidad;
    destino.total += linea.cantidad;
  }
}

export function resumirEntregas(entregas: readonly EntregaParaContar[], hasta: string): Estadisticas {
  const lunes = lunesDeLaSemana(hasta);
  const inicioDelMes = `${hasta.slice(0, 7)}-01`;
  const inicioMesAnterior = primerDiaDelMesAnterior(hasta);
  const primerDiaDetalle = sumarDias(hasta, -(DIAS_EN_DETALLE - 1));

  const porDia = new Map<string, Bidones>();
  for (let i = 0; i < DIAS_EN_DETALLE; i++) porDia.set(sumarDias(primerDiaDetalle, i), cero());
  const resultado: Estadisticas = { hasta, dia: cero(), semana: cero(), mes: cero(), mesAnterior: cero(), dias: [], vacios: [] };
  const faltantes = new Map<string, VaciosPorRetirar>();

  for (const e of entregas) {
    if (e.dia > hasta) continue;
    if (e.dia === hasta) sumar(resultado.dia, e.lineas);
    if (e.dia >= lunes) sumar(resultado.semana, e.lineas);
    if (e.dia >= inicioDelMes) sumar(resultado.mes, e.lineas);
    else if (e.dia >= inicioMesAnterior) sumar(resultado.mesAnterior, e.lineas);
    const delDia = porDia.get(e.dia);
    if (delDia) sumar(delDia, e.lineas);

    if (e.vaciosRetirados !== null && e.vaciosRetirados < e.envasesARetirar) {
      const clave = e.telefono || e.nombre || '(sin datos)';
      const previo = faltantes.get(clave) ?? { telefono: e.telefono, nombre: e.nombre, faltan: 0, ultimoDia: e.dia };
      previo.faltan += e.envasesARetirar - e.vaciosRetirados;
      if (e.dia >= previo.ultimoDia) {
        previo.ultimoDia = e.dia;
        if (e.nombre) previo.nombre = e.nombre;
      }
      faltantes.set(clave, previo);
    }
  }
  resultado.dias = [...porDia].map(([fecha, bidones]) => ({ fecha, bidones }));
  resultado.vacios = [...faltantes.values()].sort((a, b) => b.faltan - a.faltan || (a.ultimoDia < b.ultimoDia ? 1 : -1));
  return resultado;
}
