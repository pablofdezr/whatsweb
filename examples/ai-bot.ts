/**
 * AI agent on WhatsApp, powered by the Vercel AI SDK, for a team whose users
 * belong to organizations with private data.
 *
 * What it shows:
 *   - Only authorized phone numbers can talk to the agent (`authorize`).
 *     Everyone else gets a short "no access" reply and nothing else.
 *   - Every tool checks that the user belongs to the organization whose data
 *     they ask for, so one organization never sees another's records.
 *   - The conversation history lives in your database, not in whatsweb: each
 *     message is saved as a plain record (`toRecord()`) and the model context
 *     is rebuilt from those rows with `toModelMessages()`.
 *   - Photos and PDFs reach the model as files; voice notes are transcribed.
 *   - Messages from the same chat are handled one at a time (the default).
 *
 * The `db` object below stands in for Postgres so the example runs as-is.
 * The comments show the tables it represents.
 *
 * Setup: copy `.env.example` to `.env` (it is git-ignored) and fill in:
 *   AI_GATEWAY_API_KEY      https://vercel.com/docs/ai-gateway
 *   WA_AGENT_PHONE          the agent's number; links with a pairing code
 *                           instead of a QR (leave empty to scan a QR)
 *   WA_AUTHORIZED_NUMBERS   comma-separated numbers allowed to use the agent
 *   AI_MODEL, AI_REASONING, AGENT_INSTRUCTIONS   optional: run your own agent
 *
 * Run:
 *   npm run example:ai
 */
import { generateText, isStepCount, jsonSchema, tool, transcribe } from 'ai';
import {
  createClient,
  serializeMessage,
  toModelMessages,
  type Attachment,
  type Context,
  type MessageRecord,
  type ModelAttachment,
} from '../src/index.js';

// Any model on the AI Gateway; override with AI_MODEL and AI_REASONING.
const MODEL = process.env.AI_MODEL || 'anthropic/claude-opus-4.8';
const REASONING = (process.env.AI_REASONING || undefined) as
  'none' | 'minimal' | 'low' | 'medium' | 'high' | undefined;
// Your own agent's instructions. When set, they replace the demo agent below,
// including its demo tools.
const CUSTOM_INSTRUCTIONS = process.env.AGENT_INSTRUCTIONS?.trim() || undefined;

/** Digits only: `+34 600 11 22 33` -> `34600112233`. */
const digits = (value: string) => value.replace(/\D/g, '');

// Phone numbers come from the environment, so they are never committed.
const AGENT_PHONE = digits(process.env.WA_AGENT_PHONE ?? '') || undefined;
const AUTHORIZED_NUMBERS = (process.env.WA_AUTHORIZED_NUMBERS ?? '')
  .split(',')
  .map(digits)
  .filter(Boolean);
if (AUTHORIZED_NUMBERS.length === 0) {
  console.warn('⚠️  WA_AUTHORIZED_NUMBERS is empty: nobody will be able to use the agent.');
}
// Any speech-to-text model available through the AI Gateway.
const TRANSCRIPTION_MODEL = 'openai/gpt-4o-mini-transcribe';

// --- Your data (Postgres in a real deployment) ---------------------------------

interface User {
  id: string;
  /** Organizations this user belongs to. */
  organizations: string[];
}

// Tell whatsweb what `authorize` returns, so `ctx.principal` is typed as `User`.
declare module '../src/index.js' {
  interface Register {
    principal: User;
  }
}

interface RepoRecord {
  id: string;
  title: string;
  status: string;
}

/** A stored message: the record plus the raw message, to download or quote it later. */
interface MessageRow extends MessageRecord {
  raw: string;
  /** Where you uploaded the file (e.g. S3). Here, kept in memory. */
  attachment?: ModelAttachment;
}

const db = {
  // CREATE TABLE users (id text PRIMARY KEY, name text, phone text UNIQUE NOT NULL);
  // CREATE TABLE memberships (user_id text, organization text, PRIMARY KEY (user_id, organization));
  // Demo: every authorized number belongs to "acme" only, so asking for
  // "globex" data shows the access check refusing it.
  users: new Map<string, User>(
    AUTHORIZED_NUMBERS.map((phone, i) => [phone, { id: `u${i + 1}`, organizations: ['acme'] }]),
  ),

  // CREATE TABLE records (organization text, id text, title text, status text, PRIMARY KEY (organization, id));
  records: new Map<string, RepoRecord[]>([
    ['acme', [{ id: 'A-1', title: 'Q3 budget', status: 'draft' }]],
    ['globex', [{ id: 'G-7', title: 'Supplier contract', status: 'signed' }]],
  ]),

  // CREATE TABLE messages (
  //   chat_id text, id text, from_me boolean, sender_phone text, ts bigint,
  //   text text, transcript text, media jsonb, raw jsonb, attachment_url text,
  //   PRIMARY KEY (chat_id, id)
  // );
  messages: [] as MessageRow[],

  async findUserByPhone(phone: string): Promise<User | null> {
    return this.users.get(phone) ?? null;
  },
  async saveMessage(row: MessageRow): Promise<void> {
    this.messages.push(row);
  },
  async lastMessages(chatId: string, limit: number): Promise<MessageRow[]> {
    return this.messages.filter((m) => m.chatId === chatId).slice(-limit);
  },
};

// --- Tools: every one checks the user's organizations ---------------------------

function toolsFor(user: User) {
  const allowed = (organization: string) => user.organizations.includes(organization);

  return {
    list_records: tool({
      description: "List the records of one of the user's organizations.",
      inputSchema: jsonSchema<{ organization: string }>({
        type: 'object',
        properties: { organization: { type: 'string', enum: user.organizations } },
        required: ['organization'],
      }),
      execute: async ({ organization }) =>
        allowed(organization)
          ? (db.records.get(organization) ?? [])
          : { error: 'You do not have access to this organization.' },
    }),

    update_record_status: tool({
      description: 'Change the status of a record. Confirm with the user before calling it.',
      inputSchema: jsonSchema<{ organization: string; id: string; status: string }>({
        type: 'object',
        properties: {
          organization: { type: 'string', enum: user.organizations },
          id: { type: 'string' },
          status: { type: 'string' },
        },
        required: ['organization', 'id', 'status'],
      }),
      execute: async ({ organization, id, status }) => {
        if (!allowed(organization))
          return { error: 'You do not have access to this organization.' };
        const record = db.records.get(organization)?.find((r) => r.id === id);
        if (!record) return { error: `No record ${id} in ${organization}.` };
        record.status = status;
        return { ok: true, record };
      },
    }),
  };
}

// --- WhatsApp -------------------------------------------------------------------

const wa = createClient({
  session: 'ai-demo',
  deviceName: 'whatsweb-ai',
  pairingCode: AGENT_PHONE,
  // The history is kept in the database, so whatsweb's in-memory copy is off.
  history: false,

  // Only known numbers, and only in private chats: replies in a group would
  // show private data to every member. `phone` is the number WhatsApp reports
  // (resolved from the LID when hidden), never the display name.
  authorize: async ({ phone, isGroup }) =>
    !isGroup && phone ? await db.findUserByPhone(phone) : null,

  // Voice notes arrive as text in `ctx.text`.
  transcribe: async (audio: Attachment) =>
    (await transcribe({ model: TRANSCRIPTION_MODEL, audio: audio.data })).text,
});

const INSTRUCTIONS = (user: User) => `You are the assistant of a team, chatting on WhatsApp.
The user belongs to these organizations: ${user.organizations.join(', ')}.
Only use the tools to read or change data, and only for those organizations.
Ask for confirmation before changing anything.
Keep replies short and conversational: no markdown headers or tables.
Match the language the user writes in.`;

/** Files the model can read directly; the rest are described in text. */
const MODEL_FILE_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

/** One database row per message: the plain record plus the raw message. */
const toRow = (ctx: Context): MessageRow => ({
  ...ctx.message.toRecord(),
  raw: serializeMessage(ctx.message),
});

// Save the agent's own replies (and anything you send from your phone).
// Incoming messages are saved by the handler below, before it reads the history.
wa.on('message_create', (ctx) => {
  if (ctx.fromMe) void db.saveMessage(toRow(ctx));
});

// People without access get one short answer.
wa.on('unauthorized', ({ identity, ctx }) => {
  console.log(`🚫 Rejected message from ${identity.phone ?? identity.jid}`);
  if (!identity.isGroup) void ctx.reply('This number is not authorized to use this assistant.');
});

wa.use(async (ctx: Context) => {
  const user = ctx.principal!; // always set: `authorize` ran first
  const stop = await ctx.typing();

  try {
    // Save the incoming message. Keep its file so the model can see it, now
    // and in later turns: in production, upload it to S3 and store the URL.
    const row = toRow(ctx);
    if (ctx.media && MODEL_FILE_TYPES.includes(ctx.media.mimetype.split(';')[0]!)) {
      row.attachment = await ctx.downloadAttachment();
    }
    await db.saveMessage(row);

    const rows = await db.lastMessages(ctx.chatId, 20);
    const messages = toModelMessages(rows, {
      acceptsMediaType: (type) => MODEL_FILE_TYPES.includes(type),
    });

    const { text } = await generateText({
      model: MODEL,
      instructions: CUSTOM_INSTRUCTIONS ?? INSTRUCTIONS(user),
      reasoning: REASONING,
      messages,
      ...(CUSTOM_INSTRUCTIONS ? {} : { tools: toolsFor(user), stopWhen: isStepCount(5) }),
    });

    await stop();
    if (text) await ctx.reply(text);
  } catch (err) {
    await stop();
    console.error('❌ AI request failed:', err);
    await ctx.reply('Sorry, something went wrong. Please try again.');
  }
});

wa.on('qr', () => {
  if (!AGENT_PHONE) console.log('📲 Scan the QR above with WhatsApp > Linked devices');
});
wa.on('pairing_code', () =>
  console.log(
    '📲 On the agent phone: WhatsApp > Linked devices > Link a device > Link with phone number, and enter the code above',
  ),
);
wa.on('ready', (me) => console.log(`✅ Connected as ${me.number ?? me.jid}`));
wa.on('logged_out', () => void wa.start());
wa.on('error', (err) => console.error('❌', err.message));

process.on('SIGINT', () => {
  // Let in-flight replies finish before closing.
  void wa
    .whenIdle()
    .then(() => wa.destroy())
    .then(() => process.exit(0));
});

await wa.start();
