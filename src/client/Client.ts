import { EventEmitter } from 'node:events';
import makeWASocket, {
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
  normalizeMessageContent,
  proto,
  type AnyMessageContent,
  type ConnectionState,
  type GroupMetadata,
  type MiscMessageGenerationOptions,
  type WAMessage,
  type WAMessageKey,
  type WASocket,
} from 'baileys';
import { LocalAuth } from '../auth/LocalAuth.js';
import { isAllowed, type Authorizer, type SenderIdentity } from '../auth/authorize.js';
import { mediaToBuffer, toOggOpus } from '../media/convert.js';
import { detectMediaKind, fileNameFromLink } from '../media/detect.js';
import { detectMime, isOggOpus } from '../media/mime.js';
import { resolveMedia, type MediaSource, type ResolvedMedia } from '../media/resolve.js';
import { Qr } from '../qr/Qr.js';
import { Context } from '../router/Context.js';
import type { Handler, Middleware, Trigger } from '../router/types.js';
import { ConversationState } from '../state/ConversationState.js';
import { MemoryStore, type StateStore } from '../state/StateStore.js';
import { Chat } from '../structures/Chat.js';
import { Conversation } from '../structures/Conversation.js';
import { Group } from '../structures/Group.js';
import { History } from '../structures/History.js';
import { Message, parseSerializedMessage } from '../structures/Message.js';
import { isControlMessage } from '../util/content.js';
import { eventStream } from '../util/eventStream.js';
import { ensureJid, jidToNumber } from '../util/jid.js';
import { silentLogger } from '../util/logger.js';
import { KeyedQueue, RateLimitedQueue } from '../util/queue.js';
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
  clearSessionOnLogout: boolean;
  logger: import('../util/logger.js').Logger;
  authorize?: Authorizer;
  transcribe?: ClientOptions['transcribe'];
  concurrency: 'per-chat' | 'parallel';
  ffmpegPath?: string;
}

/** The file name or link of a media source, used to guess its type and name. */
function sourceName(source: MediaSource): string | undefined {
  if (typeof source === 'string') return source;
  if (typeof source === 'object' && source !== null) {
    if ('url' in source && typeof source.url === 'string') return source.url;
    if ('path' in source && typeof source.path === 'string') return source.path;
  }
  return undefined;
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
/** How long each QR ref lives while linking by pairing code: the time to type the code (Baileys: 60 s, then 20 s). */
const PAIRING_REF_MS = 3 * 60_000;

export class Client extends EventEmitter {
  private readonly options: NormalizedOptions;
  private readonly prefixes: string[];
  private readonly middlewares: Middleware[] = [];

  private sock?: WASocket;
  private reconnectAttempts = 0;
  private reconnectTimer?: ReturnType<typeof setTimeout>;
  private manualClose = false;
  private connected = false;
  /** Sockets whose session ended: they must not write credentials any more. */
  private readonly discardedSockets = new WeakSet<WASocket>();
  private readonly sendQueue?: RateLimitedQueue;
  private readonly store: StateStore;
  private readonly messageHistory?: History;
  /** Receives messages in order per chat: authorize, transcribe, hand to waiters. */
  private readonly intake = new KeyedQueue();
  /** Runs handlers one message at a time per chat (`concurrency: 'per-chat'`). */
  private readonly handlers = new KeyedQueue();
  /** Handlers still running, so `whenIdle()` can wait for them. */
  private readonly inflight = new Set<Promise<void>>();
  /** Internal channel for `waitForMessage`/`ask`, which must not wait behind handlers. */
  private readonly inbox = new EventEmitter().setMaxListeners(0);

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
      clearSessionOnLogout: options.clearSessionOnLogout ?? true,
      logger: options.logger ?? silentLogger,
      authorize: options.authorize,
      transcribe: options.transcribe,
      concurrency: options.concurrency ?? 'per-chat',
      ffmpegPath: options.ffmpegPath,
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
    // Calling start() again replaces the previous socket instead of running two at once.
    // Detach it first so its close event doesn't trigger a reconnection.
    const previous = this.sock;
    this.sock = undefined;
    previous?.end(undefined);
    const { state, saveCreds } = await this.options.authStrategy.getAuthState();
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      auth: state,
      logger: this.options.logger as never,
      // Phone-number pairing rejects companion platforms whose browser name
      // isn't a recognized browser (Chrome, Firefox, Safari, Edge, Opera), so
      // a custom deviceName can only be used with the QR flow.
      browser: this.options.pairingCode
        ? Browsers.ubuntu('Chrome')
        : Browsers.ubuntu(this.options.deviceName),
      markOnlineOnConnect: this.options.markOnlineOnConnect,
      // While linking by pairing code, the connection lives as long as WhatsApp's QR refs do
      // (60 s, then 20 s each): when they run out it closes, and the reconnection asks for a
      // new code, so the one being typed stops working. Longer refs give time to type it.
      ...(this.options.pairingCode && !state.creds.registered ? { qrTimeout: PAIRING_REF_MS } : {}),
    });

    this.sock = sock;
    // Ignore late events from a socket that has since been replaced or destroyed,
    // so they can't schedule a duplicate reconnection or emit stale messages.
    const isCurrent = (): boolean => this.sock === sock;
    sock.ev.on('creds.update', () => {
      if (!this.discardedSockets.has(sock)) void saveCreds();
    });
    sock.ev.on('connection.update', (u) => {
      if (isCurrent()) this.handleConnectionUpdate(u);
    });
    sock.ev.on('messages.upsert', (u) => {
      if (isCurrent()) void this.handleMessagesUpsert(u);
    });
    sock.ev.on('messages.reaction', (reactions) => {
      if (!isCurrent()) return;
      for (const r of reactions) {
        this.emit('reaction', { emoji: r.reaction.text ?? '', key: r.key, fromMe: !!r.key.fromMe });
      }
    });
    sock.ev.on('presence.update', (update) => {
      if (isCurrent()) this.emit('presence', update);
    });

    // Login via pairing code (no QR).
    if (this.options.pairingCode && !state.creds.registered) {
      setTimeout(() => {
        if (isCurrent()) void this.requestPairingCode(this.options.pairingCode!);
      }, 3000);
    }
  }

  /** Waits until the connection is ready. */
  waitUntilReady(timeoutMs?: number): Promise<ClientInfo> {
    if (this.connected && this.info) return Promise.resolve(this.info);
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
      this.connected = true;
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
      this.connected = false;
      const code = (lastDisconnect?.error as { output?: { statusCode?: number } } | undefined)
        ?.output?.statusCode;
      const loggedOut = code === DisconnectReason.loggedOut;
      const reconnecting = !this.manualClose && !loggedOut && this.options.autoReconnect;
      this.emit('disconnected', { code, reconnecting });
      if (loggedOut && !this.manualClose) void this.handleLoggedOut();
      else if (reconnecting) this.scheduleReconnect();
    }
  }

  /**
   * WhatsApp ended the session from its side. The credentials are no longer
   * valid, so they are deleted (unless disabled) to let the next `start()` link
   * the device again instead of failing on every attempt.
   */
  private async handleLoggedOut(): Promise<void> {
    if (this.sock) this.discardedSockets.add(this.sock);
    this.sock = undefined;
    this.info = undefined;
    try {
      if (this.options.clearSessionOnLogout) await this.options.authStrategy.clear?.();
    } catch (err) {
      this.emitError(err);
    }
    this.emit('logged_out');
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

    const received: Promise<void>[] = [];
    for (const raw of upsert.messages) {
      if (!raw.message) continue;
      const protocol = normalizeMessageContent(raw.message)?.protocolMessage;
      if (protocol) {
        this.handleProtocolMessage(raw, protocol, true);
        continue;
      }
      // Reactions arrive through the 'reaction' event; poll votes, pins and the
      // like carry no text. None of them should reach handlers as a message.
      if (isControlMessage(raw.message)) continue;
      const ctx = new Context(this, new Message(this, raw));
      received.push(this.intake.run(ctx.chatId, () => this.receive(ctx)));
    }
    await Promise.all(received);
  }

  /**
   * First stage, in order per chat: authorize the sender, transcribe audio,
   * record the message and hand it to `ask()` waiters. Then it schedules the
   * handlers without waiting for them, so a handler blocked in `ask()` can
   * still receive the answer.
   */
  private async receive(ctx: Context): Promise<void> {
    try {
      if (!ctx.fromMe) {
        if (this.options.authorize) {
          const identity = await this.resolveIdentity(ctx.message);
          let principal: unknown;
          try {
            principal = await this.options.authorize(identity, ctx.message);
          } catch (err) {
            // Fail closed: if the check can't run, the message is rejected.
            this.emitError(err);
            principal = null;
          }
          if (!isAllowed(principal)) {
            this.emit('unauthorized', { identity, ctx });
            return;
          }
          ctx.identity = identity;
          ctx.principal = principal as Context['principal'];
        }
        await this.transcribeAudio(ctx.message);
      }

      this.messageHistory?.add(ctx.message);
      this.emit('message_create', ctx);
      if (ctx.fromMe) return;

      this.inbox.emit('message', ctx);
      const run = () => this.handle(ctx);
      const handling =
        this.options.concurrency === 'per-chat' ? this.handlers.run(ctx.chatId, run) : run();
      this.inflight.add(handling);
      void handling.finally(() => this.inflight.delete(handling));
    } catch (err) {
      this.emitError(err);
    }
  }

  /** Second stage: `message` listeners and the router, unless `ask()` took the message. */
  private async handle(ctx: Context): Promise<void> {
    if (ctx.consumed) return;
    try {
      // Awaited, so async listeners also run one message at a time per chat.
      await Promise.all(
        // rawListeners, so `once` listeners are removed after they run.
        this.rawListeners('message').map((listener) => (listener as (c: Context) => unknown)(ctx)),
      );
      await this.runRouter(ctx);
    } catch (err) {
      this.emitError(err);
    }
  }

  private async transcribeAudio(message: Message): Promise<void> {
    if (!this.options.transcribe || message.media?.kind !== 'audio') return;
    try {
      const audio = await message.downloadAttachment();
      message.transcript = (await this.options.transcribe(audio, message)) || undefined;
    } catch (err) {
      this.emitError(err);
    }
  }

  /**
   * Waits until every message received so far has been handled. Call it
   * before `destroy()` for a graceful shutdown.
   */
  async whenIdle(): Promise<void> {
    while (this.inflight.size > 0 || this.intake.size > 0) {
      await Promise.all([...this.inflight]);
      await new Promise((resolve) => setImmediate(resolve));
    }
  }

  /**
   * Who sent a message, with the phone number resolved from the LID when
   * WhatsApp hides it. This is what the `authorize` function receives.
   */
  async resolveIdentity(message: Message): Promise<SenderIdentity> {
    const sender = message.sender;
    let phone = sender.number;
    const lid = sender.lid;
    if (!phone && lid) {
      const pn = await this.getPhoneForLid(lid).catch(() => undefined);
      if (pn) phone = jidToNumber(pn);
    }
    return {
      jid: sender.id,
      phone,
      lid,
      chatId: message.chatId,
      isGroup: message.isGroup,
      name: sender.name,
    };
  }

  /** Phone-number JID for a LID, when WhatsApp has shared the mapping. */
  async getPhoneForLid(lid: string): Promise<string | undefined> {
    const mapping = (
      this.sock as
        | {
            signalRepository?: {
              lidMapping?: { getPNForLID?: (lid: string) => Promise<string | null> };
            };
          }
        | undefined
    )?.signalRepository?.lidMapping;
    if (!mapping?.getPNForLID) return undefined;
    return (await mapping.getPNForLID(lid)) ?? undefined;
  }

  /**
   * Rebuilds a message saved with `serializeMessage()` (e.g. from your
   * database), so you can download its file, quote it or forward it later.
   */
  restoreMessage(saved: string | WAMessage): Message {
    return new Message(this, typeof saved === 'string' ? parseSerializedMessage(saved) : saved);
  }

  /** Applies an edit or a delete-for-everyone to the history and emits its event. */
  private handleProtocolMessage(
    raw: WAMessage,
    protocol: proto.Message.IProtocolMessage,
    emit: boolean,
  ): void {
    const chatId = raw.key.remoteJid ?? '';
    const id = protocol.key?.id ?? '';
    if (!chatId || !id) return;
    const fromMe = !!raw.key.fromMe;
    const { Type } = proto.Message.ProtocolMessage;

    if (protocol.type === Type.REVOKE) {
      this.messageHistory?.remove(chatId, id);
      if (emit) this.emit('message_delete', { chatId, id, fromMe });
    } else if (protocol.type === Type.MESSAGE_EDIT && protocol.editedMessage) {
      const message = new Message(this, {
        ...raw,
        key: { ...raw.key, id },
        message: protocol.editedMessage,
      });
      this.messageHistory?.replace(message);
      if (emit) this.emit('message_edit', { chatId, id, fromMe, message });
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
    // Your own edits and deletes update the history instead of being added to it.
    const protocol = normalizeMessageContent(sent.message)?.protocolMessage;
    if (protocol) this.handleProtocolMessage(sent, protocol, true);
    else if (!isControlMessage(sent.message)) {
      this.messageHistory?.add(message);
      this.emit('message_create', new Context(this, message));
    }
    return message;
  }

  sendText(to: string, text: string, options: TextOptions = {}): Promise<Message> {
    const { mentions, ...misc } = options;
    return this.send(to, { text, mentions: mentions?.map(ensureJid) }, misc);
  }

  /** The real MIME type of a file, from its bytes or else its name. */
  private mimeOf(source: MediaSource, media: ResolvedMedia): string | undefined {
    return detectMime({
      data: Buffer.isBuffer(media) ? media : undefined,
      name: sourceName(source),
    });
  }

  async sendImage(to: string, source: MediaSource, options: CaptionOptions = {}): Promise<Message> {
    const { caption, mentions, ...misc } = options;
    const image = await resolveMedia(source);
    const mime = this.mimeOf(source, image);
    return this.send(
      to,
      {
        image,
        caption,
        mentions: mentions?.map(ensureJid),
        mimetype: mime?.startsWith('image/') ? mime : undefined,
      },
      misc,
    );
  }

  async sendVideo(to: string, source: MediaSource, options: CaptionOptions = {}): Promise<Message> {
    const { caption, mentions, ...misc } = options;
    const video = await resolveMedia(source);
    const mime = this.mimeOf(source, video);
    return this.send(
      to,
      {
        video,
        caption,
        mentions: mentions?.map(ensureJid),
        mimetype: mime?.startsWith('video/') ? mime : undefined,
      },
      misc,
    );
  }

  /**
   * Sends an audio file. With `ptt: true` it is sent as a voice note, and audio
   * that isn't OGG/Opus (MP3, WAV, M4A, text-to-speech output…) is converted
   * first, since WhatsApp only plays that format as a voice note. Conversion
   * needs `ffmpeg`.
   */
  async sendAudio(to: string, source: MediaSource, options: AudioOptions = {}): Promise<Message> {
    const { ptt, mimetype, ...misc } = options;
    const resolved = await resolveMedia(source);
    if (ptt) {
      const data = await mediaToBuffer(resolved);
      const audio = isOggOpus(data)
        ? data
        : await toOggOpus(data, { ffmpegPath: this.options.ffmpegPath });
      return this.send(to, { audio, ptt: true, mimetype: 'audio/ogg; codecs=opus' }, misc);
    }
    const detected = this.mimeOf(source, resolved);
    return this.send(
      to,
      {
        audio: resolved,
        mimetype: mimetype ?? (detected?.startsWith('audio/') ? detected : undefined),
      },
      misc,
    );
  }

  /** Voice note (audio with `ptt: true`), converted to OGG/Opus if needed. */
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
    const name = sourceName(source);
    const finalName = fileName ?? (name ? fileNameFromLink(name) : undefined);
    const detected =
      detectMime({ data: Buffer.isBuffer(document) ? document : undefined, name: finalName }) ??
      (name ? detectMime({ name }) : undefined);
    return this.send(
      to,
      {
        document,
        fileName: finalName,
        mimetype: mimetype ?? detected ?? 'application/octet-stream',
        caption,
      },
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
    if (options.signal?.aborted) controller.abort();
    else options.signal?.addEventListener('abort', onAbort, { once: true });
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          controller.abort();
        }, options.timeoutMs)
      : undefined;

    try {
      for await (const ctx of eventStream<Context>(this.inbox, 'message', {
        signal: controller.signal,
      })) {
        if (!ctx.consumed && filter(ctx)) {
          // It is the answer, so handlers won't process it again as a new message.
          ctx.consumed = true;
          return ctx;
        }
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
    const sock = this.sock;
    try {
      await sock?.logout();
    } finally {
      if (sock) this.discardedSockets.add(sock);
      await this.options.authStrategy.clear?.();
      this.connected = false;
      this.info = undefined;
      this.sock = undefined;
    }
  }

  /** Closes the connection without unlinking the device. */
  async destroy(): Promise<void> {
    this.stopReconnecting();
    this.connected = false;
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
