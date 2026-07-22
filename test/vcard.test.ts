import assert from 'node:assert/strict';
import { test } from 'node:test';
import { buildVCard } from '../src/util/vcard.js';

test('buildVCard builds a valid card', () => {
  const vcard = buildVCard({ fullName: 'Ada Lovelace', phone: '+34 600 11 22 33' });
  assert.match(vcard, /BEGIN:VCARD/);
  assert.match(vcard, /END:VCARD/);
  assert.match(vcard, /FN:Ada Lovelace/);
  assert.match(vcard, /waid=34600112233:\+34600112233/);
  assert.ok(!vcard.includes('ORG:'));
});

test('buildVCard includes the organization when present', () => {
  const vcard = buildVCard({ fullName: 'X', phone: '111', organization: 'ACME' });
  assert.match(vcard, /ORG:ACME/);
});
