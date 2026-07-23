/**
 * Demonstrates `hears` with a case-insensitive RegExp. Run with Bun:
 *
 *   bun examples/hello-bot.ts
 *   # or:  bun run example:hello
 *
 * The first time, scan the QR from WhatsApp > Linked devices, then message the
 * linked account from another phone. Try "hello", "Hello", "HELLO", "hello
 * there" — every casing fires the handler because of the `i` flag. Sending
 * "hello" or "hell" does NOT match, so you can see the boundary too.
 */
import { createClient } from '../src/index.js';

const wa = createClient({ session: 'hello-demo', deviceName: 'whatsweb-hello' });

wa.on('qr', () => console.log('📲 Scan the QR above with WhatsApp > Linked devices'));
wa.on('ready', (me) => console.log(`✅ Connected as ${me.number ?? me.jid}`));

// `/hello/i` — the `i` flag makes the match case-insensitive, so "Hello",
// "HELLO" and "hello" all trigger this. `ctx.match` is the RegExpMatchArray, so
// we can echo back exactly what matched to prove it.
wa.hears(/hello/i, (ctx) => {
  const matched = ctx.match?.[0] ?? ctx.text;
  return ctx.reply(`👋 Matched "${matched}" with /hello/i — case doesn't matter.`);
});

// Contrast: `/^hello$/i` only matches when the whole message is exactly "hello"
// (any casing). Use `!strict` to see the difference against the loose pattern.
wa.hears(/^\/strict\b/i, (ctx) => {
  const value = ctx.text.replace(/^\/strict\s*/i, '');
  const exact = /^hello$/i.test(value);
  return ctx.reply(
    exact ? `✅ "${value}" is an exact hello` : `❌ "${value}" is not an exact hello`,
  );
});

// Log every incoming message so you can watch matches happen in the terminal.
wa.use(async (ctx, next) => {
  console.log(`💬 ${ctx.sender.displayName}: ${ctx.text}`);
  await next();
});

wa.on('error', (err) => console.error('❌', err.message));

await wa.start();
