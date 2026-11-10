import type { PresenceData, WAMessageKey } from 'baileys';
import type { AuthStrategy } from '../auth/AuthStrategy.js';
import type { Authorizer, SenderIdentity } from '../auth/authorize.js';
import type { Attachment } from '../media/attachment.js';
import type { StateStore } from '../state/StateStore.js';
import type { Qr } from '../qr/Qr.js';
import type { Context } from '../router/Context.js';
import type { Message } from '../structures/Message.js';
import type { Logger } from '../util/logger.js';

export interface ClientOptions {
  /** Auth/persistence strategy. Defaults to `LocalAuth` in `.whatsweb_auth`. */
  authStrategy?: AuthStrategy;
  /**
   * Shortcut: session name. Stored in `.whatsweb_auth/<session>`.
   * Handy for keeping several accounts. For full control, pass `authStrategy`.
   */
  session?: string;
  /**
   * Phone number (E.164, with or without `+`) to link via **pairing code**
   * instead of QR. Ideal when you can't scan a QR. The code stays valid for
   * several minutes; if the connection drops before it is typed, a new one is
   * emitted.
   */
  pairingCode?: string;
  /** Automatically reconnect if the connection drops. Defaults to `true`. */
  autoReconnect?: boolean;
  /** Max reconnection attempts before giving up. Defaults to `Infinity`. */
  maxReconnectAttempts?: number;
  /** Base delay (ms) for the exponential reconnection backoff. Defaults to `1000`. */
  reconnectDelayMs?: number;
  /** Print the QR / code to the terminal automatically. Defaults to `true`. */
  printQRInTerminal?: boolean;
  /** Device name shown in "Linked devices". Defaults to `whatsweb`. */
  deviceName?: string;
  /**
   * Delete the stored credentials when WhatsApp ends the session (the device was
   * unlinked from the phone, or the session expired). They can't be reused, and
   * keeping them makes every later `start()` fail. Defaults to `true`.
   */
  clearSessionOnLogout?: boolean;
  /** Mark the account as "online" on connect. Defaults to `false`. */
  markOnlineOnConnect?: boolean;
  /**
   * Minimum milliseconds between outgoing messages. When set, all sends go
   * through a serial queue spaced by this interval, reducing ban risk.
   * Defaults to `undefined` (send immediately).
   */
  rateLimitMs?: number;
  /** Command prefix(es) for the router. Defaults to `['!', '/']`. */
  commandPrefix?: string | string[];
  /**
   * Per-chat conversation state store. Defaults to an in-memory store;
   * implement `StateStore` to back it with Redis, a database, etc.
   */
  stateStore?: StateStore;
  /**
   * In-memory per-chat message history (used by `conversation.history()`).
   * Defaults to `{ limit: 50, maxChats: 1000 }`. Set to `false` to disable.
   */
  history?: false | { limit?: number; maxChats?: number };
  /** Pino (or compatible) logger. Silent by default. */
  logger?: Logger;
  /**
   * Decides who may use the bot. It runs for every incoming message before
   * anything else: rejected messages never reach handlers, `ask()`,
   * transcription or the history; they only emit `unauthorized`. Whatever it
   * returns for an allowed sender is available as `ctx.principal`.
   *
   * Without it, everyone can talk to the bot.
   *
   * @example
   * ```ts
   * authorize: async ({ phone, isGroup }) =>
   *   !isGroup && phone ? await db.findUserByPhone(phone) : null,
   * ```
   */
  authorize?: Authorizer;
  /**
   * Turns audio into text. When set, every authorized voice note and audio
   * file is transcribed before it reaches your handlers: the text is in
   * `ctx.text`, `message.transcript` and the message record. Plug in any
   * speech-to-text service (e.g. the AI SDK's `transcribe`).
   */
  transcribe?: (audio: Attachment, message: Message) => Promise<string | undefined>;
  /**
   * How incoming messages are handled. `'per-chat'` (the default) handles the
   * messages of each chat one at a time, in order, so a user sending several
   * messages quickly doesn't start several replies at once; different chats
   * still run in parallel. `'parallel'` handles every message as it arrives.
   */
  concurrency?: 'per-chat' | 'parallel';
  /** Path to `ffmpeg`, used to convert audio to OGG/Opus for voice notes. Defaults to `ffmpeg`. */
  ffmpegPath?: string;
}

/** Information about the connected account. */
export interface ClientInfo {
  /** Own JID. */
  jid: string;
  /** Own LID, if known. */
  lid?: string;
  /** Own phone number, if known. */
  number?: string;
  /** Display name. */
  name?: string;
}

/** Reaction to a message. */
export interface ReactionEvent {
  /** Reaction emoji (empty string if it was removed). */
  emoji: string;
  /** Key of the reacted message. */
  key: WAMessageKey;
  /** Did I react? */
  fromMe: boolean;
}

/** A message was edited. */
export interface MessageEditEvent {
  /** Chat the message belongs to. */
  chatId: string;
  /** ID of the edited message. */
  id: string;
  /** Did I edit it? */
  fromMe: boolean;
  /** The message with its new content. */
  message: Message;
}

/** A message was deleted for everyone. */
export interface MessageDeleteEvent {
  /** Chat the message belonged to. */
  chatId: string;
  /** ID of the deleted message. */
  id: string;
  /** Did I delete it? */
  fromMe: boolean;
}

/** A message from a sender the `authorize` function rejected. */
export interface UnauthorizedEvent {
  /** Who sent it. */
  identity: SenderIdentity;
  /** The message, e.g. to reply that they have no access. */
  ctx: Context;
}

/** Presence update for a chat/contact. */
export interface PresenceEvent {
  /** JID the presence belongs to. */
  id: string;
  /** Presence per participant (last seen, composing, …). */
  presences: Record<string, PresenceData>;
}

/** Client event map (strongly typed). */
export interface ClientEvents {
  /** New QR to scan. */
  qr: [qr: Qr];
  /** Pairing code generated (login without QR). */
  pairing_code: [code: string];
  /** Connection established and ready to use. */
  ready: [info: ClientInfo];
  /** Incoming message (not your own). You receive a `Context`. */
  message: [ctx: Context];
  /** Any created message, including your own and the ones you send. */
  message_create: [ctx: Context];
  /** A message was edited (it is not routed again as a new message). */
  message_edit: [edit: MessageEditEvent];
  /** A message was deleted for everyone. */
  message_delete: [deletion: MessageDeleteEvent];
  /** A message was rejected by `authorize`. */
  unauthorized: [event: UnauthorizedEvent];
  /** Someone reacted to a message. */
  reaction: [reaction: ReactionEvent];
  /** A contact's presence changed (requires `subscribeToPresence`). */
  presence: [presence: PresenceEvent];
  /** Connection closed. `reconnecting` indicates whether it will retry. */
  disconnected: [info: { code?: number; reconnecting: boolean }];
  /**
   * WhatsApp ended the session (device unlinked or session expired). The
   * stored credentials have been deleted unless `clearSessionOnLogout` is
   * `false`; call `start()` again to link with a new QR or pairing code.
   */
  logged_out: [];
  /** Non-fatal error. */
  error: [error: Error];
}
