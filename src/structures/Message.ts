import {
  BufferJSON,
  downloadMediaMessage,
  getContentType,
  jidNormalizedUser,
  normalizeMessageContent,
  type AnyMessageContent,
  type WAMessage,
  type MiscMessageGenerationOptions,
  type proto,
} from 'baileys';
import type { Client } from '../client/Client.js';
import { getMediaInfo, type Attachment, type MediaInfo } from '../media/attachment.js';
import { extractText, getMessageType, messageHasMedia } from '../util/content.js';
import { isGroupJid } from '../util/jid.js';
import { silentLogger } from '../util/logger.js';
import { Sender } from './Sender.js';

/**
 * A message as plain data, ready to store in your own database (e.g. one row
 * per message in Postgres). It has no Buffers or class instances, so it
 * serializes with `JSON.stringify`. To download the file or quote the message
 * later, also store `serializeMessage(message)` and restore it with
 * `client.restoreMessage()`.
 */
export interface MessageRecord {
  /** Message ID (unique within the chat). */
  id: string;
  /** Chat JID (user or group; may be a LID). */
  chatId: string;
  /** The chat's alternative JID (the phone-number JID when `chatId` is a LID). */
  chatIdAlt?: string;
  fromMe: boolean;
  isGroup: boolean;
  sender: {
    /** JID WhatsApp uses for the sender (LID or phone number). */
    id: string;
    /** Phone number in international format without `+`, when known. */
    phone?: string;
    /** LID of the sender, when known. */
    lid?: string;
    /** Display name chosen by the sender (not verified, don't use it to authorize). */
    name?: string;
  };
  /** When it was sent, in epoch seconds. */
  timestamp: number;
  /** Content type (`conversation`, `imageMessage`, …). */
  type?: string;
  /** Text or caption. */
  text: string;
  /** Transcript of a voice note or audio, when a `transcribe` function is set. */
  transcript?: string;
  /** File details, when the message carries one. */
  media?: MediaInfo;
  /** The message this one replies to. */
  quoted?: QuotedRecord;
  /** JIDs mentioned with @. */
  mentions: string[];
  /** Was it forwarded? */
  forwarded: boolean;
}

/** The message another one replies to, as plain data. */
export interface QuotedRecord {
  /** The quoted message's id (look it up in your history for everything else). */
  id: string;
  /** JID of whoever wrote it. */
  senderId?: string;
  /** Whether you wrote it (unknown before the client is connected). */
  fromMe?: boolean;
  /** Its text or caption ("" for a file without one). */
  text: string;
  /** The file it carried, if any: a reply to a document or a photo has no text, but this. */
  media?: MediaInfo;
}

/** Turns a message into a JSON string that keeps everything needed to restore it. */
export function serializeMessage(message: Message | WAMessage): string {
  const raw = message instanceof Message ? message.raw : message;
  return JSON.stringify(raw, BufferJSON.replacer);
}

/** Reads a message saved with {@link serializeMessage}. */
export function parseSerializedMessage(json: string): WAMessage {
  return JSON.parse(json, BufferJSON.reviver) as WAMessage;
}

/**
 * A WhatsApp message with a convenient API on top of the raw Baileys object
 * (accessible via `raw` for advanced cases).
 */
export class Message {
  /** Transcript of a voice note or audio, when the client has a `transcribe` function. */
  transcript?: string;

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
    if (this.fromMe) {
      const me = this.client.info;
      const id = me?.jid ? jidNormalizedUser(me.jid) : (this.raw.key.participant ?? '');
      return new Sender(id, me?.lid ? jidNormalizedUser(me.lid) : undefined, me?.name);
    }
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

  /** What file the message carries (type, name, size…), without downloading it. */
  get media(): MediaInfo | undefined {
    return getMediaInfo(this.raw.message);
  }

  /**
   * The message this one replies to, if any: its id, who wrote it (and whether it was you), its
   * text and, when it carried a file, what file (a reply to a document has no text of its own).
   */
  get quoted(): MessageRecord['quoted'] {
    const info = this.contextInfo();
    if (!info?.stanzaId) return undefined;
    const senderId = info.participant ?? undefined;
    const me = this.client.info;
    const mine = [me?.jid, me?.lid]
      .filter((jid): jid is string => !!jid)
      .map((jid) => jidNormalizedUser(jid));
    return {
      id: info.stanzaId,
      senderId,
      fromMe: senderId && mine.length ? mine.includes(jidNormalizedUser(senderId)) : undefined,
      text: extractText(info.quotedMessage),
      media: getMediaInfo(info.quotedMessage),
    };
  }

  /** JIDs mentioned with @ in this message. */
  get mentions(): string[] {
    return (this.contextInfo()?.mentionedJid ?? []).filter((jid): jid is string => !!jid);
  }

  /** Was it forwarded? */
  get forwarded(): boolean {
    return !!this.contextInfo()?.isForwarded;
  }

  private contextInfo(): proto.IContextInfo | undefined {
    const content = normalizeMessageContent(this.raw.message);
    const type = content ? getContentType(content) : undefined;
    if (!content || !type) return undefined;
    const inner = content[type] as { contextInfo?: proto.IContextInfo | null } | undefined;
    return (typeof inner === 'object' && inner?.contextInfo) || undefined;
  }

  /** The message as plain data, ready to store in your database. */
  toRecord(): MessageRecord {
    const sender = this.sender;
    const record: MessageRecord = {
      id: this.id,
      chatId: this.chatId,
      chatIdAlt: this.chatIdAlt,
      fromMe: this.fromMe,
      isGroup: this.isGroup,
      sender: { id: sender.id, phone: sender.number, lid: sender.lid, name: sender.name },
      timestamp: this.timestamp,
      type: this.type,
      text: this.body,
      transcript: this.transcript,
      media: this.media,
      quoted: this.quoted,
      mentions: this.mentions,
      forwarded: this.forwarded,
    };
    // Drop undefined fields so the record is compact and stable as JSON.
    return JSON.parse(JSON.stringify(record)) as MessageRecord;
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

  /**
   * Downloads the file together with its details (type, name, size…). The
   * result converts straight into a model input with `toModelPart()`.
   */
  async downloadAttachment(): Promise<Attachment> {
    const media = this.media;
    if (!media) throw new Error('The message does not contain media');
    const data = await this.downloadMedia();
    return { ...media, size: media.size ?? data.length, data };
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
