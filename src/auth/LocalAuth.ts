import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { useMultiFileAuthState } from 'baileys';
import type { AuthStrategy } from './AuthStrategy.js';

export interface LocalAuthOptions {
  /**
   * Client identifier. Lets you keep several sessions (several numbers)
   * under the same `dataPath`, each in its own subfolder.
   */
  clientId?: string;
  /** Base folder where the session is stored. Defaults to `.whatsweb_auth`. */
  dataPath?: string;
}

/**
 * Authentication strategy based on local files. Stores credentials and Signal
 * keys on disk so you don't have to rescan the QR on every startup.
 * Internally it uses Baileys' `useMultiFileAuthState`.
 */
export class LocalAuth implements AuthStrategy {
  private readonly path: string;

  constructor(options: LocalAuthOptions = {}) {
    const base = options.dataPath ?? '.whatsweb_auth';
    this.path = options.clientId ? join(base, options.clientId) : base;
  }

  /** On-disk path where this session is persisted. */
  get sessionPath(): string {
    return this.path;
  }

  getAuthState() {
    return useMultiFileAuthState(this.path);
  }

  async clear(): Promise<void> {
    await rm(this.path, { recursive: true, force: true });
  }
}
