import type { Attachment, MediaInfo } from '../media/attachment.js';
import { baseMime } from '../media/mime.js';

/*
 * Minimal message shapes for LLM calls. They are structurally compatible with
 * the Vercel AI SDK's `ModelMessage`, so the output of `toModelMessages` can be
 * passed straight to `generateText({ messages })` without whatsweb depending on
 * any AI library.
 */

export interface ModelTextPart {
  type: 'text';
  text: string;
}

export interface ModelImagePart {
  type: 'image';
  /** Bytes, base64 string or URL. */
  image: Uint8Array | string | URL;
  mediaType?: string;
}

export interface ModelFilePart {
  type: 'file';
  /** Bytes, base64 string or URL. */
  data: Uint8Array | string | URL;
  mediaType: string;
  filename?: string;
}

export type ModelUserPart = ModelTextPart | ModelImagePart | ModelFilePart;

export type ModelMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ModelUserPart[] }
  | { role: 'assistant'; content: string };

/**
 * A file to hand to the model: a downloaded {@link Attachment}, or a reference
 * to where you stored it (a URL, e.g. S3, or base64), plus its type.
 */
export type ModelAttachment =
  | Attachment
  | {
      data: Uint8Array | string | URL;
      mimetype: string;
      fileName?: string;
      kind?: MediaInfo['kind'];
    };

/**
 * One message of a conversation, in the shape `toModelMessages` reads. A
 * `MessageRecord` (from `message.toRecord()`) fits as-is, and so does a row of
 * your own database with these fields.
 */
export interface TranscriptEntry {
  fromMe: boolean;
  text?: string;
  /** Transcript of a voice note or audio. */
  transcript?: string;
  sender?: { name?: string; phone?: string };
  media?: MediaInfo;
  /** The file itself, to include as an image or file part (user turns only). */
  attachment?: ModelAttachment;
  /** The message this one replies to (a `MessageRecord`'s `quoted`). */
  quoted?: QuotedEntry;
}

/** What `toModelMessages` reads of a quoted message. */
export interface QuotedEntry {
  text?: string;
  /** Whether you (the bot) wrote it. */
  fromMe?: boolean;
  media?: Pick<MediaInfo, 'kind' | 'fileName' | 'seconds' | 'isVoiceNote'>;
}

/** File types most models accept as input (images, PDF, plain text). */
export const DEFAULT_MODEL_MEDIA_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'application/pdf',
  'text/plain',
];

export interface ToModelMessagesOptions {
  /** Prepended as a `system` message. */
  systemPrompt?: string;
  /**
   * Prefix user turns with the sender's name (`Ana: hi`). Useful in groups,
   * where several people talk. Defaults to `false`.
   */
  senderNames?: boolean;
  /**
   * Which attachments are sent to the model as files. Others are replaced by a
   * short description such as `[document: report.docx]`. Defaults to the types
   * in {@link DEFAULT_MODEL_MEDIA_TYPES}.
   */
  acceptsMediaType?: (mediaType: string) => boolean;
  /**
   * How a reply says what it replies to, before the user's text, so the model knows which
   * message "this one" is (a reply to a document has no text of its own). Defaults to
   * {@link describeQuote}; `false` leaves replies as they are.
   */
  describeQuote?: false | ((quoted: QuotedEntry) => string);
}

/** The longest quoted text repeated in a reply's description. */
const QUOTE_MAX = 300;

/** A quoted message in a few words: `(replying to your message: [document: a.pdf])`. */
export function describeQuote(quoted: QuotedEntry): string {
  const text = (quoted.text ?? '').trim();
  const short = text.length > QUOTE_MAX ? `${text.slice(0, QUOTE_MAX - 1).trimEnd()}…` : text;
  const what = [
    quoted.media ? describeMedia(quoted.media) : undefined,
    short ? `"${short}"` : undefined,
  ]
    .filter(Boolean)
    .join(' ');
  const whose =
    quoted.fromMe === true
      ? 'your message'
      : quoted.fromMe === false
        ? 'their message'
        : 'a message';
  return what ? `(replying to ${whose}: ${what})` : `(replying to ${whose})`;
}

/** A short text description of a file, e.g. `[voice note, 12s]` or `[document: a.pdf]`. */
export function describeMedia(
  media: Pick<MediaInfo, 'kind' | 'fileName' | 'seconds' | 'isVoiceNote'>,
): string {
  const label = media.isVoiceNote ? 'voice note' : media.kind;
  const details = [media.fileName, media.seconds ? `${media.seconds}s` : undefined].filter(Boolean);
  return details.length ? `[${label}: ${details.join(', ')}]` : `[${label}]`;
}

/** Converts a file into an image part (images, stickers) or a file part. */
export function toModelPart(attachment: ModelAttachment): ModelImagePart | ModelFilePart {
  const mediaType = baseMime(attachment.mimetype);
  const data = attachment.data;
  if (mediaType.startsWith('image/')) return { type: 'image', image: data, mediaType };
  return { type: 'file', data, mediaType, filename: attachment.fileName };
}

/**
 * Builds the messages for an LLM call from a conversation: your messages become
 * `assistant` turns and everyone else's `user` turns. Images and PDFs with an
 * `attachment` are included as parts; other files are described in text, and
 * voice notes use their transcript.
 *
 * @example
 * ```ts
 * const rows = await db.lastMessages(chatId, 20); // your own schema
 * const { text } = await generateText({ model, messages: toModelMessages(rows) });
 * ```
 */
export function toModelMessages(
  entries: readonly TranscriptEntry[],
  options: ToModelMessagesOptions = {},
): ModelMessage[] {
  const accepts =
    options.acceptsMediaType ?? ((type: string) => DEFAULT_MODEL_MEDIA_TYPES.includes(type));
  const messages: ModelMessage[] = [];
  if (options.systemPrompt) messages.push({ role: 'system', content: options.systemPrompt });

  for (const entry of entries) {
    const role = entry.fromMe ? 'assistant' : 'user';
    const attachment =
      role === 'user' && entry.attachment && accepts(baseMime(entry.attachment.mimetype))
        ? entry.attachment
        : undefined;

    const pieces: string[] = [];
    if (entry.media && !attachment && !entry.transcript) pieces.push(describeMedia(entry.media));
    if (entry.transcript)
      pieces.push(`${entry.media?.isVoiceNote ? '[voice note]' : '[audio]'} ${entry.transcript}`);
    // A caption is already the message text, so it isn't repeated.
    if (entry.text) pieces.push(entry.text);
    let text = pieces.join(' ').trim();
    // A reply says what it replies to first: "this one", "¿está cobrada?" mean the quoted message.
    const quote =
      options.describeQuote === false ? undefined : (options.describeQuote ?? describeQuote);
    if (role === 'user' && entry.quoted && quote && (text || attachment))
      text = `${quote(entry.quoted)} ${text}`.trim();

    if (role === 'user' && options.senderNames) {
      const name = entry.sender?.name ?? entry.sender?.phone;
      if (name && text) text = `${name}: ${text}`;
      else if (name && attachment) text = `${name} sent this file.`;
    }

    if (role === 'assistant') {
      if (text) messages.push({ role, content: text });
    } else if (attachment) {
      const parts: ModelUserPart[] = [toModelPart(attachment)];
      if (text) parts.push({ type: 'text', text });
      messages.push({ role, content: parts });
    } else if (text) {
      messages.push({ role, content: text });
    }
  }
  return messages;
}
