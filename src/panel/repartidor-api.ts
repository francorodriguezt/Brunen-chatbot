/**
 * API del repartidor (fase D, D61). Solo para un repartidor con su sesión (RUT y clave): `index.ts` lo comprueba antes.
 *
 * - GET  /api/repartidor/ruta                         las paradas de hoy, en el orden del reparto y por carga.
 * - POST /api/repartidor/pedidos/:id/entregado        { vacios, cobrado, fecha?, marcadoEn? }
 * - POST /api/repartidor/pedidos/:id/no-se-pudo       { motivo, detalle, fecha?, marcadoEn? }
 * - POST /api/repartidor/ruta/vista                   { version }  la app tiene esa versión de la ruta de hoy (D94)
 *
 * Lo que ve es lo que hoy se le escribe a mano por WhatsApp (nombre, dirección, teléfono, pedido, forma de pago y lo que
 * hay que cobrar en efectivo, notas para el reparto), y nada más: ni las observaciones internas ni lo que escribió el
 * cliente. "Hoy" es la fecha de Santiago: solo ve la ruta de hoy.
 *
 * Una marca hecha sin señal puede llegar tarde (D84): trae la fecha de su ruta y la hora del teléfono. Se acepta para
 * la ruta de ese día si es de hoy o de hasta 3 días atrás (un sábado sin señal que llega el lunes), nunca de un día
 * futuro; y se anota con la hora del teléfono solo si llegó con atraso. Sin esos datos, vale hoy, como antes.
 */

import { fechaHoraLocal, sumarDias } from '../despacho';
import { MOTIVOS_NO_ENTREGA, type EstadoDeEntrega, type RepositorioEntregas } from '../entregas';
import { COORDENADAS_DE_DEPOSITO, depositoQueDesviaMenos, enlacesDeMaps } from '../navegacion';
import type { TipoBidon } from '../precios';
import { PRECISION_BUENA_M, RepositorioPuntos, claveDePunto } from '../puntos';
import { puntoDeParada } from '../ruta';
import { armarReparto, cambiosDesdeLaPublicacion, nombrarCambios, vaciosEsperados } from '../reparto';
import type { RepositorioD1 } from '../repositorio';
import { validarPosiciones, type RepositorioSeguimiento } from '../seguimiento';
import { error, esperadoComoEscritura, json, leerCuerpo } from './api';

export interface ContextoRepartidor {
  repositorio: RepositorioD1;
  entregas: RepositorioEntregas;
  /** Puntos del mapa (D63): el teléfono enseña el de cada dirección al entregar. */
  puntos: RepositorioPuntos;
  ahoraSegundos: number;
  /** Nombre del repartidor, para el historial del pedido. */
  nombre: string;
  /** Su id: el consentimiento, la jornada y las posiciones son de él (fase E, D80). */
  usuarioId: number;
  seguimiento: RepositorioSeguimiento;
}

const MENSAJES_DE_ERROR = {
  no_existe: [404, 'Ese pedido ya no existe.'],
  no_es_de_hoy: [409, 'Ese pedido no es de la ruta de ese día: puede que lo hayan cambiado de fecha.'],
  no_disponible: [409, 'Ese pedido ya no está en la ruta: puede que lo hayan cambiado o cancelado.'],
  datos_invalidos: [422, 'Revisa lo que marcaste.'],
} as const;

/** Hasta cuántos días atrás vale una marca que llegó tarde (D84). */
export const DIAS_PARA_MARCAS_ATRASADAS = 3;
/** Una marca que llega antes de esto se anota con la hora del servidor; después, con la del teléfono. */
const ATRASO_MINIMO_S = 120;
const FECHA = /^\d{4}-\d{2}-\d{2}$/;

const MARCA_FUERA_DE_PLAZO = `Esa marca es de una ruta de hace más de ${DIAS_PARA_MARCAS_ATRASADAS} días: ya no se anota desde la app. Avísale a la oficina.`;

/**
 * El día y la hora de una marca del repartidor (D84). Sin la fecha de su ruta (la app anterior) o con una que no existe,
 * vale hoy, a esta hora. Con una fecha real fuera de plazo devuelve null y la marca se rechaza (D93): si se anotara para
 * hoy, una marca vieja caería en un pedido que justo se reagendó para hoy.
 */
export function opcionesDeMarca(cuerpo: Record<string, unknown>, ahoraSegundos: number, nombre: string) {
  const hoy = fechaHoraLocal(new Date(ahoraSegundos * 1000)).fecha;
  const pedida = cuerpo.fecha;
  const conFecha = typeof pedida === 'string' && FECHA.test(pedida) && sumarDias(pedida, 0) === pedida;
  if (conFecha && (pedida > hoy || pedida < sumarDias(hoy, -DIAS_PARA_MARCAS_ATRASADAS))) return null;
  const fecha = conFecha ? pedida : hoy;
  const marcado = cuerpo.marcadoEn;
  const conAtraso =
    typeof marcado === 'number' &&
    Number.isInteger(marcado) &&
    marcado <= ahoraSegundos - ATRASO_MINIMO_S &&
    marcado >= ahoraSegundos - (DIAS_PARA_MARCAS_ATRASADAS + 1) * 86400;
  return { fecha, quien: `Repartidor: ${nombre}`, ahora: ahoraSegundos, ...(conAtraso ? { hecho: marcado } : {}) };
}

function estadoDeParada(entrega: EstadoDeEntrega | undefined, estadoPedido: string): 'pendiente' | 'entregado' | 'no_se_pudo' {
  if (estadoPedido === 'Entregado') return 'entregado';
  return entrega?.noEntregado ? 'no_se_pudo' : 'pendiente';
}

async function rutaDeHoy(ctx: ContextoRepartidor): Promise<Response> {
  const hoy = fechaHoraLocal(new Date(ctx.ahoraSegundos * 1000)).fecha;
  const pedidos = await ctx.repositorio.pedidosDelDia(hoy);
  const porId = new Map(pedidos.map((p) => [p.id, p]));
  const entregas = await ctx.entregas.deDia(hoy);
  const viajes = await ctx.repositorio.viajesPublicados(hoy);
  const reparto = armarReparto(pedidos, hoy, viajes);
  const conocidos = await ctx.puntos.deDirecciones(reparto.paradas.map((p) => ({ direccion: p.direccion, comuna: p.comuna })));
  const paradas = reparto.paradas.map((parada) => {
    const pedido = porId.get(parada.idPedido);
    const entrega = entregas.get(parada.idPedido);
    const estado = estadoDeParada(entrega, parada.estado);
    const aCobrar = pedido?.formaPago === 'efectivo' ? parada.cobrarEnEfectivo : null;
    const exacto = parada.direccion.trim() ? conocidos.get(claveDePunto(parada.direccion, parada.comuna)) : undefined;
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
      // Lo que se propone en "Vacíos que retiraste": uno por bidón, más los que debía (D72).
      vaciosEsperados: vaciosEsperados(parada),
      notas: parada.notas,
      formaPago: pedido?.formaPago ?? '',
      // El valor del pedido, solo de referencia (D111): lo que debe cobrar sigue siendo `cobrar`, que descuenta lo ya pagado.
      total: parada.total,
      pagado: pedido?.montoPagado ?? 0,
      estadoPago: pedido?.estadoPago ?? 'pendiente',
      cobrar: estado === 'entregado' ? null : aCobrar,
      // Para "Corregir" una entrega: cuánto se cobra en efectivo y si ya lo cobró, para no perder el cobro.
      montoEfectivo: pedido?.formaPago === 'efectivo' && parada.total !== null ? Math.max(0, parada.total - (pedido.montoPagado - (entrega?.cobrado ?? 0))) || null : null,
      cobrado: entrega?.cobrado ?? null,
      estado,
      vaciosRetirados: entrega?.vaciosRetirados ?? null,
      motivo: estado === 'no_se_pudo' ? (entrega?.noEntregado?.motivo ?? null) : null,
      // Solo el punto exacto: Navegar con uno aproximado llevaría al centro de la comuna. `afinar`: el punto vino de un GPS
      // poco preciso, así que al entregar conviene leerlo de nuevo (un pin puesto a mano nunca se afina).
      punto: exacto ? { lat: exacto.lat, lng: exacto.lng, afinar: exacto.origen === 'cliente' || (exacto.origen === 'repartidor' && (exacto.precisionM ?? Infinity) > PRECISION_BUENA_M) } : null,
    };
  });
  // Por viaje (D67): cuántos bidones de cada tamaño cargar, dónde recargar antes y la ruta del viaje en Google Maps.
  const exactoDe = (p: { direccion: string; comuna: string }) =>
    p.direccion.trim() ? (conocidos.get(claveDePunto(p.direccion, p.comuna)) ?? null) : null;
  const puntoDe = (p: { direccion: string; comuna: string }) => puntoDeParada(exactoDe(p), p.comuna)?.punto ?? null;
  const cargas = reparto.cargas.map((carga) => {
    const delViaje = reparto.paradas.filter((p) => p.carga === carga.numero);
    const bidones: Record<TipoBidon, number> = { '20L': 0, '12L': 0, '10L': 0 };
    for (const p of delViaje) for (const tipo of Object.keys(bidones) as TipoBidon[]) bidones[tipo] += p.bidones[tipo] ?? 0;
    const anterior = reparto.paradas.filter((p) => p.carga === carga.numero - 1).at(-1);
    const desde = anterior ? puntoDe(anterior) : null;
    const hasta = delViaje[0] ? puntoDe(delViaje[0]) : null;
    const recargaEn = carga.numero > 1 && desde && hasta ? depositoQueDesviaMenos(desde, hasta) : null;
    const pendientes = delViaje.filter((p) => estadoDeParada(entregas.get(p.idPedido), p.estado) === 'pendiente');
    const empezo = pendientes.length < delViaje.length;
    const mapas = enlacesDeMaps(
      pendientes.map((p) => ({ punto: exactoDe(p), direccion: p.direccion, comuna: p.comuna })),
      recargaEn && !empezo ? COORDENADAS_DE_DEPOSITO[recargaEn] : null,
    );
    return { ...carga, bidones, recargaEn, mapas };
  });
  return json({
    fecha: hoy,
    // Sin ruta publicada las paradas van por comuna: no hay "siguiente" (D97).
    publicada: reparto.publicada,
    paradas,
    cargas,
    carga: reparto.carga,
    totalBidones: reparto.totalBidones,
    motivos: Object.entries(MOTIVOS_NO_ENTREGA).map(([valor, texto]) => ({ valor, texto })),
    ubicacion: await estadoDeUbicacion(ctx, hoy),
    // D102: lo que cambió desde la publicación sin volver a publicar (un pedido nuevo o uno que ya no va).
    cambiosSinPublicar: await nombrarCambios(ctx.repositorio, cambiosDesdeLaPublicacion(reparto, viajes)).catch(() => null),
    // D94: la versión publicada y la que confirmó su app; con una nueva sin confirmar, la app avisa del cambio.
    publicacion: await ctx.repositorio.publicacionDe(hoy).then((p) => (p ? { version: p.version, publicadaEn: p.publicadaEn, vista: p.vistaVersion } : null)),
  });
}

/** Lo que su app necesita para mostrar "Iniciar ruta" o "Terminar jornada" y si debe pedir el consentimiento (D80). */
async function estadoDeUbicacion(ctx: ContextoRepartidor, hoy: string) {
  // Si falla (por ejemplo, antes de aplicar la migración 0015), la ruta se ve igual, sin la tarjeta de ubicación.
  try {
    const jornada = await ctx.seguimiento.jornadaDeHoy(ctx.usuarioId, hoy);
    return {
      consentimiento: await ctx.seguimiento.tieneConsentimiento(ctx.usuarioId),
      jornada: jornada ? { iniciadaEn: jornada.iniciadaEn, terminadaEn: jornada.terminadaEn } : null,
    };
  } catch (falla) {
    console.error('No se pudo leer el estado de la ubicación:', falla instanceof Error ? falla.message : falla);
    return null;
  }
}

/**
 * Fase E (D80): consentimiento, jornada y posiciones. Devuelve null si la ruta no es de esto.
 * - POST /api/repartidor/ubicacion   { acepta }            dar o retirar el consentimiento (retirar borra sus posiciones)
 * - POST /api/repartidor/jornada     { accion }            "iniciar" o "terminar"
 * - POST /api/repartidor/posiciones  { posiciones: [...] } lo que midió el teléfono con la app abierta
 */
async function manejarSeguimiento(ruta: string, cuerpo: Record<string, unknown>, ctx: ContextoRepartidor): Promise<Response | null> {
  const hoy = fechaHoraLocal(new Date(ctx.ahoraSegundos * 1000)).fecha;
  if (ruta === '/api/repartidor/ubicacion') {
    if (typeof cuerpo.acepta !== 'boolean') return error(400, 'Solicitud no válida.');
    await ctx.seguimiento.decidir(ctx.usuarioId, cuerpo.acepta, ctx.ahoraSegundos);
    return json({ ok: true, ubicacion: await estadoDeUbicacion(ctx, hoy) });
  }
  if (ruta === '/api/repartidor/jornada') {
    if (cuerpo.accion === 'iniciar') await ctx.seguimiento.iniciar(ctx.usuarioId, hoy, ctx.ahoraSegundos);
    else if (cuerpo.accion === 'terminar') await ctx.seguimiento.terminar(ctx.usuarioId, hoy, ctx.ahoraSegundos);
    else return error(400, 'Solicitud no válida.');
    return json({ ok: true, ubicacion: await estadoDeUbicacion(ctx, hoy) });
  }
  if (ruta === '/api/repartidor/posiciones') {
    const posiciones = validarPosiciones(cuerpo.posiciones, ctx.ahoraSegundos);
    if (!posiciones) return error(400, 'Solicitud no válida.');
    const resultado = await ctx.seguimiento.guardarPosiciones(ctx.usuarioId, posiciones, ctx.ahoraSegundos);
    // 409: la app deja de mandar (no aceptó, o no hay jornada abierta). No es un error del teléfono.
    if (resultado === 'sin_consentimiento') return error(409, 'No compartes tu ubicación.');
    if (resultado === 'sin_jornada') return error(409, 'No hay una jornada abierta.');
    return json({ ok: true, guardadas: resultado });
  }
  return null;
}

/**
 * Al entregar, el teléfono manda dónde está (una sola lectura, no un seguimiento). Si el GPS es preciso, esa dirección
 * aprende su punto; un pin puesto a mano nunca se pisa. Es una ayuda: si falla, la entrega ya quedó anotada.
 */
async function aprenderPunto(ctx: ContextoRepartidor, id: string, cuerpo: Record<string, unknown>): Promise<void> {
  const { lat, lng, precision } = cuerpo;
  if (typeof lat !== 'number' || typeof lng !== 'number' || typeof precision !== 'number') return;
  try {
    const pedido = await ctx.repositorio.obtenerPedido(id);
    if (pedido) await ctx.puntos.guardar(pedido.direccion, pedido.comuna, { lat, lng, origen: 'repartidor', precisionM: precision }, ctx.ahoraSegundos);
  } catch (falla) {
    console.error('No se pudo guardar el punto de la entrega:', falla instanceof Error ? falla.message : falla);
  }
}

/** La app confirma que tiene esa versión de la ruta de hoy (D94). */
async function confirmarVersion(request: Request, url: URL, ctx: ContextoRepartidor): Promise<Response> {
  const rechazo = esperadoComoEscritura(request, url);
  if (rechazo) return rechazo;
  const cuerpo = await leerCuerpo(request);
  if (!cuerpo || !Number.isInteger(cuerpo.version) || (cuerpo.version as number) < 1) return error(400, 'Solicitud no válida.');
  const hoy = fechaHoraLocal(new Date(ctx.ahoraSegundos * 1000)).fecha;
  const ok = await ctx.repositorio.confirmarPublicacion(hoy, cuerpo.version as number, ctx.ahoraSegundos).catch(() => false);
  return ok ? json({ ok: true }) : error(409, 'Esa versión de la ruta ya no está: actualiza la ruta.');
}

/** Devuelve null si la ruta no es del repartidor. */
export async function manejarRepartidor(request: Request, url: URL, ctx: ContextoRepartidor): Promise<Response | null> {
  const ruta = url.pathname;
  if (!ruta.startsWith('/api/repartidor/')) return null;

  if (ruta === '/api/repartidor/ruta' && request.method === 'GET') return rutaDeHoy(ctx);
  if (ruta === '/api/repartidor/ruta/vista' && request.method === 'POST') return confirmarVersion(request, url, ctx);

  const accion = /^\/api\/repartidor\/pedidos\/([PHF]\d{6}-[0-9A-Z]{5})\/(entregado|no-se-pudo)$/.exec(ruta);
  const deSeguimiento = ruta === '/api/repartidor/ubicacion' || ruta === '/api/repartidor/jornada' || ruta === '/api/repartidor/posiciones';
  if ((!accion && !deSeguimiento) || request.method !== 'POST') return error(404, 'No encontrado.');
  const rechazo = esperadoComoEscritura(request, url);
  if (rechazo) return rechazo;
  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return error(400, 'Solicitud no válida.');
  if (!accion) return (await manejarSeguimiento(ruta, cuerpo, ctx)) ?? error(404, 'No encontrado.');

  const id = accion[1] as string;
  const opciones = opcionesDeMarca(cuerpo, ctx.ahoraSegundos, ctx.nombre);
  if (!opciones) return error(409, MARCA_FUERA_DE_PLAZO);
  const resultado =
    accion[2] === 'entregado'
      ? await ctx.entregas.entregar(id, { vacios: cuerpo.vacios as number, cobrado: cuerpo.cobrado as boolean, ...(typeof cuerpo.observacion === 'string' ? { observacion: cuerpo.observacion } : {}) }, opciones)
      : await ctx.entregas.noEntregado(id, { motivo: String(cuerpo.motivo ?? ''), detalle: typeof cuerpo.detalle === 'string' ? cuerpo.detalle : '' }, opciones);
  if (resultado.ok) {
    if (accion[2] === 'entregado') await aprenderPunto(ctx, id, cuerpo);
    return json({ ok: true });
  }
  const [estado, mensaje] = MENSAJES_DE_ERROR[resultado.error];
  return error(estado, mensaje);
}
