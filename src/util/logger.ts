/**
 * Minimal logger compatible with the `ILogger` interface that Baileys expects
 * (same shape as a pino logger: level methods + `child()`).
 *
 * It is silent by default so it doesn't clutter the console. You can pass your
 * own pino logger in the `Client` options if you want traces.
 */
export interface Logger {
  level: string;
  child(bindings: Record<string, unknown>): Logger;
  trace(...args: unknown[]): void;
  debug(...args: unknown[]): void;
  info(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
  fatal?(...args: unknown[]): void;
}

const noop = (): void => {};

export const silentLogger: Logger = {
  level: 'silent',
  child: () => silentLogger,
  trace: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  fatal: noop,
};
