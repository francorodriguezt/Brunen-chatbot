import { describe, expect, it } from 'vitest';
import { Cuentas, DURACION_RECORDADA_SEGUNDOS, DURACION_SIN_RECORDAR_SEGUNDOS, MAX_INTENTOS, claveDebil } from '../src/panel/cuentas';
import { formatearRut, normalizarRut } from '../src/panel/rut';
import { crearBaseSqlite } from './ayudas';

const AHORA = 1793000000;
const SECRETO = 'secreto-de-prueba-con-mas-de-32-caracteres';
// RUT de prueba con dígito verificador correcto (no son de personas reales).
const RUT_ADMIN = '11.111.111-1';
const RUT_REPARTIDOR = '22.222.222-2';
const CLAVE = '2580';

function crear() {
  const db = crearBaseSqlite();
  return { db, cuentas: new Cuentas(db, SECRETO) };
}

async function conRepartidor() {
  const base = crear();
  const creado = await base.cuentas.crearUsuario({ rut: RUT_REPARTIDOR, nombre: 'Repartidor Demo', rol: 'repartidor', clave: CLAVE }, 'admin@brunen.test', AHORA);
  if (!creado.ok) throw new Error(creado.error);
  return { ...base, repartidor: creado.valor };
}

const ingreso = (cambios: Record<string, unknown> = {}) => ({ rol: 'repartidor' as const, rut: RUT_REPARTIDOR, clave: CLAVE, recordar: false, origen: '203.0.113.7', dispositivo: 'Android · Chrome', ...cambios });

describe('RUT', () => {
  it.each([
    ['11.111.111-1', '111111111'],
    ['11111111-1', '111111111'],
    ['111111111', '111111111'],
    [' 22.222.222-2 ', '222222222'],
    ['12.345.678-5', '123456785'],
    ['6.000.000-K', '6000000K'],
    ['6000000k', '6000000K'],
  ])('acepta %s', (texto, esperado) => {
    expect(normalizarRut(texto)).toBe(esperado);
  });

  it.each([['11.111.111-2'], ['12.345.678-9'], ['123'], [''], ['abc'], ['11.111.111'], ['111111111111'], ['11.111.111-1; DROP']])('rechaza %s', (texto) => {
    expect(normalizarRut(texto)).toBeNull();
  });

  it('lo escribe con puntos y guion', () => {
    expect(formatearRut('111111111')).toBe('11.111.111-1');
    expect(formatearRut('6000000K')).toBe('6.000.000-K');
  });
});

describe('claves de 4 dígitos', () => {
  it.each([['0000'], ['7777'], ['1234'], ['4321'], ['6789'], ['1111'], ['2222']])('%s es demasiado fácil de adivinar', (clave) => {
    expect(claveDebil(clave, '123456785')).toBe(true);
  });

  it('tampoco sirve el principio ni el final del propio RUT', () => {
    expect(claveDebil('1234', '123456785')).toBe(true);
    expect(claveDebil('5678', '123456785')).toBe(true);
  });

  it('una clave cualquiera sí', () => {
    expect(claveDebil('2580', '123456785')).toBe(false);
    expect(claveDebil('9041', '123456785')).toBe(false);
  });
});

describe('crear usuarios', () => {
  it('guarda al usuario sin guardar la clave', async () => {
    const { db, repartidor } = await conRepartidor();
    expect(repartidor).toMatchObject({ rut: '222222222', nombre: 'Repartidor Demo', rol: 'repartidor', correo: null, activo: true });
    const [fila] = db.sql('SELECT * FROM usuarios') as Array<Record<string, unknown>>;
    expect(JSON.stringify(fila)).not.toContain(CLAVE);
    expect(String(fila?.clave_hash)).toMatch(/^[0-9a-f]{64}$/);
    expect(fila?.creado_por).toBe('admin@brunen.test');
  });

  it('dos usuarios con la misma clave no comparten huella', async () => {
    const { db, cuentas } = await conRepartidor();
    await cuentas.crearUsuario({ rut: RUT_ADMIN, nombre: 'Otra Persona', rol: 'repartidor', clave: CLAVE }, 'x', AHORA);
    const huellas = (db.sql('SELECT clave_hash FROM usuarios') as Array<{ clave_hash: string }>).map((f) => f.clave_hash);
    expect(new Set(huellas).size).toBe(2);
  });

  it.each([
    [{ rut: '11.111.111-2' }, 'rut_invalido'],
    [{ clave: '123' }, 'clave_invalida'],
    [{ clave: '12345' }, 'clave_invalida'],
    [{ clave: 'abcd' }, 'clave_invalida'],
    [{ clave: '1234' }, 'clave_debil'],
    [{ nombre: ' ' }, 'nombre_invalido'],
    [{ rol: 'administrador' }, 'correo_invalido'],
  ])('rechaza %j', async (cambios, error) => {
    const { cuentas } = crear();
    const r = await cuentas.crearUsuario({ rut: RUT_REPARTIDOR, nombre: 'Demo', rol: 'repartidor', clave: CLAVE, ...cambios } as never, 'x', AHORA);
    expect(r).toEqual({ ok: false, error });
  });

  it('no deja repetir el RUT ni el correo', async () => {
    const { cuentas } = await conRepartidor();
    expect(await cuentas.crearUsuario({ rut: '22222222-2', nombre: 'Otro', rol: 'repartidor', clave: '9041' }, 'x', AHORA)).toEqual({ ok: false, error: 'rut_repetido' });
    await cuentas.crearUsuario({ rut: RUT_ADMIN, nombre: 'Admin', rol: 'administrador', clave: CLAVE, correo: 'Admin@Brunen.test' }, 'x', AHORA);
    expect(await cuentas.crearUsuario({ rut: '12.345.678-5', nombre: 'Otro', rol: 'administrador', clave: CLAVE, correo: 'admin@brunen.test' }, 'x', AHORA)).toEqual({ ok: false, error: 'correo_repetido' });
  });
});

describe('entrar', () => {
  it('con el RUT y la clave correctos devuelve un token y deja la sesión guardada solo como huella', async () => {
    const { db, cuentas } = await conRepartidor();
    const r = await cuentas.entrar(ingreso(), AHORA);
    if (!r.ok) throw new Error(r.motivo);
    expect(r.token.length).toBeGreaterThanOrEqual(40);
    expect(r.usuario.nombre).toBe('Repartidor Demo');
    expect(r.venceEn).toBe(AHORA + DURACION_SIN_RECORDAR_SEGUNDOS);
    const [sesion] = db.sql('SELECT * FROM sesiones') as Array<Record<string, unknown>>;
    expect(JSON.stringify(sesion)).not.toContain(r.token);
    expect(sesion?.dispositivo).toBe('Android · Chrome');
  });

  it('acepta el RUT escrito de cualquier forma', async () => {
    const { cuentas } = await conRepartidor();
    expect((await cuentas.entrar(ingreso({ rut: '222222222' }), AHORA)).ok).toBe(true);
  });

  it('"recordar este dispositivo" dura 30 días', async () => {
    const { cuentas } = await conRepartidor();
    const r = await cuentas.entrar(ingreso({ recordar: true }), AHORA);
    expect(r.ok && r.venceEn).toBe(AHORA + DURACION_RECORDADA_SEGUNDOS);
  });

  it.each([
    ['clave equivocada', { clave: '9041' }],
    ['RUT que no existe', { rut: RUT_ADMIN }],
    ['RUT mal escrito', { rut: 'no-es-un-rut' }],
    ['otro rol', { rol: 'administrador' }],
    ['clave que no son 4 dígitos', { clave: '25801' }],
  ])('%s: responde lo mismo, sin decir qué falló', async (_nombre, cambios) => {
    const { cuentas } = await conRepartidor();
    expect(await cuentas.entrar(ingreso(cambios), AHORA)).toEqual({ ok: false, motivo: 'credenciales' });
  });

  it('un usuario desactivado no entra', async () => {
    const { cuentas, repartidor } = await conRepartidor();
    await cuentas.cambiarEstado(repartidor.id, false, AHORA);
    expect(await cuentas.entrar(ingreso(), AHORA)).toEqual({ ok: false, motivo: 'credenciales' });
  });

  it('un administrador solo entra con el correo con el que pasó por Access', async () => {
    const { cuentas } = crear();
    await cuentas.crearUsuario({ rut: RUT_ADMIN, nombre: 'Admin', rol: 'administrador', clave: CLAVE, correo: 'admin@brunen.test' }, 'admin@brunen.test', AHORA);
    const base = { rol: 'administrador' as const, rut: RUT_ADMIN, clave: CLAVE, recordar: false, origen: 'x', dispositivo: '' };
    expect((await cuentas.entrar({ ...base, correo: 'otro@brunen.test' }, AHORA)).ok).toBe(false);
    expect((await cuentas.entrar({ ...base }, AHORA)).ok).toBe(false);
    expect((await cuentas.entrar({ ...base, correo: 'ADMIN@brunen.test' }, AHORA)).ok).toBe(true);
  });

  it('sin el secreto del servidor nadie entra', async () => {
    const { db } = await conRepartidor();
    expect(Cuentas.secretoValido('corto')).toBe(false);
    expect(() => new Cuentas(db, 'corto')).toThrow();
  });
});

describe('bloqueo por intentos fallidos', () => {
  it(`al intento fallido número ${MAX_INTENTOS} se bloquea 15 minutos, aunque después se escriba la clave correcta`, async () => {
    const { cuentas } = await conRepartidor();
    for (let i = 1; i < MAX_INTENTOS; i++) expect(await cuentas.entrar(ingreso({ clave: '9041' }), AHORA + i)).toEqual({ ok: false, motivo: 'credenciales' });
    const quinto = await cuentas.entrar(ingreso({ clave: '9041' }), AHORA + 10);
    expect(quinto).toMatchObject({ ok: false, motivo: 'bloqueado', hasta: AHORA + 10 + 15 * 60, recien: true, nombre: 'Repartidor Demo' });
    expect(await cuentas.entrar(ingreso(), AHORA + 60)).toMatchObject({ ok: false, motivo: 'bloqueado', recien: false });
  });

  it('pasado el bloqueo se puede entrar, y entrar bien borra la cuenta de fallos', async () => {
    const { db, cuentas } = await conRepartidor();
    for (let i = 0; i < MAX_INTENTOS; i++) await cuentas.entrar(ingreso({ clave: '9041' }), AHORA);
    expect((await cuentas.entrar(ingreso(), AHORA + 15 * 60 + 1)).ok).toBe(true);
    expect(db.sql('SELECT intentos_fallidos, bloqueado_hasta, bloqueos FROM usuarios')).toEqual([{ intentos_fallidos: 0, bloqueado_hasta: 0, bloqueos: 0 }]);
  });

  it('cada bloqueo seguido dura más: 15 minutos, 1 hora, 4 horas… hasta un día', async () => {
    const { cuentas } = await conRepartidor();
    let ahora = AHORA;
    const duraciones: number[] = [];
    for (let ronda = 0; ronda < 6; ronda++) {
      let ultimo;
      for (let i = 0; i < MAX_INTENTOS; i++) ultimo = await cuentas.entrar(ingreso({ clave: '9041' }), ahora);
      if (!ultimo || ultimo.ok || ultimo.motivo !== 'bloqueado') throw new Error('debió bloquearse');
      duraciones.push(ultimo.hasta - ahora);
      ahora = ultimo.hasta + 1;
    }
    expect(duraciones).toEqual([900, 3600, 14400, 57600, 86400, 86400]);
  });

  it('aciertos entre medio no dejan acumular fallos sin límite: 4 fallos, un acierto y 4 fallos no bloquean', async () => {
    const { cuentas } = await conRepartidor();
    for (let i = 0; i < MAX_INTENTOS - 1; i++) await cuentas.entrar(ingreso({ clave: '9041' }), AHORA);
    expect((await cuentas.entrar(ingreso(), AHORA)).ok).toBe(true);
    for (let i = 0; i < MAX_INTENTOS - 1; i++) expect(await cuentas.entrar(ingreso({ clave: '9041' }), AHORA)).toEqual({ ok: false, motivo: 'credenciales' });
  });

  it('desde un mismo origen, 20 fallos en una hora cortan los intentos contra cualquier RUT', async () => {
    const { cuentas } = await conRepartidor();
    for (let i = 0; i < 20; i++) await cuentas.entrar(ingreso({ rut: RUT_ADMIN }), AHORA + i);
    expect(await cuentas.entrar(ingreso(), AHORA + 30)).toEqual({ ok: false, motivo: 'demasiados_intentos' });
    expect((await cuentas.entrar(ingreso({ origen: '198.51.100.9' }), AHORA + 30)).ok).toBe(true);
    expect((await cuentas.entrar(ingreso(), AHORA + 3700)).ok).toBe(true);
  });

  it('no guarda la dirección IP, solo una huella', async () => {
    const { db, cuentas } = await conRepartidor();
    await cuentas.entrar(ingreso({ clave: '9041' }), AHORA);
    expect(JSON.stringify(db.sql('SELECT * FROM intentos_de_ingreso'))).not.toContain('203.0.113.7');
  });
});

describe('sesiones', () => {
  async function conSesion(recordar = false) {
    const base = await conRepartidor();
    const r = await base.cuentas.entrar(ingreso({ recordar }), AHORA);
    if (!r.ok) throw new Error(r.motivo);
    return { ...base, token: r.token };
  }

  it('el token reconoce al usuario hasta que vence', async () => {
    const { cuentas, token } = await conSesion();
    expect((await cuentas.sesionDe(token, AHORA + 60))?.usuario).toMatchObject({ nombre: 'Repartidor Demo', rol: 'repartidor' });
    expect(await cuentas.sesionDe(token, AHORA + DURACION_SIN_RECORDAR_SEGUNDOS + 1)).toBeNull();
  });

  it('un token inventado o vacío no sirve', async () => {
    const { cuentas } = await conSesion();
    expect(await cuentas.sesionDe('inventado', AHORA)).toBeNull();
    expect(await cuentas.sesionDe('', AHORA)).toBeNull();
    expect(await cuentas.sesionDe(null, AHORA)).toBeNull();
  });

  it('un dispositivo recordado se renueva solo mientras se use: no vuelve a pedir la clave', async () => {
    const { cuentas, token } = await conSesion(true);
    const unDia = 86400;
    let ahora = AHORA;
    for (let dia = 0; dia < 90; dia += 20) {
      ahora = AHORA + dia * unDia;
      expect(await cuentas.sesionDe(token, ahora)).not.toBeNull();
    }
    const renovada = await cuentas.sesionDe(token, ahora + 2 * unDia);
    expect(renovada).toMatchObject({ renovada: true, venceEn: ahora + 2 * unDia + DURACION_RECORDADA_SEGUNDOS });
  });

  it('un dispositivo recordado que no se usa en 30 días sí vence', async () => {
    const { cuentas, token } = await conSesion(true);
    expect(await cuentas.sesionDe(token, AHORA + DURACION_RECORDADA_SEGUNDOS + 1)).toBeNull();
  });

  it('una sesión sin "recordar" no se alarga por usarla', async () => {
    const { cuentas, token } = await conSesion(false);
    await cuentas.sesionDe(token, AHORA + DURACION_SIN_RECORDAR_SEGUNDOS - 10);
    expect(await cuentas.sesionDe(token, AHORA + DURACION_SIN_RECORDAR_SEGUNDOS + 1)).toBeNull();
  });

  it('salir borra la sesión', async () => {
    const { cuentas, token } = await conSesion(true);
    await cuentas.salir(token);
    expect(await cuentas.sesionDe(token, AHORA + 1)).toBeNull();
  });

  it('cambiar la clave cierra las sesiones abiertas, quita el bloqueo y deja entrar con la nueva', async () => {
    const { cuentas, token, repartidor } = await conSesion(true);
    for (let i = 0; i < MAX_INTENTOS; i++) await cuentas.entrar(ingreso({ clave: '9041' }), AHORA);
    expect(await cuentas.cambiarClave(repartidor.id, '7410', AHORA + 5)).toEqual({ ok: true, valor: true });
    expect(await cuentas.sesionDe(token, AHORA + 6)).toBeNull();
    expect((await cuentas.entrar(ingreso(), AHORA + 6)).ok).toBe(false);
    expect((await cuentas.entrar(ingreso({ clave: '7410', origen: 'otro' }), AHORA + 7)).ok).toBe(true);
  });

  it('cambiar la clave valida la nueva', async () => {
    const { cuentas, repartidor } = await conSesion();
    expect(await cuentas.cambiarClave(repartidor.id, '0000', AHORA)).toEqual({ ok: false, error: 'clave_debil' });
    expect(await cuentas.cambiarClave(999, '7410', AHORA)).toEqual({ ok: false, error: 'no_existe' });
  });

  it('desactivar a un usuario corta sus sesiones al instante', async () => {
    const { cuentas, token, repartidor } = await conSesion(true);
    await cuentas.cambiarEstado(repartidor.id, false, AHORA + 1);
    expect(await cuentas.sesionDe(token, AHORA + 2)).toBeNull();
  });

  it('se pueden cerrar todas las sesiones de un usuario menos la propia', async () => {
    const { cuentas, token, repartidor } = await conSesion(true);
    const otra = await cuentas.entrar(ingreso({ recordar: true }), AHORA + 1);
    if (!otra.ok) throw new Error('no entró');
    expect(await cuentas.cerrarSesionesDe(repartidor.id, otra.token)).toBe(1);
    expect(await cuentas.sesionDe(token, AHORA + 2)).toBeNull();
    expect(await cuentas.sesionDe(otra.token, AHORA + 2)).not.toBeNull();
  });

  it('entrar limpia las sesiones vencidas', async () => {
    const { db, cuentas } = await conSesion(false);
    await cuentas.entrar(ingreso(), AHORA + DURACION_SIN_RECORDAR_SEGUNDOS + 100);
    expect(db.sql('SELECT COUNT(*) AS n FROM sesiones')).toEqual([{ n: 1 }]);
  });

  it('la lista de usuarios dice cuántos dispositivos tiene cada uno y si está bloqueado', async () => {
    const { cuentas } = await conSesion(true);
    const [usuario] = await cuentas.listar(AHORA + 10);
    expect(usuario).toMatchObject({ nombre: 'Repartidor Demo', rol: 'repartidor', rut: '222222222', activo: true, bloqueadoHasta: 0, dispositivos: 1, ultimoUso: AHORA });
  });
});
