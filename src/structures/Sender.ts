import { isLidJid, isPnJid, jidToNumber } from '../util/jid.js';

/**
 * Identity of whoever sends a message, aware of WhatsApp's LID system. `id`
 * is the JID that WhatsApp prefers (may be LID or PN) and `alt` is the
 * alternative JID (if `id` is a LID, `alt` is usually the number).
 */
export class Sender {
  constructor(
    /** JID preferred by WhatsApp (LID or PN). */
    public readonly id: string,
    /** Alternative JID, if known (the PN when `id` is a LID). */
    public readonly alt?: string,
    /** Display name (pushName), if present. */
    public readonly name?: string,
  ) {}

  /** Is the primary identity a LID (anonymous)? */
  get isLid(): boolean {
    return isLidJid(this.id);
  }

  /** Phone number JID, if known. `undefined` if only a LID is available. */
  get phoneJid(): string | undefined {
    if (isPnJid(this.id)) return this.id;
    if (this.alt && isPnJid(this.alt)) return this.alt;
    return undefined;
  }

  /**
   * Phone number, if known. With the LID system it may be `undefined`
   * (WhatsApp deliberately hides the number).
   */
  get number(): string | undefined {
    const pn = this.phoneJid;
    return pn ? jidToNumber(pn) : undefined;
  }

  /** The best available name: name > number > numeric LID id. */
  get displayName(): string {
    return this.name ?? this.number ?? jidToNumber(this.id);
  }
}
