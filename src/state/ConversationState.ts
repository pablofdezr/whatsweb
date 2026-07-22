import type { StateStore } from './StateStore.js';

/**
 * A per-chat view over the {@link StateStore}. Lets you read and write small
 * pieces of conversation state (a step, a cart, whatever) scoped to one chat.
 */
export class ConversationState {
  constructor(
    private readonly store: StateStore,
    private readonly chatId: string,
  ) {}

  /** The full state object for this chat. */
  async all(): Promise<Record<string, unknown>> {
    return (await this.store.get(this.chatId)) ?? {};
  }

  /** Reads a single value. */
  async get<T = unknown>(key: string): Promise<T | undefined> {
    return (await this.all())[key] as T | undefined;
  }

  /** Writes a single value. */
  async set(key: string, value: unknown): Promise<void> {
    const state = await this.all();
    state[key] = value;
    await this.store.set(this.chatId, state);
  }

  /** Merges several values at once. */
  async patch(values: Record<string, unknown>): Promise<void> {
    const state = await this.all();
    await this.store.set(this.chatId, { ...state, ...values });
  }

  /** Removes a single value. */
  async delete(key: string): Promise<void> {
    const state = await this.all();
    delete state[key];
    await this.store.set(this.chatId, state);
  }

  /** Clears all state for this chat. */
  async clear(): Promise<void> {
    await this.store.delete(this.chatId);
  }
}
