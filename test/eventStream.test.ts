import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { setImmediate as tick } from 'node:timers/promises';
import { test } from 'node:test';
import { eventStream } from '../src/util/eventStream.js';

test('buffers events emitted before iteration', async () => {
  const ee = new EventEmitter();
  const stream = eventStream<number>(ee, 'x');
  ee.emit('x', 1);
  ee.emit('x', 2);

  const got: number[] = [];
  for await (const v of stream) {
    got.push(v);
    if (got.length === 2) break;
  }
  assert.deepEqual(got, [1, 2]);
});

test('an abort signal ends the stream', async () => {
  const ee = new EventEmitter();
  const controller = new AbortController();
  const stream = eventStream<number>(ee, 'x', { signal: controller.signal });

  const collected: number[] = [];
  const task = (async () => {
    for await (const v of stream) collected.push(v);
  })();

  ee.emit('x', 1);
  await tick();
  controller.abort();
  await task;

  assert.deepEqual(collected, [1]);
});

test('ignores the emitter error event and keeps going', async () => {
  const ee = new EventEmitter();
  ee.on('error', () => {}); // so emit('error') does not throw
  const stream = eventStream<number>(ee, 'x');

  ee.emit('error', new Error('boom'));
  ee.emit('x', 5);

  const first = await stream.next();
  assert.equal(first.value, 5);
  assert.equal(first.done, false);
});
