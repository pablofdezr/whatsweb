import type { Client } from '../client/Client.js';
import type { Context } from '../router/Context.js';
import type { ConversationState } from '../state/ConversationState.js';
import { Chat } from './Chat.js';
import type { Message } from './Message.js';

/** Role of a chat transcript message. */
export type ChatRole = 'system' | 'user' | 'assistant';

/**
 * A neutral `{ role, content }` transcript message. It maps directly onto the
 * message shape used by agent frameworks (e.g. the Vercel AI SDK), so you can
 * feed `conversation.toMessages()` straight into your own LLM calls.
 */
export interface ChatMessage {
  role: ChatRole;
  content: string;
}

/** Options for {@link Conversation.ask}. */
export interface AskOptions {
  /** Reject if no reply arrives within this many milliseconds. */
  timeoutMs?: number;
  /** Abort the wait. */
  signal?: AbortSignal;
}

/**
 * A per-user chat experience: everything {@link Chat} can send, plus persistent
 * per-chat {@link ConversationState | state}, recent {@link Conversation.history | history},
 * and {@link Conversation.ask | ask} to prompt the user and await their reply.
 *
 * Get one with `client.conversation(jid)` or, inside a handler, `ctx.conversation`.
 *
 * @example
 * ```ts
 * wa.command('name', async (ctx) => {
 *   const convo = ctx.conversation;
 *   const answer = await convo.ask('What is your name?');
 *   await convo.state.set('name', answer.text);
 *   await convo.text(`Nice to meet you, ${answer.text}!`);
 * });
 * ```
 */
export class Conversation extends Chat {
  constructor(
    client: Client,
    id: string,
    /** When set (e.g. in a group), `ask` only resolves for this participant. */
    private readonly expectedSender?: string,
  ) {
    super(client, id);
  }

  /** Persistent per-chat state. */
  get state(): ConversationState {
    return this.client.stateFor(this.id);
  }

  /** Recent messages seen in this chat (oldest first). */
  history(): Message[] {
    return this.client.historyFor(this.id);
  }

  /**
   * Builds a `{ role, content }` transcript from the chat history: your messages
   * become `assistant` turns, the other party's become `user` turns, with an
   * optional `system` prompt first. Feed it to your own agent (e.g. the Vercel
   * AI SDK) — this SDK stays out of the LLM's way.
   */
  toMessages(options: { systemPrompt?: string; limit?: number } = {}): ChatMessage[] {
    const history = this.history();
    const recent = options.limit ? history.slice(-options.limit) : history;
    const messages: ChatMessage[] = [];
    if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });
    for (const message of recent) {
      const content = message.body;
      if (content) messages.push({ role: message.fromMe ? 'assistant' : 'user', content });
    }
    return messages;
  }

  /**
   * Sends a prompt and resolves with the user's next reply in this chat.
   * In groups, restricts to the expected sender when known.
   */
  async ask(question: string, options: AskOptions = {}): Promise<Context> {
    await this.text(question);
    return this.client.waitForMessage(
      (ctx) =>
        ctx.chatId === this.id &&
        (this.expectedSender === undefined || ctx.sender.id === this.expectedSender),
      { timeoutMs: options.timeoutMs, signal: options.signal },
    );
  }

  /** Like {@link ask}, but resolves with the reply text directly. */
  async askText(question: string, options: AskOptions = {}): Promise<string> {
    return (await this.ask(question, options)).text;
  }
}
