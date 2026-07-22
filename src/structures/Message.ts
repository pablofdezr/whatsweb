import {
  downloadMediaMessage,
  type AnyMessageContent,
  type WAMessage,
  type MiscMessageGenerationOptions,
} from 'baileys';
import type { Client } from '../client/Client.js';
import { extractText, getMessageType, messageHasMedia } from '../util/content.js';
import { isGroupJid } from '../util/jid.js';
import { silentLogger } from '../util/logger.js';
import { Sender } from './Sender.js';

/**
 * A WhatsApp message with a convenient API on top of the raw Baileys object
 * (accessible via `raw` for advanced cases).
 */
export class Message {
  constructor(
    private readonly client: Client,
    public readonly raw: WAMessage,
  ) {}

  /** Unique message ID. */
  get id(): string {
    return this.raw.key.id ?? '';
  }

  /** JID of the originating chat (user or group; may be a LID). */
  get chatId(): string {
    return this.raw.key.remoteJid ?? '';
  }

  /** Alternative chat JID (PN if `chatId` is a LID). */
  get chatIdAlt(): string | undefined {
    return this.raw.key.remoteJidAlt ?? undefined;
  }

  /** Did I send it? */
  get fromMe(): boolean {
    return !!this.raw.key.fromMe;
  }

  /** Does it come from a group? */
  get isGroup(): boolean {
    return isGroupJid(this.chatId);
  }

  /** Identity of whoever sent it (LID/PN-aware). */
  get sender(): Sender {
    if (this.isGroup) {
      const id = this.raw.key.participant ?? this.raw.participant ?? '';
      return new Sender(
        id,
        this.raw.key.participantAlt ?? undefined,
        this.raw.pushName ?? undefined,
      );
    }
    return new Sender(this.chatId, this.chatIdAlt, this.raw.pushName ?? undefined);
  }

  /** Timestamp (epoch seconds). */
  get timestamp(): number {
    const t = this.raw.messageTimestamp;
    return typeof t === 'number' ? t : Number(t ?? 0);
  }

  /** Readable message text (caption included). */
  get body(): string {
    return extractText(this.raw.message);
  }

  /** Sender's display name (pushName), if present. */
  get notifyName(): string | undefined {
    return this.raw.pushName ?? undefined;
  }

  /** Content type (`conversation`, `imageMessage`, …). */
  get type(): string | undefined {
    return getMessageType(this.raw.message);
  }

  /** Does it carry downloadable media? */
  get hasMedia(): boolean {
    return messageHasMedia(this.raw.message);
  }

  /** Reply to this message by quoting it. */
  reply(
    content: string | AnyMessageContent,
    options: MiscMessageGenerationOptions = {},
  ): Promise<Message> {
    return this.client.send(this.chatId, content, { quoted: this.raw, ...options });
  }

  /** React to this message with an emoji (empty string to remove). */
  react(emoji: string): Promise<void> {
    return this.client.react(this.chatId, this.raw.key, emoji);
  }

  /** Downloads the message media as a Buffer. Throws if there is no media. */
  async downloadMedia(): Promise<Buffer> {
    if (!this.hasMedia) throw new Error('The message does not contain media');
    const buffer = await downloadMediaMessage(
      this.raw,
      'buffer',
      {},
      {
        logger: silentLogger as never,
        reuploadRequest: this.client.socket.updateMediaMessage,
      },
    );
    return buffer as Buffer;
  }

  /** Marks the chat as read up to this message. */
  async markRead(): Promise<void> {
    await this.client.socket.readMessages([this.raw.key]);
  }

  /** Deletes this message for everyone. */
  delete(): Promise<void> {
    return this.client.deleteMessage(this.chatId, this.raw.key);
  }

  /** Forwards this message to another chat. */
  forward(to: string): Promise<Message> {
    return this.client.forwardMessage(to, this.raw);
  }

  /** Edits this message. Only works for your own messages. */
  edit(newText: string): Promise<Message> {
    return this.client.editMessage(this.chatId, this.raw.key, newText);
  }
}
