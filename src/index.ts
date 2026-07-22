// --- Client ---
export { Client, createClient } from './client/Client.js';
export type {
  ClientOptions,
  ClientInfo,
  ClientEvents,
  ReactionEvent,
  PresenceEvent,
} from './client/options.js';
export type {
  TextOptions,
  CaptionOptions,
  AudioOptions,
  DocumentOptions,
  LocationInput,
  SendFromLinkOptions,
  PollInput,
  ContactCard,
} from './client/send-options.js';

// --- Router ---
export { Context } from './router/Context.js';
export type { Handler, Middleware, MiddlewareNext, Trigger } from './router/types.js';

// --- Structures ---
export { Message } from './structures/Message.js';
export { Chat } from './structures/Chat.js';
export { Group } from './structures/Group.js';
export { Sender } from './structures/Sender.js';

// --- Auth ---
export { LocalAuth } from './auth/LocalAuth.js';
export type { LocalAuthOptions } from './auth/LocalAuth.js';
export type { AuthStrategy } from './auth/AuthStrategy.js';

// --- Media ---
export { resolveMedia } from './media/resolve.js';
export type { MediaSource, ResolvedMedia } from './media/resolve.js';
export {
  detectMediaKind,
  kindFromExtension,
  kindFromMime,
  fileNameFromLink,
} from './media/detect.js';
export type { MediaKind } from './media/detect.js';

// --- QR ---
export { Qr } from './qr/Qr.js';

// --- Utilities ---
export {
  ensureJid,
  jidToNumber,
  isGroupJid,
  isUserJid,
  isPnJid,
  isLidJid,
  USER_SERVER,
  LID_SERVER,
  GROUP_SERVER,
} from './util/jid.js';
export { extractText, getMessageType, messageHasMedia, MEDIA_TYPES } from './util/content.js';
export { silentLogger } from './util/logger.js';
export type { Logger } from './util/logger.js';
export { eventStream } from './util/eventStream.js';
export type { EventStreamOptions } from './util/eventStream.js';

// --- Low-level (re-exported from Baileys) ---
export type { AnyMessageContent, WAMessage, WAMessageKey, proto } from 'baileys';
