export type ValidationIssue =
  'required' | 'too_long' | 'invalid_uuid' | 'invalid_decimal';

export type ValidationResult<T> =
  | { valid: true; value: T; errors: Record<string, never> }
  | { valid: false; errors: Record<string, ValidationIssue> };

export type NamedMasterDraftInput = {
  name_bn: string;
  name_en: string;
};

export type NamedMasterDraft = {
  name_bn: string;
  name_en: string | null;
};

export type PartyDraftInput = {
  name: string;
  phone: string;
  address: string;
  notes: string;
};

export type PartyDraft = {
  name: string;
  phone: string | null;
  address: string | null;
  notes: string | null;
};

export type ProductDraftInput = {
  name_bn: string;
  name_en: string;
  sku: string;
  category_id: string;
  unit_id: string;
  preferred_supplier_id: string;
  default_selling_price: string;
  minimum_stock: string;
};

export type ProductDraft = {
  name_bn: string;
  name_en: string | null;
  sku: string | null;
  category_id: string | null;
  unit_id: string;
  preferred_supplier_id: string | null;
  default_selling_price: string;
  minimum_stock: string | null;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const BENGALI_DIGITS =
  '\u09e6\u09e7\u09e8\u09e9\u09ea\u09eb\u09ec\u09ed\u09ee\u09ef';
const MAX_DECIMAL_INPUT_LENGTH = 60;

/** Normalize Bangla digits without converting decimal strings to JS Number. */
export function normalizeMasterDataDigits(input: string): string {
  return input.replace(/[\u09e6-\u09ef]/g, (digit) =>
    String(BENGALI_DIGITS.indexOf(digit)),
  );
}

/**
 * Return a normalized non-negative decimal string, or null when invalid.
 * This does not impose financial scale/rounding rules while those decisions
 * remain unapproved, and never uses parseFloat/Number for monetary input.
 */
export function normalizeNonNegativeDecimal(input: string): string | null {
  const value = normalizeMasterDataDigits(input).trim();
  if (!value || value.length > MAX_DECIMAL_INPUT_LENGTH) return null;
  if (!/^(?:\d+(?:\.\d+)?|\.\d+)$/.test(value)) return null;

  const [integerPart, fractionalPart] = value.split('.');
  const integer = (integerPart || '0').replace(/^0+(?=\d)/, '');

  return fractionalPart === undefined
    ? integer
    : `${integer}.${fractionalPart}`;
}

function requiredText(
  input: string,
  maxLength: number,
): { value: string | null; issue?: ValidationIssue } {
  const value = input.trim();

  if (!value) return { value: null, issue: 'required' };
  if (value.length > maxLength) return { value: null, issue: 'too_long' };

  return { value };
}

function optionalText(
  input: string,
  maxLength: number,
): { value: string | null; issue?: ValidationIssue } {
  const value = input.trim();

  if (!value) return { value: null };
  if (value.length > maxLength) return { value: null, issue: 'too_long' };

  return { value };
}

function optionalUuid(input: string): {
  value: string | null;
  issue?: ValidationIssue;
} {
  const value = input.trim();

  if (!value) return { value: null };
  if (!UUID_PATTERN.test(value)) return { value: null, issue: 'invalid_uuid' };

  return { value };
}

function decimalField(
  input: string,
  required: boolean,
): { value: string | null; issue?: ValidationIssue } {
  const raw = normalizeMasterDataDigits(input).trim();

  if (!raw) {
    return required ? { value: null, issue: 'required' } : { value: null };
  }

  const value = normalizeNonNegativeDecimal(raw);

  if (value === null) return { value: null, issue: 'invalid_decimal' };

  return { value };
}

function finish<T>(
  value: T,
  errors: Record<string, ValidationIssue>,
): ValidationResult<T> {
  if (Object.keys(errors).length > 0) return { valid: false, errors };

  return { valid: true, value, errors: {} };
}

function validateLocalizedNamedDraft(
  input: NamedMasterDraftInput,
  maxLength: number,
): ValidationResult<NamedMasterDraft> {
  const errors: Record<string, ValidationIssue> = {};
  const nameBn = requiredText(input.name_bn, maxLength);
  const nameEn = optionalText(input.name_en, maxLength);

  if (nameBn.issue) errors.name_bn = nameBn.issue;
  if (nameEn.issue) errors.name_en = nameEn.issue;

  return finish(
    {
      name_bn: nameBn.value ?? '',
      name_en: nameEn.value,
    },
    errors,
  );
}

export function validateNamedMasterDraft(
  input: NamedMasterDraftInput,
): ValidationResult<NamedMasterDraft> {
  return validateLocalizedNamedDraft(input, 100);
}

export function validateCategoryDraft(
  input: NamedMasterDraftInput,
): ValidationResult<NamedMasterDraft> {
  return validateLocalizedNamedDraft(input, 100);
}

export function validateUnitDraft(
  input: NamedMasterDraftInput,
): ValidationResult<NamedMasterDraft> {
  return validateLocalizedNamedDraft(input, 60);
}

export function validatePartyDraft(
  input: PartyDraftInput,
): ValidationResult<PartyDraft> {
  const errors: Record<string, ValidationIssue> = {};
  const name = requiredText(input.name, 160);
  const phone = optionalText(input.phone, 30);
  const address = optionalText(input.address, 500);
  const notes = optionalText(input.notes, 2000);

  if (name.issue) errors.name = name.issue;
  if (phone.issue) errors.phone = phone.issue;
  if (address.issue) errors.address = address.issue;
  if (notes.issue) errors.notes = notes.issue;

  return finish(
    {
      name: name.value ?? '',
      phone: phone.value,
      address: address.value,
      notes: notes.value,
    },
    errors,
  );
}

export const validateCustomerDraft = validatePartyDraft;
export const validateSupplierDraft = validatePartyDraft;

export function validateProductDraft(
  input: ProductDraftInput,
): ValidationResult<ProductDraft> {
  const errors: Record<string, ValidationIssue> = {};
  const nameBn = requiredText(input.name_bn, 160);
  const nameEn = optionalText(input.name_en, 160);
  const sku = optionalText(input.sku, 60);
  const category = optionalUuid(input.category_id);
  const unit = requiredText(input.unit_id, 36);
  const supplier = optionalUuid(input.preferred_supplier_id);
  const sellingPrice = decimalField(input.default_selling_price, true);
  const minimumStock = decimalField(input.minimum_stock, false);

  if (nameBn.issue) errors.name_bn = nameBn.issue;
  if (nameEn.issue) errors.name_en = nameEn.issue;
  if (sku.issue) errors.sku = sku.issue;
  if (category.issue) errors.category_id = category.issue;

  if (unit.issue) {
    errors.unit_id = unit.issue;
  } else if (unit.value && unit.value.length !== 36) {
    errors.unit_id = 'invalid_uuid';
  } else if (unit.value && !UUID_PATTERN.test(unit.value)) {
    errors.unit_id = 'invalid_uuid';
  }

  if (supplier.issue) errors.preferred_supplier_id = supplier.issue;
  if (sellingPrice.issue) errors.default_selling_price = sellingPrice.issue;
  if (minimumStock.issue) errors.minimum_stock = minimumStock.issue;

  return finish(
    {
      name_bn: nameBn.value ?? '',
      name_en: nameEn.value,
      sku: sku.value,
      category_id: category.value,
      unit_id: unit.value ?? '',
      preferred_supplier_id: supplier.value,
      default_selling_price: sellingPrice.value ?? '',
      minimum_stock: minimumStock.value,
    },
    errors,
  );
}
