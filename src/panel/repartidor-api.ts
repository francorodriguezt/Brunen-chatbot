/**
 * API del repartidor (fase D, D61). Solo para un repartidor con su sesión (RUT y clave): `index.ts` lo comprueba antes.
 *
 * - GET  /api/repartidor/ruta                         las paradas de hoy, en el orden del reparto y por carga.
 * - POST /api/repartidor/pedidos/:id/entregado        { vacios, cobrado }
 * - POST /api/repartidor/pedidos/:id/no-se-pudo       { motivo, detalle }
 *
 * Lo que ve es lo que hoy se le escribe a mano por WhatsApp (nombre, dirección, teléfono, pedido, forma de pago y lo que
 * hay que cobrar en efectivo, notas para el reparto), y nada más: ni las observaciones internas ni lo que escribió el
 * cliente. "Hoy" es la fecha de Santiago: no puede ver ni marcar pedidos de otros días.
 */

import { fechaHoraLocal } from '../despacho';
import { MOTIVOS_NO_ENTREGA, type EstadoDeEntrega, type RepositorioEntregas } from '../entregas';
import { armarReparto } from '../reparto';
import type { RepositorioD1 } from '../repositorio';
import { error, esperadoComoEscritura, json, leerCuerpo } from './api';

export interface ContextoRepartidor {
  repositorio: RepositorioD1;
  entregas: RepositorioEntregas;
  ahoraSegundos: number;
  /** Nombre del repartidor, para el historial del pedido. */
  nombre: string;
}

const MENSAJES_DE_ERROR = {
  no_existe: [404, 'Ese pedido ya no existe.'],
  no_es_de_hoy: [409, 'Ese pedido no es de la ruta de hoy.'],
  no_disponible: [409, 'Ese pedido ya no está en la ruta: puede que lo hayan cambiado o cancelado.'],
  datos_invalidos: [422, 'Revisa lo que marcaste.'],
} as const;

function estadoDeParada(entrega: EstadoDeEntrega | undefined, estadoPedido: string): 'pendiente' | 'entregado' | 'no_se_pudo' {
  if (estadoPedido === 'Entregado') return 'entregado';
  return entrega?.noEntregado ? 'no_se_pudo' : 'pendiente';
}

async function rutaDeHoy(ctx: ContextoRepartidor): Promise<Response> {
  const hoy = fechaHoraLocal(new Date(ctx.ahoraSegundos * 1000)).fecha;
  const pedidos = await ctx.repositorio.pedidosDelDia(hoy);
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const entregas = await ctx.entregas.deDia(hoy);
  const reparto = armarReparto(pedidos, hoy);
  const paradas = reparto.paradas.map((parada) => {
    const pedido = porId.get(parada.idPedido);
    const entrega = entregas.get(parada.idPedido);
    const estado = estadoDeParada(entrega, parada.estado);
    const efectivoPendiente = pedido?.formaPago === 'efectivo' && pedido.estadoPago === 'pendiente';
    return {
      orden: parada.orden,
      carga: parada.carga,
      idPedido: parada.idPedido,
      nombre: parada.nombre,
      tipoCliente: pedido?.tipoCliente ?? '',
      direccion: parada.direccion,
      comuna: parada.comuna,
      telefono: parada.telefono,
      bidones: parada.bidones,
      totalBidones: parada.totalBidones,
      envasesARetirar: parada.envasesARetirar,
      notas: parada.notas,
      formaPago: pedido?.formaPago ?? '',
      cobrar: estado === 'entregado' || !efectivoPendiente ? null : parada.total,
      // Para "Corregir" una entrega: cuánto se cobra en efectivo y si ya lo cobró, para no perder el cobro.
      montoEfectivo: pedido?.formaPago === 'efectivo' ? parada.total : null,
      cobrado: entrega?.cobrado ?? null,
      estado,
      vaciosRetirados: entrega?.vaciosRetirados ?? null,
      motivo: estado === 'no_se_pudo' ? (entrega?.noEntregado?.motivo ?? null) : null,
    };
  });
  return json({
    fecha: hoy,
    paradas,
    cargas: reparto.cargas,
    carga: reparto.carga,
    totalBidones: reparto.totalBidones,
    motivos: Object.entries(MOTIVOS_NO_ENTREGA).map(([valor, texto]) => ({ valor, texto })),
  });
}

/** Devuelve null si la ruta no es del repartidor. */
export async function manejarRepartidor(request: Request, url: URL, ctx: ContextoRepartidor): Promise<Response | null> {
  const ruta = url.pathname;
  if (!ruta.startsWith('/api/repartidor/')) return null;

  if (ruta === '/api/repartidor/ruta' && request.method === 'GET') return rutaDeHoy(ctx);

  const accion = /^\/api\/repartidor\/pedidos\/([PHF]\d{6}-[0-9A-Z]{5})\/(entregado|no-se-pudo)$/.exec(ruta);
  if (!accion || request.method !== 'POST') return error(404, 'No encontrado.');
  const rechazo = esperadoComoEscritura(request, url);
  if (rechazo) return rechazo;
  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return error(400, 'Solicitud no válida.');

  const id = accion[1] as string;
  const opciones = { fecha: fechaHoraLocal(new Date(ctx.ahoraSegundos * 1000)).fecha, quien: `Repartidor: ${ctx.nombre}`, ahora: ctx.ahoraSegundos };
  const resultado =
    accion[2] === 'entregado'
      ? await ctx.entregas.entregar(id, { vacios: cuerpo.vacios as number, cobrado: cuerpo.cobrado as boolean }, opciones)
      : await ctx.entregas.noEntregado(id, { motivo: String(cuerpo.motivo ?? ''), detalle: typeof cuerpo.detalle === 'string' ? cuerpo.detalle : '' }, opciones);
  if (resultado.ok) return json({ ok: true });
  const [estado, mensaje] = MENSAJES_DE_ERROR[resultado.error];
  return error(estado, mensaje);
}
