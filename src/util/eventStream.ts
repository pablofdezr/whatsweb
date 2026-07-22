import type { EventEmitter } from 'node:events';

export interface EventStreamOptions {
  /** Abort signal that ends the stream when triggered. */
  signal?: AbortSignal;
  /** Events that, when emitted, end the stream. */
  endEvents?: readonly string[];
}

/**
 * Turns an emitter event into an async iterable, so it can be consumed with a
 * linear `for await` loop instead of callbacks.
 *
 * Events that arrive between iterations are buffered, so none are lost. The
 * stream ends when the `signal` aborts, when the consumer breaks out of the
 * loop (`return()`), or when one of `endEvents` fires. It deliberately ignores
 * the emitter's `'error'` event so a non-fatal error does not break the loop.
 */
export function eventStream<T>(
  emitter: EventEmitter,
  event: string,
  options: EventStreamOptions = {},
): AsyncIterableIterator<T> {
  const buffer: T[] = [];
  const waiting: Array<(result: IteratorResult<T>) => void> = [];
  let ended = false;

  const onEvent = (arg: T): void => {
    if (ended) return;
    const resolve = waiting.shift();
    if (resolve) resolve({ value: arg, done: false });
    else buffer.push(arg);
  };

  const cleanup = (): void => {
    emitter.off(event, onEvent as (...args: unknown[]) => void);
    for (const e of options.endEvents ?? []) emitter.off(e, end);
    options.signal?.removeEventListener('abort', end);
  };

  const end = (): void => {
    if (ended) return;
    ended = true;
    cleanup();
    let resolve: ((result: IteratorResult<T>) => void) | undefined;
    while ((resolve = waiting.shift())) resolve({ value: undefined as never, done: true });
  };

  emitter.on(event, onEvent as (...args: unknown[]) => void);
  for (const e of options.endEvents ?? []) emitter.on(e, end);
  if (options.signal) {
    if (options.signal.aborted) end();
    else options.signal.addEventListener('abort', end, { once: true });
  }

  return {
    next(): Promise<IteratorResult<T>> {
      if (buffer.length > 0) return Promise.resolve({ value: buffer.shift() as T, done: false });
      if (ended) return Promise.resolve({ value: undefined as never, done: true });
      return new Promise((resolve) => waiting.push(resolve));
    },
    return(): Promise<IteratorResult<T>> {
      end();
      return Promise.resolve({ value: undefined as never, done: true });
    },
    [Symbol.asyncIterator]() {
      return this;
    },
  };
}
