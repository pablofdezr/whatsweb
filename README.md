# whatsweb

[![npm](https://img.shields.io/npm/v/@whatsweb/core.svg)](https://www.npmjs.com/package/@whatsweb/core)
[![downloads](https://img.shields.io/npm/dm/@whatsweb/core.svg)](https://www.npmjs.com/package/@whatsweb/core)
[![docs](https://img.shields.io/badge/docs-website-25D366.svg)](https://pablofdezr.github.io/whatsweb/)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/types-included-blue.svg)](./dist/index.d.ts)
[![Baileys](https://img.shields.io/badge/built%20on-Baileys%207-25D366.svg)](https://github.com/WhiskeySockets/Baileys)

📖 **[Website & API documentation](https://pablofdezr.github.io/whatsweb/)**

A great-DX SDK for WhatsApp Web with **no browser** — no Puppeteer, no headless
Chromium. It speaks the native Multi-Device protocol directly over a WebSocket
([Baileys 7](https://github.com/WhiskeySockets/Baileys)) and wraps it in a
fully-typed, bot-friendly API.

```ts
import { createClient } from '@whatsweb/core';

const wa = createClient({ session: 'my-bot' });

wa.on('ready', (me) => console.log('Connected:', me.number));
wa.command('ping', (ctx) => ctx.reply('pong 🏓'));
wa.hears(/hello/i, (ctx) => ctx.react('👋'));

await wa.start();
```

## Features

- 🚀 **No browser** — a fraction of the RAM and startup time of Puppeteer-based clients.
- 🤖 **Command router** — `command`, `hears`, middleware, and a rich `Context`.
- 🔀 **Two styles** — event callbacks *or* a linear `for await` async iterator.
- 📎 **Media from anywhere** — local path, http(s)/S3 URL, Buffer or Node stream, with `sendFromLink` auto-detecting the type.
- 💬 **Rich messages** — polls, mentions, stickers, contacts, edit / delete / forward.
- 👥 **Groups** — metadata, participants, invite links, create / join / leave.
- 👤 **Presence & profile** — presence, profile pictures, status, block list.
- 🧭 **Per-user conversations** — persistent state, message history, `ask`, and a neutral `toMessages()` to plug in your own LLM/agent.
- 🛟 **Resilient** — auto-reconnect with backoff and optional send rate-limiting.
- 🆔 **LID-aware** — supports WhatsApp's anonymous identity system.
- 🟦 **Typed** — written in TypeScript, ships `.d.ts`, ESM.

## Install

```bash
npm install @whatsweb/core
# or
pnpm add @whatsweb/core
# or
bun add @whatsweb/core
```

Works with **npm, pnpm and Bun**. Requires **Node ≥ 20** (or Bun) and an **ESM**
project (`"type": "module"`), since Baileys 7 is ESM-only.

## Linking your account

**By QR** (default): the QR is printed to the terminal — scan it from
*WhatsApp → Linked devices*.

```ts
const wa = createClient({ session: 'my-bot' });
wa.on('qr', (qr) => qr.printToTerminal()); // printed automatically by default
await wa.start();
```

**By pairing code** (no camera / no QR):

```ts
const wa = createClient({ session: 'my-bot', pairingCode: '34600112233' });
wa.on('pairing_code', (code) => console.log('Enter on your phone:', code));
await wa.start();
```

## Command router

```ts
// Commands (default prefixes: '!' and '/'; configurable via commandPrefix)
wa.command('ping', (ctx) => ctx.reply('pong'));
wa.command(['echo', 'say'], (ctx) => ctx.reply(ctx.args.join(' ')));

// Text patterns — RegExp captures land in ctx.match
wa.hears('thanks', (ctx) => ctx.react('🙏'));
wa.hears(/price (\d+)/i, (ctx) => ctx.reply(`That costs ${ctx.match![1]}€`));

// Global middleware (Koa/Telegraf style)
wa.use(async (ctx, next) => {
  if (ctx.isGroup) return; // ignore groups: don't call next()
  await next();
});
```

### The `Context` object

| Property / method                       | Description                                        |
| --------------------------------------- | -------------------------------------------------- |
| `ctx.text`                              | Message text.                                      |
| `ctx.command` / `ctx.args`              | Parsed command name and arguments.                 |
| `ctx.sender`                            | Identity (`.number`, `.displayName`, `.isLid`, …). |
| `ctx.chat`                              | Fluent chat handle (`ctx.chat.image(...)`).        |
| `ctx.isGroup` / `ctx.fromMe`            | Handy flags.                                       |
| `ctx.match`                             | The `hears` RegExp result.                         |
| `ctx.reply(x)` / `ctx.send(x)`          | Reply quoting / send without quoting.              |
| `ctx.react('👍')`                       | React to the message.                              |
| `ctx.replyWithImage(src, { caption })`  | …plus `replyWithVideo/Audio/Voice/Document/Location/Link`. |
| `ctx.forward(to)` / `ctx.delete()`      | Forward or delete the message.                     |
| `ctx.typing()`                          | Show "typing…"; returns a function to stop it.     |
| `ctx.downloadMedia()`                   | Download the message media as a `Buffer`.          |
| `ctx.awaitReply({ timeoutMs? })`        | Await the next reply in this chat (same sender).   |
| `ctx.conversation`                      | Rich per-user handle: state, history, `ask`, send. |
| `ctx.replyWithTyping(text)`             | Show "typing…" briefly, then reply.                |
| `ctx.group`                             | `Group` handle when the message is from a group.   |
| `ctx.message`                           | The raw `Message` (`.raw` for the Baileys object). |

## Async/await style

Prefer a linear flow over registering callbacks? Iterate incoming messages with
a `for await` loop:

```ts
await wa.start();
const me = await wa.waitUntilReady();
console.log('Connected:', me.number);

for await (const ctx of wa.messages()) {
  if (ctx.command === 'ping') await ctx.reply('pong 🏓');
  else if (/hello/i.test(ctx.text)) await ctx.react('👋');
}
```

Messages are buffered between iterations, so none are lost. Also: `wa.stream(event)`
(iterate any event), `wa.next(event)` (await a single event), and an optional
`AbortSignal` to stop. Both styles are interchangeable — use whichever fits.

## Sending messages

`to` accepts a JID or a phone number. Media sources accept a **local path, an
http(s) URL (S3 included), a Buffer, or a Node stream**.

```ts
await wa.sendText('34600112233', 'Hello 👋');
await wa.sendImage('34600112233', './cat.jpg', { caption: 'meow' });
await wa.sendImage('34600112233', 'https://example.com/photo.png');
await wa.sendVoice('34600112233', './note.ogg');                 // voice note
await wa.sendDocument('34600112233', './invoice.pdf', { fileName: 'invoice.pdf' });
await wa.sendLocation('34600112233', { latitude: 40.4168, longitude: -3.7038 });

// Fluent chat handle — set the recipient once
const chat = wa.chat('34600112233');
await chat.text('first');
await chat.image('./photo.jpg');
```

### Send from a link (S3, CDNs, …)

`sendFromLink` sends whatever a URL points to and **auto-detects the media kind**
from the extension or `Content-Type`:

```ts
await wa.sendFromLink('34600112233', 'https://my-bucket.s3.eu-west-1.amazonaws.com/report.pdf');
await wa.sendFromLink('34600112233', 'https://cdn.example.com/clip.mp4', { caption: 'look' });
await wa.sendFromLink('34600112233', signedUrl, { type: 'image' }); // force the kind
```

A remote URL is fetched by **your** Node process (not by WhatsApp), then encrypted
and uploaded — so it must be reachable from your server. For a private S3 bucket,
pass a presigned URL or stream the object directly:

```ts
const obj = await s3.send(new GetObjectCommand({ Bucket, Key }));
await wa.sendVideo('34600112233', { stream: obj.Body as NodeJS.ReadableStream });
```

## Rich messages

```ts
// Mentions (@)
await wa.sendText('120363...@g.us', 'ping @34600112233', { mentions: ['34600112233'] });

// Poll, sticker, contact
await wa.sendPoll('34600112233', { name: 'Pizza?', options: ['Yes', 'No'] });
await wa.sendSticker('34600112233', './sticker.webp');
await wa.sendContact('34600112233', { fullName: 'Ada Lovelace', phone: '34600112233' });

// Edit / delete / forward
const msg = await wa.sendText('34600112233', 'typo');
await msg.edit('fixed');
await msg.delete();                                     // for everyone
wa.on('message', (ctx) => ctx.forward('34611111111'));
```

## Groups

```ts
const group = wa.group('120363...@g.us');

const meta = await group.metadata();                 // subject, participants, admins…
await group.addParticipants(['34600112233']);
await group.promote(['34600112233']);
await group.setSubject('New name');
console.log(await group.inviteLink());               // https://chat.whatsapp.com/...
await group.leave();

const created = await wa.createGroup('My group', ['34600112233', '34611111111']);
await wa.joinGroupViaLink('https://chat.whatsapp.com/AbCdEf...');

// In a handler, ctx.group is available when the message is from a group
wa.command('link', async (ctx) => {
  if (ctx.group) await ctx.reply(await ctx.group.inviteLink());
});
```

## Presence & profile

```ts
await wa.setPresence('available');
await wa.subscribeToPresence('34600112233');
wa.on('presence', ({ id, presences }) => console.log(id, presences));

await wa.setName('My Bot');
await wa.setStatus('Available 24/7');
await wa.setProfilePicture('./avatar.jpg');

const url = await wa.getProfilePictureUrl('34600112233', true);
const about = await wa.getStatus('34600112233');

await wa.blockUser('34600112233');
const blocked = await wa.getBlocklist();
```

## Conversations (per-user experiences)

`ctx.conversation` (or `wa.conversation(jid)`) is a rich, per-user handle: send +
**persistent state** + **message history** + **ask**. It's how you build stateful,
per-user chat experiences.

### Ask &amp; await — wizards

```ts
wa.command('signup', async (ctx) => {
  const convo = ctx.conversation;
  const name = await convo.askText('What is your name?');
  const email = await convo.askText('And your email?', { timeoutMs: 60_000 });
  await convo.state.patch({ name, email });
  await convo.text(`Thanks ${name}, you're all set ✅`);
});
```

### Confirm a value

`confirm` sends a yes/no question and interprets the reply (accepted answers are
configurable; defaults cover English + Spanish + 👍/👎). Unclear answers are
re-prompted.

```ts
wa.command('email', async (ctx) => {
  const convo = ctx.conversation;
  const email = await convo.askText('What is your email?');
  if (await convo.confirm(`Confirm your email is ${email}? (yes/no)`)) {
    await convo.state.set('email', email);
    await convo.text('Saved ✅');
  } else {
    await convo.text('No problem — send me the correct one.');
  }
});
```

### Per-user state

State is scoped per chat and persisted through a pluggable store (in-memory by
default; implement `StateStore` for Redis, a database, …).

```ts
wa.on('message', async (ctx) => {
  const count = (await ctx.conversation.state.get<number>('count')) ?? 0;
  await ctx.conversation.state.set('count', count + 1);
  await ctx.reply(`That's message #${count + 1} from you`);
});

createClient({ stateStore: myRedisStore }); // bring your own store
```

### Message history

The client keeps a bounded, in-memory history per chat (messages seen and sent).

```ts
const recent = ctx.conversation.history(); // Message[] (oldest first)
```

Tune or disable it: `createClient({ history: { limit: 50, maxChats: 1000 } })` or
`createClient({ history: false })`.

### Bring your own agent (LLM)

whatsweb is **unopinionated about LLMs** — it doesn't wrap any model. It just
turns the conversation into a transcript with `toMessages()`, which you feed to
your own agent (e.g. the [Vercel AI SDK](https://sdk.vercel.ai)). You stay in
full control of the model, tools and streaming.

```ts
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

wa.on('message', async (ctx) => {
  const { text } = await generateText({
    model: openai('gpt-4o-mini'),
    system: 'You are a helpful WhatsApp assistant. Keep replies short.',
    messages: ctx.conversation.toMessages({ limit: 20 }),
  });
  await ctx.replyWithTyping(text); // shows "typing…" then replies
});
```

`toMessages()` maps your messages to `assistant` turns and the other party's to
`user` turns — the exact `{ role, content }` shape agent SDKs expect.

## Reconnection & rate limiting

Auto-reconnect is on by default with exponential backoff, and stops on logout or
manual `destroy()`. WhatsApp may ban numbers that send too fast, so you can space
messages out with `rateLimitMs`:

```ts
createClient({
  autoReconnect: true,       // default
  maxReconnectAttempts: 10,  // default: Infinity
  reconnectDelayMs: 1000,    // base backoff, capped at 30s
  rateLimitMs: 1000,         // ≥ 1s between outgoing messages (off by default)
});
```

An emitted `error` without a listener would crash the process (Node behavior), so
the SDK only emits it when you're listening — otherwise it routes to the logger.
Attaching `wa.on('error', …)` is still recommended.

## LIDs (anonymous identity)

WhatsApp assigns each user a **LID** (`…@lid`) to hide their phone number; this
SDK handles it transparently:

```ts
wa.on('message', (ctx) => {
  ctx.sender.isLid;       // is the identity a LID?
  ctx.sender.number;      // phone number if known (may be undefined with LID)
  ctx.sender.displayName; // best available name
});

await wa.getLid('34600112233'); // LID for a number, if WhatsApp exposes it
```

## Events

```ts
wa.on('qr', (qr) => qr.printToTerminal());       // or use qr.raw for your own image
wa.on('pairing_code', (code) => {});
wa.on('ready', (info) => {});                     // { jid, lid, number, name }
wa.on('message', (ctx) => {});                    // incoming (not your own)
wa.on('message_create', (ctx) => {});             // every message, yours included
wa.on('reaction', ({ emoji, key, fromMe }) => {});
wa.on('presence', ({ id, presences }) => {});     // after subscribeToPresence
wa.on('disconnected', ({ code, reconnecting }) => {});
wa.on('error', (err) => {});
```

## Session persistence

Credentials are stored on disk under `.whatsweb_auth/<session>` (`LocalAuth`), so
you scan the QR only once. Use different `session` names for multiple accounts,
or implement the `AuthStrategy` interface for a custom store (e.g. a database):

```ts
import { createClient, LocalAuth } from '@whatsweb/core';

const wa = createClient({
  authStrategy: new LocalAuth({ clientId: 'account-1', dataPath: './sessions' }),
});
```

### Multiple accounts

Run several numbers in one process — one `Client` per account with a distinct
`session` (each gets its own credentials folder). See
[`examples/multi-account.ts`](./examples/multi-account.ts).

```ts
const accounts = ['personal', 'work'];
const clients = accounts.map((name) => createClient({ session: name }));

for (const wa of clients) {
  wa.on('ready', (me) => console.log('connected:', me.number));
  wa.command('ping', (ctx) => ctx.reply('pong'));
}
await Promise.all(clients.map((wa) => wa.start()));
```

## API overview

**`createClient(options)`** — `session`, `authStrategy`, `pairingCode`,
`autoReconnect`, `maxReconnectAttempts`, `reconnectDelayMs`, `rateLimitMs`,
`stateStore`, `history`, `printQRInTerminal`, `deviceName`, `markOnlineOnConnect`,
`commandPrefix`, `logger`.

**Client**

- Lifecycle: `start` / `initialize` / `waitUntilReady` / `logout` / `destroy`.
- Router: `use` / `command` / `hears`.
- Async: `messages` / `stream` / `next` / `waitForMessage`.
- Conversations: `conversation(id)` / `stateFor(id)` / `historyFor(id)` / `clearHistory(id?)`.
- Send: `send` / `sendText` / `sendImage` / `sendVideo` / `sendAudio` / `sendVoice`
  / `sendDocument` / `sendLocation` / `sendFromLink` / `sendPoll` / `sendSticker` /
  `sendContact`.
- Messages: `react` / `editMessage` / `deleteMessage` / `forwardMessage`.
- Groups: `group(id)` and `getGroupMetadata` / `createGroup` / participant ops /
  subject & description / invite links / `joinGroupViaLink` / `leaveGroup`.
- Presence & profile: `setPresence` / `subscribeToPresence` / `getProfilePictureUrl`
  / `setProfilePicture` / `removeProfilePicture` / `setName` / `setStatus` /
  `getStatus` / `blockUser` / `unblockUser` / `getBlocklist`.
- Queries: `chat(id)` / `isRegisteredUser` / `getLid`.
- `socket` — the raw Baileys `WASocket` (escape hatch).

Full typed API reference:
**[pablofdezr.github.io/whatsweb/docs](https://pablofdezr.github.io/whatsweb/docs/)**
(built with Docusaurus + TypeDoc; run `npm run docs` locally). Changes are listed
in [`CHANGELOG.md`](./CHANGELOG.md).

## Disclaimer

WhatsApp does **not** offer a public API for unofficial clients. Automating user
accounts may violate their Terms of Service and get the number banned. Use at your
own risk and only with accounts you own. Not affiliated with WhatsApp or Meta.

## Contributing

Development, testing and release notes live in [`CONTRIBUTING.md`](./CONTRIBUTING.md).

## License

MIT © Pablo Fernández Ruiz
