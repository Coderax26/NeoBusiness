import { NextRequest, NextResponse } from 'next/server';

const API_ORIGIN = process.env.API_ORIGIN || 'http://localhost:3000';

const DEFAULT_SITES = [
  { id: 'site-factory-01', name: 'NeoCore Factory — Mumbai', siteType: 'FACTORY' },
  { id: 'site-wh-01', name: 'Central Warehouse — Navi Mumbai', siteType: 'WAREHOUSE' },
  { id: 'site-office-01', name: 'NeoCore Office — Corporate', siteType: 'OFFICE' },
];

const ROLE_DEFAULT_PERMISSIONS: Record<string, string[]> = {
  OWNER: ['*'],
  OPS_COORD: [
    'order.view',
    'order.create',
    'quote.view',
    'customer.view',
    'price.set_daily',
    'supplier.read',
    'po.create',
    'po.read',
    'requisition.read',
    'inventory.read',
    'inventory.transfer',
    'stock.adjust_request',
    'fleet.manage',
    'fleet.read',
    'fleet.resolve_issue',
    'invoice.read',
    'analytics.read_ar',
    'receipt.verify_handover',
    'finance.view',
    'report.view',
  ],
  STOREKEEPER: [
    'inventory.read',
    'inventory.transfer',
    'stock.transfer',
    'stock.adjust_request',
    'grn.record_blind',
    'trip.load',
  ],
  PROD_MGR: ['wo.start', 'requisition.create', 'inventory.read'],
  DRIVER: ['fleet.read', 'trip.load'],
  COLLECTOR: ['invoice.read', 'receipt.verify_handover'],
};

const ROLE_FALLBACK_PROFILES: Record<string, { id: string; name: string; phone: string }> = {
  OWNER: { id: 'usr-owner-01', name: 'Ravi Kumar', phone: '+919876543210' },
  OPS_COORD: { id: 'usr-ops-01', name: 'Anita Desai', phone: '+919876543211' },
  PROD_MGR: { id: 'usr-prod-01', name: 'Suresh Patel', phone: '+919876543212' },
  DRIVER: { id: 'usr-driver-01', name: 'Mehul Shah', phone: '+919876543213' },
  COLLECTOR: { id: 'usr-collector-01', name: 'Priya Nair', phone: '+919876543214' },
  STOREKEEPER: { id: 'usr-store-01', name: 'Arjun Rao', phone: '+919876543215' },
};

function buildSessionUserPayload(raw: any) {
  const role = String(raw?.role || 'OWNER').toUpperCase();
  const profile = ROLE_FALLBACK_PROFILES[role] || ROLE_FALLBACK_PROFILES.OWNER;
  const sites =
    Array.isArray(raw?.sites) && raw.sites.length > 0 ? raw.sites : DEFAULT_SITES;
  const siteIds =
    Array.isArray(raw?.siteIds) && raw.siteIds.length > 0
      ? raw.siteIds
      : sites.map((s: any) => s.id);
  const permissions =
    Array.isArray(raw?.permissions) && raw.permissions.length > 0
      ? raw.permissions
      : ROLE_DEFAULT_PERMISSIONS[role] || ['*'];

  const fullName = raw?.fullName || raw?.full_name || raw?.name || profile.name;

  const user = {
    id: raw?.id || profile.id,
    name: fullName,
    fullName,
    phone: raw?.phone || profile.phone,
    role,
    siteIds,
    sites,
    activeSiteId: sites[0]?.id || 'all',
    preferredLanguage: raw?.preferredLanguage || 'en',
    permissions,
  };

  return { ...user, user };
}

export async function GET(req: NextRequest) {
  const token = req.cookies.get('neobus_access_token')?.value;
  const cachedUserCookie = req.cookies.get('neobus_session_user')?.value;

  if (!token) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'No active session' } },
      { status: 401 },
    );
  }

  // 1. Handle local demo JWT tokens directly without hitting backend /auth/me
  if (token.startsWith('demo-jwt-')) {
    if (cachedUserCookie) {
      try {
        const parsed = JSON.parse(cachedUserCookie);
        return NextResponse.json(buildSessionUserPayload(parsed), { status: 200 });
      } catch {
        // continue to role extraction
      }
    }
    const parts = token.split('-');
    const role = parts[2] || 'OWNER';
    return NextResponse.json(buildSessionUserPayload({ role }), { status: 200 });
  }

  // 2. Call backend /api/v1/auth/me with real JWT
  try {
    const res = await fetch(`${API_ORIGIN}/api/v1/auth/me`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (res.ok) {
      const data = await res.json();
      const rawUser = data?.user || data;
      return NextResponse.json(buildSessionUserPayload(rawUser), { status: 200 });
    }
  } catch {
    // Backend temporarily unreachable; fall back to cached session cookie if present
  }

  // 3. Graceful fallback if neobus_session_user cookie exists
  if (cachedUserCookie) {
    try {
      const parsed = JSON.parse(cachedUserCookie);
      return NextResponse.json(buildSessionUserPayload(parsed), { status: 200 });
    } catch {
      // fall through
    }
  }

  return NextResponse.json(buildSessionUserPayload({ role: 'OWNER' }), { status: 200 });
}
