/**
 * Same bot, written with async/await instead of callbacks.  Run:
 *   npx tsx examples/async-bot.ts
 *
 * Uses a linear `for await` loop over wa.messages() instead of
 * command()/hears()/on() callbacks.
 */
import { createClient } from '../src/index.js';

const wa = createClient({ session: 'demo' });
await wa.start();

const me = await wa.waitUntilReady();
console.log(`✅ Connected as ${me.number ?? me.jid}`);

for await (const ctx of wa.messages()) {
  if (ctx.command === 'ping') {
    await ctx.reply('pong 🏓');
  } else if (ctx.command === 'sum') {
    await ctx.reply(`= ${ctx.args.map(Number).reduce((a, b) => a + b, 0)}`);
  } else if (/hello/i.test(ctx.text)) {
    await ctx.react('👋');
  }
}
