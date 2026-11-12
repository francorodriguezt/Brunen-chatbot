/**
 * Rutas de la pestaña Clientes (fase B, D53). Solo para administradores: `index.ts` las atiende después de comprobar
 * la sesión. `url` ya viene sin el prefijo `/admin`.
 *
 * Cada lectura de la lista asocia primero unos pocos pedidos nuevos a su cliente (`vincularPendientes`), así la
 * pestaña está al día aunque la tarea programada todavía no haya pasado.
 */

import type { RepositorioClientes } from '../fichas';
import type { RepositorioD1 } from '../repositorio';
import { normalizarTelefono } from '../whatsapp';
import { error, esperadoComoEscritura, json, leerCuerpo } from './api';

export interface ContextoClientes {
  clientes: RepositorioClientes;
  repositorio: RepositorioD1;
  ahoraSegundos: number;
}

const MENSAJES = {
  no_existe: [404, 'Ese cliente ya no existe.'],
  datos_invalidos: [422, 'Revisa el nombre, el tipo de cliente y las notas.'],
  telefono_invalido: [422, 'El teléfono no es válido. Escríbelo con el 9 adelante, por ejemplo 9 1234 5678.'],
  telefono_de_otro: [409, 'Ese teléfono ya es de otro cliente. Si son el mismo, usa "Unir con otro cliente".'],
  mismo_cliente: [422, 'Es el mismo cliente.'],
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

  const ficha = /^\/api\/clientes\/(\d{1,9})$/.exec(ruta);
  if (ficha && request.method === 'GET') {
    const id = Number(ficha[1]);
    const datos = await clientes.ficha(id);
    if (!datos) return errorDeCliente('no_existe');
    return json({ cliente: datos, pedidos: await ctx.repositorio.pedidosDeCliente(id, 30) });
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

  const accion = /^\/api\/clientes\/(\d{1,9})\/(editar|telefonos|unir)$/.exec(ruta);
  if (!accion) return error(404, 'No encontrado.');
  const id = Number(accion[1]);

  if (accion[2] === 'editar') {
    const r = await clientes.editar(id, { nombre: cuerpo.nombre, tipoCliente: cuerpo.tipoCliente, notas: cuerpo.notas }, ahoraSegundos);
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
