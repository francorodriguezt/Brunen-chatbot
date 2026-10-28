import { afterEach, describe, expect, it, vi } from 'vitest';
import { AlmacenD1 } from '../src/almacen';
import { LLAMADAS_POR_DIA, interpretarConRespaldo } from '../src/llm';
import { crearBaseSqlite } from './ayudas';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Estas pruebas corren el SQL de verdad (SQLite con el esquema de migrations/), a diferencia de las que usan
// una base de mentira que solo anota qué se le pidió.

describe('AlmacenD1 sobre SQLite real', () => {
  it('el primer mensaje es nuevo, el repetido no, y al liberarlo vuelve a ser nuevo', async () => {
    const almacen = new AlmacenD1(crearBaseSqlite());
    expect(await almacen.registrarSiEsNuevo('wamid.1', 1000)).toBe(true);
    expect(await almacen.registrarSiEsNuevo('wamid.1', 1001)).toBe(false);
    expect(await almacen.registrarSiEsNuevo('wamid.2', 1002)).toBe(true);
    await almacen.liberar('wamid.1');
    expect(await almacen.registrarSiEsNuevo('wamid.1', 1003)).toBe(true);
  });

  it('la limpieza borra solo lo de hace más de 7 días', async () => {
    const db = crearBaseSqlite();
    const almacen = new AlmacenD1(db, () => 0);
    const ahora = 1793000000;
    await almacen.registrarSiEsNuevo('viejo', ahora - 8 * 24 * 3600);
    await almacen.registrarSiEsNuevo('reciente', ahora - 3600);
    await almacen.limpiar(ahora);
    expect(db.sql('SELECT wamid FROM mensajes_procesados')).toEqual([{ wamid: 'reciente' }]);
  });
});

describe('tope diario de la IA sobre SQLite real', () => {
  const AHORA = 1793000000; // 2026-10-26 (UTC)

  function groqSaluda() {
    const llamadas = vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ intencion: 'saludo', items: [], envases_a_retirar: null, tipo_pregunta: null }) } }] }), { status: 200 }));
    vi.stubGlobal('fetch', llamadas);
    return llamadas;
  }

  it('permite exactamente el tope de llamadas por día y bloquea la siguiente', async () => {
    const db = crearBaseSqlite();
    const groq = groqSaluda();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = { GROQ_API_KEY: 'gsk_prueba', DB: db };
    for (let i = 0; i < LLAMADAS_POR_DIA; i++) {
      expect((await interpretarConRespaldo('xyz abc qwerty', env, AHORA)).conIa).toBe(true);
    }
    expect(groq).toHaveBeenCalledTimes(LLAMADAS_POR_DIA);
    expect((await interpretarConRespaldo('xyz abc qwerty', env, AHORA)).conIa).toBe(false);
    expect(groq).toHaveBeenCalledTimes(LLAMADAS_POR_DIA); // no se llamó a Groq por encima del tope
    expect(db.sql('SELECT dia, llamadas FROM uso_llm')).toEqual([{ dia: '2026-10-26', llamadas: LLAMADAS_POR_DIA }]);
  });

  it('al día siguiente (UTC) el contador empieza de cero', async () => {
    const db = crearBaseSqlite();
    const groq = groqSaluda();
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const env = { GROQ_API_KEY: 'gsk_prueba', DB: db };
    await db.prepare('INSERT INTO uso_llm (dia, llamadas) VALUES (?1, ?2)').bind('2026-10-26', LLAMADAS_POR_DIA).run();
    expect((await interpretarConRespaldo('xyz abc qwerty', env, AHORA)).conIa).toBe(false);
    expect((await interpretarConRespaldo('xyz abc qwerty', env, AHORA + 24 * 3600)).conIa).toBe(true);
    expect(groq).toHaveBeenCalledTimes(1);
  });
});

describe('migraciones', () => {
  it('crean las tablas que usa el código', () => {
    const tablas = crearBaseSqlite().sql("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name");
    expect(tablas).toEqual([
      { name: 'conversaciones' },
      { name: 'mensajes_pendientes' },
      { name: 'mensajes_procesados' },
      { name: 'ultimos_pedidos' },
      { name: 'uso_llm' },
    ]);
  });
});
