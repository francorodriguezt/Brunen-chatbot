/**
 * Ayuda a conectar el bot de Telegram de los avisos urgentes (Etapa 5), sin que el token pase por el chat ni quede
 * en el historial del navegador.
 *
 * Uso, en la terminal del computador:
 *   node scripts/telegram-chat-id.mjs
 *
 * 1. Pide el token que entregó @BotFather (no se muestra al escribirlo ni se guarda).
 * 2. Lista los chats donde alguien le escribió al bot: el número de cada uno es el TELEGRAM_CHAT_ID.
 *    Para un grupo, primero agrega el bot al grupo y escribe cualquier cosa en el grupo.
 * 3. Si eliges un chat, le manda un mensaje de prueba.
 *
 * Después se cargan los dos secretos en el bot:
 *   npx wrangler secret put TELEGRAM_BOT_TOKEN
 *   npx wrangler secret put TELEGRAM_CHAT_ID
 */

import { createInterface } from 'node:readline';

/** Lee una línea sin mostrar lo que se escribe. */
function preguntarOculto(pregunta) {
  return new Promise((resolver) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let silencio = false;
    rl._writeToOutput = (texto) => {
      if (!silencio) process.stdout.write(texto);
    };
    rl.question(pregunta, (respuesta) => {
      rl.close();
      process.stdout.write('\n');
      resolver(respuesta.trim());
    });
    silencio = true;
  });
}

function preguntar(pregunta) {
  return new Promise((resolver) => {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    rl.question(pregunta, (respuesta) => {
      rl.close();
      resolver(respuesta.trim());
    });
  });
}

async function llamar(token, metodo, cuerpo) {
  const respuesta = await fetch(`https://api.telegram.org/bot${token}/${metodo}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(cuerpo ?? {}),
    signal: AbortSignal.timeout(10_000),
  });
  const datos = await respuesta.json().catch(() => ({}));
  if (!datos.ok) throw new Error(`Telegram respondió ${respuesta.status}: ${datos.description ?? 'sin detalle'}`);
  return datos.result;
}

async function main() {
  const token = await preguntarOculto('Token del bot (no se muestra al escribirlo): ');
  if (!/^\d{5,}:[A-Za-z0-9_-]{20,}$/.test(token)) {
    console.error('Eso no parece un token de @BotFather (tiene la forma 123456789:ABC...).');
    return 1;
  }
  const bot = await llamar(token, 'getMe');
  console.log(`\nBot: @${bot.username}`);

  const actualizaciones = await llamar(token, 'getUpdates', { allowed_updates: ['message', 'my_chat_member'] });
  const chats = new Map();
  for (const a of actualizaciones) {
    const chat = a.message?.chat ?? a.my_chat_member?.chat;
    if (chat) chats.set(chat.id, chat);
  }
  if (chats.size === 0) {
    console.log('\nNadie le ha escrito al bot todavía. Agrégalo al grupo de avisos, escribe "hola" en el grupo y vuelve a correr esto.');
    return 0;
  }
  console.log('\nChats donde le escribieron al bot:');
  for (const chat of chats.values()) {
    const nombre = chat.title ?? [chat.first_name, chat.last_name].filter(Boolean).join(' ');
    console.log(`  ${chat.id}  (${chat.type === 'private' ? 'chat privado' : 'grupo'}: ${nombre})`);
  }

  const elegido = await preguntar('\nNúmero del chat para mandarle un mensaje de prueba (Enter para no mandar): ');
  if (!elegido) return 0;
  await llamar(token, 'sendMessage', { chat_id: elegido, text: 'Prueba de los avisos de Brunen: si ves esto, el bot quedó bien conectado.' });
  console.log(`Listo. Ese es el TELEGRAM_CHAT_ID: ${elegido}`);
  return 0;
}

main()
  .then((codigo) => (process.exitCode = codigo))
  .catch((error) => {
    console.error(`\nError: ${error instanceof Error ? error.message : error}`);
    process.exitCode = 1;
  });
