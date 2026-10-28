/**
 * Deduplicación de mensajes por wamid (regla del webhook: Meta reintenta).
 *
 * Con la base D1 de Cloudflare la revisión es atómica: INSERT OR IGNORE sobre una clave primaria.
 * Sin D1 configurada (`env.DB` ausente) no se deduplica y el bot funciona como antes.
 * Esquema: migrations/0001_mensajes_procesados.sql.
 */

/**
 * Lo mínimo de D1 que usamos; se define aquí para no depender de tipos externos.
 * En D1, `run()` devuelve `meta.changes` (filas cambiadas por una escritura) y, en un SELECT, las filas en `results`.
 */
export interface BaseDatos {
  prepare(sql: string): {
    bind(...valores: unknown[]): { run(): Promise<{ meta?: { changes?: number }; results?: unknown[] }> };
  };
}

export interface AlmacenMensajes {
  /** true si el mensaje es nuevo (y queda reclamado); false si ya se había procesado. */
  registrarSiEsNuevo(id: string, ahoraSegundos: number): Promise<boolean>;
  /** Suelta el mensaje reclamado cuando su procesamiento falló, para que un reintento pueda procesarlo. */
  liberar(id: string): Promise<void>;
  /** Borra los registros viejos. Se llama al terminar el lote, fuera del camino de la respuesta. */
  limpiar?(ahoraSegundos: number): Promise<void>;
}

const RETENCION_SEGUNDOS = 7 * 24 * 3600; // Meta reintenta durante horas o pocos días, no más
const PROBABILIDAD_LIMPIEZA = 0.02; // limpia en 1 de cada ~50 lotes

export class AlmacenD1 implements AlmacenMensajes {
  constructor(
    private readonly db: BaseDatos,
    private readonly azar: () => number = Math.random,
  ) {}

  async registrarSiEsNuevo(id: string, ahoraSegundos: number): Promise<boolean> {
    const resultado = await this.db
      .prepare('INSERT OR IGNORE INTO mensajes_procesados (wamid, recibido_en) VALUES (?1, ?2)')
      .bind(id, ahoraSegundos)
      .run();
    return (resultado.meta?.changes ?? 0) > 0;
  }

  async liberar(id: string): Promise<void> {
    await this.db.prepare('DELETE FROM mensajes_procesados WHERE wamid = ?1').bind(id).run();
  }

  async limpiar(ahoraSegundos: number): Promise<void> {
    if (this.azar() >= PROBABILIDAD_LIMPIEZA) return;
    await this.db
      .prepare('DELETE FROM mensajes_procesados WHERE recibido_en < ?1')
      .bind(ahoraSegundos - RETENCION_SEGUNDOS)
      .run();
  }
}

/** Para pruebas y desarrollo sin base de datos. */
export class AlmacenEnMemoria implements AlmacenMensajes {
  private readonly vistos = new Set<string>();

  async registrarSiEsNuevo(id: string): Promise<boolean> {
    if (this.vistos.has(id)) return false;
    this.vistos.add(id);
    return true;
  }

  async liberar(id: string): Promise<void> {
    this.vistos.delete(id);
  }
}

export function almacenDe(env: { DB?: BaseDatos }): AlmacenMensajes | null {
  return env.DB ? new AlmacenD1(env.DB) : null;
}

/**
 * Si la base falla, es mejor procesar el mensaje (quizá dos veces) que perderlo: el cliente
 * nunca debe quedar sin respuesta.
 */
export async function esMensajeNuevo(
  almacen: AlmacenMensajes,
  id: string,
  ahoraSegundos: number = Math.floor(Date.now() / 1000),
): Promise<boolean> {
  try {
    return await almacen.registrarSiEsNuevo(id, ahoraSegundos);
  } catch (error) {
    console.error('No se pudo revisar si el mensaje ya se procesó:', error instanceof Error ? error.message : error);
    return true;
  }
}

/** Libera el mensaje y la limpieza son mejoras: si fallan, solo se registran. */
export async function liberarMensaje(almacen: AlmacenMensajes, id: string): Promise<void> {
  try {
    await almacen.liberar(id);
  } catch (error) {
    console.error('No se pudo liberar el mensaje:', error instanceof Error ? error.message : error);
  }
}

export async function limpiarAlmacen(
  almacen: AlmacenMensajes,
  ahoraSegundos: number = Math.floor(Date.now() / 1000),
): Promise<void> {
  try {
    await almacen.limpiar?.(ahoraSegundos);
  } catch (error) {
    console.error('No se pudo limpiar el almacén:', error instanceof Error ? error.message : error);
  }
}
