/**
 * Memoria del flujo de pedido en D1 (migrations/0003_etapa4.sql):
 *
 *  - Conversación a medias: cuando el bot le pregunta algo al cliente ("¿de qué tamaño?"), guarda el
 *    pedido incompleto para entender la respuesta siguiente ("20") en su contexto. Vence a las 12 horas.
 *  - Último pedido: para responder "lo de siempre". Se borra tras 180 días sin pedir.
 *
 * Es una ayuda, no una fuente de verdad: si D1 falla, se registra el error y el flujo sigue como si no
 * hubiera memoria (el bot vuelve a preguntar). Nunca lanza errores al flujo del cliente.
 */

import type { BaseDatos } from './almacen';
import { enteroValido, validarItems, type ItemInterpretado } from './interprete';

/** Qué le preguntó el bot al cliente y espera que responda. */
export type Espera = 'tipo' | 'cantidad' | 'pedido';

export interface EstadoConversacion {
  espera: Espera;
  /** El pedido a medias (por ejemplo "4 bidones" sin tamaño). */
  items: ItemInterpretado[];
  fecha_texto?: string;
  comuna_mencionada?: string;
}

export const VIGENCIA_CONVERSACION_SEGUNDOS = 12 * 3600;
const VIGENCIA_ULTIMO_PEDIDO_SEGUNDOS = 180 * 24 * 3600;
const PROBABILIDAD_LIMPIEZA = 0.02; // limpia en 1 de cada ~50 mensajes
const MAX_TEXTO = 40;
const ESPERAS: ReadonlySet<string> = new Set<Espera>(['tipo', 'cantidad', 'pedido']);

function textoCorto(valor: unknown): string | undefined {
  return typeof valor === 'string' && valor.trim() !== '' && valor.length <= MAX_TEXTO ? valor : undefined;
}

/** Lo que se leyó de D1 se revisa como cualquier dato de afuera: si no cumple el contrato, no se usa. */
export function validarEstado(crudo: unknown): EstadoConversacion | null {
  if (typeof crudo !== 'object' || crudo === null) return null;
  const e = crudo as Record<string, unknown>;
  if (typeof e.espera !== 'string' || !ESPERAS.has(e.espera) || !Array.isArray(e.items)) return null;
  const items = validarItems(e.items);
  if (!items) return null;
  const fecha = textoCorto(e.fecha_texto);
  const comuna = textoCorto(e.comuna_mencionada);
  return { espera: e.espera as Espera, items, ...(fecha && { fecha_texto: fecha }), ...(comuna && { comuna_mencionada: comuna }) };
}

/** Un pedido "de siempre" solo sirve si está completo: tipo y cantidad conocidos. */
function validarPedidoCompleto(crudo: unknown): ItemInterpretado[] | null {
  const items = Array.isArray(crudo) ? validarItems(crudo) : null;
  if (!items || items.length === 0) return null;
  return items.every((item) => item.tipo !== 'no_especificado' && item.cantidad !== null && enteroValido(item.cantidad) !== null) ? items : null;
}

function filaTexto(resultado: { results?: unknown[] }, columna: string): string | null {
  const fila = resultado.results?.[0] as Record<string, unknown> | undefined;
  const valor = fila?.[columna];
  return typeof valor === 'string' ? valor : null;
}

function jsonODescartar(texto: string | null): unknown {
  if (texto === null) return null;
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}

export class MemoriaConversaciones {
  constructor(
    private readonly db: BaseDatos,
    private readonly azar: () => number = Math.random,
  ) {}

  /** Envuelve cada operación: la memoria es una ayuda y un fallo suyo no debe romper la respuesta al cliente. */
  private async seguro<T>(que: string, porDefecto: T, operacion: () => Promise<T>): Promise<T> {
    try {
      return await operacion();
    } catch (error) {
      console.error(`Memoria de conversaciones: no se pudo ${que}:`, error instanceof Error ? error.message : error);
      return porDefecto;
    }
  }

  obtener(telefono: string, ahoraSegundos: number): Promise<EstadoConversacion | null> {
    return this.seguro('leer la conversación', null, async () => {
      const r = await this.db
        .prepare('SELECT estado FROM conversaciones WHERE telefono = ?1 AND actualizado_en > ?2')
        .bind(telefono, ahoraSegundos - VIGENCIA_CONVERSACION_SEGUNDOS)
        .run();
      return validarEstado(jsonODescartar(filaTexto(r, 'estado')));
    });
  }

  guardar(telefono: string, estado: EstadoConversacion, ahoraSegundos: number): Promise<void> {
    return this.seguro('guardar la conversación', undefined, async () => {
      await this.db
        .prepare(
          'INSERT INTO conversaciones (telefono, estado, actualizado_en) VALUES (?1, ?2, ?3) ON CONFLICT(telefono) DO UPDATE SET estado = ?2, actualizado_en = ?3',
        )
        .bind(telefono, JSON.stringify(estado), ahoraSegundos)
        .run();
    });
  }

  borrar(telefono: string): Promise<void> {
    return this.seguro('borrar la conversación', undefined, async () => {
      await this.db.prepare('DELETE FROM conversaciones WHERE telefono = ?1').bind(telefono).run();
    });
  }

  ultimoPedido(telefono: string): Promise<ItemInterpretado[] | null> {
    return this.seguro('leer el último pedido', null, async () => {
      const r = await this.db.prepare('SELECT items FROM ultimos_pedidos WHERE telefono = ?1').bind(telefono).run();
      return validarPedidoCompleto(jsonODescartar(filaTexto(r, 'items')));
    });
  }

  guardarUltimoPedido(telefono: string, items: readonly ItemInterpretado[], ahoraSegundos: number): Promise<void> {
    return this.seguro('guardar el último pedido', undefined, async () => {
      await this.db
        .prepare(
          'INSERT INTO ultimos_pedidos (telefono, items, actualizado_en) VALUES (?1, ?2, ?3) ON CONFLICT(telefono) DO UPDATE SET items = ?2, actualizado_en = ?3',
        )
        .bind(telefono, JSON.stringify(items), ahoraSegundos)
        .run();
    });
  }

  /** Borra lo vencido. Se llama al terminar de atender un mensaje, fuera del camino de la respuesta. */
  limpiar(ahoraSegundos: number): Promise<void> {
    if (this.azar() >= PROBABILIDAD_LIMPIEZA) return Promise.resolve();
    return this.seguro('limpiar', undefined, async () => {
      await this.db
        .prepare('DELETE FROM conversaciones WHERE actualizado_en < ?1')
        .bind(ahoraSegundos - VIGENCIA_CONVERSACION_SEGUNDOS)
        .run();
      await this.db
        .prepare('DELETE FROM ultimos_pedidos WHERE actualizado_en < ?1')
        .bind(ahoraSegundos - VIGENCIA_ULTIMO_PEDIDO_SEGUNDOS)
        .run();
    });
  }
}
