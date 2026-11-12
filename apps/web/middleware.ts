import { NextResponse, type NextRequest } from 'next/server';

export const ROUTE_PERMISSIONS: Record<string, string> = {
  '/sales/prices': 'price.set_daily',
  '/sales/orders': 'order.view',
  '/sales/quotes': 'quote.view',
  '/sales/customers': 'customer.view',
  '/procurement/requisitions': 'requisition.read',
  '/procurement/purchase-orders': 'po.read',
  '/procurement/suppliers': 'supplier.read',
  '/inventory/stock': 'inventory.read',
  '/inventory/stock-counts': 'inventory.read',
  '/logistics/trips': 'fleet.view',
  '/finance/invoices': 'finance.view',
  '/finance/handovers': 'receipt.verify_handover',
  '/finance/expenses': 'finance.view',
  '/finance/eod': 'eod.signoff',
  '/reports': 'report.view',
  '/admin': 'config.edit',
};

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Bypassed public paths
  if (
    pathname.startsWith('/login') ||
    pathname.startsWith('/api/auth') ||
    pathname.startsWith('/_next') ||
    pathname.startsWith('/public') ||
    pathname === '/favicon.ico'
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('neobus_access_token')?.value;

  // Unauthenticated user attempting to access protected office or floor screens
  if (!token) {
    const loginUrl = new URL('/login', request.url);
    if (pathname !== '/' && pathname !== '/home') {
      loginUrl.searchParams.set('returnTo', pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // User is authenticated - continue
  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
};
