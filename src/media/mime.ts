/** MIME types by file extension, for when the content can't be sniffed. */
const EXTENSION_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  webp: 'image/webp',
  bmp: 'image/bmp',
  heic: 'image/heic',
  mp4: 'video/mp4',
  m4v: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
  mkv: 'video/x-matroska',
  avi: 'video/x-msvideo',
  '3gp': 'video/3gpp',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg; codecs=opus',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  aac: 'audio/aac',
  flac: 'audio/flac',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  odt: 'application/vnd.oasis.opendocument.text',
  ods: 'application/vnd.oasis.opendocument.spreadsheet',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  html: 'text/html',
  json: 'application/json',
  xml: 'application/xml',
  zip: 'application/zip',
  rar: 'application/vnd.rar',
};

/** MIME type for a file name or link, from its extension. */
export function mimeFromName(name: string): string | undefined {
  const base = (name.split('?')[0] ?? '').split('#')[0] ?? '';
  const ext = base.split('/').pop()?.split('.').pop()?.toLowerCase();
  return ext && base.includes('.') ? EXTENSION_MIME[ext] : undefined;
}

const ascii = (data: Buffer, start: number, end: number): string =>
  data.subarray(start, end).toString('latin1');

/**
 * MIME type from the first bytes of a file (its "magic number"). Returns
 * `undefined` when the format isn't recognized, or for ZIP containers (DOCX,
 * XLSX…), whose real type only the file name can tell.
 */
export function mimeFromBuffer(data: Buffer): string | undefined {
  if (data.length < 4) return undefined;
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data[0] === 0x89 && ascii(data, 1, 4) === 'PNG') return 'image/png';
  if (ascii(data, 0, 4) === 'GIF8') return 'image/gif';
  if (ascii(data, 0, 4) === '%PDF') return 'application/pdf';
  if (ascii(data, 0, 4) === 'RIFF') {
    const format = ascii(data, 8, 12);
    if (format === 'WEBP') return 'image/webp';
    if (format === 'WAVE') return 'audio/wav';
  }
  if (ascii(data, 0, 4) === 'OggS') {
    return ascii(data, 0, Math.min(data.length, 64)).includes('OpusHead')
      ? 'audio/ogg; codecs=opus'
      : 'audio/ogg';
  }
  if (ascii(data, 0, 4) === 'fLaC') return 'audio/flac';
  if (ascii(data, 0, 3) === 'ID3') return 'audio/mpeg';
  if (ascii(data, 4, 8) === 'ftyp') {
    const brand = ascii(data, 8, 12);
    if (brand.startsWith('M4A') || brand.startsWith('M4B')) return 'audio/mp4';
    if (brand === 'qt  ') return 'video/quicktime';
    return 'video/mp4';
  }
  if (data[0] === 0x1a && data[1] === 0x45 && data[2] === 0xdf && data[3] === 0xa3) {
    return 'video/webm';
  }
  if (data[0] === 0xff && data[1] !== undefined) {
    // ADTS AAC has layer bits 00; MPEG audio (MP3) has a non-zero layer.
    if ((data[1] & 0xf6) === 0xf0) return 'audio/aac';
    if ((data[1] & 0xe0) === 0xe0) return 'audio/mpeg';
  }
  return undefined;
}

/**
 * Best guess of a file's MIME type: the content first (it can't lie about its
 * format), then the file name or link.
 */
export function detectMime(input: { data?: Buffer; name?: string }): string | undefined {
  const fromData = input.data ? mimeFromBuffer(input.data) : undefined;
  return fromData ?? (input.name ? mimeFromName(input.name) : undefined);
}

/** The MIME type without parameters (`audio/ogg; codecs=opus` -> `audio/ogg`). */
export function baseMime(mime: string): string {
  return (mime.split(';')[0] ?? mime).trim().toLowerCase();
}

/** Is this audio already in the format WhatsApp needs for voice notes (OGG/Opus)? */
export function isOggOpus(data: Buffer): boolean {
  return mimeFromBuffer(data) === 'audio/ogg; codecs=opus';
}
