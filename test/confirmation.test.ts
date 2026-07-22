import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseConfirmation } from '../src/util/confirmation.js';

test('parseConfirmation recognizes affirmatives', () => {
  for (const yes of ['yes', 'Y', ' Sí! ', 'ok', 'claro', '👍', 'CONFIRM']) {
    assert.equal(parseConfirmation(yes), true, yes);
  }
});

test('parseConfirmation recognizes negatives', () => {
  for (const no of ['no', 'N', 'nope', 'cancelar', '👎']) {
    assert.equal(parseConfirmation(no), false, no);
  }
});

test('parseConfirmation returns undefined for unclear answers', () => {
  assert.equal(parseConfirmation('maybe'), undefined);
  assert.equal(parseConfirmation('later'), undefined);
});

test('parseConfirmation honors custom answer lists', () => {
  assert.equal(parseConfirmation('accept', { yes: ['accept'], no: ['reject'] }), true);
  assert.equal(parseConfirmation('reject', { yes: ['accept'], no: ['reject'] }), false);
  assert.equal(parseConfirmation('yes', { yes: ['accept'] }), undefined);
});
