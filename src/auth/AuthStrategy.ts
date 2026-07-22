import type { AuthenticationState } from 'baileys';

/**
 * Contract for an authentication strategy: how the WhatsApp session
 * credentials/keys are loaded and saved across restarts.
 *
 * With Baileys 7 the state also persists LID↔PN mappings, device lists and
 * tokens; `useMultiFileAuthState` (used by `LocalAuth`) already handles this
 * for you.
 */
export interface AuthStrategy {
  /**
   * Returns the authentication state and a `saveCreds` function that the
   * client will call whenever something changes.
   */
  getAuthState(): Promise<{
    state: AuthenticationState;
    saveCreds: () => Promise<void>;
  }>;

  /** Deletes the persisted session (after logout). Optional. */
  clear?(): Promise<void>;
}
