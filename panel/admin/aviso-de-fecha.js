/**
 * Aviso al elegir la fecha de entrega en el panel (D101): el bot nunca ofrece un domingo ni un día marcado sin reparto
 * (D74), pero al anotar o cambiar un pedido a mano se podía elegir sin darse cuenta. No bloquea: puede haber una
 * excepción (una empresa que recibe el domingo); solo lo dice. Los feriados viven en la planilla y el panel no la lee,
 * así que no los conoce.
 */

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];

/**
 * "" si la fecha está bien, o el aviso en palabras. `hoy` en YYYY-MM-DD (hora de Santiago) y `sinReparto` como
 * { "2026-12-24": "Nochebuena" }.
 */
export function avisoDeFecha(iso, hoy, sinReparto = {}) {
  const [anio, mes, dia] = String(iso).split('-').map(Number);
  if (!anio || !mes || !dia) return '';
  if (iso < hoy) return 'Esa fecha ya pasó.';
  if (Object.hasOwn(sinReparto, iso)) return `Ese día está marcado sin reparto${sinReparto[iso] ? ` (${sinReparto[iso]})` : ''}.`;
  const semana = new Date(Date.UTC(anio, mes - 1, dia, 12)).getUTCDay();
  if (semana === 0) return 'Es domingo: no hay reparto.';
  if (semana === 6) return `Es ${DIAS[6]}: el reparto es hasta las 15:00.`;
  return '';
}
