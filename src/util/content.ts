import { getContentType, type proto } from 'baileys';

/** Message types that contain downloadable media. */
export const MEDIA_TYPES = [
  'imageMessage',
  'videoMessage',
  'audioMessage',
  'documentMessage',
  'stickerMessage',
] as const;

/**
 * Returns the content-type key of a message
 * (`conversation`, `imageMessage`, `extendedTextMessage`, …).
 */
export function getMessageType(message?: proto.IMessage | null): string | undefined {
  if (!message) return undefined;
  return getContentType(message);
}

/**
 * Extracts the readable text from a message, covering the common cases:
 * plain text, extended text (links/mentions), image/video/document captions
 * and button/list responses.
 */
export function extractText(message?: proto.IMessage | null): string {
  if (!message) return '';
  const type = getContentType(message);
  if (!type) return '';

  switch (type) {
    case 'conversation':
      return message.conversation ?? '';
    case 'extendedTextMessage':
      return message.extendedTextMessage?.text ?? '';
    case 'imageMessage':
      return message.imageMessage?.caption ?? '';
    case 'videoMessage':
      return message.videoMessage?.caption ?? '';
    case 'documentMessage':
      return message.documentMessage?.caption ?? '';
    case 'buttonsResponseMessage':
      return message.buttonsResponseMessage?.selectedButtonId ?? '';
    case 'listResponseMessage':
      return message.listResponseMessage?.singleSelectReply?.selectedRowId ?? '';
    case 'templateButtonReplyMessage':
      return message.templateButtonReplyMessage?.selectedId ?? '';
    default: {
      const content = (message as Record<string, unknown>)[type] as
        { caption?: string; text?: string } | undefined;
      return content?.caption ?? content?.text ?? '';
    }
  }
}

/** Does the message carry downloadable media? */
export function messageHasMedia(message?: proto.IMessage | null): boolean {
  const type = getMessageType(message);
  return !!type && (MEDIA_TYPES as readonly string[]).includes(type);
}
