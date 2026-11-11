/**
 * Entrar y salir de la aplicación, y la gestión de usuarios (D51). Aquí está solo lo que tiene que ver con HTTP: las
 * cookies, las respuestas y los permisos de cada ruta. Las reglas (claves, bloqueos, sesiones) viven en `cuentas.ts`.
 *
 * Dos puertas:
 *  - Pública (`/api/sesion…`): la del repartidor. RUT y clave.
 *  - De administración (`/admin/api/sesion…`): solo se llega habiendo pasado por Cloudflare Access; además del RUT y
 *    la clave, el usuario tiene que ser el dueño del correo de esa sesión de Access.
 */

import type { RepositorioD1 } from '../repositorio';
import { error, esperadoComoEscritura, json, leerCuerpo } from './api';
import { DURACION_RECORDADA_SEGUNDOS, type Cuentas, type ErrorDeCuenta, type ResultadoDeIngreso, type Rol, type Usuario } from './cuentas';
import { formatearRut } from './rut';

export const COOKIE_DE_SESION = 'brunen_sesion';

export interface ContextoDeIngreso {
  cuentas: Cuentas;
  repositorio: RepositorioD1;
  ahoraSegundos: number;
  /** false solo en localhost, donde no hay HTTPS: ahí la cookie no puede llevar `Secure`. */
  cookieSegura: boolean;
}

export function tokenDeCookie(request: Request): string | null {
  const encontrado = /(?:^|;\s*)brunen_sesion=([A-Za-z0-9_-]{20,200})(?:;|$)/.exec(request.headers.get('cookie') ?? '');
  return encontrado?.[1] ?? null;
}

/**
 * HttpOnly: el código de la página no puede leerla (un script inyectado no se la lleva). SameSite=Strict: no viaja en
 * solicitudes que nacen en otro sitio. Con "recordar" lleva fecha de vencimiento; sin ella, se va al cerrar el navegador.
 */
export function cookieDeSesion(token: string, recordar: boolean, segura: boolean): string {
  return [`${COOKIE_DE_SESION}=${token}`, 'Path=/', 'HttpOnly', 'SameSite=Strict', segura ? 'Secure' : '', recordar ? `Max-Age=${DURACION_RECORDADA_SEGUNDOS}` : '']
    .filter(Boolean)
    .join('; ');
}

export function cookieBorrada(segura: boolean): string {
  return [`${COOKIE_DE_SESION}=`, 'Path=/', 'HttpOnly', 'SameSite=Strict', segura ? 'Secure' : '', 'Max-Age=0'].filter(Boolean).join('; ');
}

/** "Android · Chrome": lo justo para que un administrador reconozca de qué dispositivo es una sesión. */
export function dispositivoDe(agente: string | null): string {
  const ua = agente ?? '';
  const sistema = /iPhone|iPad|iPod/.test(ua) ? 'iPhone' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : '';
  const navegador = /Edg\//.test(ua) ? 'Edge' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\/|CriOS/.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return [sistema, navegador].filter(Boolean).join(' · ') || 'Dispositivo desconocido';
}

const MENSAJES: Readonly<Record<ErrorDeCuenta, { estado: number; mensaje: string }>> = {
  rut_invalido: { estado: 422, mensaje: 'El RUT no es válido. Revisa los números y el dígito verificador.' },
  clave_invalida: { estado: 422, mensaje: 'La clave tiene que ser de 4 dígitos.' },
  clave_debil: { estado: 422, mensaje: 'Esa clave es muy fácil de adivinar. Evita números repetidos, escaleras (1234) y los números de tu RUT.' },
  nombre_invalido: { estado: 422, mensaje: 'Escribe el nombre (entre 2 y 60 letras).' },
  correo_invalido: { estado: 422, mensaje: 'El correo no es válido.' },
  rut_repetido: { estado: 409, mensaje: 'Ya hay un usuario con ese RUT.' },
  correo_repetido: { estado: 409, mensaje: 'Ya hay un usuario con ese correo.' },
  no_existe: { estado: 404, mensaje: 'Ese usuario ya no existe.' },
};

const errorDeCuenta = (codigo: ErrorDeCuenta): Response => error(MENSAJES[codigo].estado, MENSAJES[codigo].mensaje);

const publico = (usuario: Usuario) => ({ nombre: usuario.nombre, rol: usuario.rol });

function conCookie(respuesta: Response, cookie: string): Response {
  respuesta.headers.append('set-cookie', cookie);
  return respuesta;
}

function minutosHasta(hasta: number, ahora: number): string {
  const minutos = Math.max(1, Math.ceil((hasta - ahora) / 60));
  if (minutos < 90) return minutos === 1 ? '1 minuto' : `${minutos} minutos`;
  const horas = Math.ceil(minutos / 60);
  return `${horas} horas`;
}

async function responderIngreso(resultado: ResultadoDeIngreso, ctx: ContextoDeIngreso): Promise<Response> {
  if (resultado.ok) {
    return conCookie(json({ usuario: publico(resultado.usuario) }), cookieDeSesion(resultado.token, resultado.recordar, ctx.cookieSegura));
  }
  if (resultado.motivo === 'credenciales') return error(401, 'RUT o clave incorrectos.');
  if (resultado.motivo === 'demasiados_intentos') return error(429, 'Demasiados intentos desde esta conexión. Espera una hora antes de volver a probar.');

  if (resultado.recien) {
    // Que un administrador se entere: puede ser alguien que olvidó su clave o alguien probando claves ajenas.
    try {
      await ctx.repositorio.guardarAviso(
        {
          tipo: 'error',
          telefono: '',
          resumen: `Se bloqueó el ingreso de ${resultado.nombre} por varios intentos con una clave equivocada. Si no fue esa persona, cámbiale la clave en "Equipo".`,
          motivos: [],
        },
        `ingreso-bloqueado:${resultado.usuarioId}:${resultado.hasta}`,
        ctx.ahoraSegundos,
      );
    } catch (falla) {
      console.error('No se pudo dejar el aviso del bloqueo:', falla instanceof Error ? falla.message : falla);
    }
  }
  return error(429, `Demasiados intentos fallidos. Podrás probar de nuevo en ${minutosHasta(resultado.hasta, ctx.ahoraSegundos)}, o pide a un administrador que te cambie la clave.`);
}

async function entrar(request: Request, url: URL, ctx: ContextoDeIngreso, rol: Rol, correo?: string): Promise<Response> {
  const rechazo = esperadoComoEscritura(request, url);
  if (rechazo) return rechazo;
  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return error(400, 'Solicitud no válida.');
  const resultado = await ctx.cuentas.entrar(
    {
      rol,
      rut: cuerpo.rut,
      clave: cuerpo.clave,
      recordar: cuerpo.recordar === true,
      origen: request.headers.get('cf-connecting-ip') ?? 'sin-origen',
      dispositivo: dispositivoDe(request.headers.get('user-agent')),
      ...(correo !== undefined && { correo }),
    },
    ctx.ahoraSegundos,
  );
  return responderIngreso(resultado, ctx);
}

async function salir(request: Request, url: URL, ctx: ContextoDeIngreso): Promise<Response> {
  const rechazo = esperadoComoEscritura(request, url);
  if (rechazo) return rechazo;
  await ctx.cuentas.salir(tokenDeCookie(request));
  return conCookie(json({ ok: true }), cookieBorrada(ctx.cookieSegura));
}

/** La puerta pública: la del repartidor. Devuelve null si la ruta no es de sesión. */
export async function manejarSesionPublica(request: Request, url: URL, ctx: ContextoDeIngreso): Promise<Response | null> {
  const ruta = url.pathname;
  const metodo = request.method;

  if (ruta === '/api/sesion' && metodo === 'GET') {
    const token = tokenDeCookie(request);
    const sesion = await ctx.cuentas.sesionDe(token, ctx.ahoraSegundos);
    const respuesta = json({ usuario: sesion ? publico(sesion.usuario) : null });
    return sesion?.renovada && token ? conCookie(respuesta, cookieDeSesion(token, true, ctx.cookieSegura)) : respuesta;
  }
  if (ruta === '/api/sesion/entrar' && metodo === 'POST') return entrar(request, url, ctx, 'repartidor');
  if (ruta === '/api/sesion/salir' && metodo === 'POST') return salir(request, url, ctx);
  return null;
}

/** La sesión de administrador vale solo si el usuario es administrador y es el dueño del correo que pasó por Access. */
export function esDelAdministrador(usuario: Usuario | undefined, correo: string): usuario is Usuario {
  return usuario !== undefined && usuario.rol === 'administrador' && usuario.correo === correo.trim().toLowerCase();
}

/** La puerta de administración. `url` ya viene sin el prefijo `/admin`. Devuelve null si la ruta no es de sesión. */
export async function manejarSesionAdmin(request: Request, url: URL, ctx: ContextoDeIngreso & { correo: string }): Promise<Response | null> {
  const ruta = url.pathname;
  const metodo = request.method;

  if (ruta === '/api/sesion' && metodo === 'GET') {
    const token = tokenDeCookie(request);
    const sesion = await ctx.cuentas.sesionDe(token, ctx.ahoraSegundos);
    const usuario = esDelAdministrador(sesion?.usuario, ctx.correo) ? sesion?.usuario : undefined;
    // Primer ingreso: esta persona ya pasó por Access pero todavía no eligió su RUT y su clave.
    const primerIngreso = !usuario && (await ctx.cuentas.usuarioPorCorreo(ctx.correo)) === null;
    const respuesta = json({ correo: ctx.correo, usuario: usuario ? publico(usuario) : null, primerIngreso });
    return usuario && sesion?.renovada && token ? conCookie(respuesta, cookieDeSesion(token, true, ctx.cookieSegura)) : respuesta;
  }

  if (ruta === '/api/sesion/entrar' && metodo === 'POST') return entrar(request, url, ctx, 'administrador', ctx.correo);
  if (ruta === '/api/sesion/salir' && metodo === 'POST') return salir(request, url, ctx);

  if (ruta === '/api/sesion/primer-ingreso' && metodo === 'POST') {
    const rechazo = esperadoComoEscritura(request, url);
    if (rechazo) return rechazo;
    const cuerpo = await leerCuerpo(request);
    if (!cuerpo) return error(400, 'Solicitud no válida.');
    if ((await ctx.cuentas.usuarioPorCorreo(ctx.correo)) !== null) return error(409, 'Este correo ya tiene un usuario. Entra con tu RUT y tu clave.');
    const creado = await ctx.cuentas.crearUsuario({ rut: cuerpo.rut, nombre: cuerpo.nombre, rol: 'administrador', clave: cuerpo.clave, correo: ctx.correo }, ctx.correo, ctx.ahoraSegundos);
    if (!creado.ok) return errorDeCuenta(creado.error);
    return responderIngreso(
      await ctx.cuentas.entrar(
        {
          rol: 'administrador',
          rut: cuerpo.rut,
          clave: cuerpo.clave,
          recordar: cuerpo.recordar === true,
          origen: request.headers.get('cf-connecting-ip') ?? 'sin-origen',
          dispositivo: dispositivoDe(request.headers.get('user-agent')),
          correo: ctx.correo,
        },
        ctx.ahoraSegundos,
      ),
      ctx,
    );
  }
  return null;
}

/**
 * Gestión de usuarios, solo para un administrador con la sesión abierta. Un administrador crea y administra
 * repartidores; de los administradores solo puede tocar lo suyo (su clave y sus otros dispositivos): quién es
 * administrador lo decide la lista de correos de Cloudflare Access, no esta pantalla.
 * `url` ya viene sin el prefijo `/admin`. Devuelve null si la ruta no es de usuarios.
 */
export async function manejarUsuarios(request: Request, url: URL, ctx: ContextoDeIngreso & { yo: Usuario }): Promise<Response | null> {
  const ruta = url.pathname;
  const metodo = request.method;
  if (ruta !== '/api/usuarios' && !ruta.startsWith('/api/usuarios/')) return null;

  if (ruta === '/api/usuarios' && metodo === 'GET') {
    const usuarios = await ctx.cuentas.listar(ctx.ahoraSegundos);
    return json({
      usuarios: usuarios.map((u) => ({
        id: u.id,
        nombre: u.nombre,
        rol: u.rol,
        rut: formatearRut(u.rut),
        activo: u.activo,
        bloqueadoHasta: u.bloqueadoHasta,
        dispositivos: u.dispositivos,
        ultimoUso: u.ultimoUso,
        soyYo: u.id === ctx.yo.id,
      })),
    });
  }

  if (metodo !== 'POST') return error(404, 'No encontrado.');
  const rechazo = esperadoComoEscritura(request, url);
  if (rechazo) return rechazo;
  const cuerpo = await leerCuerpo(request);
  if (!cuerpo) return error(400, 'Solicitud no válida.');

  if (ruta === '/api/usuarios') {
    const creado = await ctx.cuentas.crearUsuario({ rut: cuerpo.rut, nombre: cuerpo.nombre, rol: 'repartidor', clave: cuerpo.clave }, ctx.yo.correo ?? ctx.yo.nombre, ctx.ahoraSegundos);
    return creado.ok ? json({ usuario: { id: creado.valor.id, nombre: creado.valor.nombre } }) : errorDeCuenta(creado.error);
  }

  const partes = /^\/api\/usuarios\/(\d{1,9})\/(clave|estado|sesiones\/cerrar)$/.exec(ruta);
  if (!partes) return error(404, 'No encontrado.');
  const id = Number(partes[1]);
  const accion = partes[2];
  const objetivo = await ctx.cuentas.usuario(id);
  if (!objetivo) return errorDeCuenta('no_existe');
  const esPropio = objetivo.id === ctx.yo.id;
  if (objetivo.rol !== 'repartidor' && !esPropio) return error(403, 'Solo puedes cambiar a los repartidores y tu propia cuenta.');

  if (accion === 'clave') {
    const cambiada = await ctx.cuentas.cambiarClave(id, cuerpo.clave, ctx.ahoraSegundos);
    if (!cambiada.ok) return errorDeCuenta(cambiada.error);
    // Cambiar la clave cierra todas las sesiones de esa persona; si era la propia, también esta.
    return esPropio ? conCookie(json({ ok: true, salir: true }), cookieBorrada(ctx.cookieSegura)) : json({ ok: true });
  }
  if (accion === 'estado') {
    if (esPropio) return error(403, 'No puedes desactivar tu propia cuenta.');
    if (typeof cuerpo.activo !== 'boolean') return error(400, 'Solicitud no válida.');
    const cambiado = await ctx.cuentas.cambiarEstado(id, cuerpo.activo, ctx.ahoraSegundos);
    return cambiado.ok ? json({ ok: true }) : errorDeCuenta(cambiado.error);
  }
  const cerradas = await ctx.cuentas.cerrarSesionesDe(id, esPropio ? (tokenDeCookie(request) ?? undefined) : undefined);
  return json({ ok: true, cerradas });
}
