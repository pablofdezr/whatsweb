import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ConversationState } from '../src/state/ConversationState.js';
import { MemoryStore } from '../src/state/StateStore.js';

test('MemoryStore get/set/delete', () => {
  const store = new MemoryStore();
  assert.deepEqual(store.get('a'), {});
  store.set('a', { x: 1 });
  assert.deepEqual(store.get('a'), { x: 1 });
  store.delete('a');
  assert.deepEqual(store.get('a'), {});
});

test('ConversationState set/get/patch/delete/clear', async () => {
  const state = new ConversationState(new MemoryStore(), 'chat@s');
  await state.set('step', 1);
  assert.equal(await state.get('step'), 1);

  await state.patch({ name: 'Ada', lang: 'es' });
  assert.deepEqual(await state.all(), { step: 1, name: 'Ada', lang: 'es' });

  await state.delete('lang');
  assert.equal(await state.get('lang'), undefined);

  await state.clear();
  assert.deepEqual(await state.all(), {});
});

test('ConversationState scopes state by chat', async () => {
  const store = new MemoryStore();
  await new ConversationState(store, 'a@s').set('v', 1);
  await new ConversationState(store, 'b@s').set('v', 2);
  assert.equal(await new ConversationState(store, 'a@s').get('v'), 1);
  assert.equal(await new ConversationState(store, 'b@s').get('v'), 2);
});
