import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Client } from '../src/client/Client.js';
import { Conversation } from '../src/structures/Conversation.js';
import { History } from '../src/structures/History.js';
import type { Message } from '../src/structures/Message.js';

const msg = (chatId: string, id: string, body = '', fromMe = false) =>
  ({ chatId, id, body, fromMe }) as unknown as Message;

test('History keeps per-chat order and cap', () => {
  const history = new History(3, 10);
  for (let i = 1; i <= 5; i++) history.add(msg('a@s', String(i)));
  assert.deepEqual(
    history.get('a@s').map((m) => m.id),
    ['3', '4', '5'],
  );
});

test('History de-duplicates by id', () => {
  const history = new History(10, 10);
  history.add(msg('a@s', '1'));
  history.add(msg('a@s', '1'));
  assert.equal(history.get('a@s').length, 1);
});

test('History evicts least-recently-active chats', () => {
  const history = new History(10, 2);
  history.add(msg('a@s', '1'));
  history.add(msg('b@s', '1'));
  history.add(msg('a@s', '2')); // touches "a", so "b" becomes oldest
  history.add(msg('c@s', '1')); // over maxChats -> evict "b"
  assert.deepEqual(
    ['a@s', 'b@s', 'c@s'].map((id) => history.get(id).length),
    [2, 0, 1],
  );
});

test('History.clear', () => {
  const history = new History(10, 10);
  history.add(msg('a@s', '1'));
  history.clear('a@s');
  assert.equal(history.get('a@s').length, 0);
});

test('Conversation.toMessages maps history to a transcript', () => {
  const client = {
    historyFor: () => [msg('a@s', '1', 'hi', false), msg('a@s', '2', 'hello!', true)],
  } as unknown as Client;
  const conversation = new Conversation(client, 'a@s.whatsapp.net');
  assert.deepEqual(conversation.toMessages({ systemPrompt: 'sys' }), [
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello!' },
  ]);
});
