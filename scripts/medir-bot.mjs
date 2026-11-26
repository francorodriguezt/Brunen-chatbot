#!/usr/bin/env node
/**
 * Mide cuánto entiende el bot con chats reales (D96). Corre en tu computador, sin red y sin IA.
 *
 *   npm run medir-bot -- "datos/chats"                    (una carpeta con los .txt exportados de WhatsApp)
 *   npm run medir-bot -- "datos/chat1.txt" "datos/chat2.txt" --negocio "Brunen"
 *
 * Exportar un chat: en el teléfono, abre el chat → ⋮ (o el nombre) → Más → Exportar chat → Sin archivos.
 * Deja los .txt en datos/ (ignorada por git). El informe queda en datos-anonimos/medicion-bot/: revísalo antes de
 * compartirlo. Con dos o más chats, el negocio se reconoce solo (es quien escribe en todos); con uno, usa --negocio.
 */

import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { agrupar, detectarNegocio, informe, leerChat, medir } from './medir/nucleo.mjs';

function argumentos(lista) {
  const archivos = [];
  let negocio = [];
  let salida = 'datos-anonimos/medicion-bot';
  for (let i = 0; i < lista.length; i++) {
    if (lista[i] === '--negocio') negocio = String(lista[++i] ?? '').split(',').map((n) => n.trim()).filter(Boolean);
    else if (lista[i] === '--salida') salida = String(lista[++i] ?? salida);
    else archivos.push(lista[i]);
  }
  return { archivos, negocio, salida };
}

function chatsDe(rutas) {
  return rutas.flatMap((ruta) =>
    statSync(ruta).isDirectory()
      ? readdirSync(ruta).filter((n) => n.toLowerCase().endsWith('.txt')).map((n) => join(ruta, n))
      : [ruta],
  );
}

/** El intérprete del bot, tal cual (src/interprete.ts), empaquetado al vuelo con esbuild (viene con wrangler). */
async function cargarInterprete() {
  const { outputFiles } = await build({
    entryPoints: [fileURLToPath(new URL('../src/interprete.ts', import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
  });
  return (await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`)).interpretar;
}

const { archivos, negocio: indicado, salida } = argumentos(process.argv.slice(2));
if (archivos.length === 0) {
  console.error('Indica los chats: npm run medir-bot -- "datos/chats" (una carpeta con los .txt exportados de WhatsApp).');
  process.exit(1);
}
const rutas = chatsDe(archivos);
const chats = rutas.map((ruta) => leerChat(readFileSync(ruta, 'utf8')));
const negocio = new Set(indicado.length > 0 ? indicado : detectarNegocio(chats));
if (negocio.size === 0) {
  console.error('No se pudo saber quién es el negocio. Indícalo como aparece en el chat: --negocio "Brunen".');
  process.exit(1);
}
const nombres = [...new Set(chats.flat().map((m) => m.autor))];
const grupos = chats.flatMap((chat) => agrupar(chat, negocio));
const medicion = medir(grupos, await cargarInterprete(), nombres);

mkdirSync(salida, { recursive: true });
writeFileSync(join(salida, 'informe.md'), informe(medicion));
writeFileSync(join(salida, 'no-entendidos.json'), `${JSON.stringify(medicion.revisar, null, 2)}\n`);
const desconocidos = medicion.porIntencion.get('desconocido') ?? 0;
console.log(`Chats: ${rutas.length}. Mensajes del cliente: ${medicion.total}. Entendidos por las reglas: ${medicion.total - desconocidos}.`);
console.log(`Informe en ${join(salida, 'informe.md')}. Revísalo antes de compartirlo.`);
