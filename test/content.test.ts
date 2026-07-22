import assert from 'node:assert/strict';
import { test } from 'node:test';
import { extractText, getMessageType, messageHasMedia } from '../src/util/content.js';

test('extractText covers common shapes', () => {
  assert.equal(extractText({ conversation: 'hi' }), 'hi');
  assert.equal(extractText({ extendedTextMessage: { text: 'link' } }), 'link');
  assert.equal(extractText({ imageMessage: { caption: 'pic' } }), 'pic');
  assert.equal(extractText({ videoMessage: { caption: 'vid' } }), 'vid');
  assert.equal(extractText(null), '');
  assert.equal(extractText({}), '');
});

test('getMessageType returns the content key', () => {
  assert.equal(getMessageType({ conversation: 'x' }), 'conversation');
  assert.equal(getMessageType({ imageMessage: {} }), 'imageMessage');
  assert.equal(getMessageType(null), undefined);
});

test('messageHasMedia detects downloadable media', () => {
  assert.ok(messageHasMedia({ imageMessage: {} }));
  assert.ok(messageHasMedia({ documentMessage: {} }));
  assert.ok(!messageHasMedia({ conversation: 'x' }));
});
