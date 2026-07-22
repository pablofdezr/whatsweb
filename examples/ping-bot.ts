/**
 * Bot with a command router.  Run:  npm run example:bot
 * The first time, scan the QR from WhatsApp > Linked devices.
 */
import { createClient } from '../src/index.js';

const wa = createClient({ session: 'demo', deviceName: 'whatsweb-demo' });

wa.on('qr', () => console.log('📲 Scan the QR above with WhatsApp > Linked devices'));
wa.on('ready', (me) => console.log(`✅ Connected as ${me.number ?? me.jid}`));

// Commands (default prefixes: ! and /)
wa.command('ping', (ctx) => ctx.reply('pong 🏓'));
wa.command(['echo', 'eco'], (ctx) => ctx.reply(ctx.args.join(' ') || 'Usage: !echo <text>'));
wa.command('sum', (ctx) => {
  const total = ctx.args.map(Number).reduce((a, b) => a + b, 0);
  return ctx.reply(`= ${total}`);
});

// Patterns and reactions
wa.hears(/\bhola\b/i, (ctx) => ctx.react('👋'));

// Middleware: log everything incoming
wa.use(async (ctx, next) => {
  console.log(`💬 [${ctx.isGroup ? 'group' : 'dm'}] ${ctx.sender.displayName}: ${ctx.text}`);
  await next();
});

wa.on('disconnected', ({ reconnecting }) =>
  console.log(reconnecting ? '🔌 Reconnecting…' : '🔌 Done'),
);
wa.on('error', (err) => console.error('❌', err.message));

await wa.start();
