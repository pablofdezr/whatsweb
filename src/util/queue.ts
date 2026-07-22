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
