import { EventEmitter } from 'node:events';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  type AnyMessageContent,
  type ConnectionState,
  type GroupMetadata,
  type MiscMessageGenerationOptions,
  type WAMessage,
  type WAMessageKey,
  type WASocket,
} from 'baileys';
import { LocalAuth } from '../auth/LocalAuth.js';
import { detectMediaKind, fileNameFromLink } from '../media/detect.js';
import { resolveMedia, type MediaSource } from '../media/resolve.js';
import { Qr } from '../qr/Qr.js';
import { Context } from '../router/Context.js';
import type { Handler, Middleware, Trigger } from '../router/types.js';
import { ConversationState } from '../state/ConversationState.js';
import { MemoryStore, type StateStore } from '../state/StateStore.js';
import { Chat } from '../structures/Chat.js';
import { Conversation } from '../structures/Conversation.js';
import { Group } from '../structures/Group.js';
import { History } from '../structures/History.js';
import { Message } from '../structures/Message.js';
import { eventStream } from '../util/eventStream.js';
import { ensureJid, jidToNumber } from '../util/jid.js';
import { silentLogger } from '../util/logger.js';
import { RateLimitedQueue } from '../util/queue.js';
import { buildVCard } from '../util/vcard.js';
import type { ClientEvents, ClientInfo, ClientOptions } from './options.js';
import type {
  AudioOptions,
  CaptionOptions,
  ContactCard,
  DocumentOptions,
  LocationInput,
  PollInput,
  SendFromLinkOptions,
  TextOptions,
} from './send-options.js';

interface NormalizedOptions {
  authStrategy: import('../auth/AuthStrategy.js').AuthStrategy;
  pairingCode?: string;
  autoReconnect: boolean;
  maxReconnectAttempts: number;
  reconnectBaseDelayMs: number;
  reconnectMaxDelayMs: number;
  printQRInTerminal: boolean;
  deviceName: string;
  markOnlineOnConnect: boolean;
  logger: import('../util/logger.js').Logger;
}

/**
 * WhatsApp Web client without a browser, with a built-in command router.
 *
 * @example
 * ```ts
 * const wa = createClient({ session: 'my-bot' });
 * wa.command('ping', (ctx) => ctx.reply('pong 🏓'));
 * wa.hears(/hola/i, (ctx) => ctx.reply('hi!'));
 * wa.on('ready', (me) => console.log('Connected:', me.number));
 * await wa.start();
 * ```
 */
export class Client extends EventEmitter {
  private readonly options: NormalizedOptions;
  private readonly prefixes: string[];
  private readonly middlewares: Middleware[] = [];

  private sock?: WASocket;
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private manualClose = false;
  private readonly sendQueue?: RateLimitedQueue;
  private readonly store: StateStore;
  private readonly messageHistory?: History;

  /** Account information once connected. */
  public info?: ClientInfo;

  constructor(options: ClientOptions = {}) {
    super();
    this.setMaxListeners(0);
    this.options = {
      authStrategy:
        options.authStrategy ?? new LocalAuth(options.session ? { clientId: options.session } : {}),
      pairingCode: options.pairingCode,
      autoReconnect: options.autoReconnect ?? true,
      maxReconnectAttempts: options.maxReconnectAttempts ?? Number.POSITIVE_INFINITY,
      reconnectBaseDelayMs: options.reconnectDelayMs ?? 1000,
      reconnectMaxDelayMs: 30_000,
      printQRInTerminal: options.printQRInTerminal ?? true,
      deviceName: options.deviceName ?? 'whatsweb',
      markOnlineOnConnect: options.markOnlineOnConnect ?? false,
      logger: options.logger ?? silentLogger,
    };
    const prefix = options.commandPrefix ?? ['!', '/'];
    this.prefixes = Array.isArray(prefix) ? prefix : [prefix];
    if (options.rateLimitMs !== undefined) {
      this.sendQueue = new RateLimitedQueue(options.rateLimitMs);
    }
    this.store = options.stateStore ?? new MemoryStore();
    if (options.history !== false) {
      this.messageHistory = new History(
        options.history?.limit ?? 50,
        options.history?.maxChats ?? 1000,
      );
    }
  }

  /** Configured command prefixes (used by `Context`). */
  get commandPrefixes(): string[] {
    return this.prefixes;
  }

  /** Raw Baileys socket (low-level access). Throws if there is no connection. */
  get socket(): WASocket {
    if (!this.sock) throw new Error('Client is not initialized. Call start() first.');
    return this.sock;
  }

  // --- Lifecycle ---

  /** Starts the connection (alias of `initialize`). */
  start(): Promise<void> {
    return this.initialize();
  }

  /**
   * Starts the connection. Emits `qr` (or `pairing_code`) the first time and
   * `ready` once it is operational.
   */
  async initialize(): Promise<void> {
    this.manualClose = false;
    const { state, saveCreds } = await this.options.authStrategy.getAuthState();
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: this.options.logger as never,
      browser: Browsers.ubuntu(this.options.deviceName),
      markOnlineOnConnect: this.options.markOnlineOnConnect,
    });

    this.sock = sock;
    sock.ev.on('creds.update', saveCreds);
    sock.ev.on('connection.update', (u) => this.handleConnectionUpdate(u));
    sock.ev.on('messages.upsert', (u) => {
      void this.handleMessagesUpsert(u);
    });
    sock.ev.on('messages.reaction', (reactions) => {
      for (const r of reactions) {
        this.emit('reaction', { emoji: r.reaction.text ?? '', key: r.key, fromMe: !!r.key.fromMe });
      }
    });
    sock.ev.on('presence.update', (update) => this.emit('presence', update));

    // Login via pairing code (no QR).
    if (this.options.pairingCode && !state.creds.registered) {
      setTimeout(() => this.requestPairingCode(this.options.pairingCode!), 3000);
    }
  }

  /** Waits until the connection is ready. */
  waitUntilReady(timeoutMs?: number): Promise<ClientInfo> {
    if (this.info) return Promise.resolve(this.info);
    return new Promise((resolve, reject) => {
      const timer =
        timeoutMs !== undefined
          ? setTimeout(() => {
              this.off('ready', onReady);
              reject(new Error('Timeout waiting for the connection'));
            }, timeoutMs)
          : undefined;
      const onReady = (info: ClientInfo): void => {
        if (timer) clearTimeout(timer);
        resolve(info);
      };
      this.once('ready', onReady);
    });
  }

  // --- Async iterators (async/await instead of callbacks) ---

  /**
   * Async iterator over incoming messages (not your own). Lets you handle
   * messages with a linear `for await` loop instead of registering callbacks.
   * Messages are buffered between iterations, so none are lost.
   *
   * @example
   * ```ts
   * for await (const ctx of wa.messages()) {
   *   if (ctx.command === 'ping') await ctx.reply('pong');
   * }
   * ```
   */
  messages(options: { signal?: AbortSignal } = {}): AsyncIterableIterator<Context> {
    return eventStream<Context>(this, 'message', { signal: options.signal });
  }

  /** Async iterator over any client event (`'qr'`, `'reaction'`, …). */
  stream<K extends keyof ClientEvents>(
    event: K,
    options: { signal?: AbortSignal } = {},
  ): AsyncIterableIterator<ClientEvents[K][0]> {
    return eventStream<ClientEvents[K][0]>(this, event as string, { signal: options.signal });
  }

  /** Awaits the next occurrence of an event (one-shot promise). */
  next<K extends keyof ClientEvents>(
    event: K,
    options: { signal?: AbortSignal } = {},
  ): Promise<ClientEvents[K][0]> {
    return new Promise((resolve, reject) => {
      const onEvent = (arg: ClientEvents[K][0]): void => {
        cleanup();
        resolve(arg);
      };
      const onAbort = (): void => {
        cleanup();
        reject(new Error('next() aborted'));
      };
      const cleanup = (): void => {
        this.off(event, onEvent as never);
        options.signal?.removeEventListener('abort', onAbort);
      };
      this.on(event, onEvent as never);
      if (options.signal) {
        if (options.signal.aborted) onAbort();
        else options.signal.addEventListener('abort', onAbort, { once: true });
      }
    });
  }

  private async requestPairingCode(phone: string): Promise<void> {
    try {
      const number = phone.replace(/[^0-9]/g, '');
      const code = await this.socket.requestPairingCode(number);
      this.emit('pairing_code', code);
      if (this.options.printQRInTerminal) {
        console.log(`\n🔗 Pairing code: ${code}\n`);
      }
    } catch (err) {
      this.emitError(err);
    }
  }

  private handleConnectionUpdate(update: Partial<ConnectionState>): void {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      const q = new Qr(qr);
      this.emit('qr', q);
      if (this.options.printQRInTerminal && !this.options.pairingCode) q.printToTerminal();
    }

    if (connection === 'open') {
      this.reconnectAttempts = 0;
      const user = this.sock?.user as { id?: string; lid?: string; name?: string } | undefined;
      const jid = user?.id ?? '';
      this.info = {
        jid,
        lid: user?.lid ?? undefined,
        number: jidToNumber(jid) || undefined,
        name: user?.name ?? undefined,
      };
      this.emit('ready', this.info);
    }

    if (connection === 'close') {
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const reconnecting = !this.manualClose && !loggedOut && this.options.autoReconnect;
      this.emit('disconnected', { code, reconnecting });
      if (reconnecting) this.scheduleReconnect();
    }
  }

  /** Schedules a reconnection with exponential backoff and jitter. */
  private scheduleReconnect(): void {
    if (this.reconnectTimer || this.manualClose) return;
    const attempt = this.reconnectAttempts++;
    if (attempt >= this.options.maxReconnectAttempts) {
      this.emitError(new Error(`Giving up reconnection after ${attempt} attempts`));
      return;
    }
    const backoff = Math.min(
      this.options.reconnectMaxDelayMs,
      this.options.reconnectBaseDelayMs * 2 ** attempt,
    );
    const delay = backoff + Math.floor(Math.random() * 250);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = undefined;
      if (this.manualClose) return;
      void this.initialize().catch((err) => this.emitError(err));
    }, delay);
  }

  private async handleMessagesUpsert(upsert: {
    messages: WAMessage[];
    type: 'notify' | 'append';
  }): Promise<void> {
    if (upsert.type !== 'notify') return;

    for (const raw of upsert.messages) {
      if (!raw.message) continue;
      const ctx = new Context(this, new Message(this, raw));
      this.messageHistory?.add(ctx.message);
      this.emit('message_create', ctx);
      if (ctx.fromMe) continue;
      this.emit('message', ctx);
      try {
        await this.runRouter(ctx);
      } catch (err) {
        this.emitError(err);
      }
    }
  }

  // --- Router (middleware + commands) ---

  /** Registers a global middleware (runs for every incoming message). */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /** Registers a handler for one or more commands (`!ping`, `/start`, …). */
  command(name: string | string[], handler: Handler): this {
    const names = (Array.isArray(name) ? name : [name]).map((n) => n.toLowerCase());
    return this.use(async (ctx, next) => {
      if (ctx.command && names.includes(ctx.command)) await handler(ctx);
      else await next();
    });
  }

  /** Registers a handler that fires when the text matches a pattern. */
  hears(trigger: Trigger | Trigger[], handler: Handler): this {
    const triggers = Array.isArray(trigger) ? trigger : [trigger];
    return this.use(async (ctx, next) => {
      const text = ctx.text;
      for (const t of triggers) {
        if (typeof t === 'string') {
          if (text.includes(t)) return void (await handler(ctx));
        } else {
          const match = text.match(t);
          if (match) {
            ctx.match = match;
            return void (await handler(ctx));
          }
        }
      }
      await next();
    });
  }

  private async runRouter(ctx: Context): Promise<void> {
    let lastIndex = -1;
    const dispatch = async (i: number): Promise<void> => {
      if (i <= lastIndex)
        throw new Error('next() was called multiple times in the same middleware');
      lastIndex = i;
      const middleware = this.middlewares[i];
      if (!middleware) return;
      await middleware(ctx, () => dispatch(i + 1));
    };
    await dispatch(0);
  }

  // --- Sending ---

  /**
   * Low-level dispatch: sends through the rate-limit queue if configured,
   * otherwise straight to the socket. Returns the raw Baileys result.
   */
  private dispatch(jid: string, content: AnyMessageContent, options: MiscMessageGenerationOptions) {
    const task = () => this.socket.sendMessage(jid, content, options);
    return this.sendQueue ? this.sendQueue.add(task) : task();
  }

  /** Sends raw Baileys content (or text) to a chat. */
  async send(
    to: string,
    content: string | AnyMessageContent,
    options: MiscMessageGenerationOptions = {},
  ): Promise<Message> {
    const jid = ensureJid(to);
    const payload: AnyMessageContent = typeof content === 'string' ? { text: content } : content;
    const sent = await this.dispatch(jid, payload, options);
    if (!sent) throw new Error('WhatsApp did not return the sent message');
    const message = new Message(this, sent);
    this.messageHistory?.add(message);
    return message;
  }

  sendText(to: string, text: string, options: TextOptions = {}): Promise<Message> {
    const { mentions, ...misc } = options;
    return this.send(to, { text, mentions: mentions?.map(ensureJid) }, misc);
  }

  async sendImage(to: string, source: MediaSource, options: CaptionOptions = {}): Promise<Message> {
    const { caption, mentions, ...misc } = options;
    const image = await resolveMedia(source);
    return this.send(to, { image, caption, mentions: mentions?.map(ensureJid) }, misc);
  }

  async sendVideo(to: string, source: MediaSource, options: CaptionOptions = {}): Promise<Message> {
    const { caption, mentions, ...misc } = options;
    const video = await resolveMedia(source);
    return this.send(to, { video, caption, mentions: mentions?.map(ensureJid) }, misc);
  }

  async sendAudio(to: string, source: MediaSource, options: AudioOptions = {}): Promise<Message> {
    const { ptt, mimetype, ...misc } = options;
    const audio = await resolveMedia(source);
    return this.send(
      to,
      { audio, ptt, mimetype: mimetype ?? (ptt ? 'audio/ogg; codecs=opus' : undefined) },
      misc,
    );
  }

  /** Voice note (audio with `ptt: true`). */
  sendVoice(
    to: string,
    source: MediaSource,
    options: MiscMessageGenerationOptions = {},
  ): Promise<Message> {
    return this.sendAudio(to, source, { ptt: true, ...options });
  }

  async sendDocument(
    to: string,
    source: MediaSource,
    options: DocumentOptions = {},
  ): Promise<Message> {
    const { fileName, mimetype, caption, ...misc } = options;
    const document = await resolveMedia(source);
    return this.send(
      to,
      { document, fileName, mimetype: mimetype ?? 'application/octet-stream', caption },
      misc,
    );
  }

  sendLocation(
    to: string,
    location: LocationInput,
    options?: MiscMessageGenerationOptions,
  ): Promise<Message> {
    return this.send(
      to,
      {
        location: {
          degreesLatitude: location.latitude,
          degreesLongitude: location.longitude,
          name: location.name,
          address: location.address,
        },
      },
      options,
    );
  }

  /**
   * Sends whatever a link points to, auto-detecting the media kind
   * (image/video/audio/document) from the extension or `Content-Type`. Works
   * with any http(s) URL, including S3 public or presigned URLs, or a local path.
   * Pass `type` to skip detection.
   *
   * @example
   * ```ts
   * await wa.sendFromLink('34600112233', 'https://my-bucket.s3.amazonaws.com/report.pdf');
   * await wa.sendFromLink('34600112233', 'https://cdn.example.com/clip.mp4', { caption: 'look' });
   * ```
   */
  async sendFromLink(
    to: string,
    link: string,
    options: SendFromLinkOptions = {},
  ): Promise<Message> {
    const { type, caption, fileName, mimetype, ptt, ...misc } = options;
    const kind = type ?? (await detectMediaKind(link));

    switch (kind) {
      case 'image':
        return this.sendImage(to, link, { caption, ...misc });
      case 'video':
        return this.sendVideo(to, link, { caption, ...misc });
      case 'audio':
        return this.sendAudio(to, link, { ptt, mimetype, ...misc });
      case 'sticker':
        return this.send(to, { sticker: await resolveMedia(link) }, misc);
      case 'document':
      default:
        return this.sendDocument(to, link, {
          fileName: fileName ?? fileNameFromLink(link),
          mimetype,
          caption,
          ...misc,
        });
    }
  }

  /** Reacts to a message with an emoji (empty string to remove the reaction). */
  async react(to: string, key: WAMessageKey, emoji: string): Promise<void> {
    await this.dispatch(ensureJid(to), { react: { text: emoji, key } }, {});
  }

  /** Sends a poll. */
  sendPoll(to: string, poll: PollInput, options?: MiscMessageGenerationOptions): Promise<Message> {
    return this.send(
      to,
      {
        poll: { name: poll.name, values: poll.options, selectableCount: poll.selectableCount ?? 1 },
      },
      options,
    );
  }

  /** Sends a sticker (a WebP image works best). */
  async sendSticker(
    to: string,
    source: MediaSource,
    options?: MiscMessageGenerationOptions,
  ): Promise<Message> {
    return this.send(to, { sticker: await resolveMedia(source) }, options);
  }

  /** Sends one or more contact cards (vCards). */
  sendContact(
    to: string,
    contacts: ContactCard | ContactCard[],
    options?: MiscMessageGenerationOptions,
  ): Promise<Message> {
    const list = Array.isArray(contacts) ? contacts : [contacts];
    return this.send(
      to,
      {
        contacts: {
          displayName: list.length === 1 ? list[0]!.fullName : `${list.length} contacts`,
          contacts: list.map((c) => ({ displayName: c.fullName, vcard: buildVCard(c) })),
        },
      },
      options,
    );
  }

  /** Deletes a message for everyone. */
  async deleteMessage(chatId: string, key: WAMessageKey): Promise<void> {
    await this.dispatch(ensureJid(chatId), { delete: key }, {});
  }

  /** Edits a previously sent (own) message. */
  editMessage(chatId: string, key: WAMessageKey, newText: string): Promise<Message> {
    return this.send(ensureJid(chatId), { text: newText, edit: key });
  }

  /** Forwards a message to another chat. */
  forwardMessage(
    to: string,
    message: WAMessage,
    options?: MiscMessageGenerationOptions,
  ): Promise<Message> {
    return this.send(to, { forward: message }, options);
  }

  // --- Queries / helpers ---

  /** Returns a fluent handle for a chat. */
  chat(id: string, name?: string): Chat {
    return new Chat(this, ensureJid(id), name);
  }

  /**
   * Returns a rich per-user handle: send + persistent state + history + `ask`.
   * `expectedSender` (used by `ctx.conversation`) scopes `ask` to a participant.
   */
  conversation(id: string, expectedSender?: string): Conversation {
    return new Conversation(this, ensureJid(id), expectedSender);
  }

  /** The persistent state for a chat. */
  stateFor(chatId: string): ConversationState {
    return new ConversationState(this.store, ensureJid(chatId));
  }

  /** Recent in-memory message history for a chat. */
  historyFor(chatId: string): Message[] {
    return this.messageHistory?.get(ensureJid(chatId)) ?? [];
  }

  /** Clears message history for one chat, or all chats. */
  clearHistory(chatId?: string): void {
    this.messageHistory?.clear(chatId ? ensureJid(chatId) : undefined);
  }

  /** Is the number registered on WhatsApp? */
  async isRegisteredUser(number: string): Promise<boolean> {
    const results = (await this.socket.onWhatsApp(ensureJid(number))) ?? [];
    return !!results[0]?.exists;
  }

  /** Gets the LID associated with a phone number, if WhatsApp exposes it. */
  async getLid(number: string): Promise<string | undefined> {
    const mapping = (
      this.socket as {
        signalRepository?: {
          lidMapping?: { getLIDForPN?: (pn: string) => Promise<string | undefined> };
        };
      }
    ).signalRepository?.lidMapping;
    if (!mapping?.getLIDForPN) return undefined;
    return (await mapping.getLIDForPN(ensureJid(number))) ?? undefined;
  }

  // --- Presence & profile ---

  /** Own JID once connected. Throws if not connected yet. */
  private ownJid(): string {
    const id = this.socket.user?.id;
    if (!id) throw new Error('Not connected yet');
    return id;
  }

  /** Updates your presence, optionally scoped to a chat. */
  async setPresence(
    state: 'available' | 'unavailable' | 'composing' | 'recording' | 'paused',
    to?: string,
  ): Promise<void> {
    await this.socket.sendPresenceUpdate(state, to ? ensureJid(to) : undefined);
  }

  /** Subscribes to a contact's presence so `'presence'` events start arriving. */
  async subscribeToPresence(jid: string): Promise<void> {
    await this.socket.presenceSubscribe(ensureJid(jid));
  }

  /** Profile picture URL of a chat/contact, or `undefined` if not available. */
  getProfilePictureUrl(jid: string, highRes = false): Promise<string | undefined> {
    return this.socket.profilePictureUrl(ensureJid(jid), highRes ? 'image' : 'preview');
  }

  /** Sets a profile picture (your own by default, or a group you admin). */
  async setProfilePicture(source: MediaSource, jid?: string): Promise<void> {
    const media = await resolveMedia(source);
    await this.socket.updateProfilePicture(jid ? ensureJid(jid) : this.ownJid(), media);
  }

  /** Removes a profile picture (your own by default). */
  async removeProfilePicture(jid?: string): Promise<void> {
    await this.socket.removeProfilePicture(jid ? ensureJid(jid) : this.ownJid());
  }

  /** Updates your display name. */
  async setName(name: string): Promise<void> {
    await this.socket.updateProfileName(name);
  }

  /** Updates your status/about text. */
  async setStatus(status: string): Promise<void> {
    await this.socket.updateProfileStatus(status);
  }

  /** Fetches a contact's status/about text, if visible. */
  async getStatus(jid: string): Promise<string | undefined> {
    const results = await this.socket.fetchStatus(ensureJid(jid));
    return (results?.[0] as { status?: string } | undefined)?.status ?? undefined;
  }

  /** Blocks a contact. */
  async blockUser(jid: string): Promise<void> {
    await this.socket.updateBlockStatus(ensureJid(jid), 'block');
  }

  /** Unblocks a contact. */
  async unblockUser(jid: string): Promise<void> {
    await this.socket.updateBlockStatus(ensureJid(jid), 'unblock');
  }

  /** Returns the list of blocked JIDs. */
  async getBlocklist(): Promise<string[]> {
    const list = await this.socket.fetchBlocklist();
    return list.filter((jid): jid is string => !!jid);
  }

  // --- Conversation flows ---

  /**
   * Waits for the next incoming message that matches `filter` (any message by
   * default). Useful for question→answer flows.
   *
   * @throws if it times out or the signal aborts before a match.
   */
  async waitForMessage(
    filter: (ctx: Context) => boolean = () => true,
    options: { timeoutMs?: number; signal?: AbortSignal } = {},
  ): Promise<Context> {
    const controller = new AbortController();
    let timedOut = false;
    const onAbort = (): void => controller.abort();
    options.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, options.timeoutMs)
      : undefined;

    try {
      for await (const ctx of this.messages({ signal: controller.signal })) {
        if (filter(ctx)) return ctx;
      }
      throw new Error(timedOut ? 'waitForMessage: timed out' : 'waitForMessage: aborted');
    } finally {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', onAbort);
    }
  }

  // --- Groups ---

  /** Returns a fluent handle for a group. */
  group(id: string): Group {
    return new Group(this, ensureJid(id));
  }

  /** Full metadata of a group. */
  getGroupMetadata(jid: string): Promise<GroupMetadata> {
    return this.socket.groupMetadata(ensureJid(jid));
  }

  /** Creates a group with the given subject and participants. */
  createGroup(subject: string, participants: string[]): Promise<GroupMetadata> {
    return this.socket.groupCreate(subject, participants.map(ensureJid));
  }

  /** Updates a group's subject (name). */
  async updateGroupSubject(jid: string, subject: string): Promise<void> {
    await this.socket.groupUpdateSubject(ensureJid(jid), subject);
  }

  /** Updates a group's description. */
  async updateGroupDescription(jid: string, description: string): Promise<void> {
    await this.socket.groupUpdateDescription(ensureJid(jid), description);
  }

  addGroupParticipants(jid: string, participants: string | string[]) {
    return this.updateGroupParticipants(jid, participants, 'add');
  }

  removeGroupParticipants(jid: string, participants: string | string[]) {
    return this.updateGroupParticipants(jid, participants, 'remove');
  }

  promoteGroupParticipants(jid: string, participants: string | string[]) {
    return this.updateGroupParticipants(jid, participants, 'promote');
  }

  demoteGroupParticipants(jid: string, participants: string | string[]) {
    return this.updateGroupParticipants(jid, participants, 'demote');
  }

  private updateGroupParticipants(
    jid: string,
    participants: string | string[],
    action: 'add' | 'remove' | 'promote' | 'demote',
  ) {
    const jids = (Array.isArray(participants) ? participants : [participants]).map(ensureJid);
    return this.socket.groupParticipantsUpdate(ensureJid(jid), jids, action);
  }

  /** Leaves a group. */
  async leaveGroup(jid: string): Promise<void> {
    await this.socket.groupLeave(ensureJid(jid));
  }

  /** Current invite link of a group (`https://chat.whatsapp.com/…`). */
  async getGroupInviteLink(jid: string): Promise<string> {
    const code = await this.socket.groupInviteCode(ensureJid(jid));
    return `https://chat.whatsapp.com/${code ?? ''}`;
  }

  /** Revokes a group's invite link and returns the new one. */
  async revokeGroupInviteLink(jid: string): Promise<string> {
    const code = await this.socket.groupRevokeInvite(ensureJid(jid));
    return `https://chat.whatsapp.com/${code ?? ''}`;
  }

  /** Joins a group via an invite link or code. Returns the group JID. */
  joinGroupViaLink(linkOrCode: string): Promise<string | undefined> {
    const code = linkOrCode.replace(/^https?:\/\/chat\.whatsapp\.com\//, '').trim();
    return this.socket.groupAcceptInvite(code);
  }

  // --- Shutdown ---

  /** Logs out of WhatsApp and deletes the local credentials. */
  async logout(): Promise<void> {
    this.stopReconnecting();
    try {
      await this.sock?.logout();
    } finally {
      await this.options.authStrategy.clear?.();
      this.sock = undefined;
    }
  }

  /** Closes the connection without unlinking the device. */
  async destroy(): Promise<void> {
    this.stopReconnecting();
    this.sock?.end(undefined);
    this.sock = undefined;
  }

  private stopReconnecting(): void {
    this.manualClose = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }

  /**
   * Emits an `'error'` event, but only if there is a listener. Node crashes the
   * process on an unhandled `'error'` event, so without a listener the error is
   * routed to the logger instead.
   */
  private emitError(err: unknown): void {
    const error = err instanceof Error ? err : new Error(String(err));
    if (this.listenerCount('error') > 0) this.emit('error', error);
    else
      this.options.logger.error({ err: error }, 'whatsweb: unhandled error (no "error" listener)');
  }

  // --- Typed EventEmitter overloads ---

  override on<K extends keyof ClientEvents>(
    event: K,
    listener: (...args: ClientEvents[K]) => void,
  ): this {
    return super.on(event, listener as (...args: unknown[]) => void);
  }

  override once<K extends keyof ClientEvents>(
    event: K,
    listener: (...args: ClientEvents[K]) => void,
  ): this {
    return super.once(event, listener as (...args: unknown[]) => void);
  }

  override off<K extends keyof ClientEvents>(
    event: K,
    listener: (...args: ClientEvents[K]) => void,
  ): this {
    return super.off(event, listener as (...args: unknown[]) => void);
  }

  override emit<K extends keyof ClientEvents>(event: K, ...args: ClientEvents[K]): boolean {
    return super.emit(event, ...args);
  }
}

/** Creates a WhatsApp client. Sugar over `new Client(options)`. */
export function createClient(options?: ClientOptions): Client {
  return new Client(options);
}
