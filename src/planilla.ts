/**
 * Registro de mensajes y errores en la planilla de Google Sheets, como vista para Constanza
 * (hojas MENSAJES_PROCESADOS y ERRORES). La deduplicación real vive en D1 (D20), no aquí.
 *
 * Privacidad: nunca se guarda el texto del mensaje, el teléfono va enmascarado.
 * Sin las variables GOOGLE_SERVICE_ACCOUNT_JSON y GOOGLE_SHEET_ID no se registra nada y el bot
 * funciona igual; si Google falla, el error se anota en el log y el mensaje se atiende igual.
 */

import { fechaHoraLocal } from './despacho';
import { ClienteSheets, type CuentaServicio } from './google';

// Los mensajes repetidos (reintentos de Meta) no se anotan: solo quedan en el log, para no llenar la hoja.

export type Resultado = 'respondido' | 'ignorado_modo_prueba' | 'ignorado_bot_apagado' | 'error';

export interface RegistroMensaje {
  wamid: string;
  telefonoEnmascarado: string;
  tipo: string;
  resultado: Resultado;
  /** Lo que entendió el intérprete (pedido, pregunta, reclamo...). */
  intencion?: string;
  /** Solo cuando resultado = "error". */
  error?: string;
}

export interface Planilla {
  guardar(registros: readonly RegistroMensaje[], ahora?: Date): Promise<void>;
}

export interface EntornoPlanilla {
  GOOGLE_SERVICE_ACCOUNT_JSON?: string;
  GOOGLE_SHEET_ID?: string;
}

function textoFechaHora(ahora: Date): string {
  const local = fechaHoraLocal(ahora);
  const dosDigitos = (n: number) => String(n).padStart(2, '0');
  return `${local.fecha} ${dosDigitos(local.hora)}:${dosDigitos(local.minuto)}`;
}

class PlanillaSheets implements Planilla {
  constructor(private readonly cliente: ClienteSheets) {}

  async guardar(registros: readonly RegistroMensaje[], ahora: Date = new Date()): Promise<void> {
    const cuando = textoFechaHora(ahora);
    const mensajes = registros.map((r) => [cuando, r.wamid, r.telefonoEnmascarado, r.tipo, r.resultado, r.intencion ?? '']);
    const errores = registros.filter((r) => r.error).map((r) => [cuando, 'webhook', r.wamid, (r.error ?? '').slice(0, 300)]);
    await Promise.all([
      this.cliente.agregarFilas('MENSAJES_PROCESADOS', mensajes),
      this.cliente.agregarFilas('ERRORES', errores),
    ]);
  }
}

export function planillaDe(env: EntornoPlanilla): Planilla | null {
  if (!env.GOOGLE_SERVICE_ACCOUNT_JSON || !env.GOOGLE_SHEET_ID) return null;
  try {
    const cuenta = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON) as Partial<CuentaServicio>;
    if (!cuenta.client_email || !cuenta.private_key) throw new Error('faltan client_email o private_key');
    return new PlanillaSheets(new ClienteSheets({ client_email: cuenta.client_email, private_key: cuenta.private_key }, env.GOOGLE_SHEET_ID));
  } catch (error) {
    console.error('GOOGLE_SERVICE_ACCOUNT_JSON inválida; no se registrará en la planilla:', error instanceof Error ? error.message : error);
    return null;
  }
}
