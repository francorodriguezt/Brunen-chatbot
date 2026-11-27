/**
 * Rutas de la pestaña Clientes (fase B, D53). Solo para administradores: `index.ts` las atiende después de comprobar
 * la sesión. `url` ya viene sin el prefijo `/admin`.
 *
 * Cada lectura de la lista asocia primero unos pocos pedidos nuevos a su cliente (`vincularPendientes`), así la
 * pestaña está al día aunque la tarea programada todavía no haya pasado.
 */

import { detectarComuna } from '../comunas';
import { fechaHoraLocal } from '../despacho';
import { claveDePunto, type RepositorioPuntos } from '../puntos';
import { CENTRO_DE_COMUNA } from '../ruta';
import type { RepositorioClientes } from '../fichas';
import type { RepositorioFijos } from '../fijos';
import type { RepositorioD1 } from '../repositorio';
import { normalizarTelefono } from '../whatsapp';
import { error, esperadoComoEscritura, json, leerCuerpo } from './api';

export interface ContextoClientes {
  clientes: RepositorioClientes;
  repositorio: RepositorioD1;
  /** Pedidos fijos (D59). */
  fijos: RepositorioFijos;
  /** Puntos exactos de las direcciones (D63): para el mapa de clientes. */
  puntos?: RepositorioPuntos;
  ahoraSegundos: number;
  /** Quién usa el panel: queda en el historial al borrar los datos de un cliente (D87). */
  correo?: string;
}

const MENSAJES = {
  no_existe: [404, 'Ese cliente ya no existe.'],
  datos_invalidos: [422, 'Revisa el nombre, el tipo de cliente, las notas, el precio especial ($100 a $20.000) y los vacíos (0 a 500).'],
  telefono_invalido: [422, 'El teléfono no es válido. Escríbelo con el 9 adelante, por ejemplo 9 1234 5678.'],
  telefono_de_otro: [409, 'Ese teléfono ya es de otro cliente. Si son el mismo, usa "Unir con otro cliente".'],
  mismo_cliente: [422, 'Es el mismo cliente.'],
  pedidos_vivos: [409, 'Tiene pedidos sin entregar: entrégalos o cancélalos antes de borrar sus datos.'],
} as const;

function errorDeCliente(codigo: keyof typeof MENSAJES, otroId?: number): Response {
  const [estado, mensaje] = MENSAJES[codigo];
  return otroId === undefined ? error(estado, mensaje) : new Response(JSON.stringify({ error: mensaje, otroId }), { status: estado, headers: { 'content-type': 'application/json; charset=utf-8' } });
}

/** Asociar pedidos es una ayuda: si falla (la base, el tope de consultas), la lista se muestra igual con lo que hay. */
async function vincularSinFallar(clientes: RepositorioClientes, ahora: number): Promise<void> {
  try {
    await clientes.vincularPendientes(ahora);
  } catch (falla) {
    console.error('No se pudieron asociar pedidos a clientes:', falla instanceof Error ? falla.message : falla);
  }
}

/** Devuelve null si la ruta no es de clientes. */
export async function manejarClientes(request: Request, url: URL, ctx: ContextoClientes): Promise<Response | null> {
  const ruta = url.pathname;
  if (ruta !== '/api/clientes' && !ruta.startsWith('/api/clientes/')) return null;
  // `/api/clientes/anterior` es de la API de pedidos (reconocer al cliente al anotar a mano): no se toca aquí.
  if (ruta === '/api/clientes/anterior') return null;
  const { clientes, ahoraSegundos } = ctx;

  if (ruta === '/api/clientes' && request.method === 'GET') {
    await vincularSinFallar(clientes, ahoraSegundos);
    return json({ clientes: await clientes.listar() });
  }

  // A quién le toca pedir según su ritmo (D58). Lee los pedidos una vez: se pide con un botón, no al abrir la pestaña.
  // Clientes por comuna y en el mapa (D75): cuántos hay en cada comuna (con el centro de la comuna) y, de los que tienen
  // el punto exacto guardado por el repartidor o a mano, dónde están. No viajan teléfonos ni direcciones.
  if (ruta === '/api/clientes/mapa' && request.method === 'GET') {
    const lista = await clientes.paraMapa();
    const exactos = ctx.puntos ? await ctx.puntos.deDirecciones(lista) : new Map();
    const porComuna = new Map<string, number>();
    const puntos: Array<{ id: number; nombre: string; lat: number; lng: number }> = [];
    for (const c of lista) {
      const comuna = detectarComuna(c.comuna)?.nombre ?? (c.comuna.trim() || 'Sin comuna');
      porComuna.set(comuna, (porComuna.get(comuna) ?? 0) + 1);
      const exacto = c.direccion.trim() ? exactos.get(claveDePunto(c.direccion, c.comuna)) : undefined;
      if (exacto) puntos.push({ id: c.id, nombre: c.nombre, lat: exacto.lat, lng: exacto.lng });
    }
    const comunas = [...porComuna]
      .map(([comuna, cantidad]) => ({ comuna, clientes: cantidad, centro: CENTRO_DE_COMUNA[comuna] ?? null }))
      .sort((a, b) => b.clientes - a.clientes || a.comuna.localeCompare(b.comuna, 'es'));
    return json({ total: lista.length, comunas, puntos });
  }

  if (ruta === '/api/clientes/por-pedir' && request.method === 'GET') {
    return json(await clientes.porPedir(fechaHoraLocal(new Date(ahoraSegundos * 1000)).fecha));
  }

  const ficha = /^\/api\/clientes\/(\d{1,9})$/.exec(ruta);
  if (ficha && request.method === 'GET') {
    const id = Number(ficha[1]);
    const datos = await clientes.ficha(id);
    if (!datos) return errorDeCliente('no_existe');
    return json({ cliente: datos, pedidos: await ctx.repositorio.pedidosDeCliente(id, 30), fijo: await ctx.fijos.deCliente(id) });
  }

  if (request.method !== 'POST') return error(404, 'No encontrado.');
  const rechazo = esperadoComoEscritura(request, url);
  if (rechazo) return rechazo;
  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return error(400, 'Solicitud no válida.');

  // La búsqueda va por POST: el texto (un nombre, un teléfono) no queda en la dirección ni en los registros.
  if (ruta === '/api/clientes/buscar') {
    if (typeof cuerpo.texto !== 'string') return error(400, 'Solicitud no válida.');
    await vincularSinFallar(clientes, ahoraSegundos);
    return json({ clientes: await clientes.listar(cuerpo.texto) });
  }

  const accion = /^\/api\/clientes\/(\d{1,9})\/(editar|telefonos|unir|fijo|olvidar)$/.exec(ruta);
  if (!accion) return error(404, 'No encontrado.');
  const id = Number(accion[1]);

  if (accion[2] === 'fijo') {
    const r = await ctx.fijos.guardar(id, cuerpo, ahoraSegundos);
    if (r.ok) return json({ ok: true, fijo: r.fijo });
    return error(422, r.error === 'sin_telefono' ? 'Ese cliente no tiene teléfono: agrégale uno primero.' : 'Revisa el tamaño, la cantidad (1 a 200), cada cuántos días (1 a 60) y la próxima fecha.');
  }

  // Borrar los datos de un cliente que lo pide (D87). No se puede deshacer: la pantalla pide confirmar y el cuerpo lo repite.
  if (accion[2] === 'olvidar') {
    if (cuerpo.confirmar !== true) return error(400, 'Solicitud no válida.');
    const r = await clientes.olvidar(id, ctx.correo ?? 'panel', ahoraSegundos);
    return r.ok ? json({ ok: true, ...r.valor }) : errorDeCliente(r.error);
  }

  if (accion[2] === 'editar') {
    const r = await clientes.editar(
      id,
      {
        nombre: cuerpo.nombre,
        tipoCliente: cuerpo.tipoCliente,
        notas: cuerpo.notas,
        precioEspecial20L: cuerpo.precioEspecial20L,
        vaciosPendientes: cuerpo.vaciosPendientes,
        bloqueado: cuerpo.bloqueado,
      },
      ahoraSegundos,
    );
    return r.ok ? json({ ok: true }) : errorDeCliente(r.error);
  }
  if (accion[2] === 'telefonos') {
    const telefono = typeof cuerpo.telefono === 'string' ? normalizarTelefono(cuerpo.telefono) : null;
    if (!telefono) return errorDeCliente('telefono_invalido');
    const r = await clientes.agregarTelefono(id, telefono, ahoraSegundos);
    return r.ok ? json({ ok: true }) : errorDeCliente(r.error, r.otroId);
  }
  // unir: llega el id del otro cliente, o un teléfono suyo.
  let otro = Number.isInteger(cuerpo.otroId) ? (cuerpo.otroId as number) : null;
  if (otro === null && typeof cuerpo.telefono === 'string') {
    const telefono = normalizarTelefono(cuerpo.telefono);
    if (!telefono) return errorDeCliente('telefono_invalido');
    otro = await clientes.clienteDeTelefono(telefono);
    if (otro === null) return error(404, 'No hay ningún cliente con ese teléfono.');
  }
  if (otro === null) return error(400, 'Solicitud no válida.');
  const r = await clientes.unir(id, otro, ahoraSegundos);
  return r.ok ? json({ ok: true }) : errorDeCliente(r.error);
}
