/**
 * API de la ruta del administrador (fase C, D63). Solo para administradores: `index.ts` la atiende después de comprobar
 * la sesión. `url` ya viene sin el prefijo `/admin`.
 *
 * - GET  /api/ruta?fecha=YYYY-MM-DD[&modo=optima]  la ruta del día: la publicada si hay, o la que calcula el servidor.
 * - POST /api/ruta/evaluar   { fecha, orden }  kilómetros y cargas de un orden a mano, sin guardar nada.
 * - POST /api/ruta/publicar  { fecha, orden }  guarda el orden: es el que ve el repartidor.
 * - POST /api/puntos         { direccion, comuna, lat, lng }  un pin puesto a mano.
 *
 * El plan cubre las paradas que faltan por entregar y tienen ubicación (un punto exacto o el centro de su comuna). Las
 * ya entregadas salen de la ruta y se publican primero; las que no se pueden ubicar quedan al final, para que una
 * persona las revise. Nada de esto sale de Brunen (D32, D62).
 */

import { armarReparto } from '../reparto';
import { RepositorioPuntos, claveDePunto } from '../puntos';
import { MAXIMO_DE_PARADAS_PUBLICADAS, type RepositorioD1 } from '../repositorio';
import { ACTUM, CAPACIDAD_POR_VIAJE, PLANTA, evaluarOrden, optimizar, puntoDeParada, type ParadaParaRuta, type PlanDeRuta } from '../ruta';
import { error, esperadoComoEscritura, json, leerCuerpo } from './api';

export interface ContextoRuta {
  repositorio: RepositorioD1;
  puntos: RepositorioPuntos;
  ahoraSegundos: number;
}

const esFecha = (valor: unknown): valor is string => typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !Number.isNaN(Date.parse(`${valor}T00:00:00Z`));

interface ParadaConUbicacion {
  idPedido: string;
  nombre: string;
  direccion: string;
  comuna: string;
  bidones: number;
  estado: string;
  lat: number | null;
  lng: number | null;
  aproximado: boolean;
  origenPunto: string | null;
}

/** Las paradas del día con su ubicación, separadas en las que faltan por entregar, las entregadas y las sin ubicar. */
async function cargarDelDia(ctx: ContextoRuta, fecha: string) {
  const pedidos = await ctx.repositorio.pedidosDelDia(fecha);
  const reparto = armarReparto(pedidos, fecha);
  const conocidos = await ctx.puntos.deDirecciones(reparto.paradas.map((p) => ({ direccion: p.direccion, comuna: p.comuna })));
  const paradas: ParadaConUbicacion[] = [];
  const paraRuta: ParadaParaRuta[] = [];
  const entregadas: string[] = [];
  const sinUbicar: string[] = [];
  for (const parada of reparto.paradas) {
    const exacto = parada.direccion.trim() ? (conocidos.get(claveDePunto(parada.direccion, parada.comuna)) ?? null) : null;
    const ubicacion = puntoDeParada(exacto, parada.comuna);
    paradas.push({
      idPedido: parada.idPedido,
      nombre: parada.nombre,
      direccion: parada.direccion,
      comuna: parada.comuna,
      bidones: parada.totalBidones,
      estado: parada.estado,
      lat: ubicacion?.punto.lat ?? null,
      lng: ubicacion?.punto.lng ?? null,
      aproximado: ubicacion?.aproximado ?? false,
      origenPunto: exacto?.origen ?? null,
    });
    if (parada.estado === 'Entregado') entregadas.push(parada.idPedido);
    else if (!ubicacion) sinUbicar.push(parada.idPedido);
    else paraRuta.push({ id: parada.idPedido, punto: ubicacion.punto, bidones: parada.totalBidones });
  }
  const sinOrden = new Set(pedidos.filter((p) => p.ordenRuta === null).map((p) => p.id));
  return { reparto, paradas, paraRuta, entregadas, sinUbicar, sinOrden };
}

/**
 * El orden publicado de las paradas que faltan. Null si no hay uno o si alguna parada no lo tiene (llegó un pedido
 * después de publicar, o se ubicó una que estaba sin ubicar): el repartidor la vería al final, sin que nadie lo decidiera.
 */
function ordenPublicado(datos: Awaited<ReturnType<typeof cargarDelDia>>): string[] | null {
  if (!datos.reparto.publicada || datos.paraRuta.some((p) => datos.sinOrden.has(p.id))) return null;
  const faltan = new Set(datos.paraRuta.map((p) => p.id));
  return datos.reparto.paradas.map((p) => p.idPedido).filter((id) => faltan.has(id));
}

/** `sigueLaPublicada`: el plan es justo el orden que ve el repartidor (no hay un pedido nuevo ni un cambio sin publicar). */
function respuesta(fecha: string, datos: Awaited<ReturnType<typeof cargarDelDia>>, plan: PlanDeRuta, sigueLaPublicada = false) {
  const cargaDe = new Map(plan.cargas.flatMap((c) => c.paradas.map((id) => [id, c.numero] as const)));
  return {
    fecha,
    publicada: datos.reparto.publicada,
    sigueLaPublicada,
    planta: PLANTA,
    actum: ACTUM,
    capacidad: CAPACIDAD_POR_VIAJE,
    plan,
    paradas: datos.paradas.map((p) => ({ ...p, carga: cargaDe.get(p.idPedido) ?? null })),
    entregadas: datos.entregadas,
    sinUbicar: datos.sinUbicar,
    /** Los kilómetros y los minutos son por línea recta con un factor de rodeo: sirven para comparar órdenes, no para prometer horas. */
    referencial: true,
  };
}

/** Devuelve null si la ruta no es de la ruta ni de los puntos. */
export async function manejarRuta(request: Request, url: URL, ctx: ContextoRuta): Promise<Response | null> {
  const ruta = url.pathname;
  if (ruta !== '/api/ruta' && !ruta.startsWith('/api/ruta/') && ruta !== '/api/puntos') return null;

  if (ruta === '/api/ruta' && request.method === 'GET') {
    const fecha = url.searchParams.get('fecha');
    if (!esFecha(fecha)) return error(400, 'Fecha no válida.');
    const datos = await cargarDelDia(ctx, fecha);
    const publicado = url.searchParams.get('modo') === 'optima' ? null : ordenPublicado(datos);
    let plan: PlanDeRuta | null = null;
    if (publicado && publicado.length === datos.paraRuta.length) {
      try {
        plan = evaluarOrden(datos.paraRuta, publicado);
      } catch {
        plan = null; // el orden publicado ya no calza con las paradas: se calcula de nuevo
      }
    }
    if (plan) return json(respuesta(fecha, datos, plan, true));
    return json(respuesta(fecha, datos, optimizar(datos.paraRuta)));
  }

  if (request.method !== 'POST') return error(404, 'No encontrado.');
  const rechazo = esperadoComoEscritura(request, url);
  if (rechazo) return rechazo;
  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return error(400, 'Solicitud no válida.');

  if (ruta === '/api/puntos') {
    const { direccion, comuna, lat, lng } = cuerpo;
    if (typeof direccion !== 'string' || typeof comuna !== 'string' || typeof lat !== 'number' || typeof lng !== 'number') return error(400, 'Solicitud no válida.');
    const resultado = await ctx.puntos.guardar(direccion, comuna, { lat, lng, origen: 'manual' }, ctx.ahoraSegundos);
    return resultado === 'guardado' ? json({ ok: true }) : error(422, 'Ese punto no está en la Región Metropolitana o la dirección está vacía.');
  }

  if ((ruta === '/api/ruta/evaluar' || ruta === '/api/ruta/publicar') && esFecha(cuerpo.fecha) && Array.isArray(cuerpo.orden) && cuerpo.orden.every((id) => typeof id === 'string')) {
    const fecha = cuerpo.fecha;
    const datos = await cargarDelDia(ctx, fecha);
    let plan: PlanDeRuta;
    try {
      plan = evaluarOrden(datos.paraRuta, cuerpo.orden as string[]);
    } catch {
      return error(422, 'El orden no coincide con las paradas de ese día: actualiza la ruta y vuelve a intentar.');
    }
    if (ruta === '/api/ruta/evaluar') return json(respuesta(fecha, datos, plan));
    // Primero las ya entregadas, después la ruta, y al final las que no se pudieron ubicar.
    const ids = [...datos.entregadas, ...plan.orden, ...datos.sinUbicar];
    if (ids.length > MAXIMO_DE_PARADAS_PUBLICADAS) return error(422, `La ruta tiene más de ${MAXIMO_DE_PARADAS_PUBLICADAS} paradas: el repartidor las verá por comuna.`);
    await ctx.repositorio.publicarOrdenDeRuta(fecha, ids);
    return json({ ok: true, paradas: datos.entregadas.length + plan.orden.length + datos.sinUbicar.length });
  }
  return error(400, 'Solicitud no válida.');
}
