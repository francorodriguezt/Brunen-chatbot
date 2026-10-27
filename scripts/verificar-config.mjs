/**
 * Revisa que .dev.vars y wrangler.toml estén listos para la Etapa 1, SIN mostrar ningún valor.
 * Uso: npm run verificar-config            (lee .dev.vars)
 *      npm run verificar-config -- --vars otra/ruta.vars
 */

import { readFileSync } from 'node:fs';
import { argumento, leerVars } from './vars.mjs';

const errores = [];
const avisos = [];

let vars = {};
try {
  vars = leerVars(argumento('vars', '.dev.vars'));
} catch (error) {
  errores.push(error.message);
}

const requeridas = [
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'NUMEROS_PERMITIDOS',
];

if (errores.length === 0) {
  for (const clave of requeridas) {
    if (!vars[clave]) errores.push(`${clave} está vacía.`);
  }

  const verifyToken = vars.WHATSAPP_VERIFY_TOKEN ?? '';
  if (verifyToken && verifyToken.length < 16) {
    avisos.push('WHATSAPP_VERIFY_TOKEN es corta: usa al menos 16 caracteres al azar.');
  }

  // El App Secret de Meta son 32 caracteres hexadecimales.
  const appSecret = vars.WHATSAPP_APP_SECRET ?? '';
  if (appSecret && !/^[0-9a-f]{32}$/i.test(appSecret)) {
    avisos.push('WHATSAPP_APP_SECRET no parece un App Secret de Meta (32 caracteres hexadecimales). Revisa App settings > Basic.');
  }

  const phoneId = vars.WHATSAPP_PHONE_NUMBER_ID ?? '';
  if (phoneId && !/^\d+$/.test(phoneId)) {
    errores.push('WHATSAPP_PHONE_NUMBER_ID debe ser solo números (es el ID, no el teléfono con +).');
  }

  for (const numero of (vars.NUMEROS_PERMITIDOS ?? '').split(',').map((n) => n.trim()).filter(Boolean)) {
    if (numero.startsWith('+')) {
      avisos.push('NUMEROS_PERMITIDOS: el "+" no hace falta (se ignora), basta con 569XXXXXXXX.');
    } else if (!/^\d{8,15}$/.test(numero)) {
      errores.push(`NUMEROS_PERMITIDOS: un número tiene formato inválido (termina en ${numero.slice(-2)}). Usa 569XXXXXXXX, sin espacios.`);
    } else if (!/^569\d{8}$/.test(numero)) {
      avisos.push(`NUMEROS_PERMITIDOS: el número que termina en ${numero.slice(-4)} no es un celular chileno (569 + 8 dígitos).`);
    }
  }
}

const toml = readFileSync('wrangler.toml', 'utf8');
const version = /^GRAPH_API_VERSION\s*=\s*"([^"]*)"/m.exec(toml)?.[1];
if (!version || !/^v[1-9]\d*\.\d+$/.test(version)) {
  errores.push(`wrangler.toml: GRAPH_API_VERSION = "${version ?? ''}". Pon la versión que muestra Meta en API Setup (formato vNN.N).`);
}

for (const aviso of avisos) console.log(`⚠  ${aviso}`);
for (const error of errores) console.log(`✗  ${error}`);
if (errores.length > 0) {
  console.log(`\n${errores.length} problema(s) por corregir.`);
  process.exit(1);
}
console.log('✓  Configuración lista para la Etapa 1.');
