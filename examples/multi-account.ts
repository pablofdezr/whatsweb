/**
 * Managing several WhatsApp accounts (numbers) in one process.
 *
 * Each account gets its own Client with a distinct `session` name, so their
 * credentials live in separate folders under `.whatsweb_auth/<name>` and never
 * mix. On first run, scan the QR for each account (they print one by one).
 *
 * Run with any package manager:
 *   npm run example:multi
 *   pnpm example:multi
 *   bun examples/multi-account.ts
 */
import { type Client, createClient } from '../src/index.js';

const ACCOUNTS = ['personal', 'work'] as const;

const clients = new Map<string, Client>();

for (const name of ACCOUNTS) {
  const wa = createClient({ session: name, deviceName: `whatsweb-${name}` });

  wa.on('qr', () => console.log(`📲 [${name}] scan the QR above with WhatsApp > Linked devices`));
  wa.on('ready', (me) => console.log(`✅ [${name}] connected as ${me.number ?? me.jid}`));
  wa.on('disconnected', ({ reconnecting }) =>
    console.log(`🔌 [${name}] ${reconnecting ? 'reconnecting…' : 'closed'}`),
  );
  wa.on('error', (err) => console.error(`❌ [${name}]`, err.message));

  // Each account answers, identifying itself so you can tell them apart.
  wa.command('ping', (ctx) => ctx.reply(`pong from "${name}" 🏓`));
  wa.command('whoami', (ctx) => ctx.reply(`You reached the "${name}" account.`));

  clients.set(name, wa);
}

// Start every account concurrently.
await Promise.all([...clients.values()].map((wa) => wa.start()));

console.log(`\nRunning ${clients.size} accounts: ${[...clients.keys()].join(', ')}.`);
console.log('Press Ctrl+C to stop.\n');

// Send from a specific account whenever you want:
//   await clients.get('work')!.sendText('34600112233', 'Hello from the work account');

// Graceful shutdown: close every connection without unlinking.
process.on('SIGINT', () => {
  console.log('\nShutting down…');
  void Promise.all([...clients.values()].map((wa) => wa.destroy())).then(() => process.exit(0));
});
