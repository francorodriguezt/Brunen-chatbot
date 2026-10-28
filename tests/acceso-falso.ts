/**
 * Un Cloudflare Access de mentira para probar el panel: genera un par de claves RSA, firma tokens como lo hace Access
 * y responde con la clave pública cuando el panel la pide (`/cdn-cgi/access/certs`).
 */

import { vi } from 'vitest';

export const DOMINIO = 'brunen.cloudflareaccess.com';
export const AUD = 'aud-de-prueba-123';

const aBase64Url = (bytes: Uint8Array): string => {
  let texto = '';
  for (const byte of bytes) texto += String.fromCharCode(byte);
  return btoa(texto).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const jsonABase64Url = (valor: unknown): string => aBase64Url(new TextEncoder().encode(JSON.stringify(valor)));

export interface AccesoFalso {
  /** Cuántas veces el panel pidió las claves públicas. */
  pedidosDeClaves: () => number;
  /** Un token firmado; `datos` pisa lo que lleva un token válido y `cabecera` pisa su encabezado. */
  token: (datos?: Record<string, unknown>, cabecera?: Record<string, unknown>) => Promise<string>;
  /** Cambia las claves que publica Access (rotación): los tokens firmados antes dejan de servir. */
  rotarClaves: () => Promise<void>;
  /** Hace que el servidor de claves falle. */
  caer: (falla: boolean) => void;
  /** Reemplaza `fetch` por el servidor de claves falso. */
  instalar: () => void;
}

export async function crearAccesoFalso(ahoraSegundos: number): Promise<AccesoFalso> {
  const generar = () =>
    crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
  let par = await generar();
  let version = 1;
  let pedidos = 0;
  let caido = false;

  const token: AccesoFalso['token'] = async (datos = {}, cabecera = {}) => {
    const encabezado = { alg: 'RS256', kid: `clave-${version}`, typ: 'JWT', ...cabecera };
    const cuerpo = {
      aud: [AUD],
      email: 'operadora@brunen.test',
      iss: `https://${DOMINIO}`,
      iat: ahoraSegundos,
      exp: ahoraSegundos + 3600,
      sub: 'usuario-1',
      ...datos,
    };
    const partes = `${jsonABase64Url(encabezado)}.${jsonABase64Url(cuerpo)}`;
    const firma = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', par.privateKey, new TextEncoder().encode(partes));
    return `${partes}.${aBase64Url(new Uint8Array(firma))}`;
  };

  return {
    pedidosDeClaves: () => pedidos,
    token,
    rotarClaves: async () => {
      par = await generar();
      version++;
    },
    caer: (falla) => {
      caido = falla;
    },
    instalar: () => {
      vi.stubGlobal('fetch', async (url: string) => {
        if (url !== `https://${DOMINIO}/cdn-cgi/access/certs`) return new Response('no esperado', { status: 404 });
        pedidos++;
        if (caido) return new Response('caído', { status: 500 });
        const jwk = await crypto.subtle.exportKey('jwk', par.publicKey);
        return new Response(JSON.stringify({ keys: [{ kid: `clave-${version}`, kty: 'RSA', alg: 'RS256', use: 'sig', n: jwk.n, e: jwk.e }] }), { status: 200 });
      });
    },
  };
}
