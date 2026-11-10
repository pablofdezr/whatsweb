import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RateLimitedQueue } from '../src/util/queue.js';

test('runs tasks in order and one at a time', async () => {
  const queue = new RateLimitedQueue(0);
  const finished: number[] = [];
  let active = 0;

  const task = (n: number) => async () => {
    active += 1;
    assert.equal(active, 1, 'only one task should run at a time');
    await new Promise((r) => setTimeout(r, 5));
    active -= 1;
    finished.push(n);
    return n;
  };

  const results = await Promise.all([queue.add(task(1)), queue.add(task(2)), queue.add(task(3))]);
  assert.deepEqual(finished, [1, 2, 3]);
  assert.deepEqual(results, [1, 2, 3]);
});

test('enforces a minimum interval between tasks', async () => {
  const queue = new RateLimitedQueue(40);
  const times: number[] = [];
  await Promise.all([1, 2, 3].map((n) => queue.add(async () => times.push(Date.now()) && n)));

  assert.ok(times[1]! - times[0]! >= 30, `gap 1 too small: ${times[1]! - times[0]!}ms`);
  assert.ok(times[2]! - times[1]! >= 30, `gap 2 too small: ${times[2]! - times[1]!}ms`);
});

test('a failing task does not break the queue', async () => {
  const queue = new RateLimitedQueue(0);
  await assert.rejects(
    queue.add(async () => {
      throw new Error('boom');
    }),
  );
  const ok = await queue.add(async () => 'ok');
  assert.equal(ok, 'ok');
});

test('KeyedQueue runs tasks in order per key and forgets idle keys', async () => {
  const { KeyedQueue } = await import('../src/util/queue.js');
  const queue = new KeyedQueue();
  const order: string[] = [];
  await Promise.all([
    queue.run('a', async () => {
      await new Promise((r) => setTimeout(r, 10));
      order.push('a1');
    }),
    queue.run('a', () => void order.push('a2')),
    queue.run('b', () => void order.push('b1')),
  ]);
  assert.deepEqual(order, ['b1', 'a1', 'a2']);
  await new Promise((r) => setImmediate(r));
  assert.equal(queue.size, 0);
});
