/**
 * Pluggable per-chat state store. The default is an in-memory `MemoryStore`;
 * implement this interface to back conversation state with Redis, a database,
 * etc. State is stored as one plain object per chat JID.
 */
export interface StateStore {
  /** Returns the full state object for a chat (empty object if none). */
  get(chatId: string): Promise<Record<string, unknown>> | Record<string, unknown>;
  /** Replaces the full state object for a chat. */
  set(chatId: string, state: Record<string, unknown>): Promise<void> | void;
  /** Removes all state for a chat. */
  delete(chatId: string): Promise<void> | void;
}

/** In-memory `StateStore`. Fine for a single process; lost on restart. */
export class MemoryStore implements StateStore {
  private readonly store = new Map<string, Record<string, unknown>>();

  get(chatId: string): Record<string, unknown> {
    return this.store.get(chatId) ?? {};
  }

  set(chatId: string, state: Record<string, unknown>): void {
    this.store.set(chatId, state);
  }

  delete(chatId: string): void {
    this.store.delete(chatId);
  }
}
