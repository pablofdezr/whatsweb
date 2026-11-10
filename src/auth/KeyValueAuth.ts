import {
  BufferJSON,
  initAuthCreds,
  makeCacheableSignalKeyStore,
  proto,
  type AuthenticationCreds,
  type SignalDataTypeMap,
  type SignalKeyStore,
} from 'baileys';
import type { AuthStrategy } from './AuthStrategy.js';

/**
 * Any key/value storage: a Postgres table, Redis, DynamoDB… Values are JSON
 * strings. Implement these four methods and pass it to {@link KeyValueAuth}.
 *
 * @example Postgres (with `pg`)
 * ```ts
 * // CREATE TABLE whatsapp_auth (key text PRIMARY KEY, value text NOT NULL);
 * const store: KeyValueStore = {
 *   get: async (key) =>
 *     (await pool.query('SELECT value FROM whatsapp_auth WHERE key = $1', [key])).rows[0]?.value,
 *   set: async (key, value) => {
 *     await pool.query(
 *       'INSERT INTO whatsapp_auth (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = $2',
 *       [key, value],
 *     );
 *   },
 *   delete: async (key) => {
 *     await pool.query('DELETE FROM whatsapp_auth WHERE key = $1', [key]);
 *   },
 *   deleteByPrefix: async (prefix) => {
 *     await pool.query('DELETE FROM whatsapp_auth WHERE starts_with(key, $1)', [prefix]);
 *   },
 * };
 * ```
 */
export interface KeyValueStore {
  get(key: string): Promise<string | null | undefined>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  /** Deletes every key starting with `prefix` (used to remove a whole session). */
  deleteByPrefix(prefix: string): Promise<void>;
}

export interface KeyValueAuthOptions {
  store: KeyValueStore;
  /**
   * Session name. Every key is prefixed with it, so several WhatsApp accounts
   * can share one table. Defaults to `default`.
   */
  session?: string;
}

/**
 * Authentication strategy that keeps the WhatsApp session in your own
 * database instead of on disk. Use it on servers and containers, where the
 * local file system is not persistent or is shared by several instances.
 *
 * Only one running client may use a session at a time.
 */
export class KeyValueAuth implements AuthStrategy {
  private readonly store: KeyValueStore;
  private readonly prefix: string;

  constructor(options: KeyValueAuthOptions) {
    this.store = options.store;
    this.prefix = `${options.session ?? 'default'}:`;
  }

  private async read<T>(key: string): Promise<T | null> {
    const value = await this.store.get(this.prefix + key);
    return value ? (JSON.parse(value, BufferJSON.reviver) as T) : null;
  }

  private write(key: string, value: unknown): Promise<void> {
    return this.store.set(this.prefix + key, JSON.stringify(value, BufferJSON.replacer));
  }

  async getAuthState() {
    const creds = (await this.read<AuthenticationCreds>('creds')) ?? initAuthCreds();

    const keys: SignalKeyStore = {
      get: async <T extends keyof SignalDataTypeMap>(type: T, ids: string[]) => {
        const data: { [id: string]: SignalDataTypeMap[T] } = {};
        await Promise.all(
          ids.map(async (id) => {
            let value = await this.read<SignalDataTypeMap[T]>(`${type}-${id}`);
            if (type === 'app-state-sync-key' && value) {
              value = proto.Message.AppStateSyncKeyData.fromObject(
                value as object,
              ) as unknown as SignalDataTypeMap[T];
            }
            if (value) data[id] = value;
          }),
        );
        return data;
      },
      set: async (data) => {
        const tasks: Promise<void>[] = [];
        for (const category in data) {
          const entries = data[category as keyof SignalDataTypeMap] ?? {};
          for (const id in entries) {
            const value = entries[id];
            const key = `${category}-${id}`;
            tasks.push(value ? this.write(key, value) : this.store.delete(this.prefix + key));
          }
        }
        await Promise.all(tasks);
      },
    };

    return {
      // The cache avoids a database round trip for every encryption key lookup.
      state: { creds, keys: makeCacheableSignalKeyStore(keys) },
      saveCreds: () => this.write('creds', creds),
    };
  }

  async clear(): Promise<void> {
    await this.store.deleteByPrefix(this.prefix);
  }
}
