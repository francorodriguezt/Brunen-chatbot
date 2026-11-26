/**
 * La cola del teléfono del repartidor (D84): lo que marca en una parada ("Entregado" o "No se pudo") se guarda aquí
 * antes de enviarlo, y sale de la cola solo cuando el servidor lo confirma.
 *
 * - Sin señal, o si el servidor falla de su lado (5xx, 429, 408), la marca queda y se reintenta sola.
 * - Si el servidor la rechaza (pedido cancelado, de otro día, datos raros), queda a la vista con el motivo y no se
 *   reintenta: el repartidor la ve y avisa a la oficina. Nunca se le dice "anotada" si no lo está.
 * - Cada marca lleva la fecha de su ruta y la hora del teléfono: si llega tarde (sin señal hasta el día siguiente), el
 *   servidor la anota en su día y a su hora.
 * - Repetir una marca no duplica nada: el servidor guarda valores (cuántos vacíos, si cobró), no los suma.
 *
 * Sin DOM ni almacenamiento: `app.js` le pasa cómo leer, guardar y enviar. Así se prueba sola (tests/cola-repartidor).
 */

/** Qué significa la respuesta del servidor a una marca. */
export function clasificar(estado) {
  if (estado >= 200 && estado < 300) return 'anotada';
  if (estado === 401) return 'sin_sesion';
  // 0: una redirección que el navegador no muestra (el servidor no la atendió); 408 y 429: que se intente después.
  if (estado === 0 || estado === 408 || estado === 429 || estado >= 500) return 'reintentar';
  return 'rechazada';
}

let contador = 0;
function nuevaClave(ahoraMs) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  contador += 1;
  return `${ahoraMs}-${contador}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Una marca nueva. `fecha` es la de la ruta que se estaba viendo (YYYY-MM-DD). */
export function nuevaMarca({ parada, tipo, cuerpo, fecha, ahoraMs }) {
  return {
    op: nuevaClave(ahoraMs),
    id: parada.idPedido,
    nombre: parada.nombre ?? '',
    orden: parada.orden ?? null,
    tipo,
    cuerpo,
    fecha,
    marcadoEn: Math.floor(ahoraMs / 1000),
  };
}

/** Lo que se manda al servidor: lo marcado, más su fecha y su hora. */
export function cuerpoParaEnviar(marca) {
  const extra = {};
  if (typeof marca.fecha === 'string') extra.fecha = marca.fecha;
  if (Number.isInteger(marca.marcadoEn)) extra.marcadoEn = marca.marcadoEn;
  return { ...marca.cuerpo, ...extra };
}

/**
 * La cola tal como quedó guardada. Descarta lo que no tiene forma y completa las marcas de la versión anterior de la
 * app (sin `op`, sin fecha): esas se envían como antes, para hoy.
 */
export function normalizar(crudo) {
  if (!Array.isArray(crudo)) return [];
  return crudo
    .filter((m) => m && typeof m === 'object' && typeof m.id === 'string' && (m.tipo === 'entregado' || m.tipo === 'no-se-pudo') && m.cuerpo && typeof m.cuerpo === 'object')
    .map((m) => ({ ...m, op: typeof m.op === 'string' ? m.op : `${m.id}:${m.tipo}` }));
}

/** Agrega una marca. Reemplaza cualquier otra de la misma parada: vale lo último que el repartidor decidió. */
export const agregar = (cola, marca) => [...cola.filter((m) => m.id !== marca.id), marca];

export const pendientes = (cola) => cola.filter((m) => !m.rechazo);
export const rechazadas = (cola) => cola.filter((m) => m.rechazo);
export const quitar = (cola, op) => cola.filter((m) => m.op !== op);
const rechazar = (cola, op, motivo) => cola.map((m) => (m.op === op ? { ...m, rechazo: motivo } : m));

const MOTIVO_GENERICO = 'El sistema no aceptó esta marca.';

/**
 * Envía las marcas pendientes, una por una y en orden. Relee la cola en cada paso: el repartidor puede marcar otra
 * parada mientras se envía, y esa también sale en esta vuelta.
 *
 * - `leer()` y `guardar(cola)`: el almacenamiento del teléfono.
 * - `enviar(marca)`: devuelve `{ estado, datos }`, o lanza si no hay red.
 *
 * Se detiene en la primera que no sale (sin señal, servidor caído o sesión vencida): las demás esperan su turno.
 * Devuelve qué pasó: `{ anotadas: [op], rechazadas: [{ op, motivo }], detenida: null | 'sin_senal' | 'servidor' | 'sin_sesion' }`.
 */
export async function enviarPendientes({ leer, guardar, enviar }) {
  const intentadas = new Set();
  const resumen = { anotadas: [], rechazadas: [], detenida: null };
  for (;;) {
    const marca = pendientes(leer()).find((m) => !intentadas.has(m.op));
    if (!marca) return resumen;
    intentadas.add(marca.op);
    let respuesta;
    try {
      respuesta = await enviar(marca);
    } catch {
      resumen.detenida = 'sin_senal';
      return resumen;
    }
    const resultado = clasificar(respuesta?.estado ?? 0);
    if (resultado === 'anotada') {
      guardar(quitar(leer(), marca.op));
      resumen.anotadas.push(marca.op);
    } else if (resultado === 'rechazada') {
      const error = respuesta?.datos?.error;
      const motivo = typeof error === 'string' && error.trim() ? error.trim() : MOTIVO_GENERICO;
      guardar(rechazar(leer(), marca.op, motivo));
      resumen.rechazadas.push({ op: marca.op, motivo });
    } else {
      resumen.detenida = resultado === 'sin_sesion' ? 'sin_sesion' : 'servidor';
      return resumen;
    }
  }
}
