/**
 * API del panel (D32): lo que la pantalla pide y manda. Todo pasa por `RepositorioD1`, que ya impone las reglas del
 * negocio (no confirmar sin precio, no saltar de estado, historial de quién hizo qué).
 *
 * Seguridad de las escrituras (POST): solo con `Content-Type: application/json`, con la cabecera `X-Panel: 1` y, si el
 * navegador manda `Origin`, desde el mismo sitio. Un formulario o un script de otra página no puede cumplir esas
 * condiciones sin permiso (no se habilita CORS), así que no puede mover pedidos con la sesión de la operadora.
 */

import { ESTADOS_DE_PEDIDO, type CambiosDePedido, type EstadoDePedido, type ErrorDeRepositorio, type LineaEditable, type RepositorioD1 } from '../repositorio';

export interface ContextoApi {
  repositorio: RepositorioD1;
  /** Correo de quien está conectado: queda en el historial de cada cambio. */
  correo: string;
  ahoraSegundos: number;
}

const MAX_CUERPO_BYTES = 20_000;

const GRUPOS: Readonly<Record<string, readonly EstadoDePedido[] | undefined>> = {
  por_confirmar: ['Pendiente_Confirmacion', 'Fuera_de_zona'],
  confirmados: ['Confirmado', 'En_Ruta'],
  cerrados: ['Entregado', 'Cancelado'],
  todos: undefined,
};

const MENSAJES_DE_ERROR: Readonly<Record<ErrorDeRepositorio, { estado: number; mensaje: string }>> = {
  no_existe: { estado: 404, mensaje: 'Ese pedido ya no existe.' },
  transicion_invalida: { estado: 409, mensaje: 'Ese cambio de estado no es posible desde el estado actual del pedido.' },
  falta_precio: { estado: 422, mensaje: 'Falta el precio de alguna línea: complétalo con "Cambiar" antes de confirmar.' },
  conflicto: { estado: 409, mensaje: 'Otra persona cambió este pedido hace un momento. Se recargó con lo último.' },
  fecha_invalida: { estado: 422, mensaje: 'La fecha no es válida.' },
  datos_invalidos: { estado: 422, mensaje: 'Revisa las cantidades y los precios.' },
  pedido_cerrado: { estado: 409, mensaje: 'Un pedido entregado o cancelado ya no se puede editar.' },
};

function json(datos: unknown, estado = 200): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

const error = (estado: number, mensaje: string): Response => json({ error: mensaje }, estado);

function esperadoComoEscritura(request: Request, url: URL): Response | null {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json') || request.headers.get('x-panel') !== '1') {
    return error(400, 'Solicitud no válida.');
  }
  const origen = request.headers.get('origin');
  if (origen !== null && origen !== url.origin) return error(403, 'Solicitud no permitida desde otro sitio.');
  return null;
}

async function leerCuerpo(request: Request): Promise<Record<string, unknown> | null> {
  const texto = await request.text();
  if (texto.length > MAX_CUERPO_BYTES) return null;
  try {
    const valor = JSON.parse(texto) as unknown;
    return typeof valor === 'object' && valor !== null && !Array.isArray(valor) ? (valor as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const esTexto = (valor: unknown): valor is string => typeof valor === 'string';

/** Convierte lo que manda la pantalla en cambios del repositorio. Lo que no viene, no se toca. */
function aCambios(cuerpo: Record<string, unknown>): CambiosDePedido | null {
  const cambios: CambiosDePedido = {};
  if ('fechaConfirmada' in cuerpo) {
    if (cuerpo.fechaConfirmada !== null && !esTexto(cuerpo.fechaConfirmada)) return null;
    cambios.fechaConfirmada = cuerpo.fechaConfirmada as string | null;
  }
  for (const campo of ['comuna', 'direccion', 'notasRepartidor'] as const) {
    if (campo in cuerpo) {
      if (!esTexto(cuerpo[campo])) return null;
      cambios[campo] = cuerpo[campo];
    }
  }
  if ('lineas' in cuerpo) {
    if (!Array.isArray(cuerpo.lineas)) return null;
    cambios.lineas = cuerpo.lineas as LineaEditable[];
  }
  return cambios;
}

function respuestaDeRepositorio<T>(resultado: { ok: true; valor: T } | { ok: false; error: ErrorDeRepositorio }, clave: string): Response {
  if (resultado.ok) return json({ [clave]: resultado.valor });
  const { estado, mensaje } = MENSAJES_DE_ERROR[resultado.error];
  return error(estado, mensaje);
}

export async function manejarApi(request: Request, url: URL, ctx: ContextoApi): Promise<Response> {
  const { repositorio, correo, ahoraSegundos } = ctx;
  const ruta = url.pathname;
  const metodo = request.method;

  try {
    if (ruta === '/api/estado' && metodo === 'GET') {
      return json({ correo, ahora: ahoraSegundos, resumen: await repositorio.resumen() });
    }

    if (ruta === '/api/pedidos' && metodo === 'GET') {
      const grupo = url.searchParams.get('grupo') ?? 'por_confirmar';
      if (!(grupo in GRUPOS)) return error(400, 'Grupo de pedidos no válido.');
      const fecha = url.searchParams.get('fecha') ?? undefined;
      if (fecha !== undefined && !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return error(400, 'Fecha no válida.');
      return json({ pedidos: await repositorio.listarPedidos({ estados: GRUPOS[grupo], fecha }) });
    }

    const pedido = /^\/api\/pedidos\/(P\d{6}-[0-9A-Z]{5})(?:\/(estado|editar))?$/.exec(ruta);
    if (pedido) {
      const id = pedido[1] as string;
      if (pedido[2] === undefined && metodo === 'GET') {
        const encontrado = await repositorio.obtenerPedido(id);
        return encontrado ? json({ pedido: encontrado, historial: await repositorio.historialDe(id) }) : error(404, MENSAJES_DE_ERROR.no_existe.mensaje);
      }
      if (metodo === 'POST' && (pedido[2] === 'estado' || pedido[2] === 'editar')) {
        const rechazo = esperadoComoEscritura(request, url);
        if (rechazo) return rechazo;
        const cuerpo = await leerCuerpo(request);
        if (!cuerpo) return error(400, 'Solicitud no válida.');

        if (pedido[2] === 'estado') {
          const nuevo = cuerpo.estado;
          if (!esTexto(nuevo) || !(ESTADOS_DE_PEDIDO as readonly string[]).includes(nuevo)) return error(400, 'Estado no válido.');
          if (cuerpo.fechaConfirmada !== undefined && !esTexto(cuerpo.fechaConfirmada)) return error(400, 'Fecha no válida.');
          const motivo = esTexto(cuerpo.motivo) ? cuerpo.motivo.slice(0, 300) : undefined;
          return respuestaDeRepositorio(
            await repositorio.cambiarEstado(id, nuevo as EstadoDePedido, correo, ahoraSegundos, { fechaConfirmada: cuerpo.fechaConfirmada as string | undefined, motivo }),
            'pedido',
          );
        }
        const cambios = aCambios(cuerpo);
        if (!cambios) return error(400, 'Solicitud no válida.');
        return respuestaDeRepositorio(await repositorio.editarPedido(id, cambios, correo, ahoraSegundos), 'pedido');
      }
    }

    if (ruta === '/api/avisos' && metodo === 'GET') {
      const estado = url.searchParams.get('estado') ?? 'abierto';
      if (estado !== 'abierto' && estado !== 'resuelto') return error(400, 'Estado de avisos no válido.');
      return json({ avisos: await repositorio.listarAvisos(estado) });
    }

    const aviso = /^\/api\/avisos\/(\d{1,12})\/resolver$/.exec(ruta);
    if (aviso && metodo === 'POST') {
      const rechazo = esperadoComoEscritura(request, url);
      if (rechazo) return rechazo;
      const resuelto = await repositorio.resolverAviso(Number(aviso[1]), correo, ahoraSegundos);
      return resuelto ? json({ ok: true }) : error(409, 'Ese aviso ya estaba resuelto o no existe.');
    }

    return error(404, 'No encontrado.');
  } catch (falla) {
    // Nunca se devuelve el detalle: podría traer datos de la base.
    console.error('Error en la API del panel:', falla instanceof Error ? falla.message : falla);
    return error(500, 'No se pudo completar. Intenta de nuevo.');
  }
}
