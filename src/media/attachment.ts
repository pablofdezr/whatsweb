import { normalizeMessageContent, type proto } from 'baileys';
import type { MediaKind } from './detect.js';

/**
 * What a received file is, without downloading it. Plain data (no Buffers or
 * class instances), so it can be stored as-is, e.g. in a JSON column.
 */
export interface MediaInfo {
  /** `image`, `video`, `audio`, `document` or `sticker`. */
  kind: MediaKind;
  /** MIME type as sent by WhatsApp (e.g. `application/pdf`, `audio/ogg; codecs=opus`). */
  mimetype: string;
  /** Original file name (documents only, when the sender's app provides it). */
  fileName?: string;
  /** Size in bytes. */
  size?: number;
  /** Duration in seconds (audio and video). */
  seconds?: number;
  /** Was it recorded as a voice note (push-to-talk)? */
  isVoiceNote: boolean;
  /** Pixel size (images, videos, stickers). */
  width?: number;
  height?: number;
  /** Page count (PDF documents). */
  pageCount?: number;
  /** Caption written with the file, if any. */
  caption?: string;
  /** SHA-256 of the file, base64. Handy to de-duplicate stored files. */
  sha256?: string;
}

/** A downloaded file: its {@link MediaInfo} plus the bytes. */
export interface Attachment extends MediaInfo {
  data: Buffer;
}

const DEFAULT_MIME: Record<MediaKind, string> = {
  image: 'image/jpeg',
  video: 'video/mp4',
  audio: 'audio/ogg; codecs=opus',
  document: 'application/octet-stream',
  sticker: 'image/webp',
};

/** Converts protobuf numbers (which may be `Long` objects) to plain numbers. */
function toNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === 'number') return value;
  if (
    typeof value === 'object' &&
    typeof (value as { toNumber?: unknown }).toNumber === 'function'
  ) {
    return (value as { toNumber(): number }).toNumber();
  }
  if (typeof value === 'object' && typeof (value as { low?: unknown }).low === 'number') {
    const { low, high = 0 } = value as { low: number; high?: number };
    return (high >>> 0) * 2 ** 32 + (low >>> 0);
  }
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function toBase64(value: unknown): string | undefined {
  if (!value) return undefined;
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return Buffer.from(value).toString('base64');
  return undefined;
}

const clean = <T extends object>(info: T): T =>
  Object.fromEntries(Object.entries(info).filter(([, v]) => v !== undefined && v !== '')) as T;

/** Reads the {@link MediaInfo} of a message, or `undefined` if it carries no file. */
export function getMediaInfo(raw?: proto.IMessage | null): MediaInfo | undefined {
  const message = normalizeMessageContent(raw);
  if (!message) return undefined;

  const pick = (
    kind: MediaKind,
    m:
      | {
          mimetype?: string | null;
          fileLength?: unknown;
          fileSha256?: unknown;
          seconds?: number | null;
          ptt?: boolean | null;
          width?: number | null;
          height?: number | null;
          caption?: string | null;
          fileName?: string | null;
          pageCount?: number | null;
        }
      | null
      | undefined,
  ): MediaInfo | undefined =>
    m
      ? clean<MediaInfo>({
          kind,
          mimetype: m.mimetype || DEFAULT_MIME[kind],
          fileName: m.fileName ?? undefined,
          size: toNumber(m.fileLength),
          seconds: m.seconds ?? undefined,
          isVoiceNote: !!m.ptt,
          width: m.width ?? undefined,
          height: m.height ?? undefined,
          pageCount: m.pageCount ?? undefined,
          caption: m.caption ?? undefined,
          sha256: toBase64(m.fileSha256),
        })
      : undefined;

  return (
    pick('image', message.imageMessage) ??
    pick('video', message.videoMessage) ??
    pick('audio', message.audioMessage) ??
    pick('document', message.documentMessage) ??
    pick('sticker', message.stickerMessage)
  );
}
