/**
 * Deduplicación de mensajes por wamid (regla del webhook: Meta reintenta).
 *
 * Con la base D1 de Cloudflare la revisión es atómica: INSERT OR IGNORE sobre una clave primaria.
 * Sin D1 configurada (`env.DB` ausente) no se deduplica y el bot funciona como antes.
 * Esquema: migrations/0001_mensajes_procesados.sql.
 */

/** Lo mínimo de D1 que usamos; se define aquí para no depender de tipos externos. */
export interface BaseDatos {
  prepare(sql: string): {
    bind(...valores: unknown[]): { run(): Promise<{ meta?: { changes?: number } }> };
  };
}

export interface AlmacenMensajes {
  /** true si el mensaje es nuevo (y queda registrado); false si ya se había procesado. */
  registrarSiEsNuevo(id: string, ahoraSegundos: number): Promise<boolean>;
}

const RETENCION_SEGUNDOS = 7 * 24 * 3600; // Meta reintenta durante horas o pocos días, no más
const PROBABILIDAD_LIMPIEZA = 0.02; // limpia las filas viejas en 1 de cada ~50 mensajes

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
    if (this.azar() < PROBABILIDAD_LIMPIEZA) {
      await this.db
        .prepare('DELETE FROM mensajes_procesados WHERE recibido_en < ?1')
        .bind(ahoraSegundos - RETENCION_SEGUNDOS)
        .run();
    }
    return (resultado.meta?.changes ?? 0) > 0;
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
