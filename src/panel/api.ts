/**
 * API del panel (D32): lo que la pantalla pide y manda. Todo pasa por `RepositorioD1`, que ya impone las reglas del
 * negocio (no confirmar sin precio, no saltar de estado, historial de quién hizo qué).
 *
 * Además de la bandeja (pedidos y avisos): el reparto del día con sus textos para copiar y su archivo CSV, anotar un
 * pedido a mano, buscar, y reconocer a un cliente por su teléfono.
 *
 * Seguridad de las escrituras (POST): solo con `Content-Type: application/json`, con la cabecera `X-Panel: 1` y, si el
 * navegador manda `Origin`, desde el mismo sitio. Un formulario o un script de otra página no puede cumplir esas
 * condiciones sin permiso (no se habilita CORS), así que no puede mover pedidos con la sesión de la operadora.
 */

import { COMUNAS_ATENDIDAS } from '../comunas';
import { calcularFechaEntrega, fechaHoraLocal } from '../despacho';
import { armarReparto, csvDeReparto, textoDeReparto, tsvDeReparto } from '../reparto';
import { ESTADOS_DE_PEDIDO, OPCIONES_DE_PEDIDO, type CambiosDePedido, type DatosDePago, type EstadoDePedido, type ErrorDeRepositorio, type LineaEditable, type PedidoManual, type RepositorioD1 } from '../repositorio';
import type { RepositorioClientes } from '../fichas';
import { normalizarTelefono } from '../whatsapp';

export interface ContextoApi {
  repositorio: RepositorioD1;
  /** Correo de quien está conectado: queda en el historial de cada cambio. */
  correo: string;
  ahoraSegundos: number;
  /** Fichas de clientes (D53): si viene, un cambio de dirección queda también en el historial del cliente. */
  clientes?: RepositorioClientes;
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

export function json(datos: unknown, estado = 200): Response {
  return new Response(JSON.stringify(datos), {
    status: estado,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' },
  });
}

export const error = (estado: number, mensaje: string): Response => json({ error: mensaje }, estado);

export function esperadoComoEscritura(request: Request, url: URL): Response | null {
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json') || request.headers.get('x-panel') !== '1') {
    return error(400, 'Solicitud no válida.');
  }
  const origen = request.headers.get('origin');
  if (origen !== null && origen !== url.origin) return error(403, 'Solicitud no permitida desde otro sitio.');
  return null;
}

export async function leerCuerpo(request: Request): Promise<Record<string, unknown> | null> {
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
const esFecha = (valor: string | null): valor is string => valor !== null && /^\d{4}-\d{2}-\d{2}$/.test(valor);
const SIN_FERIADOS: ReadonlySet<string> = new Set();

/**
 * La versión del pedido que la pantalla mostraba (`actualizadoEn`). Si viene, el repositorio rechaza el cambio cuando
 * alguien lo modificó después. `undefined` = la pantalla no la mandó; `null` = vino, pero no es un número entero.
 */
function versionVista(cuerpo: Record<string, unknown>): number | undefined | null {
  if (!('actualizadoEn' in cuerpo)) return undefined;
  return Number.isInteger(cuerpo.actualizadoEn) ? (cuerpo.actualizadoEn as number) : null;
}

/**
 * Lo que manda el formulario "Nuevo pedido". Devuelve null si algún dato no es del tipo esperado y 'telefono' si el
 * teléfono no se entiende; las reglas del negocio (cantidades, fecha real) las revisa el repositorio.
 */
function aPedidoManual(cuerpo: Record<string, unknown>): PedidoManual | 'telefono' | null {
  const textos: Record<'telefono' | 'nombre' | 'comuna' | 'direccion' | 'notasRepartidor', string> = { telefono: '', nombre: '', comuna: '', direccion: '', notasRepartidor: '' };
  for (const campo of Object.keys(textos) as Array<keyof typeof textos>) {
    if (cuerpo[campo] === undefined) continue;
    if (!esTexto(cuerpo[campo])) return null;
    textos[campo] = cuerpo[campo];
  }
  const envases = cuerpo.envasesARetirar ?? 0;
  const confirmar = cuerpo.confirmar ?? false;
  if (!esTexto(cuerpo.fecha) || !Array.isArray(cuerpo.lineas) || typeof envases !== 'number' || typeof confirmar !== 'boolean') return null;

  let telefono = '';
  if (textos.telefono.trim() !== '') {
    const normalizado = normalizarTelefono(textos.telefono);
    if (!normalizado) return 'telefono';
    telefono = normalizado;
  }
  const pago = aDatosDePago(cuerpo);
  if (!pago) return null;
  return { ...textos, ...pago, telefono, fecha: cuerpo.fecha, lineas: cuerpo.lineas as LineaEditable[], envasesARetirar: envases, confirmar };
}

/** Los datos de pago y documento que vengan en el cuerpo. Su valor lo valida el repositorio; aquí solo el tipo. */
function aDatosDePago(cuerpo: Record<string, unknown>): DatosDePago | null {
  const datos: Record<string, string> = {};
  for (const campo of ['formaPago', 'estadoPago', 'documento', 'numeroDocumento', 'tipoCliente'] as const) {
    if (!(campo in cuerpo)) continue;
    if (!esTexto(cuerpo[campo])) return null;
    datos[campo] = cuerpo[campo];
  }
  return datos as DatosDePago;
}

/** Convierte lo que manda la pantalla en cambios del repositorio. Lo que no viene, no se toca. */
function aCambios(cuerpo: Record<string, unknown>): CambiosDePedido | null {
  const pago = aDatosDePago(cuerpo);
  if (!pago) return null;
  const cambios: CambiosDePedido = { ...pago };
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
  if ('envasesARetirar' in cuerpo) {
    if (typeof cuerpo.envasesARetirar !== 'number') return null;
    cambios.envasesARetirar = cuerpo.envasesARetirar;
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

    if (ruta === '/api/opciones' && metodo === 'GET') {
      // La fecha sugerida aplica el corte de las 9:00 y salta los domingos, pero no conoce los feriados (viven en la
      // planilla y el panel no tiene acceso a Google): la persona la revisa antes de guardar.
      const sugerida = calcularFechaEntrega(new Date(ahoraSegundos * 1000), { feriados: SIN_FERIADOS });
      return json({ comunas: COMUNAS_ATENDIDAS, fechaSugerida: sugerida.fecha, ...OPCIONES_DE_PEDIDO });
    }

    if ((ruta === '/api/reparto' || ruta === '/api/reparto.csv') && metodo === 'GET') {
      const fecha = url.searchParams.get('fecha');
      if (!esFecha(fecha) || Number.isNaN(Date.parse(`${fecha}T00:00:00Z`))) return error(400, 'Fecha no válida.');
      const reparto = armarReparto(await repositorio.pedidosDelDia(fecha), fecha);
      if (ruta === '/api/reparto') return json({ reparto, texto: textoDeReparto(reparto), tsv: tsvDeReparto(reparto) });
      return new Response(csvDeReparto(reparto), {
        status: 200,
        headers: {
          'content-type': 'text/csv; charset=utf-8',
          'content-disposition': `attachment; filename="reparto-${fecha}.csv"`,
          'cache-control': 'no-store',
          'x-content-type-options': 'nosniff',
        },
      });
    }

    // Estas dos solo leen, pero van por POST: lo que se busca (un nombre, un teléfono) viaja en el cuerpo y no en la
    // dirección, que queda escrita en los registros de Cloudflare.
    if ((ruta === '/api/clientes/anterior' || ruta === '/api/pedidos/buscar') && metodo === 'POST') {
      const rechazo = esperadoComoEscritura(request, url);
      if (rechazo) return rechazo;
      const cuerpo = await leerCuerpo(request);
      if (!cuerpo) return error(400, 'Solicitud no válida.');
      if (ruta === '/api/clientes/anterior') {
        // Para no volver a escribir los datos de alguien que ya pidió: los de su último pedido con dirección (D40).
        const telefono = esTexto(cuerpo.telefono) ? normalizarTelefono(cuerpo.telefono) : null;
        return json({ datos: telefono ? await repositorio.datosDelUltimoPedido(telefono) : null });
      }
      if (!esTexto(cuerpo.texto) || cuerpo.texto.trim().length < 2) return error(400, 'Escribe al menos 2 letras o números para buscar.');
      return json({ pedidos: await repositorio.buscarPedidos(cuerpo.texto) });
    }

    if (ruta === '/api/pedidos' && metodo === 'POST') {
      const rechazo = esperadoComoEscritura(request, url);
      if (rechazo) return rechazo;
      const cuerpo = await leerCuerpo(request);
      const manual = cuerpo ? aPedidoManual(cuerpo) : null;
      if (!manual) return error(400, 'Solicitud no válida.');
      if (manual === 'telefono') return error(422, 'Revisa el teléfono: escríbelo con sus 9 dígitos (por ejemplo 9 1234 5678) o déjalo vacío.');
      const creado = await repositorio.crearPedido(manual, correo, ahoraSegundos, fechaHoraLocal(new Date(ahoraSegundos * 1000)).fecha);
      if (!creado.ok) return respuestaDeRepositorio(creado, 'pedido');
      return json({ pedido: creado.valor }, 201);
    }

    if (ruta === '/api/pedidos' && metodo === 'GET') {
      if (url.searchParams.has('buscar')) return error(400, 'La búsqueda se hace con el buscador del panel.');
      const grupo = url.searchParams.get('grupo') ?? 'por_confirmar';
      if (!Object.hasOwn(GRUPOS, grupo)) return error(400, 'Grupo de pedidos no válido.'); // `in` también acepta "constructor" y "__proto__"
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
        const version = versionVista(cuerpo);
        if (version === null) return error(400, 'Solicitud no válida.');

        if (pedido[2] === 'estado') {
          const nuevo = cuerpo.estado;
          if (!esTexto(nuevo) || !(ESTADOS_DE_PEDIDO as readonly string[]).includes(nuevo)) return error(400, 'Estado no válido.');
          if (cuerpo.fechaConfirmada !== undefined && !esTexto(cuerpo.fechaConfirmada)) return error(400, 'Fecha no válida.');
          const motivo = esTexto(cuerpo.motivo) ? cuerpo.motivo.slice(0, 300) : undefined;
          return respuestaDeRepositorio(
            await repositorio.cambiarEstado(id, nuevo as EstadoDePedido, correo, ahoraSegundos, { fechaConfirmada: cuerpo.fechaConfirmada as string | undefined, motivo, versionVista: version }),
            'pedido',
          );
        }
        const cambios = aCambios(cuerpo);
        if (!cambios) return error(400, 'Solicitud no válida.');
        const editado = await repositorio.editarPedido(id, cambios, correo, ahoraSegundos, version);
        if (editado.ok && ctx.clientes && (cambios.direccion !== undefined || cambios.comuna !== undefined)) {
          await ctx.clientes.registrarDireccionDePedido(id, ahoraSegundos);
        }
        return respuestaDeRepositorio(editado, 'pedido');
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
