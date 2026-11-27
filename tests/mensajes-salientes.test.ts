import { describe, expect, it } from 'vitest';
import {
  MENSAJES_GRATIS_AL_MES,
  MENSAJES_PARA_AVISAR,
  contarMensaje,
  mensajesDelMes,
  mesDe,
  registrarMensajeEnviado,
  umbralQueCruza,
} from '../src/mensajesSalientes';
import { crearBaseSqlite } from './ayudas';

// El contador de mensajes salientes del mes (D113). Todo ficticio.
const NOVIEMBRE = 1794582000; // 13 de noviembre de 2026
const DICIEMBRE = 1797336000; // 15 de diciembre de 2026

describe('mesDe y umbralQueCruza', () => {
  it('el mes es el de UTC', () => {
    expect(mesDe(NOVIEMBRE)).toBe('2026-11');
    expect(mesDe(DICIEMBRE)).toBe('2026-12');
  });

  it('avisa en el mensaje 800 y en el 1.001, y en ningún otro', () => {
    expect(umbralQueCruza(MENSAJES_PARA_AVISAR - 1)).toBeNull();
    expect(umbralQueCruza(MENSAJES_PARA_AVISAR)).toBe('aviso');
    expect(umbralQueCruza(MENSAJES_PARA_AVISAR + 1)).toBeNull();
    expect(umbralQueCruza(MENSAJES_GRATIS_AL_MES)).toBeNull();
    expect(umbralQueCruza(MENSAJES_GRATIS_AL_MES + 1)).toBe('tope');
  });
});

describe('contarMensaje', () => {
  it('suma de a uno y lleva la cuenta de cada mes por separado', async () => {
    const db = crearBaseSqlite();
    expect(await contarMensaje(db, NOVIEMBRE)).toBe(1);
    expect(await contarMensaje(db, NOVIEMBRE)).toBe(2);
    expect(await contarMensaje(db, DICIEMBRE)).toBe(1);
    expect(await mensajesDelMes(db, NOVIEMBRE)).toBe(2);
    expect(await mensajesDelMes(db, DICIEMBRE)).toBe(1);
  });

  it('un mes sin mensajes cuenta 0', async () => {
    expect(await mensajesDelMes(crearBaseSqlite(), NOVIEMBRE)).toBe(0);
  });

  it('si la base falla (falta la tabla), no lanza y devuelve null', async () => {
    const db = crearBaseSqlite('0021');
    expect(await contarMensaje(db, NOVIEMBRE)).toBeNull();
    expect(await registrarMensajeEnviado(db, NOVIEMBRE)).toBeNull();
  });
});

describe('registrarMensajeEnviado', () => {
  const avisos = (db: ReturnType<typeof crearBaseSqlite>) => db.sql('SELECT tipo, resumen, origen FROM avisos ORDER BY id') as Array<Record<string, string>>;

  it('mientras no llega a 800 no deja ningún aviso', async () => {
    const db = crearBaseSqlite();
    db.sql("INSERT INTO uso_mensajes (mes, enviados) VALUES ('2026-11', 797)");
    expect(await registrarMensajeEnviado(db, NOVIEMBRE)).toBeNull(); // 798
    expect(await registrarMensajeEnviado(db, NOVIEMBRE)).toBeNull(); // 799
    expect(avisos(db)).toEqual([]);
  });

  it('en el 800 deja un aviso en el panel y devuelve la alerta para Telegram, una sola vez', async () => {
    const db = crearBaseSqlite();
    db.sql("INSERT INTO uso_mensajes (mes, enviados) VALUES ('2026-11', 799)");
    const alerta = await registrarMensajeEnviado(db, NOVIEMBRE);
    expect(alerta?.tipo).toBe('error');
    expect(alerta?.resumen).toContain('800 mensajes');
    expect(avisos(db)).toEqual([expect.objectContaining({ tipo: 'error', origen: 'mensajes-aviso:2026-11' })]);
    expect(await registrarMensajeEnviado(db, NOVIEMBRE)).toBeNull(); // 801
    expect(avisos(db)).toHaveLength(1);
  });

  it('pasado el tope avisa de nuevo, con otro texto', async () => {
    const db = crearBaseSqlite();
    db.sql("INSERT INTO uso_mensajes (mes, enviados) VALUES ('2026-11', 1000)");
    const alerta = await registrarMensajeEnviado(db, NOVIEMBRE);
    expect(alerta?.resumen).toContain('pasó los 1000 mensajes gratis');
    expect(avisos(db)[0]?.origen).toBe('mensajes-tope:2026-11');
  });

  it('el mes siguiente vuelve a avisar', async () => {
    const db = crearBaseSqlite();
    db.sql("INSERT INTO uso_mensajes (mes, enviados) VALUES ('2026-11', 799), ('2026-12', 799)");
    expect(await registrarMensajeEnviado(db, NOVIEMBRE)).not.toBeNull();
    expect(await registrarMensajeEnviado(db, DICIEMBRE)).not.toBeNull();
    expect(avisos(db)).toHaveLength(2);
  });
});
