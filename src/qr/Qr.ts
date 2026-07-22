import qrcode from 'qrcode-terminal';

/**
 * Wrapper around the pairing QR code with convenient utilities.
 * The raw value (`raw`) is the string encoded by the QR; you can generate your
 * own image from it if you need to (PNG, DataURL, …).
 */
export class Qr {
  constructor(public readonly raw: string) {}

  /** Renders the QR as ASCII art in the terminal. */
  printToTerminal(options: { small?: boolean } = {}): void {
    qrcode.generate(this.raw, { small: options.small ?? true });
  }

  /** Returns the raw QR value. */
  toString(): string {
    return this.raw;
  }
}
