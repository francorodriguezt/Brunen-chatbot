#!/usr/bin/env node
/**
 * Compara a Groq con Workers AI (Cloudflare) como respaldo del intérprete (D114). Corre en tu computador y usa solo los
 * mensajes ficticios de tests/mensajes.json: ningún dato de clientes sale de aquí.
 *
 *   npm run comparar-ia                  (los mensajes que las reglas no entienden, más los casos dudosos)
 *   npm run comparar-ia -- --todos       (todos los casos del archivo: gasta más cupo)
 *
 * Claves en .dev.vars: GROQ_API_KEY, CLOUDFLARE_ACCOUNT_ID y CLOUDFLARE_API_TOKEN (un token con permiso "Workers AI").
 * Para cada mensaje mira si el modelo devuelve un JSON que el bot acepta y si coincide con lo esperado (intención y
 * productos). Con eso decides si Workers AI sirve de respaldo. Cuesta unas 2 llamadas por mensaje: usa el cupo gratis.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { leerVars } from './vars.mjs';

const vars = leerVars(fileURLToPath(new URL('../.dev.vars', import.meta.url)));
const faltan = ['GROQ_API_KEY', 'CLOUDFLARE_ACCOUNT_ID', 'CLOUDFLARE_API_TOKEN'].filter((n) => !vars[n]);
if (faltan.length > 0) {
  console.error(`Faltan en .dev.vars: ${faltan.join(', ')}`);
  process.exit(1);
}

async function cargar(archivo) {
  const { outputFiles } = await build({
    entryPoints: [fileURLToPath(new URL(archivo, import.meta.url))],
    bundle: true,
    format: 'esm',
    platform: 'neutral',
    write: false,
    logLevel: 'silent',
  });
  return import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);
}

const llm = await cargar('../src/llm.ts');
const { interpretar } = await cargar('../src/interprete.ts');

/** Workers AI por su API REST, con la misma forma que el binding `env.AI.run` que usa el bot. */
const ia = {
  async run(modelo, entrada) {
    const respuesta = await fetch(`https://api.cloudflare.com/client/v4/accounts/${vars.CLOUDFLARE_ACCOUNT_ID}/ai/run/${modelo}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${vars.CLOUDFLARE_API_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(entrada),
    });
    if (!respuesta.ok) throw new Error(`Workers AI respondió ${respuesta.status}`);
    return (await respuesta.json()).result;
  },
};

const todos = process.argv.includes('--todos');
const casos = JSON.parse(readFileSync(new URL('../tests/mensajes.json', import.meta.url), 'utf8')).casos;
const lista = casos.filter((c) => todos || interpretar(c.mensaje).intencion === 'desconocido' || c.esperado.intencion === 'desconocido' || c.mensaje.length > 40);

function coincide(obtenido, esperado) {
  if (!obtenido) return false;
  if (obtenido.intencion !== esperado.intencion) return false;
  if (!esperado.items) return true;
  const clave = (items) => items.map((i) => `${i.tipo}:${i.cantidad}`).sort().join(',');
  return clave(obtenido.items) === clave(esperado.items);
}

async function probar(nombre, consulta, caso) {
  const reglas = interpretar(caso.mensaje);
  const inicio = Date.now();
  try {
    const crudo = await consulta(caso.mensaje);
    const interpretacion = llm.completarConRespuesta(crudo, reglas);
    return { nombre, ms: Date.now() - inicio, json: true, valido: interpretacion !== null, acierta: coincide(interpretacion, caso.esperado) };
  } catch (error) {
    return { nombre, ms: Date.now() - inicio, json: false, valido: false, acierta: false, error: error.message };
  }
}

const resultados = { groq: [], cloudflare: [] };
console.log(`Comparando ${lista.length} mensajes de tests/mensajes.json…`);
for (const caso of lista) {
  resultados.groq.push(await probar('groq', (t) => llm.consultarGroq(t, vars.GROQ_API_KEY), caso));
  resultados.cloudflare.push(await probar('cloudflare', (t) => llm.consultarCloudflare(t, ia), caso));
}

for (const [nombre, filas] of Object.entries(resultados)) {
  const n = filas.length;
  const cuenta = (f) => filas.filter(f).length;
  const lentitud = Math.round(filas.reduce((s, r) => s + r.ms, 0) / n);
  console.log(`\n${nombre}: ${cuenta((r) => r.json)}/${n} devolvieron JSON · ${cuenta((r) => r.valido)}/${n} aceptados por el bot · ${cuenta((r) => r.acierta)}/${n} coinciden con lo esperado · ${lentitud} ms en promedio`);
  const errores = [...new Set(filas.filter((r) => r.error).map((r) => r.error))];
  if (errores.length > 0) console.log(`  errores: ${errores.join(' | ')}`);
}
console.log('\nSi Workers AI acierta parecido a Groq y casi siempre devuelve JSON, sirve de respaldo. Si no, deja solo Groq.');
