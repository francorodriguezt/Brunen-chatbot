/**
 * Medidor del bot con chats reales (D96): lee chats exportados de WhatsApp, junta los mensajes seguidos de cada
 * cliente (como hace el bot) y cuenta qué entiende el intérprete por reglas. Lo que no entiende sale con los datos
 * personales ocultos, para revisarlo y sumarlo a tests/mensajes.json.
 *
 * Sin red y sin IA: el texto no sale del computador. Ocultar es una ayuda, no una garantía: un nombre o una
 * dirección escritos de otra forma pueden quedar a la vista, así que el informe se revisa antes de compartirlo.
 */

const INVISIBLES = /[‎‏‪-‮﻿]/g;
const ESPACIOS_RAROS = /[  ]/g;
const FECHA = String.raw`(\d{1,2})\/(\d{1,2})\/(\d{2,4}),? (\d{1,2}):(\d{2})(?::\d{2})?(?:\s*([ap])\.?\s*m\.?)?`;
// Android: "26/11/26, 14:05 - Ana: hola". iPhone: "[26/11/26, 14:05:33] Ana: hola".
const LINEA_ANDROID = new RegExp(String.raw`^${FECHA} - ([^:\n]{1,60}?): (.*)$`, 'i');
const LINEA_IPHONE = new RegExp(String.raw`^\[${FECHA}\] ([^:\n]{1,60}?): (.*)$`, 'i');
// Una línea con fecha pero sin autor es del sistema ("Los mensajes están cifrados..."): no es de nadie.
const LINEA_SISTEMA = new RegExp(String.raw`^\[?${FECHA}\]?(?: -)? `, 'i');
const OMITIDO =
  /^(?:<?(?:multimedia|media) omit(?:ido|ted)>?|(?:imagen|audio|video|sticker|gif|documento|archivo|ubicaci[oó]n) omitid[oa]|se elimin[oó] este mensaje\.?|este mensaje fue eliminado\.?|eliminaste este mensaje\.?|this message was deleted\.?|.*\(archivo adjunto\))$/i;
const EDITADO = /\s*<se edit[oó] este mensaje\.?>\s*$/i;

function limpiar(linea) {
  return linea.replace(INVISIBLES, '').replace(ESPACIOS_RAROS, ' ');
}

function minutoDe([dia, mes, anio, hora, minuto, ampm]) {
  const a = Number(anio) < 100 ? 2000 + Number(anio) : Number(anio);
  let h = Number(hora) % (ampm ? 12 : 24);
  if (ampm && ampm.toLowerCase() === 'p') h += 12;
  return Date.UTC(a, Number(mes) - 1, Number(dia), h, Number(minuto)) / 60000;
}

/** Los mensajes de un chat exportado: autor, minuto (para saber cuáles van seguidos) y texto. Sin archivos ni avisos del sistema. */
export function leerChat(texto) {
  const mensajes = [];
  let actual = null;
  for (const cruda of texto.split(/\r?\n/)) {
    const linea = limpiar(cruda);
    const m = LINEA_ANDROID.exec(linea) ?? LINEA_IPHONE.exec(linea);
    if (m) {
      actual = { autor: m[7].trim(), minuto: minutoDe(m.slice(1, 7)), texto: m[8] };
      mensajes.push(actual);
    } else if (LINEA_SISTEMA.test(linea)) {
      actual = null;
    } else if (actual) {
      actual.texto += `\n${linea}`;
    }
  }
  return mensajes
    .map((m) => ({ ...m, texto: m.texto.replace(EDITADO, '').trim() }))
    .filter((m) => m.texto && !OMITIDO.test(m.texto));
}

/** Con dos o más chats, el negocio es quien escribe en todos (quien exportó los chats). Con uno solo no se sabe. */
export function detectarNegocio(chats) {
  if (chats.length < 2) return [];
  const [primero, ...resto] = chats.map((c) => new Set(c.map((m) => m.autor)));
  return [...primero].filter((autor) => resto.every((s) => s.has(autor))).sort();
}

/** Los mensajes seguidos de cada cliente, juntos (hasta 2 minutos entre uno y otro, sin respuesta en medio). */
export function agrupar(mensajes, negocio) {
  const grupos = [];
  let ultimo = null;
  for (const m of mensajes) {
    if (negocio.has(m.autor)) {
      ultimo = null;
      continue;
    }
    if (ultimo && ultimo.autor === m.autor && m.minuto - ultimo.minuto <= 2) {
      ultimo.texto += `\n${m.texto}`;
      ultimo.minuto = m.minuto;
    } else {
      ultimo = { autor: m.autor, minuto: m.minuto, texto: m.texto };
      grupos.push(ultimo);
    }
  }
  return grupos.map((g) => g.texto);
}

const escapar = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Palabras con mayúscula que no son parte de una dirección: días, meses y cómo suele empezar un mensaje.
const NO_SON_CALLE = new Set(
  (
    'lunes martes miercoles miércoles jueves viernes sabado sábado domingo enero febrero marzo abril mayo junio julio agosto ' +
    'septiembre setiembre octubre noviembre diciembre hola buenas buenos gracias brunen hoy mañana manana para quiero necesito ' +
    'dame mandame mándame son serian serían seria sería somos solo sólo ok si sí ya y me mi te un una unos unas dos tres cuatro ' +
    'cinco seis siete ocho nueve diez porfa porfavor favor el la los las de del'
  ).split(' '),
);
const CONECTORES = String.raw`(?:de|del|la|las|el|los|av\.?|avda\.?|psje\.?|pje\.?)`;
const DIRECCION = new RegExp(
  String.raw`(?<![\p{L}\d])((?:(?:\p{Lu}\p{Ll}+|${CONECTORES})\s+){1,5})#?\s?(\d{1,5})(?![\p{L}\d])(?!\s*(?:de\b|x\b|bid|vid|botell|garraf|lts?\b|litros?\b|l\b))`,
  'gu',
);

/** Oculta lo que identifica a alguien: enlaces, correos, RUT, teléfonos, direcciones, números de depto y los nombres de los autores. */
export function ocultar(texto, nombres = []) {
  let t = texto
    .replace(/https?:\/\/\S+|www\.\S+/gi, '[ENLACE]')
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[CORREO]')
    .replace(/\b\d{1,2}\.?\d{3}\.?\d{3}-[\dkK]\b/g, '[RUT]')
    .replace(/\+?\d(?:[\s.-]?\d){7,}/g, '[TELÉFONO]');
  t = t.replace(DIRECCION, (todo, palabras) => {
    const conMayuscula = palabras.trim().split(/\s+/).filter((p) => /^\p{Lu}/u.test(p));
    return conMayuscula.some((p) => !NO_SON_CALLE.has(p.toLowerCase())) ? '[DIRECCIÓN]' : todo;
  });
  t = t.replace(/\b(depto|dpto|dto|departamento|depa|block|torre|oficina)\.?\s*#?\s*\d+[a-z]?\b/gi, '$1 [N]');
  const palabras = [...new Set(nombres.flatMap((n) => n.split(/\s+/)).filter((p) => p.length >= 3))];
  for (const p of palabras) t = t.replace(new RegExp(String.raw`(?<![\p{L}\d])${escapar(p)}(?![\p{L}\d])`, 'giu'), '[NOMBRE]');
  return t;
}

/** Cuántos mensajes de cada intención y los no entendidos, ya ocultos. `interpretar` es el del bot. */
export function medir(grupos, interpretar, nombres = []) {
  const porIntencion = new Map();
  const revisar = [];
  for (const grupo of grupos) {
    const { intencion } = interpretar(grupo);
    porIntencion.set(intencion, (porIntencion.get(intencion) ?? 0) + 1);
    if (intencion === 'desconocido') revisar.push(ocultar(grupo, nombres));
  }
  return { total: grupos.length, porIntencion, revisar };
}

const porcentaje = (n, total) => (total > 0 ? `${Math.round((n / total) * 100)} %` : '0 %');

/** El informe en Markdown: totales, por intención y los no entendidos (sin datos personales, a revisar igual). */
export function informe({ total, porIntencion, revisar }) {
  const desconocidos = porIntencion.get('desconocido') ?? 0;
  const filas = [...porIntencion].sort((a, b) => b[1] - a[1]).map(([intencion, n]) => `| ${intencion} | ${n} | ${porcentaje(n, total)} |`);
  return [
    '# Medición del bot con chats reales (D96)',
    '',
    `Mensajes del cliente: ${total} (los seguidos cuentan como uno, como en el bot).`,
    `Entendidos por las reglas: ${total - desconocidos} (${porcentaje(total - desconocidos, total)}). En producción, los no entendidos pasan además por la IA de respaldo antes de ir a una persona.`,
    '',
    '| Intención | Mensajes | % |',
    '|---|---|---|',
    ...filas,
    '',
    '## No entendidos',
    '',
    'Se ocultaron teléfonos, correos, RUT, enlaces, direcciones, números de departamento y los nombres de los autores. **Revísalos antes de compartirlos:** un nombre o una dirección escritos de otra forma pueden quedar a la vista.',
    '',
    ...revisar.map((texto, i) => `${i + 1}. ${texto.replace(/\n/g, ' / ')}`),
    '',
  ].join('\n');
}
