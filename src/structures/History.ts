import type { Message } from './Message.js';

/**
 * In-memory, bounded message history observed while the client runs. Keeps up
 * to `limit` messages per chat and at most `maxChats` chats (least-recently
 * active chats are evicted). This is session history — messages seen via events
 * and messages you send — not a full server-side backfill.
 */
export class History {
  private readonly chats = new Map<string, Message[]>();

  constructor(
    private readonly limit: number,
    private readonly maxChats: number,
  ) {}

  /** Records a message, de-duplicating by id. */
  add(message: Message): void {
    const id = message.chatId;
    if (!id) return;

    let messages = this.chats.get(id);
    if (messages) {
      // Refresh recency and skip duplicates (a sent message may also echo back).
      this.chats.delete(id);
      if (message.id && messages.some((m) => m.id === message.id)) {
        this.chats.set(id, messages);
        return;
      }
    } else {
      messages = [];
    }

    messages.push(message);
    if (messages.length > this.limit) messages.splice(0, messages.length - this.limit);
    this.chats.set(id, messages);

    if (this.chats.size > this.maxChats) {
      const oldest = this.chats.keys().next().value;
      if (oldest !== undefined) this.chats.delete(oldest);
    }
  }

  /** Recent messages for a chat (oldest first). */
  get(chatId: string): Message[] {
    return [...(this.chats.get(chatId) ?? [])];
  }

  /** Clears history for one chat, or all chats if no id is given. */
  clear(chatId?: string): void {
    if (chatId) this.chats.delete(chatId);
    else this.chats.clear();
  }
}
