/**
 * @neo/shared — RBAC Permissions, Navigation Guards & Role-Based Field Masking
 *
 * Implements M0 §4 permission model and Phase P2 confirmed access rules:
 * - OD-007: Multi-site coordinator access via siteIds
 * - OD-016: OPS_COORD granted receipt.verify_handover
 * - BR-05: Blind GRN strips ordered_qty and unit_price for STOREKEEPER
 * - Field masking: PROD_MGR never receives cost, price, margin, or customer ledger fields
 */

export type UserRole =
  | 'OWNER'
  | 'OPS_COORD'
  | 'PROD_MGR'
  | 'STOREKEEPER'
  | 'DRIVER'
  | 'COLLECTOR';

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  role: UserRole;
  siteIds: string[];
  sites?: Array<{
    id: string;
    name: string;
    siteType?: string;
    code?: string;
    isFulfillmentSite?: boolean;
  }>;
  activeSiteId: string;
  preferredLanguage: 'en' | 'mr';
  permissions?: string[];
}

/**
 * NOTE (gap I-1): the hard-coded ROLE_PERMISSIONS map was removed. Permission codes
 * are owned by the backend (`role_permissions`) and delivered via GET /auth/me.
 * Use `toSessionUser()` to build a SessionUser from that response.
 */

export interface NavItem {
  id: string;
  labelKey: string;
  route: string;
  group:
    | 'HOME'
    | 'SALES'
    | 'PROCUREMENT'
    | 'INVENTORY'
    | 'PRODUCTION'
    | 'LOGISTICS'
    | 'FINANCE'
    | 'CONTROL'
    | 'ADMIN'
    | 'TABLET'
    | 'MOBILE';
  requiredPermission: string;
  surface: 'WEB' | 'TABLET' | 'MOBILE';
}

export const ALL_NAV_ITEMS: readonly NavItem[] = [
  // Control Tower & Owner
  { id: 'control-dashboard', labelKey: 'nav.controlDashboard', route: '/control/dashboard', group: 'CONTROL', requiredPermission: 'dashboard.read_pulse', surface: 'WEB' },
  { id: 'control-approvals', labelKey: 'nav.approvals', route: '/control/approvals', group: 'CONTROL', requiredPermission: 'exception.resolve', surface: 'WEB' },
  { id: 'control-analytics', labelKey: 'nav.analytics', route: '/control/analytics', group: 'CONTROL', requiredPermission: 'analytics.read_customers', surface: 'WEB' },
  { id: 'control-audit', labelKey: 'nav.audit', route: '/control/audit', group: 'CONTROL', requiredPermission: 'audit.view', surface: 'WEB' },
  // Coordinator Home
  { id: 'coord-home', labelKey: 'nav.todayBoard', route: '/home', group: 'HOME', requiredPermission: 'order.view', surface: 'WEB' },
  // Sales (M1)
  { id: 'sales-quick-order', labelKey: 'nav.quickOrder', route: '/sales/orders/new', group: 'SALES', requiredPermission: 'order.create', surface: 'WEB' },
  { id: 'sales-orders', labelKey: 'nav.orders', route: '/sales/orders', group: 'SALES', requiredPermission: 'order.view', surface: 'WEB' },
  { id: 'sales-quotes', labelKey: 'nav.quotes', route: '/sales/quotes', group: 'SALES', requiredPermission: 'quote.view', surface: 'WEB' },
  { id: 'sales-customers', labelKey: 'nav.customers', route: '/sales/customers', group: 'SALES', requiredPermission: 'customer.view', surface: 'WEB' },
  { id: 'sales-prices', labelKey: 'nav.dailyPriceSheet', route: '/sales/prices', group: 'SALES', requiredPermission: 'price.set_daily', surface: 'WEB' },
  // Procurement (M2)
  { id: 'proc-suppliers', labelKey: 'nav.suppliers', route: '/procurement/suppliers', group: 'PROCUREMENT', requiredPermission: 'supplier.read', surface: 'WEB' },
  { id: 'proc-pos', labelKey: 'nav.purchaseOrders', route: '/procurement/pos/new', group: 'PROCUREMENT', requiredPermission: 'po.create', surface: 'WEB' },
  { id: 'proc-shortfalls', labelKey: 'nav.shortfalls', route: '/procurement/shortfalls', group: 'PROCUREMENT', requiredPermission: 'po.read', surface: 'WEB' },
  { id: 'proc-requisitions', labelKey: 'nav.requisitions', route: '/procurement/requisitions', group: 'PROCUREMENT', requiredPermission: 'requisition.read', surface: 'WEB' },
  // Inventory (M3)
  { id: 'inv-stock', labelKey: 'nav.stock', route: '/inventory/stock', group: 'INVENTORY', requiredPermission: 'inventory.read', surface: 'WEB' },
  { id: 'inv-transfers', labelKey: 'nav.transfers', route: '/inventory/transfers', group: 'INVENTORY', requiredPermission: 'inventory.transfer', surface: 'WEB' },
  { id: 'inv-adjustments', labelKey: 'nav.adjustments', route: '/inventory/adjustments', group: 'INVENTORY', requiredPermission: 'stock.adjust_request', surface: 'WEB' },
  // Production (M4)
  { id: 'prod-orders', labelKey: 'nav.workOrders', route: '/production/orders', group: 'PRODUCTION', requiredPermission: 'wo.start', surface: 'WEB' },
  { id: 'prod-boms', labelKey: 'nav.boms', route: '/production/boms', group: 'PRODUCTION', requiredPermission: 'wo.start', surface: 'WEB' },
  // Logistics (M5)
  { id: 'log-trips', labelKey: 'nav.tripBuilder', route: '/logistics/trips/new', group: 'LOGISTICS', requiredPermission: 'fleet.manage', surface: 'WEB' },
  { id: 'log-dispatch', labelKey: 'nav.dispatchBoard', route: '/logistics/dispatch', group: 'LOGISTICS', requiredPermission: 'fleet.read', surface: 'WEB' },
  { id: 'log-issues', labelKey: 'nav.issueDesk', route: '/logistics/issues', group: 'LOGISTICS', requiredPermission: 'fleet.resolve_issue', surface: 'WEB' },
  // Finance (M6)
  { id: 'fin-invoices', labelKey: 'nav.invoices', route: '/finance/invoices', group: 'FINANCE', requiredPermission: 'invoice.read', surface: 'WEB' },
  { id: 'fin-ar', labelKey: 'nav.arAging', route: '/finance/ar', group: 'FINANCE', requiredPermission: 'analytics.read_ar', surface: 'WEB' },
  { id: 'fin-handover', labelKey: 'nav.cashHandover', route: '/finance/handover', group: 'FINANCE', requiredPermission: 'receipt.verify_handover', surface: 'WEB' },
  { id: 'fin-cheques', labelKey: 'nav.cheques', route: '/finance/cheques', group: 'FINANCE', requiredPermission: 'receipt.verify_handover', surface: 'WEB' },
  { id: 'fin-eod', labelKey: 'nav.eodClosing', route: '/finance/eod', group: 'FINANCE', requiredPermission: 'eod.signoff', surface: 'WEB' },
  // Admin (M0)
  { id: 'admin-settings', labelKey: 'nav.settings', route: '/admin/settings', group: 'ADMIN', requiredPermission: 'config.edit', surface: 'WEB' },
  { id: 'admin-users', labelKey: 'nav.usersAndSites', route: '/admin/users', group: 'ADMIN', requiredPermission: 'config.edit', surface: 'WEB' },
  // Tablet PWA
  { id: 'tab-production', labelKey: 'nav.tabletKanban', route: '/t/production', group: 'TABLET', requiredPermission: 'wo.start', surface: 'TABLET' },
  { id: 'tab-rm-request', labelKey: 'nav.rmRequest', route: '/t/rm-request', group: 'TABLET', requiredPermission: 'requisition.create', surface: 'TABLET' },
  { id: 'tab-attendance', labelKey: 'nav.attendance', route: '/t/attendance', group: 'TABLET', requiredPermission: 'wo.start', surface: 'TABLET' },
  { id: 'tab-grn', labelKey: 'nav.blindGrn', route: '/t/grn', group: 'TABLET', requiredPermission: 'grn.record_blind', surface: 'TABLET' },
  { id: 'tab-loading', labelKey: 'nav.vehicleLoading', route: '/t/loading', group: 'TABLET', requiredPermission: 'trip.load', surface: 'TABLET' },
  { id: 'tab-transfers', labelKey: 'nav.tabletTransfers', route: '/t/transfers', group: 'TABLET', requiredPermission: 'stock.transfer', surface: 'TABLET' },
  { id: 'tab-stock', labelKey: 'nav.tabletStock', route: '/t/stock', group: 'TABLET', requiredPermission: 'inventory.read', surface: 'TABLET' },
];

/**
 * Checks whether a user holds a given permission and optional site access (OD-007).
 */
export function can(
  user: Pick<SessionUser, 'role' | 'siteIds' | 'permissions'> | null | undefined,
  permission: string,
  siteId?: string,
): boolean {
  if (!user) return false;

  // Site check (OD-007): OWNER has access to all sites; other roles must have siteId in siteIds
  if (siteId && user.role !== 'OWNER' && siteId !== 'ALL') {
    if (!user.siteIds.includes(siteId)) {
      return false;
    }
  }

  if (user.role === 'OWNER') return true;

  const granted = user.permissions ?? []; // server-provided only (gap I-1)
  if (granted.includes('*')) return true;
  return granted.includes(permission);
}

/**
 * Returns only the navigation items permitted for the user's role and target surface.
 */
export function getAuthorizedNavItems(
  user: Pick<SessionUser, 'role' | 'siteIds' | 'permissions'> | null | undefined,
  surface?: 'WEB' | 'TABLET' | 'MOBILE',
): NavItem[] {
  if (!user) return [];
  return ALL_NAV_ITEMS.filter((item) => {
    if (surface && item.surface !== surface) return false;
    // Special guard: OPS_COORD cannot access /control/dashboard (Owner Control Tower)
    if (item.route === '/control/dashboard' && user.role !== 'OWNER') {
      return false;
    }
    return can(user, item.requiredPermission);
  });
}

/**
 * Returns the default home route for each role (docs/claude/10_FE_Web_Frontend.md §2).
 */
export function getRoleHomeRoute(role: UserRole): string {
  switch (role) {
    case 'OWNER':
      return '/control/dashboard';
    case 'OPS_COORD':
      return '/home';
    case 'PROD_MGR':
      return '/t/production';
    case 'STOREKEEPER':
      return '/t/grn';
    case 'DRIVER':
      return '/m/manifest';
    case 'COLLECTOR':
      return '/m/collections';
  }
}

/**
 * Checks whether a user is allowed to access a specific URL path.
 */
export function canAccessRoute(
  user: Pick<SessionUser, 'role' | 'siteIds' | 'permissions'> | null | undefined,
  pathname: string,
): boolean {
  if (!user) return false;
  if (user.role === 'OWNER') return true;

  // Owner-only routes strictly blocked for non-owners
  const ownerOnlyPrefixes = [
    '/sales/prices',
    '/admin',
    '/control/audit',
    '/control/dashboard',
    '/control/analytics',
    '/control/approvals',
  ];
  if (ownerOnlyPrefixes.some((prefix) => pathname.startsWith(prefix))) {
    return false;
  }

  if (user.role === 'PROD_MGR') {
    return (
      pathname.startsWith('/t/production') ||
      pathname.startsWith('/t/rm-request') ||
      pathname.startsWith('/t/attendance') ||
      pathname.startsWith('/t/stock')
    );
  }

  if (user.role === 'STOREKEEPER') {
    return (
      pathname.startsWith('/t/grn') ||
      pathname.startsWith('/t/loading') ||
      pathname.startsWith('/t/transfers') ||
      pathname.startsWith('/t/stock') ||
      pathname.startsWith('/t/adjustments')
    );
  }

  return true;
}

const FINANCIAL_SENSITIVE_KEYS = new Set([
  'unitPrice',
  'unit_price',
  'floorPrice',
  'floor_price',
  'targetPrice',
  'target_price',
  'landedCost',
  'landed_cost',
  'cost',
  'price',
  'margin',
  'marginPct',
  'grossMarginPct',
  'gross_margin_pct',
  'grossProfit',
  'gross_profit',
  'totalAmount',
  'total_amount',
  'customerLedgerBalance',
  'arBalance',
]);

const BLIND_GRN_FORBIDDEN_KEYS = new Set([
  'orderedQty',
  'ordered_qty',
  'expectedQty',
  'expected_qty',
  'poQty',
  'po_qty',
  'unitPrice',
  'unit_price',
  'lineTotal',
  'line_total',
  'price',
  'cost',
]);

/**
 * Strips sensitive fields according to role and workflow rules:
 * - PROD_MGR never receives financial, cost, price, or margin fields.
 * - STOREKEEPER in Blind GRN never receives ordered/expected quantity or price (BR-05).
 */
export function maskSensitivePayload<T>(
  role: UserRole,
  payload: T,
  context?: 'DEFAULT' | 'BLIND_GRN',
): T {
  if (payload === null || payload === undefined || typeof payload !== 'object') {
    return payload;
  }

  if (role === 'OWNER') {
    return payload;
  }

  const forbidden =
    context === 'BLIND_GRN'
      ? BLIND_GRN_FORBIDDEN_KEYS
      : role === 'PROD_MGR' || role === 'STOREKEEPER'
        ? FINANCIAL_SENSITIVE_KEYS
        : null;

  if (!forbidden) return payload;

  if (Array.isArray(payload)) {
    return payload.map((item) => maskSensitivePayload(role, item, context)) as unknown as T;
  }

  const clone: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload as Record<string, unknown>)) {
    if (forbidden.has(key)) {
      continue;
    }
    clone[key] =
      value !== null && typeof value === 'object'
        ? maskSensitivePayload(role, value, context)
        : value;
  }
  return clone as T;
}


/** Shape returned by GET /auth/me (gap I-2). */
export interface AuthMeResponse {
  id: string;
  name?: string;
  full_name?: string;
  phone: string;
  role: UserRole;
  siteIds?: string[];
  sites?: Array<{ id: string; name: string; type: string }>;
  preferredLanguage?: string;
  permissions?: string[];
}

/**
 * Builds a SessionUser from the backend /auth/me payload. Permissions are never
 * invented client-side: a missing list means "no permissions".
 */
export function toSessionUser(me: AuthMeResponse): SessionUser {
  const siteIds = me.siteIds ?? [];
  return {
    id: me.id,
    name: me.name ?? me.full_name ?? '',
    phone: me.phone,
    role: me.role,
    siteIds,
    activeSiteId: siteIds[0] ?? '',
    preferredLanguage: me.preferredLanguage === 'mr' ? 'mr' : 'en',
    permissions: me.permissions ?? [],
  };
}
