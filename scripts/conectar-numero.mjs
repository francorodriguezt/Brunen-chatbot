#!/usr/bin/env node
/**
 * Conecta el número de WhatsApp de Brunen a la API (coexistencia con la app WhatsApp Business), D116.
 *
 * Se corre en el computador de Franco, justo después de usar la página /conectar (que entrega el código, la cuenta y el
 * número). El código vale 5 minutos y la sincronización debe pedirse dentro de 24 horas, así que hazlo de una vez:
 *
 *   npm run conectar-numero -- --code <código> --waba <cuenta> --telefono <número> --guardar
 *
 * Variables (en .dev.vars o en el entorno; nunca en el chat): META_APP_ID y META_APP_SECRET. Si falta el secreto, el
 * comando lo pide sin mostrarlo.
 *
 * Qué hace con el token: `--guardar` lo carga con `wrangler secret put WHATSAPP_TOKEN` (y el identificador del número en
 * WHATSAPP_PHONE_NUMBER_ID) sin pasar por la pantalla. `--mostrar-token` lo imprime una vez, para quien prefiera
 * cargarlo a mano. Sin una de las dos opciones el comando no hace nada: el token se perdería. No toca WHATSAPP_APP_SECRET:
 * si la app de Meta es otra, cámbialo tú (docs/TECH_PROVIDER.md).
 */

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { Writable } from 'node:stream';
import { argumento, leerVars } from './vars.mjs';
import { conectarNumero, ErrorDeConexion } from './conectar/nucleo.mjs';

const tiene = (bandera) => process.argv.includes(`--${bandera}`);

/** Pide un texto sin mostrarlo mientras se escribe. */
function pedirEnSecreto(pregunta) {
  return new Promise((resolver) => {
    const mudo = new Writable({ write: (_trozo, _codificacion, listo) => listo() });
    const lector = createInterface({ input: process.stdin, output: mudo, terminal: true });
    process.stdout.write(pregunta);
    lector.question('', (respuesta) => {
      lector.close();
      process.stdout.write('\n');
      resolver(respuesta.trim());
    });
  });
}

function guardarSecreto(nombre, valor) {
  const r = spawnSync('npx', ['wrangler', 'secret', 'put', nombre], { input: valor, encoding: 'utf8', stdio: ['pipe', 'inherit', 'inherit'] });
  return r.status === 0;
}

async function principal() {
  if (!tiene('guardar') && !tiene('mostrar-token')) {
    throw new ErrorDeConexion('Agrega --guardar (carga el token en Cloudflare) o --mostrar-token (lo imprime una vez). Sin eso el token se perdería.');
  }
  const vars = existsSync('.dev.vars') ? leerVars('.dev.vars') : {};
  const appId = process.env.META_APP_ID ?? vars.META_APP_ID ?? argumento('app-id');
  let appSecret = process.env.META_APP_SECRET ?? vars.META_APP_SECRET;
  if (!appSecret) appSecret = await pedirEnSecreto('Secreto de la app de Meta (no se muestra): ');

  const resultado = await conectarNumero(
    {
      version: argumento('version', process.env.GRAPH_API_VERSION ?? vars.GRAPH_API_VERSION ?? 'v27.0'),
      appId,
      appSecret,
      code: argumento('code'),
      waba: argumento('waba'),
      telefono: argumento('telefono'),
    },
    { fetch, avisar: (texto) => console.log(texto) },
  );

  console.log('\nListo. Meta aceptó las sincronizaciones (guarda estos números por si hay que escribirle a soporte):');
  for (const [tipo, id] of Object.entries(resultado.sincronizaciones)) console.log(`  ${tipo}: ${id ?? '(sin identificador)'}`);
  console.log(`Número en la app WhatsApp Business: ${resultado.enLaApp ?? 'no informado'} · plataforma: ${resultado.plataforma ?? 'no informada'}`);
  for (const aviso of resultado.advertencias) console.log(`Ojo: ${aviso}`);

  if (tiene('guardar')) {
    const token = guardarSecreto('WHATSAPP_TOKEN', resultado.token);
    const numero = guardarSecreto('WHATSAPP_PHONE_NUMBER_ID', argumento('telefono'));
    if (!token || !numero) {
      console.error('\nNo se pudo cargar todo en Cloudflare. Vuelve a cargarlo a mano con `npx wrangler secret put` (necesitas el token otra vez: pide una conexión nueva, el código ya se usó).');
      if (!token) console.error('Falló: WHATSAPP_TOKEN. Usa --mostrar-token la próxima vez para no perderlo.');
      process.exitCode = 1;
    } else {
      console.log('\nCargados WHATSAPP_TOKEN y WHATSAPP_PHONE_NUMBER_ID en el bot.');
    }
  }
  if (tiene('mostrar-token')) {
    console.log('\nToken (se muestra una sola vez; no lo pegues en el chat ni en un archivo):');
    console.log(resultado.token);
  }
  console.log('\nSigue en docs/TECH_PROVIDER.md: mantén abierta la app WhatsApp Business unos minutos y revisa /salud del bot.');
}

principal().catch((falla) => {
  console.error(falla instanceof ErrorDeConexion ? `\n${falla.message}` : `\nError inesperado: ${falla instanceof Error ? falla.constructor.name : 'desconocido'}`);
  process.exitCode = 1;
});
