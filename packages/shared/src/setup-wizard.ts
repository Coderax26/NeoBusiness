/**
 * @neo/shared — Owner Setup Wizard 8-Step Framework & Configuration (§2, F3-01)
 */

export interface SetupStepConfig {
  id: number;
  key: string;
  title: string;
  subtitle: string;
  description: string;
  routeHint?: string;
}

export const SETUP_STEPS_CONFIG: SetupStepConfig[] = [
  {
    id: 1,
    key: 'company',
    title: '1. Company Profile',
    subtitle: 'Legal name, GSTIN, and invoice header',
    description: 'Enter your registered business identity, GSTIN, primary billing address, and bank account for invoice footers.',
    routeHint: '/admin/settings',
  },
  {
    id: 2,
    key: 'sites',
    title: '2. Sites & Storage Locations',
    subtitle: 'Depots, processing plants, cold rooms',
    description: 'Configure your active operational hubs (factory, central warehouse, transit depots) and internal storage bins.',
    routeHint: '/admin/sites',
  },
  {
    id: 3,
    key: 'users',
    title: '3. Users & Access Roles',
    subtitle: 'Invite team members by phone and assign roles',
    description: 'Provision credentials for floor managers, sales coordinators, drivers, and accountants with least-privilege role permissions.',
    routeHint: '/admin/users',
  },
  {
    id: 4,
    key: 'items',
    title: '4. Items Master & Units',
    subtitle: 'Raw materials, processed goods, traded items',
    description: 'Add your product catalog with primary and secondary UoMs, catch-weight conversions, HSN codes, and GST rates.',
    routeHint: '/sales/items',
  },
  {
    id: 5,
    key: 'customers',
    title: '5. Customers & Credit Limits',
    subtitle: 'Buyer profiles, delivery addresses, credit limits',
    description: 'Set up customer trade accounts, GSTIN verification, credit limits, payment terms, and delivery preferences.',
    routeHint: '/sales/customers',
  },
  {
    id: 6,
    key: 'suppliers',
    title: '6. Suppliers & Rate Cards',
    subtitle: 'Vendor directory and agreed procurement prices',
    description: 'Register trusted suppliers, link items supplied, and record contract rate cards to prevent billing errors.',
    routeHint: '/procurement/suppliers',
  },
  {
    id: 7,
    key: 'vehicles',
    title: '7. Logistics Vehicles',
    subtitle: 'Owned and hired delivery fleet',
    description: 'Catalog delivery mini-trucks, reefers, payload capacities in kg and crates, and document expiry dates.',
    routeHint: '/logistics/vehicles',
  },
  {
    id: 8,
    key: 'opening_balances',
    title: '8. Opening Balances (Signed CSV)',
    subtitle: 'Customer receivables & initial inventory stock',
    description: 'Upload signed opening balances for customer ledgers and warehouse stock to start day-to-day operations with clean reconciliations.',
    routeHint: '/finance/opening-balances',
  },
];

export function calculateSetupProgress(completedCount: number, totalCount = 8): number {
  if (totalCount <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((completedCount / totalCount) * 100)));
}

