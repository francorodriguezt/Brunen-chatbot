import { describe, expect, it } from 'vitest';
import { avisoDeCambioDeCuenta, extraerCambiosDeCuenta } from '../src/cuentaWhatsApp';

// Los avisos `account_update` de Meta (D116). Los identificadores son ficticios.
const envio = (value: Record<string, unknown>, field = 'account_update', tiempo: number | string = 1794582000) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: '1111111111', time: tiempo, changes: [{ field, value }] }],
});

describe('extraerCambiosDeCuenta', () => {
  it('lee la desconexión con su motivo y quién la inició', () => {
    const payload = envio({ event: 'PARTNER_REMOVED', waba_info: { waba_id: '1' }, disconnection_info: { reason: 'BUSINESS_DOWNGRADE', initiated_by: 'USER' } });
    expect(extraerCambiosDeCuenta(payload)).toEqual([{ evento: 'PARTNER_REMOVED', motivo: 'BUSINESS_DOWNGRADE', iniciadoPor: 'USER', tiempo: 1794582000 }]);
  });

  it('lee el cierre y la reconexión (con el tiempo como texto, como los manda Meta en esos casos)', () => {
    expect(extraerCambiosDeCuenta(envio({ event: 'ACCOUNT_OFFBOARDED' }, 'account_update', '1794582000'))).toEqual([{ evento: 'ACCOUNT_OFFBOARDED', motivo: '', iniciadoPor: '', tiempo: 1794582000 }]);
    expect(extraerCambiosDeCuenta(envio({ event: 'ACCOUNT_RECONNECTED' }))[0]?.evento).toBe('ACCOUNT_RECONNECTED');
  });

  it('ignora otros campos (mensajes, historial, contactos) y lo que no tiene la forma esperada', () => {
    for (const campo of ['messages', 'history', 'smb_app_state_sync', 'smb_message_echoes']) expect(extraerCambiosDeCuenta(envio({ event: 'PARTNER_REMOVED' }, campo))).toEqual([]);
    for (const raro of [null, 'texto', 42, {}, { object: 'otro', entry: [] }, { object: 'whatsapp_business_account', entry: 'no' }, envio({})]) expect(extraerCambiosDeCuenta(raro)).toEqual([]);
  });

  it('deja solo letras mayúsculas y guiones bajos: lo que viaja al aviso no puede traer texto libre', () => {
    const [c] = extraerCambiosDeCuenta(envio({ event: 'PARTNER_REMOVED <b>x</b>', disconnection_info: { reason: 'ACCOUNT_DISCONNECTED\nCalle Falsa 123', initiated_by: 'SYSTEM' } }));
    expect(c?.evento).toMatch(/^[A-Za-z0-9_]+$/);
    expect(c?.motivo).toMatch(/^[A-Za-z0-9_]+$/);
  });
});

describe('avisoDeCambioDeCuenta', () => {
  it('una desconexión es urgente, dice qué hacer y no se repite si Meta reintenta', () => {
    const aviso = avisoDeCambioDeCuenta({ evento: 'PARTNER_REMOVED', motivo: 'CHANGE_NUMBER', iniciadoPor: 'USER', tiempo: 1794582000 });
    expect(aviso?.urgente).toBe(true);
    expect(aviso?.alerta.tipo).toBe('error');
    expect(aviso?.alerta.resumen).toContain('no recibe ni responde mensajes');
    expect(aviso?.alerta.resumen).toContain('CHANGE_NUMBER');
    expect(aviso?.alerta.resumen).toContain('una persona del negocio');
    expect(aviso?.origen).toBe('cuenta:PARTNER_REMOVED:1794582000');
  });

  it('el cierre por cambio de equipo también es urgente', () => {
    expect(avisoDeCambioDeCuenta({ evento: 'ACCOUNT_OFFBOARDED', motivo: '', iniciadoPor: '', tiempo: 5 })?.urgente).toBe(true);
  });

  it('la reconexión avisa en el panel, sin urgencia; el resto de los eventos no avisa', () => {
    const volvio = avisoDeCambioDeCuenta({ evento: 'ACCOUNT_RECONNECTED', motivo: '', iniciadoPor: '', tiempo: 5 });
    expect(volvio?.urgente).toBe(false);
    expect(volvio?.alerta.tipo).toBe('escalamiento');
    expect(avisoDeCambioDeCuenta({ evento: 'VERIFIED_NAME_APPROVED', motivo: '', iniciadoPor: '', tiempo: 5 })).toBeNull();
  });
});
