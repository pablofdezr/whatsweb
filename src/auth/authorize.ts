import type { Message } from '../structures/Message.js';

/**
 * Register your own types with whatsweb through declaration merging. Set
 * `principal` to the user object your `authorize` function returns, and
 * `ctx.principal` is typed with it everywhere.
 *
 * @example
 * ```ts
 * declare module '@whatsweb/core' {
 *   interface Register {
 *     principal: { userId: string; organizations: string[] };
 *   }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Register {}

/** The authorized user attached to each message (see {@link Register}). */
export type Principal = Register extends { principal: infer P } ? P : unknown;

/**
 * Who sent a message, as WhatsApp reports it. Everything here comes from
 * WhatsApp's servers except `name`, which the sender chooses: never use `name`
 * to decide access.
 */
export interface SenderIdentity {
  /** JID WhatsApp uses for the sender (LID or phone-number JID). */
  jid: string;
  /**
   * Phone number in international format without `+` (e.g. `34600112233`).
   * `undefined` when WhatsApp hides it and the LID couldn't be mapped to a
   * number: treat that as "not authorized".
   */
  phone?: string;
  /** The sender's LID, when known. */
  lid?: string;
  /** Chat the message was sent in. */
  chatId: string;
  /** Was it sent in a group? Replies in a group are visible to every member. */
  isGroup: boolean;
  /** Display name chosen by the sender. Not verified. */
  name?: string;
}

/**
 * Decides whether a sender may use the bot. Return the user (any value you
 * like, e.g. a row from your database) to allow the message, or `null`,
 * `undefined` or `false` to reject it. If it throws, the message is rejected.
 */
export type Authorizer = (
  identity: SenderIdentity,
  message: Message,
) => Principal | null | undefined | false | Promise<Principal | null | undefined | false>;

/** Did the authorizer allow the message? */
export function isAllowed(result: unknown): boolean {
  return result !== null && result !== undefined && result !== false;
}
