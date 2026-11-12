/**
 * @neo/shared — Master Data Duplicate Detection & GSTIN Validation (§9, F3-07)
 */

export const GSTIN_STATE_CODES: Record<string, string> = {
  '01': 'Jammu & Kashmir',
  '02': 'Himachal Pradesh',
  '03': 'Punjab',
  '04': 'Chandigarh',
  '05': 'Uttarakhand',
  '06': 'Haryana',
  '07': 'Delhi',
  '08': 'Rajasthan',
  '09': 'Uttar Pradesh',
  '10': 'Bihar',
  '19': 'West Bengal',
  '24': 'Gujarat',
  '27': 'Maharashtra',
  '29': 'Karnataka',
  '32': 'Kerala',
  '33': 'Tamil Nadu',
  '36': 'Telangana',
  '37': 'Andhra Pradesh',
};

export interface GSTINValidationResult {
  valid: boolean;
  stateCode?: string;
  stateName?: string;
  error?: string;
}

/**
 * Validates a 15-character Indian GSTIN format and extracts state code.
 * Format: 2 digits (state) + 10 chars (PAN) + 1 digit (entity) + 1 char (Z) + 1 check digit.
 * E.g. "27ABCDE1234F1Z5"
 */
export function validateGSTIN(gstin: string): GSTINValidationResult {
  if (!gstin) {
    return { valid: false, error: 'GSTIN is required.' };
  }

  const clean = gstin.trim().toUpperCase();
  if (clean.length !== 15) {
    return {
      valid: false,
      error: `GSTIN must be exactly 15 characters (entered: ${clean.length}).`,
    };
  }

  const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
  if (!gstinRegex.test(clean)) {
    return {
      valid: false,
      error: 'Invalid GSTIN pattern. Expected format: 27ABCDE1234F1Z5 (2 state digits, 10-char PAN, 1 entity, Z, 1 check digit).',
    };
  }

  const stateCode = clean.slice(0, 2);
  const stateName = GSTIN_STATE_CODES[stateCode] || 'Other State / UT';

  return {
    valid: true,
    stateCode,
    stateName,
  };
}

/**
 * Checks for duplicate entries in master lists (Customer phone/GSTIN, Item SKU/name, Supplier GSTIN).
 * Avoids false positives against the item's own ID when editing existing records.
 */
export function checkDuplicateRecord<T extends { id?: string | number }>(
  records: T[],
  field: keyof T,
  value: string,
  currentId?: string | number,
): { isDuplicate: boolean; matchedRecord?: T } {
  if (!value || !value.trim()) return { isDuplicate: false };

  const target = value.trim().toLowerCase();

  const match = records.find((rec) => {
    if (currentId && rec.id === currentId) return false;
    const val = rec[field];
    if (typeof val === 'string') {
      return val.trim().toLowerCase() === target;
    }
    return false;
  });

  return {
    isDuplicate: Boolean(match),
    matchedRecord: match,
  };
}
