import {
  normalizeNonNegativeDecimal,
  normalizeMasterDataDigits,
} from './master-data.ts';

export type InventoryDirection = 'IN' | 'OUT';

export type InventoryValidationIssue =
  | 'required'
  | 'invalid_uuid'
  | 'invalid_decimal'
  | 'must_be_positive'
  | 'reason_required'
  | 'too_long';

export type InventoryValidationResult<T> =
  | { valid: true; value: T; errors: Record<string, never> }
  | { valid: false; errors: Record<string, InventoryValidationIssue> };

export type OpeningStockDraftInput = {
  product_id: string;
  quantity: string;
  note: string;
};

export type OpeningStockDraft = {
  product_id: string;
  quantity: string;
  note: string | null;
};

export type StockAdjustmentDraftInput = {
  product_id: string;
  direction: InventoryDirection;
  quantity: string;
  reason: string;
};

export type StockAdjustmentDraft = {
  product_id: string;
  direction: InventoryDirection;
  quantity: string;
  reason: string;
};

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function result<T>(
  value: T,
  errors: Record<string, InventoryValidationIssue>,
): InventoryValidationResult<T> {
  return Object.keys(errors).length
    ? { valid: false, errors }
    : { valid: true, value, errors: {} };
}

function normalizedQuantity(input: string): string | null {
  return normalizeNonNegativeDecimal(normalizeMasterDataDigits(input));
}

function positive(quantity: string): boolean {
  return /[1-9]/.test(quantity);
}

export function validateOpeningStockDraft(
  input: OpeningStockDraftInput,
): InventoryValidationResult<OpeningStockDraft> {
  const errors: Record<string, InventoryValidationIssue> = {};
  const productId = input.product_id.trim();
  const quantity = normalizedQuantity(input.quantity);
  const note = input.note.trim();

  if (!productId) errors.product_id = 'required';
  else if (!UUID_PATTERN.test(productId)) errors.product_id = 'invalid_uuid';

  if (quantity === null) errors.quantity = 'invalid_decimal';
  if (note.length > 500) errors.note = 'too_long';

  return result(
    {
      product_id: productId,
      quantity: quantity ?? '',
      note: note || null,
    },
    errors,
  );
}

export function validateStockAdjustmentDraft(
  input: StockAdjustmentDraftInput,
): InventoryValidationResult<StockAdjustmentDraft> {
  const errors: Record<string, InventoryValidationIssue> = {};
  const productId = input.product_id.trim();
  const quantity = normalizedQuantity(input.quantity);
  const reason = input.reason.trim();

  if (!productId) errors.product_id = 'required';
  else if (!UUID_PATTERN.test(productId)) errors.product_id = 'invalid_uuid';

  if (quantity === null) errors.quantity = 'invalid_decimal';
  else if (!positive(quantity)) errors.quantity = 'must_be_positive';

  if (!reason) errors.reason = 'reason_required';
  else if (reason.length > 500) errors.reason = 'too_long';

  return result(
    {
      product_id: productId,
      direction: input.direction,
      quantity: quantity ?? '',
      reason,
    },
    errors,
  );
}
