/**
 * PriceMasker — strips price, margin, and cost fields from objects
 * before they are returned to roles that should not see them.
 *
 * Per the blueprint (M0 §5): factory staff, drivers, and warehouse
 * roles never receive unit prices, supplier rates, or margin fields.
 *
 * This is applied at the DTO serialiser level, not in the UI, so the
 * API itself never leaks sensitive financial data.
 *
 * Usage:
 *   const masked = PriceMasker.apply(user.role, orderDto);
 */

// Fields that must be stripped from responses for restricted roles.
// These are matched case-insensitively and also catch suffixed variants
// like 'unit_price_inr', 'total_margin_pct', etc.
const SENSITIVE_FIELDS = [
  'price',
  'unit_price',
  'unit_price_inr',
  'target_price',
  'floor_price',
  'landed_cost',
  'cost',
  'margin',
  'margin_pct',
  'margin_inr',
  'supplier_rate',
  'total_price',
  'total_inr',
  'subtotal_inr',
  'tax_amount',
  'tax_amount_inr',
  'grand_total',
  'grand_total_inr',
  'outstanding_amount',
  'outstanding_amount_inr',
  'credit_limit',
  'credit_balance',
  'ar_balance',
];

// Roles that are restricted from seeing financial data.
const RESTRICTED_ROLES = new Set(['PROD_MGR', 'DRIVER', 'STOREKEEPER']);

/**
 * Deep-clone-safe field remover. Walks objects and arrays, deleting
 * sensitive keys. Returns a new object — does not mutate the input.
 */
function deepStrip(obj: unknown, fields: Set<string>): unknown {
  if (!obj || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map((item) => deepStrip(item, fields));

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const lowerKey = key.toLowerCase();
    if (fields.has(lowerKey)) continue;
    // Also strip fields whose lowercase form contains a sensitive term
    if (Array.from(fields).some((f) => lowerKey.includes(f))) continue;
    result[key] = deepStrip(value, fields);
  }
  return result;
}

const sensitiveSet = new Set(SENSITIVE_FIELDS);

export class PriceMasker {
  /**
   * Apply masking if the user's role is restricted.
   * @param role the user's role (e.g. 'STOREKEEPER', 'OWNER')
   * @param data the response DTO (will not be mutated)
   * @returns the response DTO with sensitive fields removed, or the
   *   original data if the role is not restricted
   */
  static apply<T>(role: string, data: T): T {
    if (RESTRICTED_ROLES.has(role)) {
      return deepStrip(data, sensitiveSet) as T;
    }
    return data;
  }

  /**
   * Check whether a role is restricted from seeing prices.
   */
  static isRestricted(role: string): boolean {
    return RESTRICTED_ROLES.has(role);
  }

  /** The full list of sensitive field names. */
  static sensitiveFields = SENSITIVE_FIELDS;
  /** The full set of restricted roles. */
  static restrictedRoles = Array.from(RESTRICTED_ROLES);
}
