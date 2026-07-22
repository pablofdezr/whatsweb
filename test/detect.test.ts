import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fileNameFromLink, kindFromExtension, kindFromMime } from '../src/media/detect.js';

test('kindFromExtension handles query strings, case and fragments', () => {
  assert.equal(
    kindFromExtension('https://b.s3.amazonaws.com/report.pdf?X-Amz-Signature=x'),
    'document',
  );
  assert.equal(kindFromExtension('https://x/clip.MP4'), 'video');
  assert.equal(kindFromExtension('./a/b/cat.jpeg#frag'), 'image');
  assert.equal(kindFromExtension('note.ogg'), 'audio');
  assert.equal(kindFromExtension('https://x/noext'), undefined);
});

test('kindFromMime maps mime types', () => {
  assert.equal(kindFromMime('image/png'), 'image');
  assert.equal(kindFromMime('video/mp4'), 'video');
  assert.equal(kindFromMime('audio/ogg'), 'audio');
  assert.equal(kindFromMime('application/pdf'), 'document');
  assert.equal(kindFromMime(''), undefined);
});

test('fileNameFromLink extracts the file name', () => {
  assert.equal(fileNameFromLink('https://b/x/report.pdf?sig=1'), 'report.pdf');
  assert.equal(fileNameFromLink('https://x/download?id=5'), 'file');
});
