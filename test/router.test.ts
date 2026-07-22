import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WAMessage } from 'baileys';
import { Client, createClient } from '../src/index.js';
import { Context } from '../src/router/Context.js';
import { Message } from '../src/structures/Message.js';

function contextWithText(client: Client, text: string): Context {
  const raw = {
    key: { remoteJid: '34600112233@s.whatsapp.net', fromMe: false, id: 'A' },
    message: { conversation: text },
  } as unknown as WAMessage;
  return new Context(client, new Message(client, raw));
}

test('Context parses command and args', () => {
  const ctx = contextWithText(createClient(), '!sum 2 3 4');
  assert.equal(ctx.command, 'sum');
  assert.deepEqual(ctx.args, ['2', '3', '4']);
});

test('Context returns undefined for non-commands', () => {
  const ctx = contextWithText(createClient(), 'hello world');
  assert.equal(ctx.command, undefined);
  assert.deepEqual(ctx.args, []);
});

test('Context honors a custom prefix', () => {
  const ctx = contextWithText(createClient({ commandPrefix: '.' }), '.ping now');
  assert.equal(ctx.command, 'ping');
  assert.deepEqual(ctx.args, ['now']);
});

test('command() dispatches to the matching handler', async () => {
  const wa = createClient();
  let called = '';
  wa.command('ping', (c) => {
    called = c.command ?? '';
  });
  await (wa as unknown as { runRouter(ctx: Context): Promise<void> }).runRouter(
    contextWithText(wa, '!ping'),
  );
  assert.equal(called, 'ping');
});

test('hears() matches a pattern and sets ctx.match', async () => {
  const wa = createClient();
  let matched = '';
  wa.hears(/pri(?:ce)/, (c) => {
    matched = c.match?.[0] ?? '';
  });
  await (wa as unknown as { runRouter(ctx: Context): Promise<void> }).runRouter(
    contextWithText(wa, 'the price is right'),
  );
  assert.equal(matched, 'price');
});
