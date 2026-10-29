import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeMasterDataDigits,
  normalizeNonNegativeDecimal,
  validateCategoryDraft,
  validateCustomerDraft,
  validateProductDraft,
  validateSupplierDraft,
  validateUnitDraft,
} from '../src/master-data.ts';

const unitId = '30000000-0000-4000-8000-000000000001';
const categoryId = '30000000-0000-4000-8000-000000000002';
const supplierId = '30000000-0000-4000-8000-000000000003';

function productInput() {
  return {
    name_bn: 'চাল',
    name_en: 'Rice',
    sku: '',
    category_id: categoryId,
    unit_id: unitId,
    preferred_supplier_id: supplierId,
    default_selling_price: '৮০.৫০',
    minimum_stock: '২.০০',
  };
}

test('Bangla digits normalize without converting decimal input to Number', () => {
  assert.equal(normalizeMasterDataDigits('১২৩.৪৫'), '123.45');
  assert.equal(normalizeNonNegativeDecimal('০০৮০.৫০'), '80.50');
});

test('decimal normalization rejects negative, exponent, NaN, and overly long input', () => {
  assert.equal(normalizeNonNegativeDecimal('-1.00'), null);
  assert.equal(normalizeNonNegativeDecimal('1e3'), null);
  assert.equal(normalizeNonNegativeDecimal('NaN'), null);
  assert.equal(normalizeNonNegativeDecimal('9'.repeat(61)), null);
  assert.equal(normalizeNonNegativeDecimal('.50'), '0.50');
});

test('product draft normalizes blanks and optional fields', () => {
  const input = productInput();
  input.name_en = '  ';
  input.sku = '  ';
  input.category_id = '';
  input.preferred_supplier_id = '';
  input.minimum_stock = '';

  const result = validateProductDraft(input);

  assert.equal(result.valid, true);
  if (!result.valid) return;

  assert.equal(result.value.name_en, null);
  assert.equal(result.value.sku, null);
  assert.equal(result.value.category_id, null);
  assert.equal(result.value.preferred_supplier_id, null);
  assert.equal(result.value.default_selling_price, '80.50');
  assert.equal(result.value.minimum_stock, null);
});

test('product name, unit ID, and selling price are required', () => {
  const input = productInput();
  input.name_bn = '  ';
  input.unit_id = '';
  input.default_selling_price = '';

  const result = validateProductDraft(input);

  assert.equal(result.valid, false);
  if (result.valid) return;

  assert.equal(result.errors.name_bn, 'required');
  assert.equal(result.errors.unit_id, 'required');
  assert.equal(result.errors.default_selling_price, 'required');
});

test('product draft rejects malformed optional UUIDs and invalid decimals', () => {
  const input = productInput();
  input.category_id = 'not-a-uuid';
  input.preferred_supplier_id = 'not-a-uuid';
  input.default_selling_price = '12.3.4';
  input.minimum_stock = '-2';

  const result = validateProductDraft(input);

  assert.equal(result.valid, false);
  if (result.valid) return;

  assert.equal(result.errors.category_id, 'invalid_uuid');
  assert.equal(result.errors.preferred_supplier_id, 'invalid_uuid');
  assert.equal(result.errors.default_selling_price, 'invalid_decimal');
  assert.equal(result.errors.minimum_stock, 'invalid_decimal');
});

test('product SKU remains optional and is only trimmed, not silently deduplicated', () => {
  const first = validateProductDraft({ ...productInput(), sku: ' SKU-01 ' });
  const second = validateProductDraft({ ...productInput(), sku: 'SKU-01' });

  assert.equal(first.valid, true);
  assert.equal(second.valid, true);

  if (first.valid && second.valid) {
    assert.equal(first.value.sku, 'SKU-01');
    assert.equal(second.value.sku, 'SKU-01');
  }
});

test('category requires a primary name and treats English as optional', () => {
  assert.deepEqual(validateCategoryDraft({ name_bn: ' চাল ', name_en: '' }), {
    valid: true,
    value: { name_bn: 'চাল', name_en: null },
    errors: {},
  });

  const invalid = validateCategoryDraft({ name_bn: ' ', name_en: 'Rice' });

  assert.equal(invalid.valid, false);
  if (!invalid.valid) assert.equal(invalid.errors.name_bn, 'required');
});

test('unit input rejects blank primary label', () => {
  const invalid = validateUnitDraft({ name_bn: '', name_en: 'Kilogram' });

  assert.equal(invalid.valid, false);
  if (!invalid.valid) assert.equal(invalid.errors.name_bn, 'required');
});

test('customer fields trim whitespace and contact fields remain optional', () => {
  assert.deepEqual(
    validateCustomerDraft({
      name: ' Rahim Traders ',
      phone: '',
      address: ' ',
      notes: '',
    }),
    {
      valid: true,
      value: {
        name: 'Rahim Traders',
        phone: null,
        address: null,
        notes: null,
      },
      errors: {},
    },
  );
});

test('supplier phone is optional but length limits are checked', () => {
  const valid = validateSupplierDraft({
    name: 'Supplier A',
    phone: '+880 1700 000000',
    address: '',
    notes: '',
  });

  assert.equal(valid.valid, true);

  const invalid = validateSupplierDraft({
    name: 'Supplier A',
    phone: '1'.repeat(31),
    address: '',
    notes: '',
  });

  assert.equal(invalid.valid, false);
  if (!invalid.valid) assert.equal(invalid.errors.phone, 'too_long');
});
