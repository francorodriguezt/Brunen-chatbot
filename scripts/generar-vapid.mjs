#!/usr/bin/env node
/**
 * Genera el par de claves VAPID con el que el servidor se identifica ante Apple, Google y Mozilla al mandar los avisos al
 * teléfono (D115). Córrelo una sola vez, en tu computador:
 *
 *   npm run generar-vapid
 *
 * Imprime los comandos para cargarlas. La clave privada es un secreto: no la pegues en el chat, en el código ni en un
 * commit. Si la cambias más adelante, hay que volver a activar los avisos en cada teléfono.
 */

import { generateKeyPairSync } from 'node:crypto';

const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
const jwk = privateKey.export({ format: 'jwk' });
const aBytes = (b64url) => Buffer.from(b64url, 'base64url');
const publica = Buffer.concat([Buffer.from([4]), aBytes(jwk.x), aBytes(jwk.y)]).toString('base64url');

console.log(`
Claves VAPID generadas. Cárgalas en los DOS Workers (el bot manda los avisos y el panel suscribe los teléfonos):

  1) La clave pública y el contacto no son secretos. Agrégalos en [vars] de wrangler.toml y en [env.admin.vars] de
     wrangler.panel.toml (y en [vars] de ese mismo archivo si usas el panel público):

       VAPID_PUBLIC_KEY = "${publica}"
       VAPID_SUBJECT = "mailto:<un correo del negocio, no personal>"

  2) La clave privada sí es un secreto. Pégala cuando el comando la pida:

       npx wrangler secret put VAPID_PRIVATE_KEY
       npx wrangler secret put VAPID_PRIVATE_KEY -c wrangler.panel.toml --env admin

     Valor de la clave privada (cópialo ahora; no se vuelve a mostrar):

       ${jwk.d}
`);
