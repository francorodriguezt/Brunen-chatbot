/**
 * Rutas de las notificaciones del teléfono (D115). Solo para administradores: `index.ts` las atiende después de comprobar
 * la sesión. `url` ya viene sin el prefijo `/admin`.
 *
 *  GET  /api/push            { disponible, clavePublica, dispositivos }   si el servidor puede avisar y cuántos teléfonos tiene este correo
 *  POST /api/push/suscribir  { endpoint, keys: { p256dh, auth } }          activa los avisos en este dispositivo
 *  POST /api/push/baja       { endpoint }                                  los desactiva
 *  POST /api/push/prueba     {}                                            manda un aviso de prueba a los teléfonos de este correo
 */

import type { BaseDatos } from '../almacen';
import { RepositorioPush, clavesValidas, configPush, endpointValido, enviarAvisoPush, type EntornoPush } from '../push';
import { error, esperadoComoEscritura, json, leerCuerpo } from './api';

export interface ContextoPush {
  db: BaseDatos;
  entorno: EntornoPush;
  correo: string;
  ahoraSegundos: number;
}

export async function manejarPush(request: Request, url: URL, ctx: ContextoPush): Promise<Response | null> {
  const ruta = url.pathname;
  if (ruta !== '/api/push' && !ruta.startsWith('/api/push/')) return null;
  const config = configPush(ctx.entorno);
  const repositorio = new RepositorioPush(ctx.db);

  if (ruta === '/api/push' && request.method === 'GET') {
    return json({ disponible: config !== null, clavePublica: config?.clavePublica ?? null, dispositivos: (await repositorio.todas(ctx.correo)).length });
  }
  if (request.method !== 'POST') return null;
  const rechazo = esperadoComoEscritura(request, url);
  if (rechazo) return rechazo;

  if (ruta === '/api/push/suscribir') {
    if (!config) return error(503, 'Los avisos al teléfono todavía no están configurados en el servidor.');
    const cuerpo = await leerCuerpo(request);
    const claves = cuerpo?.keys as Record<string, unknown> | undefined;
    if (!cuerpo || !endpointValido(cuerpo.endpoint) || !claves || !clavesValidas(claves.p256dh, claves.auth)) return error(422, 'Ese dispositivo no se puede suscribir.');
    await repositorio.guardar({ endpoint: cuerpo.endpoint, p256dh: claves.p256dh as string, auth: claves.auth as string }, ctx.correo, ctx.ahoraSegundos);
    return json({ ok: true, dispositivos: (await repositorio.todas(ctx.correo)).length }, 201);
  }

  if (ruta === '/api/push/baja') {
    const cuerpo = await leerCuerpo(request);
    if (!cuerpo || typeof cuerpo.endpoint !== 'string') return error(400, 'Solicitud no válida.');
    await repositorio.borrar(cuerpo.endpoint, ctx.correo);
    return json({ ok: true });
  }

  if (ruta === '/api/push/prueba') {
    if (!config) return error(503, 'Los avisos al teléfono todavía no están configurados en el servidor.');
    const enviados = await enviarAvisoPush(
      ctx.db,
      config,
      { titulo: 'Brunen: prueba de avisos', cuerpo: 'Si ves esto, los avisos urgentes van a llegar a este teléfono.', etiqueta: 'brunen-prueba', url: '/admin/' },
      ctx.ahoraSegundos,
      ctx.correo,
    );
    return json({ ok: true, enviados });
  }
  return null;
}
