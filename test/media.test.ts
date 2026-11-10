import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  detectMime,
  getMediaInfo,
  isOggOpus,
  mimeFromBuffer,
  mimeFromName,
  toOggOpus,
} from '../src/index.js';

const bytes = (...values: number[]) => Buffer.from(values);

test('mimeFromBuffer recognizes common formats by their first bytes', () => {
  assert.equal(mimeFromBuffer(bytes(0xff, 0xd8, 0xff, 0xe0)), 'image/jpeg');
  assert.equal(mimeFromBuffer(Buffer.from('\x89PNG\r\n', 'latin1')), 'image/png');
  assert.equal(mimeFromBuffer(Buffer.from('%PDF-1.7')), 'application/pdf');
  assert.equal(mimeFromBuffer(Buffer.from('ID3\x04\x00')), 'audio/mpeg');
  assert.equal(
    mimeFromBuffer(Buffer.from('OggS\x00\x02........OpusHead')),
    'audio/ogg; codecs=opus',
  );
  assert.equal(mimeFromBuffer(Buffer.from('RIFF\x00\x00\x00\x00WAVEfmt ')), 'audio/wav');
  assert.equal(mimeFromBuffer(Buffer.from('\x00\x00\x00\x20ftypM4A ', 'latin1')), 'audio/mp4');
  assert.equal(mimeFromBuffer(Buffer.from('PK\x03\x04')), undefined);
});

test('detectMime falls back to the file name for ZIP-based documents', () => {
  const docx = Buffer.from('PK\x03\x04rest');
  assert.equal(
    detectMime({ data: docx, name: 'contract.docx' }),
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  assert.equal(mimeFromName('https://s3.example.com/a/report.PDF?X-Amz=1'), 'application/pdf');
  assert.equal(mimeFromName('no-extension'), undefined);
});

test('getMediaInfo reads file details, including Long sizes and voice notes', () => {
  const doc = getMediaInfo({
    documentWithCaptionMessage: {
      message: {
        documentMessage: {
          mimetype: 'application/pdf',
          fileName: 'invoice.pdf',
          fileLength: { low: 2048, high: 0, unsigned: true },
          pageCount: 3,
          caption: 'march',
        },
      },
    },
  } as never);
  assert.deepEqual(doc, {
    kind: 'document',
    mimetype: 'application/pdf',
    fileName: 'invoice.pdf',
    size: 2048,
    isVoiceNote: false,
    pageCount: 3,
    caption: 'march',
  });

  const voice = getMediaInfo({ audioMessage: { ptt: true, seconds: 7 } });
  assert.equal(voice?.kind, 'audio');
  assert.equal(voice?.isVoiceNote, true);
  assert.equal(voice?.mimetype, 'audio/ogg; codecs=opus');
  assert.equal(getMediaInfo({ conversation: 'hi' }), undefined);
});

/** A tiny silent 16-bit mono WAV file. */
function silentWav(ms = 200, rate = 8000): Buffer {
  const samples = Math.floor((rate * ms) / 1000);
  const data = samples * 2;
  const wav = Buffer.alloc(44 + data);
  wav.write('RIFF', 0, 'latin1');
  wav.writeUInt32LE(36 + data, 4);
  wav.write('WAVEfmt ', 8, 'latin1');
  wav.writeUInt32LE(16, 16);
  wav.writeUInt16LE(1, 20);
  wav.writeUInt16LE(1, 22);
  wav.writeUInt32LE(rate, 24);
  wav.writeUInt32LE(rate * 2, 28);
  wav.writeUInt16LE(2, 32);
  wav.writeUInt16LE(16, 34);
  wav.write('data', 36, 'latin1');
  wav.writeUInt32LE(data, 40);
  return wav;
}

const hasFfmpeg = spawnSync('ffmpeg', ['-version']).status === 0;

test('toOggOpus converts audio into a WhatsApp voice note', { skip: !hasFfmpeg }, async () => {
  const ogg = await toOggOpus(silentWav());
  assert.ok(isOggOpus(ogg));
});

test('toOggOpus explains a missing ffmpeg', async () => {
  await assert.rejects(
    toOggOpus(silentWav(), { ffmpegPath: 'ffmpeg-does-not-exist' }),
    /ffmpeg was not found/,
  );
});
