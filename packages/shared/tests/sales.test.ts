import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareDecimalStrings,
  multiplyDecimalStrings,
  sumDecimalStrings,
  validateSalesLineDraft,
} from '../src/sales.ts';

const productId = '71000000-0000-4000-8000-000000000001';

test('sales draft validates product and positive quantity without Number conversion', () => {
  const result = validateSalesLineDraft({
    product_id: productId,
    quantity: '০১.২৫০',
    unit_price: '১২.৪০',
  });

  assert.equal(result.valid, true);
  if (result.valid) {
    assert.equal(result.value.quantity, '1.250');
    assert.equal(result.value.unit_price, '12.40');
  }
});

test('sales draft rejects invalid product IDs, zero quantity, exponent and negative values', () => {
  const badId = validateSalesLineDraft({
    product_id: 'bad-id',
    quantity: '1',
    unit_price: '10',
  });
  assert.equal(badId.valid, false);
  if (!badId.valid) assert.equal(badId.errors.product_id, 'invalid_uuid');

  for (const quantity of ['0', '0.000', '-1', '1e2', 'NaN', 'Infinity']) {
    const invalid = validateSalesLineDraft({
      product_id: productId,
      quantity,
      unit_price: '10',
    });
    assert.equal(invalid.valid, false, `expected ${quantity} to be rejected`);
  }
});

test('sales draft rejects invalid unit price', () => {
  for (const unit_price of ['-1', '1e3', 'NaN', '']) {
    const result = validateSalesLineDraft({
      product_id: productId,
      quantity: '1',
      unit_price,
    });
    assert.equal(result.valid, false, `expected ${unit_price} to be rejected`);
  }
});

test('decimal multiplication is exact and does not apply final currency rounding', () => {
  assert.equal(multiplyDecimalStrings('0.1', '0.2'), '0.02');
  assert.equal(multiplyDecimalStrings('1.250', '12.40'), '15.5');
  assert.equal(multiplyDecimalStrings('2.00', '10'), '20');
});

test('decimal sums are exact for mixed scales', () => {
  assert.equal(sumDecimalStrings(['0.1', '0.02', '1.880']), '2');
  assert.equal(sumDecimalStrings([]), '0');
  assert.equal(sumDecimalStrings(['1.25', 'invalid']), null);
});

test('stock comparison uses decimal-string ordering, not binary floating point', () => {
  assert.equal(compareDecimalStrings('1.2', '1.11'), 1);
  assert.equal(compareDecimalStrings('1.200', '1.2'), 0);
  assert.equal(compareDecimalStrings('0.09', '0.1'), -1);
  assert.equal(compareDecimalStrings('NaN', '1'), null);
});
