import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WAMessage } from 'baileys';
import { createClient, Message, type Client, type ClientOptions } from '../src/index.js';

interface Internals {
  handleMessagesUpsert(u: { messages: WAMessage[]; type: 'notify' }): Promise<void>;
}

let seq = 0;
function receive(wa: Client, chat: string, message: unknown, key: object = {}): Promise<void> {
  const raw = {
    key: { remoteJid: chat, fromMe: false, id: `M${++seq}`, ...key },
    message,
  } as unknown as WAMessage;
  return (wa as unknown as Internals).handleMessagesUpsert({ messages: [raw], type: 'notify' });
}

const A = '34600000001@s.whatsapp.net';
const B = '34600000002@s.whatsapp.net';
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function client(options: ClientOptions = {}): Client {
  return createClient({ history: { limit: 50 }, ...options });
}

test('authorize rejects unknown numbers before any handler, waiter or history', async () => {
  const wa = client({
    authorize: ({ phone }) => (phone === '34600000001' ? { userId: 'u1' } : null),
  });
  const handled: string[] = [];
  const rejected: string[] = [];
  wa.on('message', (ctx) => handled.push(ctx.text));
  wa.use((ctx) => void handled.push(`router:${ctx.text}`));
  wa.on('unauthorized', ({ identity }) => rejected.push(identity.phone ?? '?'));

  await receive(wa, B, { conversation: 'show me the data' });
  await receive(wa, A, { conversation: 'hi' });
  await wa.whenIdle();

  assert.deepEqual(rejected, ['34600000002']);
  assert.deepEqual(handled, ['hi', 'router:hi']);
  assert.deepEqual(
    wa.historyFor(B).map((m) => m.body),
    [],
  );
});

test('the authorized user is available as ctx.principal', async () => {
  const wa = client({ authorize: ({ phone }) => ({ userId: `u-${phone}` }) });
  let principal: unknown;
  wa.use((ctx) => void (principal = ctx.principal));
  await receive(wa, A, { conversation: 'hi' });
  await wa.whenIdle();
  assert.deepEqual(principal, { userId: 'u-34600000001' });
});

test('a failing authorize rejects the message (fails closed)', async () => {
  const wa = client({
    authorize: () => {
      throw new Error('db down');
    },
  });
  const errors: string[] = [];
  let handled = false;
  wa.on('error', (e) => errors.push(e.message));
  wa.use(() => void (handled = true));
  await receive(wa, A, { conversation: 'hi' });
  await wa.whenIdle();
  assert.equal(handled, false);
  assert.deepEqual(errors, ['db down']);
});

test('a LID sender without a known phone number reaches authorize with phone undefined', async () => {
  let seen: unknown = 'not called';
  const wa = client({
    authorize: ({ phone }) => {
      seen = phone;
      return null;
    },
  });
  await receive(wa, '999@lid', { conversation: 'hi' });
  assert.equal(seen, undefined);
});

test('messages from the same chat are handled one at a time, other chats in parallel', async () => {
  const wa = client();
  const log: string[] = [];
  wa.use(async (ctx) => {
    log.push(`start ${ctx.text}`);
    await sleep(ctx.text === 'a1' ? 30 : 5);
    log.push(`end ${ctx.text}`);
  });
  await Promise.all([
    receive(wa, A, { conversation: 'a1' }),
    receive(wa, A, { conversation: 'a2' }),
    receive(wa, B, { conversation: 'b1' }),
  ]);
  await wa.whenIdle();
  assert.ok(log.indexOf('end a1') < log.indexOf('start a2'), log.join(', '));
  assert.ok(log.indexOf('start b1') < log.indexOf('end a1'), log.join(', '));
});

test('an answer to ask() is not handled again as a new message', async () => {
  const wa = client();
  const routed: string[] = [];
  let answer = '';
  wa.use(async (ctx) => {
    routed.push(ctx.text);
    if (ctx.text === 'start') answer = (await ctx.awaitReply({ timeoutMs: 1000 })).text;
  });
  await receive(wa, A, { conversation: 'start' });
  await sleep(5);
  await receive(wa, A, { conversation: 'blue' });
  await wa.whenIdle();
  assert.equal(answer, 'blue');
  assert.deepEqual(routed, ['start']);
});

test('voice notes are transcribed before they reach handlers', async (t) => {
  t.mock.method(Message.prototype, 'downloadMedia', async () => Buffer.from('OggS'));
  const wa = client({
    transcribe: async (audio) => `heard ${audio.data.length} bytes, voice=${audio.isVoiceNote}`,
  });
  let text = '';
  let record: unknown;
  wa.use((ctx) => {
    text = ctx.text;
    record = ctx.message.toRecord().transcript;
  });
  await receive(wa, A, { audioMessage: { ptt: true, seconds: 3 } });
  await wa.whenIdle();
  assert.equal(text, 'heard 4 bytes, voice=true');
  assert.equal(record, text);
});

test('own sent messages are emitted as message_create', async () => {
  const wa = client();
  const created: string[] = [];
  wa.on('message_create', (ctx) => created.push(`${ctx.fromMe}:${ctx.text}`));
  (wa as unknown as { sock: unknown }).sock = {
    sendMessage: async (jid: string, content: { text: string }) => ({
      key: { remoteJid: jid, fromMe: true, id: 'OUT' },
      message: { conversation: content.text },
    }),
  };
  await wa.sendText(A, 'hello');
  assert.deepEqual(created, ['true:hello']);
});
