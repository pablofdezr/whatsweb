import type { PresenceData, WAMessageKey } from 'baileys';
import type { AuthStrategy } from '../auth/AuthStrategy.js';
import type { Qr } from '../qr/Qr.js';
import type { Context } from '../router/Context.js';
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
   * instead of QR. Ideal when you can't scan a QR.
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
  /** Pino (or compatible) logger. Silent by default. */
  logger?: Logger;
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
  /** Any created message, including your own. */
  message_create: [ctx: Context];
  /** Someone reacted to a message. */
  reaction: [reaction: ReactionEvent];
  /** A contact's presence changed (requires `subscribeToPresence`). */
  presence: [presence: PresenceEvent];
  /** Connection closed. `reconnecting` indicates whether it will retry. */
  disconnected: [info: { code?: number; reconnecting: boolean }];
  /** Non-fatal error. */
  error: [error: Error];
}
