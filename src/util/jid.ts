/**
 * Utilities for working with WhatsApp JIDs.
 *
 * A JID identifies a chat, contact or group. With the modern Multi-Device
 * system there are two ways to identify a user:
 *   - PN  (Phone Number):  `34123456789@s.whatsapp.net`  — the classic format.
 *   - LID (Local ID):      `123456789@lid`               — an anonymous
 *     identifier that WhatsApp assigns to each user to preserve their privacy
 *     (e.g. in large groups). As of Baileys 7 it is the default format for
 *     new sessions.
 *   - Group:               `120363...@g.us`
 *   - Broadcast/statuses:  `status@broadcast`
 */

export const USER_SERVER = 's.whatsapp.net';
export const LID_SERVER = 'lid';
export const GROUP_SERVER = 'g.us';
export const BROADCAST_SERVER = 'broadcast';

/** Is it a group JID? */
export function isGroupJid(jid: string): boolean {
  return jid.endsWith(`@${GROUP_SERVER}`);
}

/** Is it a phone-number JID (PN)? */
export function isPnJid(jid: string): boolean {
  return jid.endsWith(`@${USER_SERVER}`);
}

/** Is it an anonymous JID (LID)? */
export function isLidJid(jid: string): boolean {
  return jid.endsWith(`@${LID_SERVER}`);
}

/** Is it an individual user (PN or LID)? */
export function isUserJid(jid: string): boolean {
  return isPnJid(jid) || isLidJid(jid);
}

/**
 * Normalizes any input into a valid JID.
 *
 * Accepts a full JID (returned as-is) or a phone number in any format
 * (`+34 600 11 22 33`, `0034600112233`, …), to which it appends the user
 * server.
 */
export function ensureJid(input: string): string {
  if (input.includes('@')) return input;
  const digits = input.replace(/[^0-9]/g, '').replace(/^00/, '');
  if (!digits) throw new Error(`Could not derive a valid number from "${input}"`);
  return `${digits}@${USER_SERVER}`;
}

/** Extracts only the numeric identifier (without server or device suffix). */
export function jidToNumber(jid: string): string {
  return (jid.split('@')[0] ?? '').split(':')[0] ?? '';
}
