import { readFile } from 'node:fs/promises';
import type { Readable } from 'node:stream';

/**
 * Source of a media file. You can pass:
 *   - a local path:              `'./cat.jpg'`
 *   - an http(s) URL:            `'https://example.com/cat.jpg'`
 *     (works with S3 public or presigned URLs)
 *   - an in-memory Buffer:       `Buffer`
 *   - a Node stream:             `Readable` (e.g. an S3 `GetObject` body)
 *   - an explicit object:        `{ url }`, `{ path }` or `{ stream }`
 */
export type MediaSource =
  string | Buffer | Readable | { url: string } | { path: string } | { stream: Readable };

/** Media content exactly as Baileys expects it. */
export type ResolvedMedia = Buffer | { url: string } | { stream: Readable };

/**
 * Converts any `MediaSource` into something Baileys can send: a `Buffer` (local
 * files), `{ url }` (remote URLs, which Baileys downloads from your process and
 * then uploads to WhatsApp), or `{ stream }` (piped without buffering).
 */
export async function resolveMedia(source: MediaSource): Promise<ResolvedMedia> {
  if (Buffer.isBuffer(source)) return source;
  if (isReadable(source)) return { stream: source };

  if (typeof source === 'object') {
    if ('url' in source) return { url: source.url };
    if ('stream' in source) return { stream: source.stream };
    if ('path' in source) return readFile(source.path);
    throw new Error(
      'Invalid MediaSource: expected a path, http(s) URL, Buffer, stream, { url }, { path } or { stream }',
    );
  }

  const value = String(source);
  if (/^https?:\/\//i.test(value)) return { url: value };
  return readFile(value);
}

/** Duck-typed check for a Node `Readable` stream (avoids importing the class). */
function isReadable(value: unknown): value is Readable {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Buffer.isBuffer(value) &&
    typeof (value as { pipe?: unknown }).pipe === 'function' &&
    typeof (value as { on?: unknown }).on === 'function'
  );
}
