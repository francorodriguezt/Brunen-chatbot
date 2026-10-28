/**
 * Motor de decisión del flujo de pedido (Etapa 4). Recibe lo que el bot ya sabe (qué entendió, quién es
 * el cliente, precios, entrega propuesta, memoria) y decide qué hacer: qué responderle al cliente, qué
 * anotar en PEDIDOS, qué avisarle a la operadora y qué recordar. NO hace entrada ni salida: leer hojas,
 * escribir en la planilla, enviar mensajes y guardar la memoria son pasos de afuera (Etapa 4 al conectarlo).
 * Así cada regla del negocio se prueba con una sola llamada y sin red.
 *
 * Principios del proyecto, tal como se aplican aquí:
 *  - El LLM extrae, el código calcula: los precios salen de `precios.ts` y la fecha de `entrega.ts`.
 *  - El bot registra y propone; la operadora confirma: nada se promete como confirmado.
 *  - Reclamos, facturas y pagos a proveedores van siempre a una persona.
 *  - Ante la duda, escalar: precio dudoso, ficha rara, comuna que no calza, cliente nuevo, hoja que no se
 *    pudo leer... el pedido se anota igual y una persona lo revisa; al cliente no se le promete lo que no es seguro.
 *  - Una sola respuesta por mensaje.
 *
 * Los supuestos pendientes del dueño están en `POLITICAS` y en docs/PENDIENTES.md.
 */

import type { Alerta, TipoAlerta } from './alertas';
import type { BusquedaCliente } from './clientes';
import { detectarComuna, esComunaAtendida } from './comunas';
import type { EstadoConversacion } from './conversacion';
import { fechaHoraLocal, textoFechaHora } from './despacho';
import type { PropuestaEntrega } from './entrega';
import { accionDePedido, type AccionSugerida, type Intencion, type Interpretacion, type ItemInterpretado } from './interprete';
import { generarIdPedido, type LineaPedido, type PedidoARegistrar } from './pedidos';
import { cotizarPedido, ErrorPrecio, type Cotizacion, type TipoBidon } from './precios';
import type { TablaPrecios } from './preciosHoja';
import * as textos from './textos';

export const POLITICAS = {
  /** PENDIENTE (dueño): un pedido con más bidones de un tipo que esto se manda a revisar (puede ser un error de tipeo). */
  cantidadInusual: 20,
  /** Horario de atención de la operadora (docs/conocimiento_brunen.md, sección 8). */
  horaApertura: 8,
  horaCierre: 21,
} as const;

export interface EntradaMotor {
  /** Lo que se entendió del mensaje (ya con el contexto de la conversación, si lo había). */
  interpretacion: Interpretacion;
  /** El cliente desistió del pedido a medias. */
  cancelo?: boolean;
  /** Lo que escribió el cliente, para dar contexto a la operadora en las alertas. */
  texto: string;
  /** Teléfono en el formato de WhatsApp. */
  telefono: string;
  /** Id del último mensaje del grupo: de ahí sale el ID del pedido, así un reintento de Meta da el mismo. */
  wamid: string;
  ahora: Date;
  cliente: BusquedaCliente;
  /** Último pedido completo del cliente, para "lo de siempre". */
  ultimoPedido: ItemInterpretado[] | null;
  precios: TablaPrecios;
  /** Entrega propuesta (entrega.ts), calculada para el día que pidió el cliente. */
  entrega: PropuestaEntrega;
  servicio: { reducido: boolean; mensajeExcepcion: string };
}

export type AccionMemoria =
  | { accion: 'guardar'; estado: EstadoConversacion }
  | { accion: 'borrar' }
  | { accion: 'mantener' };

export interface Decision {
  /** Para la columna Intencion de la hoja de mensajes. */
  intencion: Intencion | 'cancelar';
  /** Lo que se le responde al cliente. null = no responder (por ejemplo, ante un "gracias"). */
  respuesta: string | null;
  memoria: AccionMemoria;
  /** Pedido para anotar en PEDIDOS. */
  pedido?: PedidoARegistrar;
  /** Aviso para la operadora. */
  alerta?: Alerta;
  /** Pedido completo para recordar como "lo de siempre". */
  ultimoPedido?: ItemInterpretado[];
}

/** Avisos informativos: el cliente ya tiene su respuesta y la operadora no tiene que contestarle. */
const SIN_ESPERA_HUMANA: ReadonlySet<TipoAlerta> = new Set<TipoAlerta>(['pedido', 'envases', 'fuera_de_zona']);

const MANTENER: AccionMemoria = { accion: 'mantener' };
const BORRAR: AccionMemoria = { accion: 'borrar' };

type ItemCompleto = { tipo: TipoBidon; cantidad: number };

function fueraDelHorarioDeAtencion(ahora: Date): boolean {
  const { hora } = fechaHoraLocal(ahora);
  return hora < POLITICAS.horaApertura || hora >= POLITICAS.horaCierre;
}

function nombreDelCliente(e: EntradaMotor): string | undefined {
  return e.cliente.estado === 'encontrado' && e.cliente.cliente.nombre ? e.cliente.cliente.nombre : undefined;
}

function alerta(e: EntradaMotor, tipo: TipoAlerta, resumen: string, extra: Partial<Alerta> = {}): Alerta {
  const nombre = nombreDelCliente(e);
  return { tipo, telefono: e.telefono, ...(nombre && { nombre }), resumen, motivos: [], texto: e.texto, ...extra };
}

function escalar(e: EntradaMotor, tipo: TipoAlerta, resumen: string, respuesta: string = textos.recibidoEscalar(), memoria: AccionMemoria = MANTENER): Decision {
  return { intencion: e.interpretacion.intencion, respuesta, memoria, alerta: alerta(e, tipo, resumen) };
}

function responderPregunta(e: EntradaMotor): Decision {
  const { tipo_pregunta: tipo, comuna_mencionada: comuna } = e.interpretacion;
  const informar = (respuesta: string): Decision => ({ intencion: 'pregunta', respuesta, memoria: MANTENER });
  if (tipo === 'precio') {
    // Con la hoja de precios dañada no se le dice un valor que podría no ser el vigente.
    return e.precios.origen === 'hoja'
      ? informar(textos.precios(e.precios.tabla))
      : escalar(e, 'error', `Preguntó por precios y la hoja PRECIOS no es confiable: ${e.precios.problemas[0] ?? 'sin detalle'}`);
  }
  if (tipo === 'zona') return informar(textos.zona(comuna));
  if (tipo === 'horario') return informar(textos.horarios());
  // Los datos de pago están en la hoja CONFIGURACION y los entrega una persona (PENDIENTE del dueño).
  if (tipo === 'pago') return escalar(e, 'pago', 'Pregunta cómo pagar o por los datos de transferencia');
  return escalar(e, 'no_entendido', 'Hizo una pregunta que el bot no supo clasificar');
}

function preguntar(e: EntradaMotor, items: ItemInterpretado[], falta: AccionSugerida, respuestaPropia?: string): Decision {
  const espera = falta === 'preguntar_tipo' ? 'tipo' : falta === 'preguntar_cantidad' ? 'cantidad' : 'pedido';
  const respuesta =
    respuestaPropia ??
    (espera === 'tipo' ? textos.preguntarTipo() : espera === 'cantidad' ? textos.preguntarCantidad(items) : textos.preguntarPedido());
  const { fecha_texto: fecha, comuna_mencionada: comuna } = e.interpretacion;
  return {
    intencion: e.interpretacion.intencion,
    respuesta,
    memoria: { accion: 'guardar', estado: { espera, items, ...(fecha && { fecha_texto: fecha }), ...(comuna && { comuna_mencionada: comuna }) } },
  };
}

/** Suma por tipo, igual que la cotización (un mismo tipo repetido es una sola línea). */
function agrupar(items: readonly ItemCompleto[]): ItemCompleto[] {
  const porTipo = new Map<TipoBidon, number>();
  for (const { tipo, cantidad } of items) porTipo.set(tipo, (porTipo.get(tipo) ?? 0) + cantidad);
  return [...porTipo].map(([tipo, cantidad]) => ({ tipo, cantidad }));
}

function motivoDeAjuste(entrega: PropuestaEntrega): string {
  if (entrega.motivoAjuste === 'sin_despacho') return 'ese día no se despacha';
  if (entrega.motivoAjuste === 'muy_pronto') return 'no alcanza';
  return 'no se entendió';
}

function decidirPedido(e: EntradaMotor, items: ItemInterpretado[], repite: boolean): Decision {
  const falta = accionDePedido(items);
  if (falta) return preguntar(e, items, falta);
  const completos = items as ItemCompleto[];

  // No se sabe quién escribe: no se puede decir si es un cliente nuevo ni qué precio le toca.
  if (e.cliente.estado === 'no_disponible') {
    return escalar(e, 'error', 'No se pudo leer la hoja CLIENTES, así que no se sabe quién escribe. Revisar el pedido y contestarle');
  }
  const cliente = e.cliente.estado === 'encontrado' ? e.cliente.cliente : null;
  if (cliente?.estado === 'bloqueado') {
    return escalar(e, 'escalamiento', 'Cliente bloqueado intenta hacer un pedido', textos.recibidoEscalar(), BORRAR);
  }

  // Todo lo que impide darle al cliente un precio o una fecha como seguros se junta en `motivos`: el pedido
  // se anota igual, se le avisa a la operadora y al cliente no se le promete lo dudoso.
  const motivos: string[] = [];
  const notas: string[] = [];
  let precioSeguro = cliente !== null;

  let cotizacion: Cotizacion | null = null;
  try {
    cotizacion = cotizarPedido(completos, { tipo: cliente?.tipo ?? 'normal', precioEspecial20L: cliente?.precioEspecial20L ?? null }, e.precios.tabla);
  } catch (error) {
    if (!(error instanceof ErrorPrecio)) throw error;
    precioSeguro = false;
    motivos.push(error.message);
  }
  if (cotizacion) {
    for (const motivo of cotizacion.motivos) (motivo.startsWith('Pedido mezclado') ? notas : motivos).push(motivo);
    if (cotizacion.requiereRevision) precioSeguro = false;
  }
  if (e.precios.origen === 'respaldo') {
    precioSeguro = false;
    motivos.push(`La hoja PRECIOS no es confiable (${e.precios.problemas[0] ?? 'sin detalle'}): se usaron los precios de respaldo.`);
  }
  if (cliente && cliente.avisos.length > 0) {
    precioSeguro = false;
    motivos.push(...cliente.avisos.map((aviso) => `Ficha del cliente: ${aviso}`));
  }
  const grandes = completos.filter((item) => item.cantidad > POLITICAS.cantidadInusual);
  if (grandes.length > 0) {
    precioSeguro = false;
    motivos.push(`Cantidad inusual (${textos.resumenLineas(grandes)}): confirmar que no es un error.`);
  }

  // Comuna: la de la ficha; si es un cliente nuevo, la que mencionó.
  const mencionada = e.interpretacion.comuna_mencionada;
  const detectada = cliente ? detectarComuna(cliente.comuna) : null;
  let fueraDeZona = false;
  if (cliente) {
    if (!detectada) motivos.push('La ficha del cliente no tiene una comuna reconocible: confirmar la dirección.');
    else if (!detectada.atendida) fueraDeZona = true;
    else if (mencionada && mencionada !== detectada.nombre) {
      motivos.push(`Pidió entrega en ${mencionada}, distinta de la comuna de su ficha (${detectada.nombre}): confirmar la dirección.`);
    }
  } else if (mencionada) {
    fueraDeZona = !esComunaAtendida(mencionada);
  }
  const comuna = detectada?.nombre ?? cliente?.comuna ?? mencionada ?? '';

  // Fecha de entrega.
  const fechaSegura = e.entrega.feriadosAlDia && e.entrega.motivoAjuste !== 'no_entendida';
  if (!e.entrega.feriadosAlDia) motivos.push('La hoja FERIADOS no tiene feriados del año de la entrega: confirmar la fecha.');
  if (e.entrega.motivoAjuste === 'no_entendida') motivos.push(`No se entendió la fecha que pidió ("${e.entrega.pedida}"): confirmar.`);
  else if (e.entrega.pedida) {
    notas.push(`Pidió "${e.entrega.pedida}"${e.entrega.motivoAjuste ? ` (${motivoDeAjuste(e.entrega)}): se propuso otra fecha` : ''}.`);
  }

  if (repite) notas.push('Pidió repetir su último pedido.');
  if (!cliente) notas.push('Cliente nuevo, sin ficha: pedir dirección y comuna, y ofrecer la carga inicial si no tiene envases.');

  const lineas: LineaPedido[] = cotizacion
    ? cotizacion.lineas.map((l) => ({ tipo: l.tipo, cantidad: l.cantidad, precioUnitario: l.precioUnitario, subtotal: l.subtotal }))
    : agrupar(completos).map((l) => ({ ...l, precioUnitario: null, subtotal: null }));

  const idPedido = generarIdPedido(e.wamid, fechaHoraLocal(e.ahora).fecha);
  const pedido: PedidoARegistrar = {
    idPedido,
    fechaHora: textoFechaHora(e.ahora),
    telefono: e.telefono,
    nombre: cliente?.nombre ?? '',
    lineas,
    fechaEntrega: e.entrega.fecha,
    estado: fueraDeZona ? 'Fuera_de_zona' : 'Pendiente_Confirmacion',
    comuna,
    direccion: cliente?.direccion ?? '',
    notasRepartidor: [cliente?.notas, cliente?.avisoHora ? 'Avisar hora aproximada de entrega' : ''].filter(Boolean).join('. '),
    envasesARetirar: cliente?.envasesPendientes ?? 0,
    observaciones: [...notas, ...motivos].join(' | '),
  };

  const resumen = `${textos.resumenLineas(lineas)}${comuna ? ` · ${comuna}` : ''}`;
  let avisoTipo: TipoAlerta = motivos.length > 0 ? 'pedido_revision' : 'pedido';
  let respuesta: string;
  if (fueraDeZona) {
    avisoTipo = 'fuera_de_zona';
    respuesta = textos.fueraDeZona(comuna);
  } else if (!cliente) {
    avisoTipo = 'cliente_nuevo';
    respuesta = textos.clienteNuevo(lineas);
  } else {
    respuesta = textos.pedidoAnotado({ lineas, total: precioSeguro && cotizacion ? cotizacion.total : null, entrega: e.entrega, fechaSegura });
  }

  return {
    intencion: e.interpretacion.intencion,
    respuesta,
    memoria: BORRAR,
    pedido,
    alerta: alerta(e, avisoTipo, resumen, { motivos, idPedido }),
    ...(!fueraDeZona && { ultimoPedido: completos }),
  };
}

function decidirBase(e: EntradaMotor): Decision {
  const i = e.interpretacion;
  if (e.cancelo) return { intencion: 'cancelar', respuesta: textos.cancelado(), memoria: BORRAR };

  switch (i.intencion) {
    case 'cierre':
      return { intencion: 'cierre', respuesta: null, memoria: MANTENER };
    case 'saludo':
      return { intencion: 'saludo', respuesta: textos.saludo(nombreDelCliente(e)), memoria: MANTENER };
    case 'reclamo':
      return escalar(e, 'reclamo', 'El cliente presenta un reclamo', textos.reclamo());
    case 'factura':
      return escalar(e, 'factura', 'Pide una factura o una boleta');
    case 'proveedor':
      return escalar(e, 'proveedor', 'Mensaje de cobranza o de un proveedor');
    case 'pago':
      return { intencion: 'pago', respuesta: textos.pagoRecibido(), memoria: MANTENER, alerta: alerta(e, 'pago', 'Avisa que pagó o transfirió') };
    case 'envases': {
      const cantidad = i.envases_a_retirar;
      return {
        intencion: 'envases',
        respuesta: textos.envasesAnotados(cantidad),
        memoria: MANTENER,
        alerta: alerta(e, 'envases', cantidad ? `Tiene ${cantidad} envase(s) vacío(s) para retirar` : 'Avisa que tiene envases vacíos para retirar'),
      };
    }
    case 'pregunta':
      return responderPregunta(e);
    case 'repetir_pedido':
      return e.ultimoPedido && e.ultimoPedido.length > 0
        ? decidirPedido(e, e.ultimoPedido, true)
        : preguntar(e, [], 'preguntar_pedido', textos.repetirSinHistorial());
    case 'pedido':
      return decidirPedido(e, i.items, false);
    case 'desconocido':
      return escalar(e, 'no_entendido', 'El bot no entendió el mensaje');
  }
}

/** Agrega lo que va al final de cualquier respuesta: el aviso de horario y la excepción de servicio. */
function adornar(decision: Decision, e: EntradaMotor): Decision {
  if (decision.respuesta === null) return decision;
  let respuesta = decision.respuesta;
  // Lo que ya está resuelto (un pedido normal, envases anotados, fuera de zona) no espera nada de la operadora:
  // solo lo demás lleva el aviso de horario.
  if (decision.alerta && !SIN_ESPERA_HUMANA.has(decision.alerta.tipo) && fueraDelHorarioDeAtencion(e.ahora)) {
    respuesta += `\n\n${textos.fueraDeHorario()}`;
  }
  const excepcion = e.servicio.mensajeExcepcion.trim();
  if (e.servicio.reducido && excepcion !== '') respuesta += `\n\n${excepcion}`;
  return { ...decision, respuesta };
}

export function decidir(entrada: EntradaMotor): Decision {
  return adornar(decidirBase(entrada), entrada);
}
