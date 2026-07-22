/** Media category used to auto-detect how to send a link. */
export type MediaKind = 'image' | 'video' | 'audio' | 'document' | 'sticker';

const EXTENSION_KIND: Record<string, MediaKind> = {
  jpg: 'image',
  jpeg: 'image',
  png: 'image',
  gif: 'image',
  webp: 'image',
  bmp: 'image',
  heic: 'image',
  mp4: 'video',
  mov: 'video',
  webm: 'video',
  mkv: 'video',
  avi: 'video',
  m4v: 'video',
  '3gp': 'video',
  mp3: 'audio',
  ogg: 'audio',
  oga: 'audio',
  opus: 'audio',
  m4a: 'audio',
  wav: 'audio',
  aac: 'audio',
  flac: 'audio',
  pdf: 'document',
  doc: 'document',
  docx: 'document',
  xls: 'document',
  xlsx: 'document',
  ppt: 'document',
  pptx: 'document',
  txt: 'document',
  csv: 'document',
  zip: 'document',
  rar: 'document',
  json: 'document',
};

/** Strips query/hash and returns the last path segment of a link. */
function baseName(link: string): string {
  const path = (link.split('?')[0] ?? '').split('#')[0] ?? '';
  return path.split('/').pop() ?? '';
}

/** Guesses the media kind from a link's file extension. */
export function kindFromExtension(link: string): MediaKind | undefined {
  const ext = baseName(link).split('.').pop()?.toLowerCase();
  return ext ? EXTENSION_KIND[ext] : undefined;
}

/** Maps a MIME type to a media kind. */
export function kindFromMime(mime: string): MediaKind | undefined {
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  return mime ? 'document' : undefined;
}

/** A sensible file name for a document, derived from the link. */
export function fileNameFromLink(link: string): string {
  const name = baseName(link);
  return name.includes('.') ? name : 'file';
}

/**
 * Detects how to send a link: first by file extension, then (for http/https
 * links) by the `Content-Type` header via a HEAD request, falling back to
 * `'document'`, which always works. Presigned URLs may reject HEAD; in that case
 * the extension usually resolves it, otherwise it is sent as a document.
 */
export async function detectMediaKind(link: string): Promise<MediaKind> {
  const byExtension = kindFromExtension(link);
  if (byExtension) return byExtension;

  if (/^https?:\/\//i.test(link)) {
    try {
      const response = await fetch(link, { method: 'HEAD' });
      const contentType = response.headers.get('content-type');
      if (contentType) {
        const byMime = kindFromMime(contentType.split(';')[0]!.trim());
        if (byMime) return byMime;
      }
    } catch {
      // ignore network/HEAD errors — fall back to document
    }
  }

  return 'document';
}
