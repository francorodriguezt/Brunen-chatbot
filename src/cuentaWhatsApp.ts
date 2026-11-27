/**
 * Cambios en la cuenta de WhatsApp del negocio (D116). Cuando el número se comparte entre la app WhatsApp Business y la
 * API (coexistencia), Meta avisa con el campo `account_update` si el número se desconecta de la API: el cliente que
 * desconecta desde la app, un cambio de teléfono, un cierre por incumplir las normas o el nombre registrado con la app
 * de consumo. Sin este aviso el bot dejaría de contestar sin que nadie se entere hasta que un cliente reclame.
 *
 * Los campos `history` y `smb_app_state_sync` (el historial y los contactos de la app) se ignoran a propósito: el bot no
 * los usa y traen datos de clientes. Fuente:
 * https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/onboarding-business-app-users#webhooks
 */

import type { Alerta } from './alertas';

export interface CambioDeCuenta {
  evento: string;
  /** Solo en `PARTNER_REMOVED`: por qué (ACCOUNT_DISCONNECTED, BUSINESS_DOWNGRADE, CHANGE_NUMBER...). */
  motivo: string;
  /** Solo en `PARTNER_REMOVED`: USER o SYSTEM. */
  iniciadoPor: string;
  tiempo: number;
}

interface PayloadCuenta {
  object?: string;
  entry?: Array<{
    time?: number | string;
    changes?: Array<{ field?: string; value?: { event?: unknown; disconnection_info?: { reason?: unknown; initiated_by?: unknown } } }>;
  }>;
}

const texto = (v: unknown): string => (typeof v === 'string' ? v.replace(/[^A-Z0-9_]/gi, '').slice(0, 60) : '');

export function extraerCambiosDeCuenta(payload: unknown): CambioDeCuenta[] {
  const datos = payload as PayloadCuenta | null;
  if (!datos || typeof datos !== 'object' || datos.object !== 'whatsapp_business_account' || !Array.isArray(datos.entry)) return [];
  const cambios: CambioDeCuenta[] = [];
  for (const entrada of datos.entry) {
    for (const cambio of entrada?.changes ?? []) {
      if (cambio?.field !== 'account_update') continue;
      const evento = texto(cambio.value?.event);
      if (!evento) continue;
      cambios.push({
        evento,
        motivo: texto(cambio.value?.disconnection_info?.reason),
        iniciadoPor: texto(cambio.value?.disconnection_info?.initiated_by),
        tiempo: Number(entrada?.time ?? 0) || 0,
      });
    }
  }
  return cambios;
}

/** Lo que dejaría al bot sin poder atender: se avisa como urgente. */
const DESCONEXIONES: ReadonlySet<string> = new Set(['PARTNER_REMOVED', 'ACCOUNT_OFFBOARDED']);
const RECONEXIONES: ReadonlySet<string> = new Set(['ACCOUNT_RECONNECTED', 'PARTNER_ADDED']);

export interface AvisoDeCuenta {
  alerta: Alerta;
  /** El mismo cambio, reintentado por Meta, no deja un segundo aviso. */
  origen: string;
  urgente: boolean;
}

/** Null para los eventos que no piden nada (hay otros, como cambios de nombre o de estado, que solo se anotan en el registro). */
export function avisoDeCambioDeCuenta(cambio: CambioDeCuenta): AvisoDeCuenta | null {
  const origen = `cuenta:${cambio.evento}:${cambio.tiempo}`;
  if (DESCONEXIONES.has(cambio.evento)) {
    const detalle = [cambio.motivo && `motivo ${cambio.motivo}`, cambio.iniciadoPor && `lo inició ${cambio.iniciadoPor === 'USER' ? 'una persona del negocio' : 'el sistema de Meta'}`].filter(Boolean).join(', ');
    return {
      alerta: {
        tipo: 'error',
        telefono: '',
        resumen: `WhatsApp desconectó el número de la API (${cambio.evento}${detalle ? `: ${detalle}` : ''}). Mientras siga así, el bot no recibe ni responde mensajes. Revisa la app WhatsApp Business (Ajustes > Cuenta > Plataforma de empresa) y vuelve a conectar el número.`,
        motivos: [],
      },
      origen,
      urgente: true,
    };
  }
  if (RECONEXIONES.has(cambio.evento)) {
    return { alerta: { tipo: 'escalamiento', telefono: '', resumen: `El número de WhatsApp volvió a conectarse a la API (${cambio.evento}). El bot debería responder otra vez: prueba con un mensaje.`, motivos: [] }, origen, urgente: false };
  }
  return null;
}
