import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ensureJid,
  isGroupJid,
  isLidJid,
  isPnJid,
  isUserJid,
  jidToNumber,
} from '../src/util/jid.js';

test('ensureJid turns a number into a PN jid', () => {
  assert.equal(ensureJid('34600112233'), '34600112233@s.whatsapp.net');
  assert.equal(ensureJid('+34 600 11 22 33'), '34600112233@s.whatsapp.net');
  assert.equal(ensureJid('0034600112233'), '34600112233@s.whatsapp.net');
});

test('ensureJid passes existing jids through', () => {
  assert.equal(ensureJid('120363@g.us'), '120363@g.us');
  assert.equal(ensureJid('123@lid'), '123@lid');
});

test('ensureJid throws when there is no number', () => {
  assert.throws(() => ensureJid('abc'));
});

test('jidToNumber strips server and device suffix', () => {
  assert.equal(jidToNumber('34600112233:12@s.whatsapp.net'), '34600112233');
  assert.equal(jidToNumber('123@lid'), '123');
});

test('jid type predicates', () => {
  assert.ok(isGroupJid('120@g.us'));
  assert.ok(!isGroupJid('34@s.whatsapp.net'));
  assert.ok(isLidJid('1@lid'));
  assert.ok(isPnJid('34@s.whatsapp.net'));
  assert.ok(isUserJid('1@lid'));
  assert.ok(isUserJid('34@s.whatsapp.net'));
  assert.ok(!isUserJid('120@g.us'));
});
