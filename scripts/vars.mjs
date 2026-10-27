/**
 * Lectura de archivos tipo .dev.vars (KEY=valor por línea), compartida por los scripts.
 * Nunca imprime valores: los scripts solo informan nombres de variables.
 */

import { readFileSync, existsSync } from 'node:fs';

export function leerVars(ruta) {
  if (!existsSync(ruta)) {
    throw new Error(`No existe ${ruta}. Cópialo desde .dev.vars.example y complétalo.`);
  }
  const vars = {};
  for (const linea of readFileSync(ruta, 'utf8').split(/\r?\n/)) {
    const limpia = linea.trim();
    if (!limpia || limpia.startsWith('#')) continue;
    const igual = limpia.indexOf('=');
    if (igual === -1) continue;
    const clave = limpia.slice(0, igual).trim();
    let valor = limpia.slice(igual + 1).trim();
    // Acepta valores entre comillas, como hace wrangler.
    if (valor.length >= 2 && (valor[0] === '"' || valor[0] === "'") && valor.at(-1) === valor[0]) {
      valor = valor.slice(1, -1);
    }
    vars[clave] = valor;
  }
  return vars;
}

/** Lee `--nombre valor` de la línea de comandos. */
export function argumento(nombre, porDefecto) {
  const i = process.argv.indexOf(`--${nombre}`);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
}
