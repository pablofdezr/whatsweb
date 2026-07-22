/**
 * Linking by CODE instead of QR (handy without camera/QR access).  Usage:
 *   npx tsx examples/pair-with-code.ts 34600112233
 *
 * On your phone: WhatsApp > Linked devices > Link with phone number, and
 * enter the 8-character code printed here.
 */
import { createClient } from '../src/index.js';

const number = process.argv[2];

if (!number) {
  console.error('Usage: tsx examples/pair-with-code.ts <number-with-country-code>');
  process.exit(1);
}

const wa = createClient({ session: 'demo-pair', pairingCode: number });

wa.on('pairing_code', (code) => {
  console.log(`\n🔗 Enter this code on your phone (Link with phone number):\n\n    ${code}\n`);
});
wa.on('ready', (me) => console.log(`✅ Connected as ${me.number ?? me.jid}`));
wa.command('ping', (ctx) => ctx.reply('pong 🏓'));
wa.on('error', (err) => console.error('❌', err.message));

await wa.start();
