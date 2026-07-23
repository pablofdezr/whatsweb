/**
 * AI chatbot powered by the Vercel AI SDK. Every incoming message is answered
 * by Claude, with the recent chat history as context — `toMessages()` converts
 * whatsweb's per-chat history straight into AI SDK messages.
 *
 * Setup:
 *   npm install ai
 *   export AI_GATEWAY_API_KEY=...   # https://vercel.com/docs/ai-gateway
 *
 * Run:
 *   npx tsx examples/ai-bot.ts
 *   # or:  npm run example:ai
 *
 * Model strings route through the Vercel AI Gateway, so swapping providers is
 * a one-line change (e.g. 'anthropic/claude-haiku-4.5' for cheaper replies).
 */
import { generateText, type ModelMessage } from 'ai';
import { createClient } from '../src/index.js';

const MODEL = 'anthropic/claude-opus-4.8';

const INSTRUCTIONS = `You are a helpful assistant chatting on WhatsApp.
Keep replies short and conversational — a couple of sentences, no markdown
headers or bullet lists. Match the language the user writes in.`;

const wa = createClient({ session: 'ai-demo', deviceName: 'whatsweb-ai' });

wa.on('qr', () => console.log('📲 Scan the QR above with WhatsApp > Linked devices'));
wa.on('ready', (me) => console.log(`✅ Connected as ${me.number ?? me.jid}`));

wa.on('message', async (ctx) => {
  if (!ctx.text) return; // ignore media-only messages

  try {
    // The just-received message is already in the history, so the transcript
    // ends with the user's latest turn — no separate prompt needed.
    const messages = ctx.conversation.toMessages({ limit: 20 }) as ModelMessage[];

    const { text } = await generateText({
      model: MODEL,
      instructions: INSTRUCTIONS,
      messages,
    });

    await ctx.reply(text);
  } catch (err) {
    console.error('❌ AI request failed:', err);
    await ctx.reply('Sorry, I could not think of a reply right now 🤖');
  }
});

wa.on('error', (err) => console.error('❌', err.message));

await wa.start();
