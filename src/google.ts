/**
 * Cliente mínimo de Google Sheets para Cloudflare Workers, con cuenta de servicio.
 *
 * Sin librerías: el JWT se firma con RS256 usando WebCrypto, se cambia por un token de acceso
 * (dura 1 hora) y ese token se guarda en memoria para no firmar en cada mensaje (el plan gratis
 * da solo 10 ms de CPU por invocación).
 */

export interface CuentaServicio {
  client_email: string;
  private_key: string;
}

export class ErrorGoogle extends Error {
  constructor(
    mensaje: string,
    readonly status?: number,
  ) {
    super(mensaje);
  }
}

const AMBITO = 'https://www.googleapis.com/auth/spreadsheets';
const URL_TOKEN = 'https://oauth2.googleapis.com/token';
const TIEMPO_MAXIMO_MS = 8000;
const MARGEN_RENOVACION_S = 120;

const codificador = new TextEncoder();

function aBase64Url(datos: Uint8Array): string {
  let texto = '';
  for (const byte of datos) texto += String.fromCharCode(byte);
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

async function clavePrivada(pem: string): Promise<CryptoKey> {
  const base64 = pem.replace(/-----(BEGIN|END) [A-Z ]+-----/g, '').replace(/\s+/g, '');
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', bytes, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

/** JWT firmado que Google cambia por un token de acceso. */
export async function firmarJwt(cuenta: CuentaServicio, ahoraSegundos: number): Promise<string> {
  const parte = (objeto: object) => aBase64Url(codificador.encode(JSON.stringify(objeto)));
  const cuerpo = `${parte({ alg: 'RS256', typ: 'JWT' })}.${parte({
    iss: cuenta.client_email,
    scope: AMBITO,
    aud: URL_TOKEN,
    iat: ahoraSegundos,
    exp: ahoraSegundos + 3600,
  })}`;
  const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', await clavePrivada(cuenta.private_key), codificador.encode(cuerpo));
  return `${cuerpo}.${aBase64Url(new Uint8Array(firma))}`;
}

interface TokenGuardado {
  valor: string;
  venceSegundos: number;
}
const tokens = new Map<string, TokenGuardado>();

/** Solo para pruebas. */
export function olvidarTokens(): void {
  tokens.clear();
}

export class ClienteSheets {
  constructor(
    private readonly cuenta: CuentaServicio,
    private readonly planillaId: string,
  ) {}

  private async token(ahoraSegundos: number): Promise<string> {
    const guardado = tokens.get(this.cuenta.client_email);
    if (guardado && guardado.venceSegundos - MARGEN_RENOVACION_S > ahoraSegundos) return guardado.valor;
    const respuesta = await fetch(URL_TOKEN, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion: await firmarJwt(this.cuenta, ahoraSegundos),
      }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    const datos = (await respuesta.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
    if (!respuesta.ok || !datos.access_token) {
      throw new ErrorGoogle(`Google no entregó el token: ${respuesta.status} ${datos.error ?? ''}`.trim(), respuesta.status);
    }
    tokens.set(this.cuenta.client_email, { valor: datos.access_token, venceSegundos: ahoraSegundos + (datos.expires_in ?? 3600) });
    return datos.access_token;
  }

  /** Agrega filas al final de una hoja, sin tocar las existentes. */
  async agregarFilas(hoja: string, filas: ReadonlyArray<ReadonlyArray<string | number>>, ahoraSegundos: number = Math.floor(Date.now() / 1000)): Promise<void> {
    if (filas.length === 0) return;
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.planillaId}/values/${encodeURIComponent(hoja)}!A1:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`;
    const respuesta = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${await this.token(ahoraSegundos)}`, 'content-type': 'application/json' },
      body: JSON.stringify({ values: filas }),
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new ErrorGoogle(`Google Sheets respondió ${respuesta.status}: ${detalle.slice(0, 200)}`, respuesta.status);
    }
  }

  /** Lee las filas de un rango (por ejemplo "FERIADOS!A2:B"). Las celdas vacías del final se omiten. */
  async leerFilas(rango: string, ahoraSegundos: number = Math.floor(Date.now() / 1000)): Promise<string[][]> {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${this.planillaId}/values/${encodeURIComponent(rango)}`;
    const respuesta = await fetch(url, {
      headers: { Authorization: `Bearer ${await this.token(ahoraSegundos)}` },
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS),
    });
    if (!respuesta.ok) {
      const detalle = await respuesta.text().catch(() => '');
      throw new ErrorGoogle(`Google Sheets respondió ${respuesta.status}: ${detalle.slice(0, 200)}`, respuesta.status);
    }
    return ((await respuesta.json()) as { values?: string[][] }).values ?? [];
  }
}
