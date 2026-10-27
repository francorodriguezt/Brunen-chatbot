/**
 * Cálculo determinista de precios de Brunen.
 *
 * Principio 1 del proyecto: el LLM extrae, el CÓDIGO calcula.
 * Fuente de verdad: docs/conocimiento_brunen.md, secciones 2 y 3.
 *
 * Reglas implementadas (en este orden):
 *   1. Cliente con precio especial  -> se usa su precio por bidón (solo definido para 20 L).
 *   2. Cliente mayorista            -> $1.250 por bidón (solo definido para 20 L).
 *   3. Resto                        -> tramos por tipo y cantidad.
 *   Pedidos mezclados: cada tipo se calcula por separado (los tramos NO se suman entre tipos).
 *
 * Todo lo que el documento marca como PENDIENTE no se inventa: se calcula con la regla
 * general y se devuelve `requiereRevision = true` con el motivo, para que Constanza decida.
 */

export type TipoBidon = '20L' | '12L' | '10L';
export type TipoCliente = 'normal' | 'mayorista' | 'empresa' | 'especial';

export interface ItemPedido {
  tipo: TipoBidon;
  cantidad: number;
}

export interface ClientePrecio {
  tipo: TipoCliente;
  /** Precio por bidón de 20 L acordado (columna Precio_Especial_20L de CLIENTES). */
  precioEspecial20L?: number | null;
}

/** Una fila de la tabla de precios. `hasta = null` significa "o más". */
export interface TramoPrecio {
  tipo: TipoBidon;
  desde: number;
  hasta: number | null;
  precio: number;
}

export type ReglaAplicada = 'especial' | 'mayorista' | 'tramo';

export interface LineaCotizacion {
  tipo: TipoBidon;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  regla: ReglaAplicada;
}

export interface Cotizacion {
  lineas: LineaCotizacion[];
  total: number;
  requiereRevision: boolean;
  motivos: string[];
}

export const PRECIO_MAYORISTA = 1250;

/**
 * Tabla por defecto (sección 2 del documento de conocimiento).
 * Más adelante se cargará desde la hoja PRECIOS; por eso las funciones la reciben como parámetro.
 */
export const TABLA_PRECIOS: readonly TramoPrecio[] = [
  { tipo: '20L', desde: 1, hasta: 1, precio: 4500 },
  { tipo: '20L', desde: 2, hasta: 3, precio: 3300 },
  { tipo: '20L', desde: 4, hasta: null, precio: 2750 },
  { tipo: '12L', desde: 1, hasta: 1, precio: 2500 },
  { tipo: '12L', desde: 2, hasta: null, precio: 2400 },
  { tipo: '10L', desde: 1, hasta: null, precio: 2200 },
];

export class ErrorPrecio extends Error {}

function validarCantidad(cantidad: number): void {
  if (!Number.isInteger(cantidad) || cantidad < 1) {
    throw new ErrorPrecio(`Cantidad inválida: ${cantidad}. Debe ser un entero mayor o igual a 1.`);
  }
}

/** Precio unitario por tramos para un tipo y cantidad. */
export function precioPorTramo(
  tipo: TipoBidon,
  cantidad: number,
  tabla: readonly TramoPrecio[] = TABLA_PRECIOS,
): number {
  validarCantidad(cantidad);
  const tramo = tabla.find(
    (t) => t.tipo === tipo && cantidad >= t.desde && (t.hasta === null || cantidad <= t.hasta),
  );
  if (!tramo) {
    throw new ErrorPrecio(`No hay tramo de precio para ${cantidad} x ${tipo}. Revisa la tabla PRECIOS.`);
  }
  return tramo.precio;
}

/** Cotiza un pedido completo. No confirma nada: solo calcula y marca lo que necesita revisión. */
export function cotizarPedido(
  items: readonly ItemPedido[],
  cliente: ClientePrecio = { tipo: 'normal' },
  tabla: readonly TramoPrecio[] = TABLA_PRECIOS,
): Cotizacion {
  if (items.length === 0) {
    throw new ErrorPrecio('El pedido no tiene productos.');
  }

  // Agrupa por tipo: "2 de 20 y 1 de 20" en el mismo pedido = 3 de 20.
  const porTipo = new Map<TipoBidon, number>();
  for (const item of items) {
    validarCantidad(item.cantidad);
    porTipo.set(item.tipo, (porTipo.get(item.tipo) ?? 0) + item.cantidad);
  }

  const motivos: string[] = [];
  const lineas: LineaCotizacion[] = [];

  if (cliente.tipo === 'empresa') {
    motivos.push('Empresa con plan mensual: condiciones pendientes, Constanza debe revisar el precio.');
  }

  for (const [tipo, cantidad] of porTipo) {
    let precioUnitario: number;
    let regla: ReglaAplicada;

    const especial = cliente.precioEspecial20L;
    const tieneEspecial = typeof especial === 'number' && especial > 0;

    if (cliente.tipo === 'especial' && tieneEspecial && tipo === '20L') {
      precioUnitario = especial;
      regla = 'especial';
    } else if (cliente.tipo === 'mayorista' && tipo === '20L') {
      precioUnitario = PRECIO_MAYORISTA;
      regla = 'mayorista';
    } else {
      precioUnitario = precioPorTramo(tipo, cantidad, tabla);
      regla = 'tramo';
      if (cliente.tipo === 'especial' && !tieneEspecial) {
        motivos.push('Cliente marcado como especial sin precio especial registrado.');
      } else if (cliente.tipo === 'especial') {
        motivos.push(`Precio especial definido solo para 20 L; ${tipo} se calculó con tramos (PENDIENTE).`);
      } else if (cliente.tipo === 'mayorista') {
        motivos.push(`Precio mayorista definido solo para 20 L; ${tipo} se calculó con tramos (PENDIENTE).`);
      }
    }

    lineas.push({ tipo, cantidad, precioUnitario, subtotal: precioUnitario * cantidad, regla });
  }

  if (porTipo.size > 1) {
    motivos.push('Pedido mezclado: tramos calculados por tipo, sin sumar entre tipos (supuesto PENDIENTE de confirmar).');
  }

  const total = lineas.reduce((suma, l) => suma + l.subtotal, 0);
  // El supuesto de pedidos mezclados es informativo; solo bloquean los demás motivos.
  const requiereRevision = motivos.some((m) => !m.startsWith('Pedido mezclado'));
  return { lineas, total, requiereRevision, motivos };
}

export interface CotizacionCargaInicial {
  envases: number;
  total: number | null;
  requiereRevision: boolean;
  motivo?: string;
}

/**
 * Carga inicial para cliente sin envase (sección 2): 1 envase $5.500, 2 envases $10.000.
 * PENDIENTE: si aplica solo a 20 L y cuánto cuestan 3 o más envases.
 */
export function cotizarCargaInicial(envases: number): CotizacionCargaInicial {
  validarCantidad(envases);
  if (envases === 1) return { envases, total: 5500, requiereRevision: false };
  if (envases === 2) return { envases, total: 10000, requiereRevision: false };
  return {
    envases,
    total: null,
    requiereRevision: true,
    motivo: 'Precio de carga inicial para 3 o más envases no definido (PENDIENTE).',
  };
}

/** Formatea pesos chilenos sin depender del locale del entorno: 9900 -> "$9.900". */
export function formatearCLP(monto: number): string {
  if (!Number.isInteger(monto)) {
    throw new ErrorPrecio(`Monto no entero: ${monto}`);
  }
  const signo = monto < 0 ? '-' : '';
  const digitos = Math.abs(monto).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${signo}$${digitos}`;
}
