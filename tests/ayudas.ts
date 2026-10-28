/**
 * Ayudas compartidas por las pruebas: una clave de Google ficticia, un Google falso por hoja y una
 * base D1 de mentira hecha sobre SQLite real (para probar el SQL de verdad, no una copia).
 */

import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { vi } from 'vitest';
import type { BaseDatos } from '../src/almacen';

let clave: Promise<string> | undefined;

/** JSON de una cuenta de servicio ficticia con una clave RSA generada al vuelo (nunca una real). */
export function crearClaveJson(): Promise<string> {
  clave ??= (async () => {
    const par = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    );
    const base64 = btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.exportKey('pkcs8', par.privateKey))));
    const pem = `-----BEGIN PRIVATE KEY-----\n${(base64.match(/.{1,64}/g) ?? []).join('\n')}\n-----END PRIVATE KEY-----\n`;
    return JSON.stringify({ client_email: 'bot@proyecto.iam.gserviceaccount.com', private_key: pem });
  })();
  return clave;
}

export async function entornoGoogle(planillaId = 'PLANILLA1') {
  return { GOOGLE_SERVICE_ACCOUNT_JSON: await crearClaveJson(), GOOGLE_SHEET_ID: planillaId };
}

/**
 * Reemplaza `fetch` por un Google falso: cada hoja devuelve sus filas (o falla con 500).
 * Devuelve la lista de direcciones pedidas, para contar lecturas.
 */
export function stubGoogle(porHoja: Record<string, string[][] | 'falla'>): string[] {
  const llamadas: string[] = [];
  vi.stubGlobal('fetch', async (url: string) => {
    llamadas.push(url);
    if (url.startsWith('https://oauth2.googleapis.com')) {
      return new Response(JSON.stringify({ access_token: 'tk', expires_in: 3600 }), { status: 200 });
    }
    const hoja = decodeURIComponent(url.split('/values/')[1] ?? '').split('!')[0] ?? '';
    const valores = porHoja[hoja];
    if (valores === 'falla') return new Response('caído', { status: 500 });
    return new Response(JSON.stringify({ values: valores ?? [] }), { status: 200 });
  });
  return llamadas;
}

export const lecturasDe = (llamadas: string[], hoja: string): number => llamadas.filter((u) => u.includes(`/values/${hoja}`)).length;

/**
 * Base D1 de prueba sobre SQLite en memoria, con el esquema real de `migrations/`.
 * Imita la interfaz de D1 que usa el código: `prepare().bind().run()`, donde un SELECT devuelve `results`
 * y una escritura devuelve `meta.changes`.
 */
export function crearBaseSqlite(): BaseDatos & { sql(sentencia: string, ...valores: unknown[]): unknown[] } {
  const db = new DatabaseSync(':memory:');
  const carpeta = fileURLToPath(new URL('../migrations/', import.meta.url));
  for (const archivo of readdirSync(carpeta).sort()) db.exec(readFileSync(carpeta + archivo, 'utf8'));
  const esConsulta = (sql: string) => /^\s*(select|with)\b/i.test(sql);
  return {
    prepare: (sql) => ({
      bind: (...valores) => ({
        run: async () => {
          const sentencia = db.prepare(sql);
          if (esConsulta(sql)) return { results: sentencia.all(...valores) };
          return { meta: { changes: Number(sentencia.run(...valores).changes) } };
        },
      }),
    }),
    /** Para que una prueba mire el contenido de las tablas. */
    sql: (sentencia, ...valores) => db.prepare(sentencia).all(...valores),
  };
}

// Feriados nacionales de Chile 2026 y 2027, como quedaron cargados en la hoja FERIADOS
// (calendario público; ver D25). Es solo dato de prueba: el código los lee de la hoja.
export const FERIADOS_2026_2027: Set<string> = new Set([
  '2026-01-01', '2026-04-03', '2026-04-04', '2026-05-01', '2026-05-21', '2026-06-21', '2026-06-29', '2026-07-16',
  '2026-08-15', '2026-09-18', '2026-09-19', '2026-10-12', '2026-10-31', '2026-11-01', '2026-12-08', '2026-12-25',
  '2027-01-01', '2027-03-26', '2027-03-27', '2027-05-01', '2027-05-21', '2027-06-21', '2027-06-28', '2027-07-16',
  '2027-08-15', '2027-09-17', '2027-09-18', '2027-09-19', '2027-10-11', '2027-10-31', '2027-11-01', '2027-12-08',
  '2027-12-25',
]);
