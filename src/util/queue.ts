/**
 * Serializes async tasks and enforces a minimum interval between them.
 *
 * Used to rate-limit outgoing messages: WhatsApp may ban numbers that send too
 * fast, so spacing sends out (and never running two at once) is safer. Tasks
 * run in the order they are added; a failing task rejects its own caller but
 * does not break the queue.
 */
export class RateLimitedQueue {
  private tail: Promise<unknown> = Promise.resolve();
  private lastRun = 0;

  constructor(private readonly minIntervalMs: number) {}

  /** Enqueues a task and resolves with its result once it runs. */
  add<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(async () => {
      if (this.minIntervalMs > 0) {
        const wait = this.minIntervalMs - (Date.now() - this.lastRun);
        if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      }
      this.lastRun = Date.now();
      return task();
    });
    // Keep the chain alive regardless of individual task outcomes.
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

/**
 * Runs tasks one at a time per key (e.g. per chat), while different keys run in
 * parallel. Used so that several quick messages from the same chat are handled
 * in order instead of all at once.
 */
export class KeyedQueue {
  private readonly tails = new Map<string, Promise<unknown>>();

  /** Runs `task` after the previous task for the same key has finished. */
  run<T>(key: string, task: () => Promise<T> | T): Promise<T> {
    const previous = this.tails.get(key) ?? Promise.resolve();
    const result = previous.then(task);
    const tail = result.then(
      () => undefined,
      () => undefined,
    );
    this.tails.set(key, tail);
    // Forget keys with nothing pending, so the map doesn't grow forever.
    void tail.then(() => {
      if (this.tails.get(key) === tail) this.tails.delete(key);
    });
    return result;
  }

  /** Number of keys with pending tasks. */
  get size(): number {
    return this.tails.size;
  }
}
