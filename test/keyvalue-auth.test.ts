import assert from 'node:assert/strict';
import { test } from 'node:test';
import { KeyValueAuth, type KeyValueStore } from '../src/index.js';

function memoryStore(): KeyValueStore & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    get: async (key) => data.get(key),
    set: async (key, value) => void data.set(key, value),
    delete: async (key) => void data.delete(key),
    deleteByPrefix: async (prefix) => {
      for (const key of [...data.keys()]) if (key.startsWith(prefix)) data.delete(key);
    },
  };
}

test('KeyValueAuth creates, saves and reloads credentials', async () => {
  const store = memoryStore();
  const first = await new KeyValueAuth({ store, session: 'bot' }).getAuthState();
  await first.saveCreds();
  assert.ok(store.data.has('bot:creds'));

  const again = await new KeyValueAuth({ store, session: 'bot' }).getAuthState();
  assert.ok(Buffer.isBuffer(again.state.creds.noiseKey.private));
  assert.deepEqual(again.state.creds.noiseKey.private, first.state.creds.noiseKey.private);
});

test('KeyValueAuth stores signal keys and keeps sessions apart', async () => {
  const store = memoryStore();
  const auth = new KeyValueAuth({ store, session: 'a' });
  const { state } = await auth.getAuthState();
  await state.keys.set({
    'pre-key': { '1': { public: Buffer.from([1]), private: Buffer.from([2]) } },
  });
  const keys = await state.keys.get('pre-key', ['1', '2']);
  assert.deepEqual(keys['1']?.public, Buffer.from([1]));
  assert.equal(keys['2'], undefined);

  await store.set('b:creds', '{}');
  await auth.clear();
  assert.deepEqual([...store.data.keys()], ['b:creds']);
});
