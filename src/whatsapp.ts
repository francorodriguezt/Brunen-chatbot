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
  ) {
    super(mensaje);
  }
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
    headers: {
      Authorization: `Bearer ${config.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: para,
      type: 'text',
      text: { preview_url: false, body: cuerpo },
    }),
  });
  if (!respuesta.ok) {
    // No se registra el token ni el cuerpo completo: solo el estado y el detalle de Meta.
    const detalle = await respuesta.text().catch(() => '');
    throw new ErrorWhatsApp(`Meta respondió ${respuesta.status}: ${detalle.slice(0, 300)}`, respuesta.status);
  }
}

/** Para logs: nunca registrar teléfonos completos. "56912345678" -> "*******5678". */
export function enmascararTelefono(telefono: string): string {
  return telefono.length <= 4 ? '****' : '*'.repeat(telefono.length - 4) + telefono.slice(-4);
}
