import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { WAMessage } from 'baileys';
import {
  createClient,
  parseSerializedMessage,
  serializeMessage,
  toModelMessages,
  describeQuote,
  Message,
} from '../src/index.js';

const CHAT = '34600112233@s.whatsapp.net';

test('toModelMessages includes images and PDFs, and describes other files', () => {
  const image = Buffer.from('img');
  const messages = toModelMessages(
    [
      {
        fromMe: false,
        text: 'what is this?',
        media: { kind: 'image', mimetype: 'image/jpeg', isVoiceNote: false },
        attachment: { data: image, mimetype: 'image/jpeg' },
      },
      { fromMe: true, text: 'A cat.' },
      {
        fromMe: false,
        media: {
          kind: 'document',
          mimetype: 'application/pdf',
          fileName: 'a.pdf',
          isVoiceNote: false,
        },
        attachment: { data: 'https://s3/a.pdf', mimetype: 'application/pdf', fileName: 'a.pdf' },
      },
      {
        fromMe: false,
        media: {
          kind: 'document',
          mimetype: 'application/zip',
          fileName: 'b.zip',
          isVoiceNote: false,
        },
        attachment: { data: Buffer.from('z'), mimetype: 'application/zip' },
      },
      {
        fromMe: false,
        media: { kind: 'audio', mimetype: 'audio/ogg', isVoiceNote: true, seconds: 4 },
        transcript: 'call me later',
      },
    ],
    { systemPrompt: 'Be brief.' },
  );
  assert.deepEqual(messages, [
    { role: 'system', content: 'Be brief.' },
    {
      role: 'user',
      content: [
        { type: 'image', image, mediaType: 'image/jpeg' },
        { type: 'text', text: 'what is this?' },
      ],
    },
    { role: 'assistant', content: 'A cat.' },
    {
      role: 'user',
      content: [
        { type: 'file', data: 'https://s3/a.pdf', mediaType: 'application/pdf', filename: 'a.pdf' },
      ],
    },
    { role: 'user', content: '[document: b.zip]' },
    { role: 'user', content: '[voice note] call me later' },
  ]);
});

test('toModelMessages prefixes sender names in groups', () => {
  const messages = toModelMessages(
    [
      { fromMe: false, text: 'hi', sender: { name: 'Ana' } },
      { fromMe: false, text: 'hello', sender: { phone: '34611' } },
    ],
    { senderNames: true },
  );
  assert.deepEqual(messages, [
    { role: 'user', content: 'Ana: hi' },
    { role: 'user', content: '34611: hello' },
  ]);
});

test('toRecord returns plain data with sender, quote, mentions and media', () => {
  const wa = createClient();
  const raw = {
    key: {
      remoteJid: '120363@g.us',
      fromMe: false,
      id: 'M1',
      participant: '111@lid',
      participantAlt: '34600112233@s.whatsapp.net',
    },
    pushName: 'Ana',
    messageTimestamp: 1_700_000_000,
    message: {
      imageMessage: {
        mimetype: 'image/png',
        caption: 'see @bob',
        contextInfo: {
          stanzaId: 'Q1',
          participant: '222@lid',
          quotedMessage: { conversation: 'send the photo' },
          mentionedJid: ['333@lid'],
        },
      },
    },
  } as unknown as WAMessage;
  const record = new Message(wa, raw).toRecord();
  assert.deepEqual(record, {
    id: 'M1',
    chatId: '120363@g.us',
    fromMe: false,
    isGroup: true,
    sender: { id: '111@lid', phone: '34600112233', lid: '111@lid', name: 'Ana' },
    timestamp: 1_700_000_000,
    type: 'imageMessage',
    text: 'see @bob',
    media: { kind: 'image', mimetype: 'image/png', isVoiceNote: false, caption: 'see @bob' },
    quoted: { id: 'Q1', senderId: '222@lid', text: 'send the photo' },
    mentions: ['333@lid'],
    forwarded: false,
  });
  assert.doesNotThrow(() => JSON.stringify(record));
});

test('serializeMessage keeps binary fields so the message can be restored', () => {
  const wa = createClient();
  const mediaKey = Buffer.from([1, 2, 3, 4]);
  const raw = {
    key: { remoteJid: CHAT, fromMe: false, id: 'S1' },
    message: { imageMessage: { mediaKey, url: 'https://mmg.whatsapp.net/x' } },
  } as unknown as WAMessage;
  const json = serializeMessage(raw);
  const restored = wa.restoreMessage(json);
  assert.equal(restored.id, 'S1');
  assert.ok(Buffer.isBuffer(parseSerializedMessage(json).message?.imageMessage?.mediaKey));
  assert.deepEqual(
    Buffer.from(restored.raw.message!.imageMessage!.mediaKey as Uint8Array),
    mediaKey,
  );
});

test('a reply to a document says which one, and that it was yours', () => {
  const wa = createClient();
  wa.info = {
    jid: '34711287710:3@s.whatsapp.net',
    lid: '47219608658156:3@lid',
    number: '34711287710',
  };
  const raw = {
    key: { remoteJid: CHAT, fromMe: false, id: 'R1' },
    messageTimestamp: 1792665003,
    message: {
      extendedTextMessage: {
        text: 'Esta está cobrada?',
        contextInfo: {
          stanzaId: 'D1',
          participant: '47219608658156@lid',
          quotedMessage: {
            documentMessage: {
              fileName: '2026-0001 Cliente Toggle SL.pdf',
              mimetype: 'application/pdf',
            },
          },
        },
      },
    },
  } as unknown as WAMessage;
  const record = new Message(wa, raw).toRecord();
  assert.equal(record.quoted?.id, 'D1');
  assert.equal(record.quoted?.fromMe, true);
  assert.equal(record.quoted?.text, '');
  assert.equal(record.quoted?.media?.fileName, '2026-0001 Cliente Toggle SL.pdf');

  const [message] = toModelMessages([record]);
  assert.deepEqual(message, {
    role: 'user',
    content:
      '(replying to your message: [document: 2026-0001 Cliente Toggle SL.pdf]) Esta está cobrada?',
  });
  // Your own words, or none.
  assert.deepEqual(
    toModelMessages([record], { describeQuote: (q) => `[re: ${q.media?.fileName}]` })[0],
    { role: 'user', content: '[re: 2026-0001 Cliente Toggle SL.pdf] Esta está cobrada?' },
  );
  assert.deepEqual(toModelMessages([record], { describeQuote: false })[0], {
    role: 'user',
    content: 'Esta está cobrada?',
  });
});

test('describeQuote: text, whose, and long texts shortened', () => {
  assert.equal(
    describeQuote({ text: 'hola', fromMe: false }),
    '(replying to their message: "hola")',
  );
  assert.equal(describeQuote({ text: '' }), '(replying to a message)');
  assert.match(
    describeQuote({ text: 'x'.repeat(500), fromMe: true }),
    /^\(replying to your message: "x{299}…"\)$/,
  );
});
