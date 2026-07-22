import type { AnyMessageContent } from 'baileys';
import type { Client } from '../client/Client.js';
import type {
  AudioOptions,
  CaptionOptions,
  DocumentOptions,
  LocationInput,
  SendFromLinkOptions,
} from '../client/send-options.js';
import type { MediaSource } from '../media/resolve.js';
import { Chat } from '../structures/Chat.js';
import type { Group } from '../structures/Group.js';
import type { Message } from '../structures/Message.js';
import type { Sender } from '../structures/Sender.js';

/**
 * Context received by the router handlers. It gathers everything needed to
 * read the incoming message and reply, without having to touch the socket.
 */
export class Context {
  /** Result of the `RegExp` if the message matched a `hears(/…/)`. */
  match?: RegExpMatchArray;

  constructor(
    /** Client that originated the context (low-level access if needed). */
    public readonly client: Client,
    /** Incoming message. */
    public readonly message: Message,
  ) {}

  /** Message text (caption included). */
  get text(): string {
    return this.message.body;
  }

  /** Chat JID (user or group). */
  get chatId(): string {
    return this.message.chatId;
  }

  /** Fluent handle for the originating chat. */
  get chat(): Chat {
    return new Chat(this.client, this.chatId);
  }

  /** Group handle if this message comes from a group, otherwise `undefined`. */
  get group(): Group | undefined {
    return this.isGroup ? this.client.group(this.chatId) : undefined;
  }

  /** Identity of whoever sent the message (LID/PN-aware). */
  get sender(): Sender {
    return this.message.sender;
  }

  /** Does it come from a group? */
  get isGroup(): boolean {
    return this.message.isGroup;
  }

  /** Is it your own message? */
  get fromMe(): boolean {
    return this.message.fromMe;
  }

  /**
   * Command name if the text starts with a prefix (`!`, `/`…),
   * lowercased and without the prefix. `undefined` if it is not a command.
   */
  get command(): string | undefined {
    const text = this.text;
    const prefix = this.client.commandPrefixes.find((p) => text.startsWith(p));
    if (!prefix) return undefined;
    const word = text.slice(prefix.length).trim().split(/\s+/)[0];
    return word ? word.toLowerCase() : undefined;
  }

  /** Arguments following the command (`!add 2 3` -> `['2','3']`). */
  get args(): string[] {
    if (!this.command) return [];
    return this.text.trim().split(/\s+/).slice(1);
  }

  // --- Replies ---

  /** Reply quoting the message. */
  reply(content: string | AnyMessageContent): Promise<Message> {
    return this.message.reply(content);
  }

  /** Send to the same chat without quoting. */
  send(content: string | AnyMessageContent): Promise<Message> {
    return this.client.send(this.chatId, content);
  }

  /** React to the message with an emoji (empty string to remove). */
  react(emoji: string): Promise<void> {
    return this.message.react(emoji);
  }

  replyWithImage(source: MediaSource, options: CaptionOptions = {}): Promise<Message> {
    return this.client.sendImage(this.chatId, source, { quoted: this.message.raw, ...options });
  }

  replyWithVideo(source: MediaSource, options: CaptionOptions = {}): Promise<Message> {
    return this.client.sendVideo(this.chatId, source, { quoted: this.message.raw, ...options });
  }

  replyWithAudio(source: MediaSource, options: AudioOptions = {}): Promise<Message> {
    return this.client.sendAudio(this.chatId, source, { quoted: this.message.raw, ...options });
  }

  replyWithVoice(source: MediaSource): Promise<Message> {
    return this.client.sendVoice(this.chatId, source, { quoted: this.message.raw });
  }

  replyWithDocument(source: MediaSource, options: DocumentOptions = {}): Promise<Message> {
    return this.client.sendDocument(this.chatId, source, { quoted: this.message.raw, ...options });
  }

  replyWithLocation(location: LocationInput): Promise<Message> {
    return this.client.sendLocation(this.chatId, location, { quoted: this.message.raw });
  }

  /** Replies with whatever a link points to, auto-detecting the media kind. */
  replyWithLink(link: string, options: SendFromLinkOptions = {}): Promise<Message> {
    return this.client.sendFromLink(this.chatId, link, { quoted: this.message.raw, ...options });
  }

  // --- Presence / state ---

  /** Shows "typing…". Returns a function to stop it. */
  typing(): Promise<() => Promise<void>> {
    return this.chat.typing();
  }

  /** Marks the message as read. */
  seen(): Promise<void> {
    return this.message.markRead();
  }

  /** Downloads the message media as a Buffer. */
  downloadMedia(): Promise<Buffer> {
    return this.message.downloadMedia();
  }

  /** Forwards the message to another chat. */
  forward(to: string): Promise<Message> {
    return this.message.forward(to);
  }

  /** Deletes the message for everyone. */
  delete(): Promise<void> {
    return this.message.delete();
  }

  /**
   * Waits for the next reply in this chat (from the same sender by default).
   * Great for question→answer flows.
   */
  awaitReply(options: { timeoutMs?: number; fromSameSender?: boolean } = {}): Promise<Context> {
    const senderId = this.sender.id;
    const chatId = this.chatId;
    return this.client.waitForMessage(
      (ctx) =>
        ctx.chatId === chatId && (options.fromSameSender === false || ctx.sender.id === senderId),
      { timeoutMs: options.timeoutMs },
    );
  }
}
