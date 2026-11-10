import assert from 'node:assert/strict';
import { test } from 'node:test';
import { proto, type WAMessage } from 'baileys';
import type { AuthStrategy } from '../src/auth/AuthStrategy.js';
import { createClient, type Client, type Context } from '../src/index.js';

const CHAT = '34600112233@s.whatsapp.net';

interface Internals {
  handleMessagesUpsert(u: { messages: WAMessage[]; type: 'notify' }): Promise<void>;
  handleConnectionUpdate(u: unknown): void;
}

function upsert(wa: Client, id: string, message: unknown): Promise<void> {
  const raw = { key: { remoteJid: CHAT, fromMe: false, id }, message } as unknown as WAMessage;
  return (wa as unknown as Internals).handleMessagesUpsert({ messages: [raw], type: 'notify' });
}

test('reactions, edits and deletes are not routed as messages', async () => {
  const wa = createClient();
  const seen: Context[] = [];
  wa.on('message', (ctx) => seen.push(ctx));
  await upsert(wa, 'R', { reactionMessage: { text: '👍', key: { id: 'A' } } });
  await upsert(wa, 'E', {
    protocolMessage: { type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT, key: { id: 'A' } },
  });
  await upsert(wa, 'P', { pollUpdateMessage: {} });
  assert.equal(seen.length, 0);
  assert.deepEqual(wa.historyFor(CHAT), []);
});

test('an edit emits message_edit and updates the history', async () => {
  const wa = createClient();
  await upsert(wa, 'A', { conversation: 'helo' });
  let edited = '';
  wa.on('message_edit', (e) => (edited = `${e.id}:${e.message.body}`));
  await upsert(wa, 'E', {
    protocolMessage: {
      type: proto.Message.ProtocolMessage.Type.MESSAGE_EDIT,
      key: { id: 'A' },
      editedMessage: { conversation: 'hello' },
    },
  });
  assert.equal(edited, 'A:hello');
  assert.deepEqual(
    wa.historyFor(CHAT).map((m) => m.body),
    ['hello'],
  );
});

test('a delete emits message_delete and removes it from the history', async () => {
  const wa = createClient();
  await upsert(wa, 'A', { conversation: 'oops' });
  await upsert(wa, 'B', { conversation: 'keep' });
  let deleted = '';
  wa.on('message_delete', (d) => (deleted = d.id));
  await upsert(wa, 'D', {
    protocolMessage: { type: proto.Message.ProtocolMessage.Type.REVOKE, key: { id: 'A' } },
  });
  assert.equal(deleted, 'A');
  assert.deepEqual(
    wa.historyFor(CHAT).map((m) => m.id),
    ['B'],
  );
});

function fakeAuth(): AuthStrategy & { cleared: number } {
  return {
    cleared: 0,
    getAuthState: () => Promise.reject(new Error('not used')),
    async clear() {
      this.cleared++;
    },
  };
}

function closeWith(wa: Client, statusCode: number): void {
  (wa as unknown as Internals).handleConnectionUpdate({
    connection: 'close',
    lastDisconnect: { error: { output: { statusCode } } },
  });
}

test('a logout from WhatsApp clears the credentials and emits logged_out', async () => {
  const auth = fakeAuth();
  const wa = createClient({ authStrategy: auth, autoReconnect: false });
  const loggedOut = wa.next('logged_out');
  closeWith(wa, 401);
  await loggedOut;
  assert.equal(auth.cleared, 1);
});

test('clearSessionOnLogout: false keeps the credentials', async () => {
  const auth = fakeAuth();
  const wa = createClient({ authStrategy: auth, clearSessionOnLogout: false });
  const loggedOut = wa.next('logged_out');
  closeWith(wa, 401);
  await loggedOut;
  assert.equal(auth.cleared, 0);
});

test('a normal disconnect does not clear the credentials', () => {
  const auth = fakeAuth();
  const wa = createClient({ authStrategy: auth, autoReconnect: false });
  closeWith(wa, 428);
  assert.equal(auth.cleared, 0);
});
