/**
 * Pedido rápido (D64): Constanza pega en el panel el mensaje de un cliente, tal como lo copia de WhatsApp, y el formulario
 * de "Nuevo pedido" se llena solo. Usa el mismo intérprete por reglas del bot: sin IA y sin mandar el texto a nadie.
 *
 * WhatsApp Web copia cada mensaje con su encabezado: "[10:32, 14/11/2026] +56 9 1234 5678: quiero 2 de 20". De ahí sale
 * el teléfono (o el nombre del contacto, si está guardado); el resto de las líneas es lo que escribió el cliente.
 * Lo que no se entiende queda vacío y se avisa: el formulario lo revisa una persona antes de guardar.
 */

import { proponerEntrega } from './entrega';
import { normalizarTelefono } from './identidad';
import { interpretar, type FormaDePagoMencionada, type TipoBidonPedido } from './interprete';

/** Un mensaje copiado de WhatsApp es corto; más que esto no es un pedido y no vale procesarlo. */
export const MAX_PEGADO = 2000;

// "[10:32, 14/11/2026] Nombre: texto" (WhatsApp Web) y "14/11/26, 10:32 - Nombre: texto" (chat exportado).
const ENCABEZADO = /^\s*(?:\[[^\]]{4,40}\]|\d{1,2}\/\d{1,2}\/\d{2,4},?\s+\d{1,2}:\d{2}(?:\s*[ap]\.?\s?m\.?)?\s+-)\s*([^:\n]{1,60}):\s*/i;
const TELEFONO = /\+?\s?56[\s-]?9(?:[\s-]?\d){8}\b|\b9(?:[\s-]?\d){8}\b/;

export interface LineaPegada {
  tipo: TipoBidonPedido;
  cantidad: number | null;
}

export interface PedidoPegado {
  /** Lo que escribió el cliente, sin los encabezados de WhatsApp. */
  texto: string;
  telefono: string | null;
  /** El nombre del contacto del encabezado, si no era un número. */
  nombre: string | null;
  lineas: LineaPegada[];
  /** Fecha de entrega propuesta (YYYY-MM-DD). No conoce los feriados: la persona la revisa. */
  fecha: string;
  /** Lo que dijo el cliente sobre el día, si dijo algo ("mañana", "el viernes"). */
  fechaTexto: string | null;
  comuna: string | null;
  formaPago: FormaDePagoMencionada | null;
  pideEnvase: boolean;
  /** Qué revisar antes de guardar, en palabras. */
  avisos: string[];
}

/** Lee el mensaje pegado. `ahora` decide "mañana" y el corte de las 9:00. */
export async function leerPedidoPegado(pegado: string, ahora: Date): Promise<PedidoPegado> {
  const textos: string[] = [];
  let remitente: string | null = null;
  for (const linea of pegado.slice(0, MAX_PEGADO).split(/\r?\n/)) {
    const encabezado = ENCABEZADO.exec(linea);
    if (encabezado) {
      remitente ??= (encabezado[1] ?? '').trim();
      textos.push(linea.slice(encabezado[0].length));
    } else {
      textos.push(linea);
    }
  }
  const texto = textos.map((t) => t.trim()).filter(Boolean).join('\n');

  const telefonoDelRemitente = remitente && TELEFONO.test(remitente) ? normalizarTelefono(remitente) : null;
  const telefonoEnTexto = TELEFONO.exec(texto);
  const telefono = telefonoDelRemitente ?? (telefonoEnTexto ? normalizarTelefono(telefonoEnTexto[0]) : null);
  const nombre = remitente && !telefonoDelRemitente && /\p{L}/u.test(remitente) ? remitente.slice(0, 80) : null;

  const interpretacion = interpretar(texto);
  const lineas = interpretacion.items.map((item) => ({ tipo: item.tipo, cantidad: item.cantidad }));
  const comuna = interpretacion.comuna_mencionada ?? null;
  // Sin acceso a la planilla, el panel no conoce los feriados: se propone igual y se avisa.
  const entrega = await proponerEntrega({}, ahora, { cargar: async () => new Set<string>(), solicitada: interpretacion.fecha_texto });

  const avisos: string[] = [];
  if (interpretacion.intencion === 'cambio') avisos.push('El mensaje parece cancelar o cambiar un pedido que ya existe: búscalo antes de anotar uno nuevo.');
  if (['reclamo', 'factura', 'proveedor'].includes(interpretacion.intencion)) avisos.push('El mensaje parece un reclamo, una factura o un proveedor: no es un pedido.');
  if (lineas.length === 0) avisos.push('No encontré cuántos bidones pidió: escríbelos.');
  if (lineas.some((l) => l.tipo === 'no_especificado')) avisos.push('No dijo de cuántos litros: elige el bidón.');
  if (lineas.some((l) => l.cantidad === null)) avisos.push('Dijo el bidón pero no cuántos: escribe la cantidad.');
  if (entrega.motivoAjuste === 'no_entendida') avisos.push(`No entendí el día que pidió ("${interpretacion.fecha_texto}"): elige la fecha.`);
  else if (entrega.motivoAjuste === 'muy_pronto') avisos.push(`Pidió "${interpretacion.fecha_texto}", pero ya pasó el corte: propuse el primer día posible.`);
  else if (entrega.motivoAjuste === 'sin_despacho') avisos.push(`Pidió "${interpretacion.fecha_texto}", que no tiene despacho: propuse el siguiente día.`);
  if (interpretacion.pide_envase) avisos.push('Pide envases nuevos: es carga inicial, revisa el precio.');
  if (!telefono) avisos.push('No encontré el teléfono: escríbelo para reconocer al cliente.');

  return {
    texto,
    telefono,
    nombre,
    lineas,
    fecha: entrega.fecha,
    fechaTexto: interpretacion.fecha_texto ?? null,
    comuna,
    formaPago: interpretacion.forma_pago ?? null,
    pideEnvase: interpretacion.pide_envase === true,
    avisos,
  };
}
