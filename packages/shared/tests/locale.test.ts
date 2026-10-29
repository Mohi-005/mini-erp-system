import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeDigits, isDecimalInput, dhakaDate } from '../src/index.ts';
import { translations } from '../src/translations.ts';
test('mixed Bangla and Latin input preserves decimal precision as text', () => {
  assert.equal(normalizeDigits('১২3.৪৫০'), '123.450');
  assert.equal(isDecimalInput('১২3.৪৫০'), true);
  for (const input of ['1e3', '১২.৩.৪', '<script>', '', 'Infinity'])
    assert.equal(isDecimalInput(input), false);
});
test('Dhaka calendar date is independent of host timezone at UTC rollover', () => {
  assert.equal(
    dhakaDate(new Date('2026-10-16T18:01:00Z'), 'en'),
    '17 October 2026',
  );
  assert.equal(
    dhakaDate(new Date('2026-10-16T17:59:00Z'), 'en'),
    '16 October 2026',
  );
});
test('both locales cover the same interface text', () => {
  assert.deepEqual(
    Object.keys(translations.bn).sort(),
    Object.keys(translations.en).sort(),
  );
});
