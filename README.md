# whatsweb

[![npm](https://img.shields.io/npm/v/@whatsweb/core.svg)](https://www.npmjs.com/package/@whatsweb/core)
[![downloads](https://img.shields.io/npm/dm/@whatsweb/core.svg)](https://www.npmjs.com/package/@whatsweb/core)
[![docs](https://img.shields.io/badge/docs-online-25D366.svg)](https://pablofdezr.github.io/whatsweb/docs/)
[![license: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](./LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/types-included-blue.svg)](./dist/index.d.ts)
[![Baileys](https://img.shields.io/badge/built%20on-Baileys%207-25D366.svg)](https://github.com/WhiskeySockets/Baileys)

📖 **[Landing page](https://pablofdezr.github.io/whatsweb/)** · **[API documentation](https://pablofdezr.github.io/whatsweb/docs/)**

A great-DX SDK for WhatsApp Web with **no browser**: no Puppeteer, no headless
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

- 🚀 **No browser**: a fraction of the RAM and startup time of Puppeteer-based clients.
- 🤖 **Command router**: `command`, `hears`, middleware, and a rich `Context`.
- 🔀 **Two styles**: event callbacks *or* a linear `for await` async iterator.
- 📎 **Media from anywhere**: local path, http(s)/S3 URL, Buffer or Node stream, with `sendFromLink` auto-detecting the type.
- 💬 **Rich messages**: polls, mentions, stickers, contacts, edit / delete / forward.
- 👥 **Groups**: metadata, participants, invite links, create / join / leave.
- 👤 **Presence & profile**: presence, profile pictures, status, block list.
- 🧭 **Per-user conversations**: persistent state, message history, `ask`, and a neutral `toMessages()` to plug in your own LLM/agent.
- 🧠 **Built for AI agents**: number-based authorization, photos and PDFs ready for the model, voice-note transcription, plain message records for your own database, and one-message-at-a-time handling per chat.
- 🛟 **Resilient**: auto-reconnect with backoff and optional send rate-limiting.
- 🆔 **LID-aware**: supports WhatsApp's anonymous identity system.
- 🟦 **Typed**: written in TypeScript, ships `.d.ts`, ESM.

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

**By QR** (default): the QR is printed to the terminal. Scan it from
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

// Text patterns: RegExp captures land in ctx.match
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
| `ctx.text`                              | Message text (or the voice-note transcript).       |
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
| `ctx.media`                             | File details: kind, MIME type, name, size, duration. |
| `ctx.downloadMedia()`                   | Download the message media as a `Buffer`.          |
| `ctx.downloadAttachment()`              | Download the file with its details, ready for the model. |
| `ctx.principal`                         | The user your `authorize` function returned.       |
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
`AbortSignal` to stop. Both styles are interchangeable, so use whichever fits.

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

// Fluent chat handle: set the recipient once
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
and uploaded, so it must be reachable from your server. For a private S3 bucket,
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

### Ask &amp; await: wizards

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
    await convo.text('No problem, send me the correct one.');
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

whatsweb is **unopinionated about LLMs**: it doesn't wrap any model. It just
turns the conversation into a transcript with `toMessages()`, which you feed to
your own agent (e.g. the [Vercel AI SDK](https://sdk.vercel.ai)). You stay in
full control of the model, tools and streaming. For production agents, see
[AI agents](#ai-agents) below.

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
`user` turns, the exact `{ role, content }` shape agent SDKs expect. Files are
described in text (`[image]`, `[document: a.pdf]`), and in groups each turn is
prefixed with the sender's name.

## AI agents

Everything an agent with private data needs. The full example is
[`examples/ai-bot.ts`](./examples/ai-bot.ts): authorized users in several
organizations, tools that check access per organization, files and voice notes.

### Authorization

`authorize` runs for every incoming message **before anything else**. Return
your user to let the message through, or `null` to reject it. Rejected messages
never reach handlers, `ask()`, transcription or the history: they only emit
`unauthorized`. If `authorize` throws (e.g. the database is down), the message
is rejected.

```ts
const wa = createClient({
  // Private data: only known numbers, and only in private chats (a reply in a
  // group is visible to every member).
  authorize: async ({ phone, isGroup }) =>
    !isGroup && phone ? await db.findUserByPhone(phone) : null,
});

wa.on('unauthorized', ({ ctx }) => ctx.reply('This number is not authorized.'));

wa.use(async (ctx) => {
  const user = ctx.principal!; // what authorize returned
  // check user.organizations in every tool before reading or changing data
});
```

`phone` is the number WhatsApp reports, resolved from the LID when WhatsApp
hides it. When it can't be resolved it is `undefined`: reject those. Never
authorize by `name`, which the sender chooses. Type `ctx.principal` once:

```ts
declare module '@whatsweb/core' {
  interface Register {
    principal: { id: string; organizations: string[] };
  }
}
```

### Files in

`ctx.media` describes the file without downloading it (kind, MIME type, file
name, size, duration, voice note or not). `ctx.downloadAttachment()` returns it
with its bytes, and `toModelPart()` turns it into an image or file part:

```ts
if (ctx.media?.mimetype === 'application/pdf') {
  const pdf = await ctx.downloadAttachment();
  await generateText({
    model,
    messages: [{ role: 'user', content: [toModelPart(pdf), { type: 'text', text: 'Summarize it' }] }],
  });
}
```

### Voice notes

Most models don't take audio, so plug in any speech-to-text service with
`transcribe`. Authorized voice notes and audio files are transcribed before
they reach handlers; the text is in `ctx.text` and in the message record.

```ts
import { transcribe } from 'ai';

createClient({
  transcribe: async (audio) =>
    (await transcribe({ model: 'openai/gpt-4o-mini-transcribe', audio: audio.data })).text,
});
```

To answer with a voice note, pass any audio to `sendVoice` / `ctx.replyWithVoice`
(MP3 from a text-to-speech API, WAV, M4A…): it is converted to OGG/Opus, the
only format WhatsApp plays as a voice note. This needs
[`ffmpeg`](https://ffmpeg.org) installed (or `ffmpegPath`). Images, videos,
audio and documents are sent with their real MIME type, detected from the
content or the file name.

### Your own message store

Keep the conversation in your own database with your own schema. Every message
(incoming, and the ones you send) is emitted as `message_create`;
`message.toRecord()` turns it into plain data: id, chat, sender (phone, LID,
name), timestamp, text, transcript, file details, quoted message, mentions.
Store `serializeMessage(message)` next to it to download the file, quote or
forward the message later with `client.restoreMessage()`.

```ts
const wa = createClient({ history: false }); // you keep the history

wa.use(async (ctx) => {
  await db.insertMessage({ ...ctx.message.toRecord(), raw: serializeMessage(ctx.message) });
  const rows = await db.lastMessages(ctx.chatId, 20);
  const { text } = await generateText({ model, messages: toModelMessages(rows) });
  await ctx.reply(text);
});
```

`toModelMessages(rows)` reads any rows with these fields (a `MessageRecord`
fits as-is). Add an `attachment` (bytes, or the URL where you stored the file,
plus its `mimetype`) and images and PDFs are passed to the model as files.

Edits and deletes arrive as `message_edit` and `message_delete`, so you can
update the stored rows.

### One message at a time per chat

By default the messages of each chat are handled in order, one at a time:
three quick messages from a user don't start three replies at once. Different
chats still run in parallel. A message taken as the answer to `ask()` isn't
handled again. Use `concurrency: 'parallel'` to opt out, and
`await wa.whenIdle()` before `destroy()` to let in-flight replies finish.

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
the SDK only emits it when you're listening; otherwise it routes to the logger.
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
wa.on('message_create', (ctx) => {});             // every message, including the ones you send
wa.on('message_edit', ({ chatId, id, message }) => {}); // message.body is the new text
wa.on('message_delete', ({ chatId, id, fromMe }) => {});
wa.on('reaction', ({ emoji, key, fromMe }) => {});
wa.on('unauthorized', ({ identity, ctx }) => {});  // rejected by authorize
wa.on('presence', ({ id, presences }) => {});     // after subscribeToPresence
wa.on('disconnected', ({ code, reconnecting }) => {});
wa.on('logged_out', () => {});                    // unlinked from the phone
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

If WhatsApp ends the session (the device is unlinked from the phone, or the
session expires), the stored credentials can't be used again, so they are
deleted and `logged_out` is emitted. Call `start()` to link again with a new QR.
Pass `clearSessionOnLogout: false` to keep them and handle it yourself.

```ts
wa.on('logged_out', () => wa.start()); // show a fresh QR right away
```

### Credentials in a database

On servers and containers, keep the session in your database with
`KeyValueAuth`: implement four methods over any key/value table.

```ts
import { createClient, KeyValueAuth } from '@whatsweb/core';

// CREATE TABLE whatsapp_auth (key text PRIMARY KEY, value text NOT NULL);
const wa = createClient({
  authStrategy: new KeyValueAuth({
    session: 'agent',
    store: {
      get: async (key) =>
        (await pool.query('SELECT value FROM whatsapp_auth WHERE key = $1', [key])).rows[0]?.value,
      set: async (key, value) => {
        await pool.query(
          'INSERT INTO whatsapp_auth (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
          [key, value],
        );
      },
      delete: async (key) => {
        await pool.query('DELETE FROM whatsapp_auth WHERE key = $1', [key]);
      },
      deleteByPrefix: async (prefix) => {
        await pool.query('DELETE FROM whatsapp_auth WHERE starts_with(key, $1)', [prefix]);
      },
    },
  }),
});
```

Only one running client may use a session at a time.

### Multiple accounts

Run several numbers in one process: one `Client` per account with a distinct
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

**`createClient(options)`**: `session`, `authStrategy`, `pairingCode`,
`autoReconnect`, `maxReconnectAttempts`, `reconnectDelayMs`, `rateLimitMs`,
`stateStore`, `history`, `printQRInTerminal`, `deviceName`, `markOnlineOnConnect`,
`clearSessionOnLogout`, `commandPrefix`, `logger`, `authorize`, `transcribe`,
`concurrency`, `ffmpegPath`.

**Client**

- Lifecycle: `start` / `initialize` / `waitUntilReady` / `logout` / `destroy`.
- Router: `use` / `command` / `hears`.
- Async: `messages` / `stream` / `next` / `waitForMessage` / `whenIdle`.
- Agents: `resolveIdentity` / `getPhoneForLid` / `restoreMessage`, plus
  `toModelMessages` / `toModelPart` / `serializeMessage` / `toOggOpus`.
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
- `socket`: the raw Baileys `WASocket` (escape hatch).

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
