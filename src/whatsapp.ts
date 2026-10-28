/**
 * Utilidades para la WhatsApp Cloud API de Meta.
 * - extraerMensajes: normaliza el payload del webhook.
 * - enviarTexto: envía un mensaje de texto (cada envío cuenta para el cupo de 1.000 gratis al mes).
 */

export interface MensajeEntrante {
  id: string; // wamid, sirve para deduplicar
  de: string; // teléfono del cliente en formato internacional sin "+"
  timestamp: number; // segundos Unix
  tipo: string; // text | image | audio | interactive | ...
  texto?: string;
}

interface PayloadWebhook {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      field?: string;
      value?: {
        messages?: Array<{
          id?: string;
          from?: string;
          timestamp?: string;
          type?: string;
          text?: { body?: string };
        }>;
      };
    }>;
  }>;
}

/** Devuelve solo mensajes de clientes; ignora estados de entrega (statuses) y datos incompletos. */
export function extraerMensajes(payload: unknown): MensajeEntrante[] {
  const datos = payload as PayloadWebhook;
  if (!datos || datos.object !== 'whatsapp_business_account' || !Array.isArray(datos.entry)) {
    return [];
  }
  const mensajes: MensajeEntrante[] = [];
  for (const entrada of datos.entry) {
    for (const cambio of entrada.changes ?? []) {
      for (const m of cambio.value?.messages ?? []) {
        if (!m.id || !m.from || !m.type) continue;
        mensajes.push({
          id: m.id,
          de: m.from,
          timestamp: Number(m.timestamp ?? 0),
          tipo: m.type,
          texto: m.type === 'text' ? m.text?.body : undefined,
        });
      }
    }
  }
  return mensajes;
}

export interface ConfigWhatsApp {
  token: string;
  phoneNumberId: string;
  /** Versión de la Graph API, p. ej. "vNN.N". Verificar la vigente en la doc de Meta; no se fija en el código. */
  graphApiVersion: string;
}

export class ErrorWhatsApp extends Error {
  constructor(
    mensaje: string,
    readonly status?: number,
    /** Código de error que devuelve Meta en el cuerpo (190 = token vencido o inválido). */
    readonly codigoMeta?: number,
  ) {
    super(mensaje);
  }
}

/** Máximo de caracteres de un mensaje de texto de WhatsApp. */
export const LIMITE_TEXTO = 4096;
/** Si Meta no responde en este tiempo, el envío falla en vez de dejar colgado el procesamiento. */
const TIEMPO_MAXIMO_ENVIO_MS = 8000;

function recortar(texto: string): string {
  return texto.length > LIMITE_TEXTO ? texto.slice(0, LIMITE_TEXTO - 1) + '…' : texto;
}

export async function enviarTexto(config: ConfigWhatsApp, para: string, cuerpo: string): Promise<void> {
  // Exige mayor >= 1: así el valor de relleno "v00.0" de wrangler.toml falla aquí con un mensaje claro.
  if (!/^v[1-9]\d*\.\d+$/.test(config.graphApiVersion)) {
    throw new ErrorWhatsApp(
      `GRAPH_API_VERSION inválida: "${config.graphApiVersion}" (formato esperado vNN.N; copia la de API Setup en Meta)`,
    );
  }
  const url = `https://graph.facebook.com/${config.graphApiVersion}/${config.phoneNumberId}/messages`;
  const respuesta = await fetch(url, {
    method: 'POST',
    signal: AbortSignal.timeout(TIEMPO_MAXIMO_ENVIO_MS),
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: para,
      type: 'text',
      text: { preview_url: false, body: recortar(cuerpo) },
    }),
  });
  if (!respuesta.ok) {
    // No se registra el token ni el cuerpo completo: solo el estado y el detalle de Meta.
    const detalle = await respuesta.text().catch(() => '');
    throw new ErrorWhatsApp(`Meta respondió ${respuesta.status}: ${detalle.slice(0, 300)}`, respuesta.status, codigoDeError(detalle));
  }
}

/** Para logs: nunca registrar teléfonos completos. "56912345678" -> "*******5678". */
export function enmascararTelefono(telefono: string): string {
  return telefono.length <= 4 ? '****' : '*'.repeat(telefono.length - 4) + telefono.slice(-4);
}

function codigoDeError(detalle: string): number | undefined {
  try {
    const codigo = (JSON.parse(detalle) as { error?: { code?: unknown } }).error?.code;
    return typeof codigo === 'number' ? codigo : undefined;
  } catch {
    return undefined;
  }
}

/** El token de acceso venció o no es válido (los temporales duran 24 h). */
export function esErrorDeToken(error: unknown): boolean {
  return error instanceof ErrorWhatsApp && (error.status === 401 || error.codigoMeta === 190);
}

export interface EstadoMensaje {
  id: string; // wamid del mensaje que envió el bot
  para: string; // teléfono del cliente
  estado: string; // sent | delivered | read | failed
  codigoError?: number;
  tituloError?: string;
}

interface PayloadEstados {
  object?: string;
  entry?: Array<{
    changes?: Array<{
      value?: {
        statuses?: Array<{
          id?: string;
          status?: string;
          recipient_id?: string;
          errors?: Array<{ code?: number; title?: string }>;
        }>;
      };
    }>;
  }>;
}

/** Avisos de entrega de Meta sobre los mensajes que envió el bot (enviado, entregado, leído o fallido). */
export function extraerEstados(payload: unknown): EstadoMensaje[] {
  const datos = payload as PayloadEstados;
  if (!datos || datos.object !== 'whatsapp_business_account' || !Array.isArray(datos.entry)) return [];
  const estados: EstadoMensaje[] = [];
  for (const entrada of datos.entry) {
    for (const cambio of entrada.changes ?? []) {
      for (const s of cambio.value?.statuses ?? []) {
        if (!s.id || !s.status || !s.recipient_id) continue;
        const error = s.errors?.[0];
        estados.push({ id: s.id, para: s.recipient_id, estado: s.status, codigoError: error?.code, tituloError: error?.title });
      }
    }
  }
  return estados;
}

/**
 * Deja un teléfono en el formato de WhatsApp (solo dígitos, con código de país), para comparar el que
 * llega en un mensaje con el que alguien escribió en una hoja: "+56 9 8765 4321", "9 8765 4321" y
 * "56987654321" dan lo mismo. Devuelve null si no parece un teléfono.
 */
export function normalizarTelefono(texto: string): string | null {
  let digitos = texto.replace(/\D/g, '');
  if (digitos.startsWith('00')) digitos = digitos.slice(2);
  if (digitos.length === 9) return `56${digitos}`; // sin código de país: se asume Chile
  if (digitos.length === 11 && digitos.startsWith('56')) return digitos;
  if (digitos.length >= 10 && digitos.length <= 15 && !digitos.startsWith('56')) return digitos; // otro país, tal cual
  return null;
}
