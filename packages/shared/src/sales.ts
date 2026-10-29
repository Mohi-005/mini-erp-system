import {
  normalizeMasterDataDigits,
  normalizeNonNegativeDecimal,
} from './master-data.ts';

export type SalesLineValidationIssue =
  'required' | 'invalid_uuid' | 'invalid_decimal' | 'must_be_positive';

export type SalesLineDraftInput = {
  product_id: string;
  quantity: string;
  unit_price: string;
};

export type SalesLineDraft = {
  product_id: string;
  quantity: string;
  unit_price: string;
};

export type SalesLineValidationResult<T> =
  | { valid: true; value: T; errors: Record<string, never> }
  | {
      valid: false;
      errors: Partial<
        Record<keyof SalesLineDraftInput, SalesLineValidationIssue>
      >;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function result<T>(
  value: T,
  errors: Partial<Record<keyof SalesLineDraftInput, SalesLineValidationIssue>>,
): SalesLineValidationResult<T> {
  return Object.keys(errors).length
    ? { valid: false, errors }
    : { valid: true, value, errors: {} };
}

function decimalParts(
  input: string,
): { coefficient: bigint; scale: number } | null {
  const normalized = normalizeNonNegativeDecimal(
    normalizeMasterDataDigits(input),
  );
  if (normalized === null) return null;

  const [integerPart, fractionalPart = ''] = normalized.split('.');
  const digits = `${integerPart}${fractionalPart}`.replace(/^0+(?=\d)/, '');
  return {
    coefficient: BigInt(digits || '0'),
    scale: fractionalPart.length,
  };
}

function formatDecimal(coefficient: bigint, scale: number): string {
  let digits = coefficient.toString();
  if (scale === 0) return digits;
  digits = digits.padStart(scale + 1, '0');
  const point = digits.length - scale;
  const integerPart = digits.slice(0, point);
  const fractionalPart = digits.slice(point).replace(/0+$/, '');
  return fractionalPart ? `${integerPart}.${fractionalPart}` : integerPart;
}

/** Validates a single unsaved sale-draft line. It never writes to the database. */
export function validateSalesLineDraft(
  input: SalesLineDraftInput,
): SalesLineValidationResult<SalesLineDraft> {
  const errors: Partial<
    Record<keyof SalesLineDraftInput, SalesLineValidationIssue>
  > = {};
  const productId = input.product_id.trim();
  const quantity = normalizeNonNegativeDecimal(
    normalizeMasterDataDigits(input.quantity),
  );
  const unitPrice = normalizeNonNegativeDecimal(
    normalizeMasterDataDigits(input.unit_price),
  );

  if (!productId) errors.product_id = 'required';
  else if (!UUID_PATTERN.test(productId)) errors.product_id = 'invalid_uuid';

  if (quantity === null) errors.quantity = 'invalid_decimal';
  else if (decimalParts(quantity)?.coefficient === 0n) {
    errors.quantity = 'must_be_positive';
  }

  if (unitPrice === null) errors.unit_price = 'invalid_decimal';

  return result(
    {
      product_id: productId,
      quantity: quantity ?? '',
      unit_price: unitPrice ?? '',
    },
    errors,
  );
}

/** Exact base-10 preview multiplication; no currency rounding is performed. */
export function multiplyDecimalStrings(
  left: string,
  right: string,
): string | null {
  const leftParts = decimalParts(left);
  const rightParts = decimalParts(right);
  if (!leftParts || !rightParts) return null;
  return formatDecimal(
    leftParts.coefficient * rightParts.coefficient,
    leftParts.scale + rightParts.scale,
  );
}

/** Exact base-10 sum for preview values; no currency rounding is performed. */
export function sumDecimalStrings(values: readonly string[]): string | null {
  const parts = values.map(decimalParts);
  if (parts.some((value) => value === null)) return null;
  if (parts.length === 0) return '0';

  const validParts = parts as { coefficient: bigint; scale: number }[];
  const scale = Math.max(...validParts.map((value) => value.scale));
  const total = validParts.reduce(
    (sum, value) =>
      sum + value.coefficient * 10n ** BigInt(scale - value.scale),
    0n,
  );
  return formatDecimal(total, scale);
}

/** Compare two non-negative decimal strings exactly: -1, 0, 1 or null. */
export function compareDecimalStrings(
  left: string,
  right: string,
): -1 | 0 | 1 | null {
  const leftParts = decimalParts(left);
  const rightParts = decimalParts(right);
  if (!leftParts || !rightParts) return null;

  const scale = Math.max(leftParts.scale, rightParts.scale);
  const leftValue =
    leftParts.coefficient * 10n ** BigInt(scale - leftParts.scale);
  const rightValue =
    rightParts.coefficient * 10n ** BigInt(scale - rightParts.scale);

  if (leftValue < rightValue) return -1;
  if (leftValue > rightValue) return 1;
  return 0;
}
