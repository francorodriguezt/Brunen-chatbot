/**
 * Flujo de un mensaje de texto del cliente (Etapa 4), de punta a punta pero sin tocar nada de afuera:
 * recibe sus dependencias como "puertos" (leer la ficha, los precios, la entrega, la memoria) y devuelve la
 * decisión del motor. Quien lo conecte al Worker (index.ts) solo tiene que:
 *   1. juntar los mensajes seguidos del cliente (agrupador.ts) y pasar el texto,
 *   2. enviar `decision.respuesta` por WhatsApp (si no es null),
 *   3. anotar `decision.pedido` en PEDIDOS (pedidos.ts) y mandar `decision.alerta` a la operadora (telegram.ts),
 *   4. registrar la intención en la hoja de mensajes.
 * La memoria de la conversación sí se actualiza aquí, porque es parte de entender al cliente.
 *
 * Pendiente al conectarlo: medir el CPU por mensaje en el plan gratis (10 ms) con las lecturas de hojas reales.
 *
 * Nunca lanza errores: si algo inesperado falla, el cliente igual recibe una respuesta y la operadora un
 * aviso de error (regla del proyecto: ningún error deja al cliente sin respuesta).
 */

import type { BusquedaCliente } from './clientes';
import { fusionarConEstado, responderEnContexto } from './contexto';
import type { EstadoConversacion } from './conversacion';
import type { PropuestaEntrega } from './entrega';
import type { Intencion, Interpretacion, ItemInterpretado } from './interprete';
import type { ResultadoInterpretacion } from './llm';
import { decidir, type Decision, type EntradaMotor } from './motor';
import type { TablaPrecios } from './preciosHoja';
import * as textos from './textos';

/** Lo que el flujo necesita de la memoria de conversaciones (conversacion.ts). */
export interface Memoria {
  obtener(telefono: string, ahoraSegundos: number): Promise<EstadoConversacion | null>;
  guardar(telefono: string, estado: EstadoConversacion, ahoraSegundos: number): Promise<void>;
  borrar(telefono: string): Promise<void>;
  ultimoPedido(telefono: string): Promise<ItemInterpretado[] | null>;
  guardarUltimoPedido(telefono: string, items: readonly ItemInterpretado[], ahoraSegundos: number): Promise<void>;
}

export interface Puertos {
  /** null si no hay base D1: sin memoria, el bot vuelve a preguntar lo que falte. */
  memoria: Memoria | null;
  buscarCliente(telefono: string): Promise<BusquedaCliente>;
  cargarPrecios(): Promise<TablaPrecios>;
  proponerEntrega(solicitada: string | undefined): Promise<PropuestaEntrega>;
  servicio(): Promise<EntradaMotor['servicio']>;
  /** Reglas y, si no alcanzan, el respaldo con IA (llm.ts). */
  interpretar(texto: string): Promise<ResultadoInterpretacion>;
}

export interface EntradaFlujo {
  /** Lo que escribió el cliente (si mandó varios mensajes seguidos, ya juntos). */
  texto: string;
  telefono: string;
  /** Id del último mensaje: de ahí sale el ID del pedido. */
  wamid: string;
  ahora: Date;
}

export interface ResultadoFlujo {
  decision: Decision;
  /** true si la interpretación la dio la IA y no las reglas. */
  conIa: boolean;
}

const INTENCIONES_CON_PRECIOS: ReadonlySet<Intencion> = new Set<Intencion>(['pregunta', 'pedido', 'repetir_pedido']);
const INTENCIONES_CON_ENTREGA: ReadonlySet<Intencion> = new Set<Intencion>(['pedido', 'repetir_pedido']);

const SIN_PRECIOS: TablaPrecios = { tabla: [], origen: 'respaldo', problemas: [] };

async function atender(entrada: EntradaFlujo, p: Puertos): Promise<ResultadoFlujo> {
  const ahoraSegundos = Math.floor(entrada.ahora.getTime() / 1000);
  const estado = p.memoria ? await p.memoria.obtener(entrada.telefono, ahoraSegundos) : null;

  // 1. Entender el mensaje, primero como respuesta a lo que el bot preguntó (sin gastar IA) y si no, desde cero.
  let interpretacion: Interpretacion;
  let cancelo = false;
  let conIa = false;
  const contextual = estado ? responderEnContexto(entrada.texto, estado) : null;
  if (contextual?.tipo === 'cancelar') {
    cancelo = true;
    interpretacion = { intencion: 'cierre', items: [] };
  } else if (contextual?.tipo === 'interpretacion') {
    interpretacion = contextual.interpretacion;
  } else {
    const resultado = await p.interpretar(entrada.texto);
    interpretacion = fusionarConEstado(resultado.interpretacion, estado);
    conIa = resultado.conIa;
  }
  const intencion = interpretacion.intencion;

  // 2. Reunir solo lo que esta intención necesita (cada lectura de hoja gasta tiempo y cupo de Google).
  const repite = intencion === 'repetir_pedido' && !cancelo;
  const [cliente, servicio, precios, entrega, ultimoPedido] = await Promise.all([
    intencion === 'cierre' ? ({ estado: 'nuevo' } as BusquedaCliente) : p.buscarCliente(entrada.telefono),
    intencion === 'cierre' ? { reducido: false, mensajeExcepcion: '' } : p.servicio(),
    INTENCIONES_CON_PRECIOS.has(intencion) ? p.cargarPrecios() : SIN_PRECIOS,
    INTENCIONES_CON_ENTREGA.has(intencion) ? p.proponerEntrega(interpretacion.fecha_texto) : undefined,
    repite && p.memoria ? p.memoria.ultimoPedido(entrada.telefono) : null,
  ]);

  // 3. Decidir.
  const decision = decidir({
    interpretacion,
    cancelo,
    texto: entrada.texto,
    telefono: entrada.telefono,
    wamid: entrada.wamid,
    ahora: entrada.ahora,
    cliente,
    ultimoPedido,
    precios,
    entrega: entrega ?? { fecha: '', mismoDia: false, feriadosAlDia: true },
    servicio,
  });

  // 4. Recordar lo que corresponda.
  if (p.memoria) {
    if (decision.memoria.accion === 'guardar') await p.memoria.guardar(entrada.telefono, decision.memoria.estado, ahoraSegundos);
    else if (decision.memoria.accion === 'borrar') await p.memoria.borrar(entrada.telefono);
    if (decision.ultimoPedido) await p.memoria.guardarUltimoPedido(entrada.telefono, decision.ultimoPedido, ahoraSegundos);
  }
  return { decision, conIa };
}

export async function atenderTexto(entrada: EntradaFlujo, puertos: Puertos): Promise<ResultadoFlujo> {
  try {
    return await atender(entrada, puertos);
  } catch (error) {
    // Solo el mensaje del error: el log no lleva teléfonos ni lo que escribió el cliente.
    const detalle = error instanceof Error ? error.message : String(error);
    console.error('El flujo de pedido falló; se escala a una persona:', detalle);
    return {
      conIa: false,
      decision: {
        intencion: 'desconocido',
        respuesta: textos.recibidoEscalar(),
        memoria: { accion: 'mantener' },
        alerta: { tipo: 'error', telefono: entrada.telefono, resumen: `Falló el flujo de pedido: ${detalle}`, motivos: [], texto: entrada.texto },
      },
    };
  }
}
