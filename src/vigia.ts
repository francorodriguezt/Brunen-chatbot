/**
 * Vigía: lo que el bot revisa por su cuenta, con una tarea programada de Cloudflare (cada 5 minutos, `wrangler.toml`),
 * para que una falla no pase en silencio.
 *
 *  - Mensajes sin atender. El webhook responde 200 a Meta de inmediato y atiende en segundo plano; si ese trabajo se
 *    interrumpe (límite de CPU, una caída, un despliegue), Meta no reintenta y el cliente quedaría sin respuesta sin que
 *    nadie se entere. Cada mensaje se anota al llegar y se marca al terminar (`almacen.ts`): el vigía busca los que
 *    llegaron hace más de dos minutos y nunca terminaron, y deja un aviso con el teléfono para que una persona le escriba.
 *  - Revisión diaria (7:30 de Santiago, antes de que empiecen los pedidos): que el token de WhatsApp siga sirviendo y
 *    que la planilla se pueda leer. Así el equipo se entera antes que un cliente.
 *
 *  - Clientes en espera. Con el número compartido, el bot calla mientras una persona atiende a un cliente (`relevo.ts`).
 *    Si esa pausa termina y el cliente había escrito algo que nadie respondió, deja un aviso para una persona.
 *
 *  - Reparto (D98): avisa en el panel si el teléfono del repartidor deja de mandar su ubicación con la jornada abierta,
 *    o si a media mañana hay entregas y nadie inició la ruta (`alertasReparto.ts`).
 *
 * Corre aparte de la atención a los clientes: si esta tarea falla o se corta, ningún cliente se queda sin respuesta.
 */

import type { Alerta } from './alertas';
import { UMBRALES_POR_DEFECTO, vigilarReparto } from './alertasReparto';
import { AlmacenD1, type BaseDatos } from './almacen';
import { FALLA_DEL_TOKEN, avisarFalla, avisarUrgente, type EntornoAtencion } from './atencion';
import { leerConfiguracion } from './configuracion';
import { fechaHoraLocal } from './despacho';
import { RepositorioClientes } from './fichas';
import { RepositorioFijos } from './fijos';
import { cerrarPausasVencidas } from './relevo';
import { TABLA_PRECIOS, type TramoPrecio } from './precios';
import { cargarTablaPrecios } from './preciosHoja';
import { RepositorioD1 } from './repositorio';
import { RepositorioSeguimiento } from './seguimiento';
import { hojasDeRespaldo, respaldarClientes, respaldarPedidos, respaldoAtrasado } from './respaldo';
import { revisarToken } from './whatsapp';

/** Atender un mensaje tarda, como mucho, la espera del agrupador más los 30 s que da Cloudflare: pasado esto, ya no va a terminar. */
const ESPERA_ANTES_DE_AVISAR_SEGUNDOS = 120;
/** Más atrás no se avisa: un mensaje de ayer ya lo vio alguien o ya no importa. */
const VENTANA_SEGUNDOS = 24 * 3600;
const MAXIMO_POR_PASADA = 50;
/** Por Telegram van uno por uno solo los primeros: si falla todo a la vez, el resto se resume en un mensaje. */
const MAXIMO_POR_TELEGRAM = 3;

export interface MensajeSinAtender {
  wamid: string;
  telefono: string;
  recibidoEn: number;
}

/** Los mensajes que llegaron y nunca terminaron de atenderse. Los que no tienen teléfono los anotó una versión anterior del bot. */
export async function mensajesSinAtender(db: BaseDatos, ahoraSegundos: number): Promise<MensajeSinAtender[]> {
  const resultado = await db
    .prepare(
      `SELECT wamid, telefono, recibido_en FROM mensajes_procesados
       WHERE atendido_en IS NULL AND telefono != '' AND recibido_en < ?1 AND recibido_en >= ?2 ORDER BY recibido_en LIMIT ${MAXIMO_POR_PASADA}`,
    )
    .bind(ahoraSegundos - ESPERA_ANTES_DE_AVISAR_SEGUNDOS, ahoraSegundos - VENTANA_SEGUNDOS)
    .run();
  return ((resultado.results ?? []) as Array<Record<string, unknown>>).map((fila) => ({
    wamid: String(fila.wamid),
    telefono: String(fila.telefono),
    recibidoEn: Number(fila.recibido_en),
  }));
}

const dosDigitos = (n: number): string => String(n).padStart(2, '0');

/**
 * Deja un aviso por cada cliente con mensajes sin atender y devuelve cuántos avisos nuevos hubo. Nunca lanza errores.
 * El aviso no se repite: su origen es el mensaje, y los mensajes quedan marcados para la pasada siguiente.
 */
export async function vigilar(env: EntornoAtencion, ahora: Date = new Date()): Promise<number> {
  const db = env.DB;
  if (!db) return 0;
  const ahoraSegundos = Math.floor(ahora.getTime() / 1000);
  try {
    const colgados = await mensajesSinAtender(db, ahoraSegundos);
    if (colgados.length === 0) return 0;

    const porCliente = new Map<string, MensajeSinAtender[]>();
    for (const mensaje of colgados) porCliente.set(mensaje.telefono, [...(porCliente.get(mensaje.telefono) ?? []), mensaje]);

    const repositorio = new RepositorioD1(db);
    const nuevos: Alerta[] = [];
    for (const [telefono, mensajes] of porCliente) {
      const primero = mensajes[0] as MensajeSinAtender;
      const local = fechaHoraLocal(new Date(primero.recibidoEn * 1000));
      const hora = `${dosDigitos(local.hora)}:${dosDigitos(local.minuto)}`;
      const cuales = mensajes.length === 1 ? `un mensaje de este cliente (recibido a las ${hora})` : `${mensajes.length} mensajes de este cliente (el primero, recibido a las ${hora})`;
      const alerta: Alerta = { tipo: 'error', telefono, resumen: `El bot no terminó de atender ${cuales}. Revisa su chat y respóndele si hace falta.`, motivos: [] };
      if (await repositorio.guardarAviso(alerta, `sin-atender:${primero.wamid}`, ahoraSegundos)) nuevos.push(alerta);
    }
    await new AlmacenD1(db).marcarAtendidos(colgados.map((mensaje) => mensaje.wamid), ahoraSegundos);

    for (const alerta of nuevos.slice(0, MAXIMO_POR_TELEGRAM)) await avisarUrgente(env, alerta, ahora);
    const resto = nuevos.length - MAXIMO_POR_TELEGRAM;
    if (resto > 0) {
      await avisarUrgente(env, { tipo: 'error', telefono: '', resumen: `El bot tampoco terminó de atender a ${resto} clientes más: están en los avisos del panel.`, motivos: [] }, ahora);
    }
    return nuevos.length;
  } catch (error) {
    console.error('El vigía no pudo revisar los mensajes sin atender:', error instanceof Error ? error.message : error);
    return 0;
  }
}

/**
 * Cierra las pausas que ya terminaron (`relevo.ts`) y deja un aviso por cada cliente que escribió durante la pausa y
 * no recibió respuesta de nadie. No es urgente (no sale por Telegram): es un recordatorio en el panel. Nunca lanza errores.
 */
export async function avisarClientesEnEspera(env: EntornoAtencion, ahora: Date = new Date()): Promise<number> {
  const db = env.DB;
  if (!db) return 0;
  const ahoraSegundos = Math.floor(ahora.getTime() / 1000);
  try {
    const repositorio = new RepositorioD1(db);
    let avisos = 0;
    for (const { telefono, esperaDesde } of await cerrarPausasVencidas(db, ahoraSegundos)) {
      const local = fechaHoraLocal(new Date(esperaDesde * 1000));
      const alerta: Alerta = {
        tipo: 'escalamiento',
        telefono,
        resumen: `Escribió a las ${dosDigitos(local.hora)}:${dosDigitos(local.minuto)} mientras una persona atendía su conversación, y después nadie le respondió. Revisa su chat.`,
        motivos: [],
      };
      if (await repositorio.guardarAviso(alerta, `en-espera:${telefono}:${esperaDesde}`, ahoraSegundos)) avisos += 1;
    }
    return avisos;
  } catch (error) {
    console.error('El vigía no pudo revisar las conversaciones que atendía una persona:', error instanceof Error ? error.message : error);
    return 0;
  }
}

const AVISO_DE_PRECIOS = 'La hoja PRECIOS tiene precios distintos';

/** Si dos tablas de precios dicen algo distinto, sin importar el orden de las filas. */
export function preciosDistintos(hoja: readonly TramoPrecio[], lista: readonly TramoPrecio[] = TABLA_PRECIOS): boolean {
  const clave = (tabla: readonly TramoPrecio[]) =>
    tabla
      .map((t) => `${t.tipo}|${t.desde}|${t.hasta ?? ''}|${t.precio}`)
      .sort()
      .join(';');
  return clave(hoja) !== clave(lista);
}

/**
 * Comprueba lo que el bot necesita para atender, sin escribirle a nadie. Un tropiezo momentáneo de Meta no es una
 * alarma: solo se avisa cuando el token ya no sirve o cuando la planilla no se puede leer.
 */
export async function revisionDiaria(env: EntornoAtencion, ahora: Date = new Date()): Promise<void> {
  const token = await revisarToken({ token: env.WHATSAPP_TOKEN, phoneNumberId: env.WHATSAPP_PHONE_NUMBER_ID, graphApiVersion: env.GRAPH_API_VERSION });
  if (token === 'token') await avisarFalla(env, 'token-whatsapp', FALLA_DEL_TOKEN, ahora);

  const hayPlanilla = Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON && env.GOOGLE_SHEET_ID);
  // Lo prometido al repartidor (D80): sus posiciones se borran a los 3 días, aunque deje de usar la app.
  if (env.DB) {
    try {
      await new RepositorioSeguimiento(env.DB).limpiar(Math.floor(ahora.getTime() / 1000));
    } catch (falla) {
      console.error('No se pudieron borrar las posiciones viejas:', falla instanceof Error ? falla.message : falla);
    }
  }
  // Respaldo en Google Sheets (D66): si lleva más de un día sin copiar y hay pedidos esperando, que lo sepa una persona.
  if (hayPlanilla && env.DB) {
    try {
      const atraso = await respaldoAtrasado(env.DB, Math.floor(ahora.getTime() / 1000));
      if (atraso) {
        const horas = Math.round(atraso.segundos / 3600);
        await avisarFalla(
          env,
          'respaldo',
          `El respaldo de los pedidos en Google Sheets no se actualiza hace ${horas > 1000 ? 'mucho' : `${horas} horas`}${atraso.error ? ` (${atraso.error})` : ''}. Los pedidos están a salvo en la base; avisa a Franco.`,
          ahora,
        );
      }
    } catch (falla) {
      console.error('No se pudo revisar el respaldo:', falla instanceof Error ? falla.message : falla);
    }
  }
  // El panel sugiere los precios de la lista del código (D71); si el dueño cambió la hoja PRECIOS, la sugerencia quedó vieja.
  if (hayPlanilla) {
    try {
      const precios = await cargarTablaPrecios(env, Math.floor(ahora.getTime() / 1000));
      if (precios.origen === 'hoja' && preciosDistintos(precios.tabla)) {
        // Mientras siga abierto el aviso de ayer, no se repite cada mañana en el panel ni en Telegram.
        const yaAvisado = env.DB ? (await new RepositorioD1(env.DB).listarAvisos('abierto')).some((a) => a.resumen.startsWith(AVISO_DE_PRECIOS)) : false;
        if (!yaAvisado) await avisarFalla(env, 'precios-panel', `${AVISO_DE_PRECIOS} a la lista del panel: el precio que sugiere el panel quedó desactualizado (el bot usa la hoja). Avisa a Franco para igualarlos.`, ahora);
      }
    } catch (falla) {
      console.error('No se pudo comparar la hoja PRECIOS:', falla instanceof Error ? falla.message : falla);
    }
  }
  if (hayPlanilla && (await leerConfiguracion(env)) === undefined) {
    await avisarFalla(
      env,
      'planilla',
      'No se pudo leer la planilla de Google (clientes, precios, feriados y configuración): mientras no vuelva, el bot deriva los pedidos a una persona. Revisa que la planilla siga compartida con la cuenta de servicio.',
      ahora,
    );
  }
}

/**
 * Respaldo en Google Sheets (D66): los pedidos cada 30 minutos (la tarea corre cada 5) y las fichas de clientes una vez
 * por noche. Si falla, se intenta de nuevo en la vuelta siguiente desde el mismo punto.
 */
async function respaldar(env: EntornoAtencion, ahora: Date, local: { hora: number; minuto: number }): Promise<void> {
  if (!env.DB || local.minuto % 30 >= 5) return;
  const hojas = hojasDeRespaldo(env);
  if (!hojas) return;
  const segundos = Math.floor(ahora.getTime() / 1000);
  try {
    const copiados = await respaldarPedidos(env.DB, hojas, segundos);
    if (copiados > 0) console.log(`Respaldo: ${copiados} pedido(s) copiados a Google Sheets.`);
  } catch (falla) {
    console.error('No se pudo respaldar los pedidos en Google Sheets:', falla instanceof Error ? falla.message : falla);
  }
  if (local.hora !== 3 || local.minuto >= 5) return;
  try {
    const fichas = await respaldarClientes(env.DB, hojas, segundos);
    console.log(`Respaldo: ${fichas} ficha(s) de clientes copiadas a Google Sheets.`);
  } catch (falla) {
    console.error('No se pudo respaldar las fichas en Google Sheets:', falla instanceof Error ? falla.message : falla);
  }
}

/** Lo que corre en cada disparo de la tarea programada. La hora que cuenta es la de Santiago, con su horario de verano. */
export async function tareaProgramada(env: EntornoAtencion, ahora: Date): Promise<void> {
  try {
    await vigilar(env, ahora);
    await avisarClientesEnEspera(env, ahora);
    if (env.DB) {
      try {
        await new RepositorioClientes(env.DB).vincularPendientes(Math.floor(ahora.getTime() / 1000));
      } catch (falla) {
        console.error('No se pudieron asociar pedidos a clientes:', falla instanceof Error ? falla.message : falla);
      }
      // Pedidos fijos (D59): se crean unos días antes de la entrega, pendientes de confirmar.
      try {
        const creados = await new RepositorioFijos(env.DB).crearLosQueTocan(fechaHoraLocal(ahora).fecha, Math.floor(ahora.getTime() / 1000));
        if (creados > 0) console.log(`Se crearon ${creados} pedido(s) fijo(s) para confirmar.`);
      } catch (falla) {
        console.error('No se pudieron crear los pedidos fijos:', falla instanceof Error ? falla.message : falla);
      }
    }
    const local = fechaHoraLocal(ahora);
    if (env.DB) {
      // Sin planilla (o si no se puede leer) valen los umbrales por defecto: 20 minutos y 10:30.
      const hayPlanilla = Boolean(env.GOOGLE_SERVICE_ACCOUNT_JSON && env.GOOGLE_SHEET_ID);
      const umbrales = (hayPlanilla ? (await leerConfiguracion(env))?.reparto : undefined) ?? UMBRALES_POR_DEFECTO;
      await vigilarReparto(env.DB, umbrales, local, Math.floor(ahora.getTime() / 1000));
    }
    await respaldar(env, ahora, local);
    if (local.hora === 7 && local.minuto >= 30 && local.minuto < 35) await revisionDiaria(env, ahora);
  } catch (error) {
    console.error('La tarea programada falló:', error instanceof Error ? error.message : error);
  }
}
