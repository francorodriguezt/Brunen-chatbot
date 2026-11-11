/**
 * Usuarios, claves y sesiones de la aplicación (D51).
 *
 * Se entra con el RUT y una clave de 4 dígitos. Una clave tan corta no resiste que alguien la pruebe muchas veces, así
 * que la protección no está en la clave sino alrededor de ella:
 *
 *  - Bloqueo: al quinto intento fallido el usuario queda bloqueado 15 minutos; cada bloqueo seguido dura más (1 hora,
 *    4 horas, 16 horas, un día). Con eso adivinar una clave toma años, no minutos.
 *  - Límite por origen: 20 fallos en una hora desde una misma conexión cortan los intentos contra cualquier RUT.
 *  - La clave no se guarda. Se guarda una huella (HMAC-SHA-256) calculada con un secreto del servidor que no vive en
 *    la base: quien copie la base no puede probar las 10.000 claves posibles sin ese secreto. No se usa un algoritmo
 *    lento (PBKDF2, scrypt) porque con solo 10.000 combinaciones no agrega protección y sí gasta el poco tiempo de
 *    proceso que da el plan gratis.
 *  - Sesiones: al entrar se entrega un token al azar que vive en una cookie del dispositivo; en la base queda solo su
 *    huella. "Recordar este dispositivo" lo renueva solo mientras se use, para no pedir la clave cada vez.
 *
 * Los administradores, además, pasan antes por Cloudflare Access (`acceso.ts`) y solo entran con el correo de esa sesión.
 */

import type { BaseDatos } from '../almacen';
import { normalizarRut } from './rut';

export type Rol = 'administrador' | 'repartidor';

export interface Usuario {
  id: number;
  rut: string;
  nombre: string;
  rol: Rol;
  correo: string | null;
  activo: boolean;
}

export interface UsuarioConEstado extends Usuario {
  /** Segundos Unix; 0 si no está bloqueado. */
  bloqueadoHasta: number;
  /** Dispositivos con la sesión abierta. */
  dispositivos: number;
  ultimoUso: number | null;
}

export type ErrorDeCuenta = 'rut_invalido' | 'clave_invalida' | 'clave_debil' | 'nombre_invalido' | 'correo_invalido' | 'rut_repetido' | 'correo_repetido' | 'no_existe';

export type Resultado<T> = { ok: true; valor: T } | { ok: false; error: ErrorDeCuenta };

export type ResultadoDeIngreso =
  | { ok: true; token: string; usuario: Usuario; venceEn: number; recordar: boolean }
  | { ok: false; motivo: 'credenciales' }
  /** `recien`: este intento provocó el bloqueo (sirve para avisar una sola vez). */
  | { ok: false; motivo: 'bloqueado'; hasta: number; recien: boolean; nombre: string; usuarioId: number }
  | { ok: false; motivo: 'demasiados_intentos' };

export interface DatosDeIngreso {
  rol: Rol;
  rut: unknown;
  clave: unknown;
  recordar: boolean;
  /** De dónde viene la conexión (la IP). Solo se guarda su huella. */
  origen: string;
  dispositivo: string;
  /** Administradores: el correo con el que pasaron por Access. */
  correo?: string;
}

export interface Sesion {
  usuario: Usuario;
  venceEn: number;
  recordar: boolean;
  /** true si se alargó en esta consulta: hay que volver a mandar la cookie con su nueva duración. */
  renovada: boolean;
}

export const MAX_INTENTOS = 5;
const BLOQUEO_BASE_SEGUNDOS = 15 * 60;
const BLOQUEO_MAXIMO_SEGUNDOS = 24 * 3600;
const MAX_FALLOS_POR_ORIGEN = 20;
const VENTANA_DE_ORIGEN_SEGUNDOS = 3600;
export const DURACION_RECORDADA_SEGUNDOS = 30 * 24 * 3600;
export const DURACION_SIN_RECORDAR_SEGUNDOS = 12 * 3600;
/** Un dispositivo recordado se renueva a lo más una vez al día: no hace falta escribir en la base en cada consulta. */
const RENOVAR_SI_FALTA_MENOS_DE = DURACION_RECORDADA_SEGUNDOS - 24 * 3600;
const ANOTAR_USO_CADA_SEGUNDOS = 600;
const LARGO_MINIMO_DEL_SECRETO = 32;

const codificador = new TextEncoder();
const aHex = (bytes: ArrayBuffer): string => Array.from(new Uint8Array(bytes), (b) => b.toString(16).padStart(2, '0')).join('');

function alAzar(bytes: number): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(bytes));
}

function aBase64Url(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Compara sin cortar en la primera diferencia, para que el tiempo de respuesta no revele cuánto se acertó. */
function iguales(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diferencia = 0;
  for (let i = 0; i < a.length; i++) diferencia |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diferencia === 0;
}

const ES_CLAVE = /^\d{4}$/;

/** Claves que cualquiera probaría primero: cuatro dígitos iguales, una escalera, o el principio o el final del RUT. */
export function claveDebil(clave: string, rut: string): boolean {
  if (/^(\d)\1{3}$/.test(clave)) return true;
  if ('0123456789'.includes(clave) || '9876543210'.includes(clave)) return true;
  const cuerpo = rut.slice(0, -1);
  return clave === cuerpo.slice(0, 4) || clave === cuerpo.slice(-4);
}

interface FilaDeUsuario {
  id: number;
  rut: string;
  nombre: string;
  rol: Rol;
  correo: string | null;
  activo: number;
  clave_sal: string;
  clave_hash: string;
  bloqueado_hasta: number;
}

const aUsuario = (f: Pick<FilaDeUsuario, 'id' | 'rut' | 'nombre' | 'rol' | 'correo' | 'activo'>): Usuario => ({
  id: Number(f.id),
  rut: String(f.rut),
  nombre: String(f.nombre),
  rol: f.rol,
  correo: f.correo ?? null,
  activo: Number(f.activo) === 1,
});

export class Cuentas {
  private llave: Promise<CryptoKey> | undefined;

  constructor(
    private readonly db: BaseDatos,
    private readonly secreto: string,
  ) {
    if (!Cuentas.secretoValido(secreto)) throw new Error('Falta el secreto del panel (PANEL_SECRETO) o es demasiado corto.');
  }

  static secretoValido(secreto: unknown): secreto is string {
    return typeof secreto === 'string' && secreto.trim().length >= LARGO_MINIMO_DEL_SECRETO;
  }

  // ------------------------------------------------------------------ base de datos y huellas

  private async filas<T>(sql: string, ...valores: unknown[]): Promise<T[]> {
    return ((await this.db.prepare(sql).bind(...valores).run()).results ?? []) as T[];
  }

  private async cambios(sql: string, ...valores: unknown[]): Promise<number> {
    return (await this.db.prepare(sql).bind(...valores).run()).meta?.changes ?? 0;
  }

  private async firmar(texto: string): Promise<string> {
    this.llave ??= crypto.subtle.importKey('raw', codificador.encode(this.secreto), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    return aHex(await crypto.subtle.sign('HMAC', await this.llave, codificador.encode(texto)));
  }

  private huellaDeClave(sal: string, clave: string): Promise<string> {
    return this.firmar(`clave:${sal}:${clave}`);
  }

  private async huellaDeToken(token: string): Promise<string> {
    return aHex(await crypto.subtle.digest('SHA-256', codificador.encode(token)));
  }

  private async huellaDeOrigen(origen: string): Promise<string> {
    return (await this.firmar(`origen:${origen}`)).slice(0, 32);
  }

  // ------------------------------------------------------------------ usuarios

  async crearUsuario(datos: { rut: unknown; nombre: unknown; rol: Rol; clave: unknown; correo?: unknown }, quien: string, ahora: number): Promise<Resultado<Usuario>> {
    const rut = normalizarRut(datos.rut);
    if (!rut) return { ok: false, error: 'rut_invalido' };
    const nombre = typeof datos.nombre === 'string' ? datos.nombre.trim().replace(/\s+/g, ' ') : '';
    if (nombre.length < 2 || nombre.length > 60) return { ok: false, error: 'nombre_invalido' };
    if (typeof datos.clave !== 'string' || !ES_CLAVE.test(datos.clave)) return { ok: false, error: 'clave_invalida' };
    if (claveDebil(datos.clave, rut)) return { ok: false, error: 'clave_debil' };

    let correo: string | null = null;
    if (datos.rol === 'administrador') {
      correo = typeof datos.correo === 'string' ? datos.correo.trim().toLowerCase() : '';
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 120) return { ok: false, error: 'correo_invalido' };
      if ((await this.filas('SELECT 1 FROM usuarios WHERE correo = ?1', correo)).length > 0) return { ok: false, error: 'correo_repetido' };
    }
    if ((await this.filas('SELECT 1 FROM usuarios WHERE rut = ?1', rut)).length > 0) return { ok: false, error: 'rut_repetido' };

    const sal = aHex(alAzar(16).buffer as ArrayBuffer);
    const creados = await this.cambios(
      `INSERT INTO usuarios (rut, nombre, rol, correo, clave_sal, clave_hash, creado_en, creado_por, actualizado_en)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?7) ON CONFLICT DO NOTHING`,
      rut, nombre, datos.rol, correo, sal, await this.huellaDeClave(sal, datos.clave), ahora, quien.slice(0, 120),
    );
    // Dos altas a la vez con el mismo RUT: la segunda no inserta.
    if (creados === 0) return { ok: false, error: 'rut_repetido' };
    const [fila] = await this.filas<FilaDeUsuario>('SELECT id, rut, nombre, rol, correo, activo FROM usuarios WHERE rut = ?1', rut);
    return fila ? { ok: true, valor: aUsuario(fila) } : { ok: false, error: 'no_existe' };
  }

  /** Clave nueva: cierra las sesiones abiertas y quita el bloqueo. Es lo que se hace cuando alguien pierde el teléfono. */
  async cambiarClave(id: number, clave: unknown, ahora: number): Promise<Resultado<true>> {
    const [usuario] = await this.filas<{ rut: string }>('SELECT rut FROM usuarios WHERE id = ?1', id);
    if (!usuario) return { ok: false, error: 'no_existe' };
    if (typeof clave !== 'string' || !ES_CLAVE.test(clave)) return { ok: false, error: 'clave_invalida' };
    if (claveDebil(clave, usuario.rut)) return { ok: false, error: 'clave_debil' };
    const sal = aHex(alAzar(16).buffer as ArrayBuffer);
    await this.cambios(
      'UPDATE usuarios SET clave_sal = ?2, clave_hash = ?3, intentos_fallidos = 0, bloqueado_hasta = 0, bloqueos = 0, actualizado_en = ?4 WHERE id = ?1',
      id, sal, await this.huellaDeClave(sal, clave), ahora,
    );
    await this.cerrarSesionesDe(id);
    return { ok: true, valor: true };
  }

  /** Desactivar corta las sesiones al instante; reactivar no devuelve las sesiones. */
  async cambiarEstado(id: number, activo: boolean, ahora: number): Promise<Resultado<true>> {
    if ((await this.cambios('UPDATE usuarios SET activo = ?2, actualizado_en = ?3 WHERE id = ?1', id, activo ? 1 : 0, ahora)) === 0) return { ok: false, error: 'no_existe' };
    if (!activo) await this.cerrarSesionesDe(id);
    return { ok: true, valor: true };
  }

  async usuario(id: number): Promise<Usuario | null> {
    const [fila] = await this.filas<FilaDeUsuario>('SELECT id, rut, nombre, rol, correo, activo FROM usuarios WHERE id = ?1', id);
    return fila ? aUsuario(fila) : null;
  }

  async usuarioPorCorreo(correo: string): Promise<Usuario | null> {
    const [fila] = await this.filas<FilaDeUsuario>('SELECT id, rut, nombre, rol, correo, activo FROM usuarios WHERE correo = ?1', correo.trim().toLowerCase());
    return fila ? aUsuario(fila) : null;
  }

  async listar(ahora: number): Promise<UsuarioConEstado[]> {
    const filas = await this.filas<FilaDeUsuario & { dispositivos: number; ultimo_uso: number | null }>(
      `SELECT u.id, u.rut, u.nombre, u.rol, u.correo, u.activo, u.bloqueado_hasta,
              (SELECT COUNT(*) FROM sesiones s WHERE s.usuario_id = u.id AND s.vence_en > ?1) AS dispositivos,
              (SELECT MAX(s.ultimo_uso) FROM sesiones s WHERE s.usuario_id = u.id AND s.vence_en > ?1) AS ultimo_uso
       FROM usuarios u ORDER BY u.rol, u.nombre`,
      ahora,
    );
    return filas.map((f) => ({
      ...aUsuario(f),
      bloqueadoHasta: Number(f.bloqueado_hasta) > ahora ? Number(f.bloqueado_hasta) : 0,
      dispositivos: Number(f.dispositivos),
      ultimoUso: f.ultimo_uso === null ? null : Number(f.ultimo_uso),
    }));
  }

  // ------------------------------------------------------------------ entrar

  private async origenFrenado(huella: string, ahora: number): Promise<boolean> {
    const [fila] = await this.filas<{ fallos: number; desde: number }>('SELECT fallos, desde FROM intentos_de_ingreso WHERE origen = ?1', huella);
    return fila !== undefined && Number(fila.desde) > ahora - VENTANA_DE_ORIGEN_SEGUNDOS && Number(fila.fallos) >= MAX_FALLOS_POR_ORIGEN;
  }

  private async anotarFalloDeOrigen(huella: string, ahora: number): Promise<void> {
    await this.cambios(
      `INSERT INTO intentos_de_ingreso (origen, fallos, desde) VALUES (?1, 1, ?2)
       ON CONFLICT(origen) DO UPDATE SET fallos = CASE WHEN desde <= ?3 THEN 1 ELSE fallos + 1 END, desde = CASE WHEN desde <= ?3 THEN ?2 ELSE desde END`,
      huella, ahora, ahora - VENTANA_DE_ORIGEN_SEGUNDOS,
    );
  }

  async entrar(datos: DatosDeIngreso, ahora: number): Promise<ResultadoDeIngreso> {
    const origen = await this.huellaDeOrigen(datos.origen);
    if (await this.origenFrenado(origen, ahora)) return { ok: false, motivo: 'demasiados_intentos' };

    const rechazar = async (): Promise<ResultadoDeIngreso> => {
      await this.anotarFalloDeOrigen(origen, ahora);
      return { ok: false, motivo: 'credenciales' };
    };

    const rut = normalizarRut(datos.rut);
    const clave = typeof datos.clave === 'string' && ES_CLAVE.test(datos.clave) ? datos.clave : null;
    const [fila] = rut ? await this.filas<FilaDeUsuario>('SELECT id, rut, nombre, rol, correo, activo, clave_sal, clave_hash, bloqueado_hasta FROM usuarios WHERE rut = ?1', rut) : [];
    const correo = (datos.correo ?? '').trim().toLowerCase();
    const calza = fila !== undefined && Number(fila.activo) === 1 && fila.rol === datos.rol && (fila.rol !== 'administrador' || (correo !== '' && fila.correo === correo));
    if (!fila || !calza || !clave) {
      // Se calcula igual una huella, para que responder tarde lo mismo exista o no el usuario.
      await this.huellaDeClave('sin-usuario', clave ?? '0000');
      return rechazar();
    }

    // El intento se anota ANTES de revisar la clave, en una sola sentencia: así varios intentos a la vez no pasan del
    // límite. Si la clave era correcta, la cuenta de fallos se borra más abajo.
    const anotado = await this.cambios(
      `UPDATE usuarios SET
         intentos_fallidos = CASE WHEN bloqueado_hasta > 0 THEN 1 ELSE intentos_fallidos + 1 END,
         bloqueos = CASE WHEN bloqueado_hasta = 0 AND intentos_fallidos + 1 >= ?2 THEN bloqueos + 1 ELSE bloqueos END,
         bloqueado_hasta = CASE WHEN bloqueado_hasta = 0 AND intentos_fallidos + 1 >= ?2
                                THEN ?3 + MIN(?4 * (1 << (2 * MIN(bloqueos, 8))), ?5) ELSE 0 END
       WHERE id = ?1 AND bloqueado_hasta <= ?3`,
      fila.id, MAX_INTENTOS, ahora, BLOQUEO_BASE_SEGUNDOS, BLOQUEO_MAXIMO_SEGUNDOS,
    );
    const bloqueado = (hasta: number, recien: boolean): ResultadoDeIngreso => ({ ok: false, motivo: 'bloqueado', hasta, recien, nombre: String(fila.nombre), usuarioId: Number(fila.id) });
    if (anotado === 0) return bloqueado(Number(fila.bloqueado_hasta), false);

    if (!iguales(await this.huellaDeClave(fila.clave_sal, clave), fila.clave_hash)) {
      await this.anotarFalloDeOrigen(origen, ahora);
      const [estado] = await this.filas<{ bloqueado_hasta: number }>('SELECT bloqueado_hasta FROM usuarios WHERE id = ?1', fila.id);
      const hasta = Number(estado?.bloqueado_hasta ?? 0);
      return hasta > ahora ? bloqueado(hasta, true) : { ok: false, motivo: 'credenciales' };
    }

    await this.cambios('UPDATE usuarios SET intentos_fallidos = 0, bloqueado_hasta = 0, bloqueos = 0 WHERE id = ?1', fila.id);
    await this.cambios('DELETE FROM sesiones WHERE vence_en <= ?1', ahora);
    await this.cambios('DELETE FROM intentos_de_ingreso WHERE desde <= ?1', ahora - 24 * 3600);

    const token = aBase64Url(alAzar(32));
    const venceEn = ahora + (datos.recordar ? DURACION_RECORDADA_SEGUNDOS : DURACION_SIN_RECORDAR_SEGUNDOS);
    await this.cambios(
      'INSERT INTO sesiones (token_hash, usuario_id, creada_en, vence_en, ultimo_uso, recordar, dispositivo) VALUES (?1, ?2, ?3, ?4, ?3, ?5, ?6)',
      await this.huellaDeToken(token), fila.id, ahora, venceEn, datos.recordar ? 1 : 0, datos.dispositivo.slice(0, 60),
    );
    return { ok: true, token, usuario: aUsuario(fila), venceEn, recordar: datos.recordar };
  }

  // ------------------------------------------------------------------ sesiones

  async sesionDe(token: string | null | undefined, ahora: number): Promise<Sesion | null> {
    if (!token || token.length < 20 || token.length > 200) return null;
    const huella = await this.huellaDeToken(token);
    const [fila] = await this.filas<FilaDeUsuario & { vence_en: number; ultimo_uso: number; recordar: number }>(
      `SELECT u.id, u.rut, u.nombre, u.rol, u.correo, u.activo, s.vence_en, s.ultimo_uso, s.recordar
       FROM sesiones s JOIN usuarios u ON u.id = s.usuario_id
       WHERE s.token_hash = ?1 AND s.vence_en > ?2 AND u.activo = 1`,
      huella, ahora,
    );
    if (!fila) return null;

    const recordar = Number(fila.recordar) === 1;
    let venceEn = Number(fila.vence_en);
    let renovada = false;
    if (recordar && venceEn - ahora < RENOVAR_SI_FALTA_MENOS_DE) {
      venceEn = ahora + DURACION_RECORDADA_SEGUNDOS;
      renovada = true;
      await this.cambios('UPDATE sesiones SET vence_en = ?2, ultimo_uso = ?3 WHERE token_hash = ?1', huella, venceEn, ahora);
    } else if (ahora - Number(fila.ultimo_uso) > ANOTAR_USO_CADA_SEGUNDOS) {
      await this.cambios('UPDATE sesiones SET ultimo_uso = ?2 WHERE token_hash = ?1', huella, ahora);
    }
    return { usuario: aUsuario(fila), venceEn, recordar, renovada };
  }

  async salir(token: string | null | undefined): Promise<void> {
    if (token) await this.cambios('DELETE FROM sesiones WHERE token_hash = ?1', await this.huellaDeToken(token));
  }

  /** Cierra las sesiones de un usuario; con `menosEste`, todas menos la del dispositivo que lo pide. Devuelve cuántas cerró. */
  async cerrarSesionesDe(usuarioId: number, menosEste?: string): Promise<number> {
    if (menosEste) return this.cambios('DELETE FROM sesiones WHERE usuario_id = ?1 AND token_hash != ?2', usuarioId, await this.huellaDeToken(menosEste));
    return this.cambios('DELETE FROM sesiones WHERE usuario_id = ?1', usuarioId);
  }
}
