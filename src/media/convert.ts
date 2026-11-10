import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable } from 'node:stream';
import type { ResolvedMedia } from './resolve.js';

/** Reads any resolved media source (Buffer, `{ url }` or `{ stream }`) into memory. */
export async function mediaToBuffer(media: ResolvedMedia): Promise<Buffer> {
  if (Buffer.isBuffer(media)) return media;
  if ('url' in media) {
    const response = await fetch(media.url);
    if (!response.ok) throw new Error(`Could not download ${media.url}: HTTP ${response.status}`);
    return Buffer.from(await response.arrayBuffer());
  }
  return streamToBuffer(media.stream);
}

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream)
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Converts any audio (MP3, WAV, M4A, the output of a text-to-speech API…) to
 * OGG/Opus, the only format WhatsApp plays as a voice note. Requires `ffmpeg`
 * to be installed (or its path given in `ffmpegPath`).
 */
export async function toOggOpus(
  input: Buffer,
  options: { ffmpegPath?: string } = {},
): Promise<Buffer> {
  // A temp file instead of stdin: some formats (e.g. M4A) need a seekable input.
  const dir = await mkdtemp(join(tmpdir(), 'whatsweb-'));
  const source = join(dir, 'input');
  const target = join(dir, 'output.ogg');
  try {
    await writeFile(source, input);
    await run(options.ffmpegPath ?? 'ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-y',
      '-i',
      source,
      '-vn',
      '-ac',
      '1',
      '-ar',
      '48000',
      '-c:a',
      'libopus',
      '-b:a',
      '32k',
      '-application',
      'voip',
      target,
    ]);
    return await readFile(target);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

function run(command: string, args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ['ignore', 'ignore', 'pipe'] });
    const stderr: Buffer[] = [];
    proc.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
    proc.on('error', (err: NodeJS.ErrnoException) =>
      reject(
        err.code === 'ENOENT'
          ? new Error(
              `ffmpeg was not found ("${command}"). Install it, set the ffmpegPath option, or send OGG/Opus audio.`,
            )
          : err,
      ),
    );
    proc.on('close', (code) =>
      code === 0
        ? resolve()
        : reject(
            new Error(`ffmpeg failed (exit ${code}): ${Buffer.concat(stderr).toString().trim()}`),
          ),
    );
  });
}
