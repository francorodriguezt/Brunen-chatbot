/**
 * Página pública del aviso de privacidad (`/privacidad` en la dirección pública del panel, D116).
 *
 * El texto vive en `panel/privacidad.html` con tres huecos ({{RUT}}, {{CORREO}}, {{FECHA}}) que se llenan con variables
 * del Worker. Mientras falte una, o `PRIVACIDAD_PUBLICADA` no sea "SI", la página NO existe (404): así nunca se muestra
 * un aviso a medias ni con datos inventados. Meta pide esta dirección para ser Tech Provider y para cada app (docs/TECH_PROVIDER.md).
 */

export interface EntornoPrivacidad {
  /** "SI" cuando el dueño aprobó el texto y estas tres variables están completas. */
  PRIVACIDAD_PUBLICADA?: string;
  /** RUT de Brunen SpA, como se escribe en una factura: 76.123.456-7. */
  PRIVACIDAD_RUT?: string;
  /** Correo al que los clientes escriben por sus datos. */
  PRIVACIDAD_CORREO?: string;
  /** Fecha de esta versión, AAAA-MM-DD. */
  PRIVACIDAD_FECHA?: string;
}

export interface DatosDePrivacidad {
  rut: string;
  correo: string;
  /** Ya escrita para leerla: "27 de noviembre de 2026". */
  fecha: string;
}

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const RUT = /^\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]$/;
const CORREO = /^[^\s@<>"']+@[^\s@<>"']+\.[^\s@<>"']+$/;

/** "2026-11-27" → "27 de noviembre de 2026"; null si no es una fecha real. */
export function fechaLegible(valor: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!m) return null;
  const [anio, mes, dia] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  if (fecha.getUTCFullYear() !== anio || fecha.getUTCMonth() !== mes - 1 || fecha.getUTCDate() !== dia) return null;
  return `${dia} de ${MESES[mes - 1]} de ${anio}`;
}

/** Los datos del aviso, o null si no se debe publicar todavía (apagado, o falta o está mal escrita alguna variable). */
export function datosDePrivacidad(env: EntornoPrivacidad): DatosDePrivacidad | null {
  if (env.PRIVACIDAD_PUBLICADA?.trim().toUpperCase() !== 'SI') return null;
  const rut = env.PRIVACIDAD_RUT?.trim() ?? '';
  const correo = env.PRIVACIDAD_CORREO?.trim() ?? '';
  const fecha = fechaLegible(env.PRIVACIDAD_FECHA?.trim() ?? '');
  if (!RUT.test(rut) || !CORREO.test(correo) || !fecha) return null;
  return { rut, correo, fecha };
}

const escapar = (texto: string): string =>
  texto.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Llena los huecos de la plantilla con los datos, escapados para HTML. */
export function pintarPrivacidad(plantilla: string, datos: DatosDePrivacidad): string {
  return plantilla
    .replaceAll('{{RUT}}', escapar(datos.rut))
    .replaceAll('{{CORREO}}', escapar(datos.correo))
    .replaceAll('{{FECHA}}', escapar(datos.fecha));
}
