/**
 * Sends a single message and exits.  Usage:
 *   npx tsx examples/send-message.ts 34600112233 "Hello from whatsweb"
 */
import { createClient } from '../src/index.js';

const [, , number, ...rest] = process.argv;
const text = rest.join(' ');

if (!number || !text) {
  console.error('Usage: tsx examples/send-message.ts <number> <message>');
  process.exit(1);
}

const wa = createClient({ session: 'demo' });
await wa.start();

const me = await wa.waitUntilReady();
console.log(`Connected as ${me.number ?? me.jid}. Sending…`);

if (!(await wa.isRegisteredUser(number))) {
  console.error(`The number ${number} is not on WhatsApp.`);
  await wa.destroy();
  process.exit(1);
}

const sent = await wa.sendText(number, text);
console.log(`✅ Sent (id ${sent.id})`);

await wa.destroy();
process.exit(0);
