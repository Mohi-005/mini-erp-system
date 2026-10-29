import assert from 'node:assert/strict';
import test from 'node:test';

import {
  validateOpeningStockDraft,
  validateStockAdjustmentDraft,
} from '../src/inventory.ts';

const productId = '71000000-0000-4000-8000-000000000001';

test('opening stock accepts zero and preserves decimal text', () => {
  const result = validateOpeningStockDraft({
    product_id: productId,
    quantity: '০১২.৫০০',
    note: '  first count  ',
  });

  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.value.quantity, '12.500');
    assert.equal(result.value.note, 'first count');
  }
});

test('opening stock rejects malformed quantity and bad product id', () => {
  const result = validateOpeningStockDraft({
    product_id: 'invalid',
    quantity: '1e3',
    note: '',
  });

  assert.equal(result.valid, false);
  if (!result.valid) {
    assert.equal(result.errors.product_id, 'invalid_uuid');
    assert.equal(result.errors.quantity, 'invalid_decimal');
  }
});

test('opening stock note limit is enforced', () => {
  const result = validateOpeningStockDraft({
    product_id: productId,
    quantity: '0',
    note: 'x'.repeat(501),
  });

  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.errors.note, 'too_long');
});

test('stock adjustment accepts only positive decimal quantities', () => {
  const valid = validateStockAdjustmentDraft({
    product_id: productId,
    direction: 'OUT',
    quantity: '.250',
    reason: 'Damaged stock count correction',
  });
  assert.equal(valid.valid, true);
  if (valid.valid) assert.equal(valid.value.quantity, '0.250');

  const zero = validateStockAdjustmentDraft({
    product_id: productId,
    direction: 'IN',
    quantity: '0.000',
    reason: 'Count adjustment',
  });
  assert.equal(zero.valid, false);
  if (!zero.valid) assert.equal(zero.errors.quantity, 'must_be_positive');
});

test('stock adjustment requires an explicit reason', () => {
  const result = validateStockAdjustmentDraft({
    product_id: productId,
    direction: 'IN',
    quantity: '2',
    reason: '   ',
  });

  assert.equal(result.valid, false);
  if (!result.valid) assert.equal(result.errors.reason, 'reason_required');
});

test('negative, exponent, NaN-like and overlong values are rejected', () => {
  for (const quantity of ['-1', '1e2', 'NaN', 'Infinity', ' '.repeat(61)]) {
    const result = validateOpeningStockDraft({
      product_id: productId,
      quantity,
      note: '',
    });
    assert.equal(result.valid, false, `expected ${quantity} to be rejected`);
  }
});
