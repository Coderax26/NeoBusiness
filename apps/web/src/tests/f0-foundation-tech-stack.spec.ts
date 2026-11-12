import { describe, it, expect } from 'vitest';
import nextConfig from '../../next.config.mjs';
import { generateIdempotencyKey, createMutationHeaders } from '../../lib/idempotency';
import { formatApiError } from '../../lib/api-client';
import { createQueryClient, queryKeys } from '../../lib/query-client';
import { isMockModeEnabled, getMockResponse } from '../../lib/mock-mode';
import { middleware, ROUTE_PERMISSIONS } from '../../middleware';
import * as fs from 'fs';
import * as path from 'path';

describe('Phase F0 — Foundation & Technology Stack Acceptance Criteria', () => {
  it('TC-F0-AC01: Next.js standalone build configuration and package transpilation (F0-01, F0-11)', () => {
    expect(nextConfig.output).toBe('standalone');
    expect(nextConfig.reactStrictMode).toBe(true);
    expect(nextConfig.transpilePackages).toContain('@neo/shared');
    expect(nextConfig.transpilePackages).toContain('@neo/api-client');
    expect(nextConfig.transpilePackages).toContain('@neo/ui');
    expect(nextConfig.transpilePackages).toContain('@neo/i18n');
  });

  it('TC-F0-AC02: BFF Auth Route handlers exist with cookie configuration (F0-05)', () => {
    const loginRoute = path.resolve(__dirname, '../../app/api/auth/login/route.ts');
    const logoutRoute = path.resolve(__dirname, '../../app/api/auth/logout/route.ts');
    const meRoute = path.resolve(__dirname, '../../app/api/auth/me/route.ts');
    const bffRoute = path.resolve(__dirname, '../../app/api/bff/[...path]/route.ts');

    expect(fs.existsSync(loginRoute)).toBe(true);
    expect(fs.existsSync(logoutRoute)).toBe(true);
    expect(fs.existsSync(meRoute)).toBe(true);
    expect(fs.existsSync(bffRoute)).toBe(true);

    const loginContent = fs.readFileSync(loginRoute, 'utf-8');
    expect(loginContent).toContain('neobus_access_token');
    expect(loginContent).toContain('httpOnly: true');
  });

  it('TC-F0-AC03: middleware.ts protects private routes and redirects unauthenticated requests (F0-06)', () => {
    const fakeRequest = {
      nextUrl: { pathname: '/sales/orders' },
      url: 'http://localhost:4000/sales/orders',
      cookies: {
        get: () => undefined, // No cookie
      },
    } as any;

    const response = middleware(fakeRequest);
    expect(response.status).toBe(307); // Next.js redirect
    const location = response.headers.get('location');
    expect(location).toContain('/login?returnTo=%2Fsales%2Forders');
  });

  it('TC-F0-AC04: middleware.ts bypasses public login and static assets (F0-06)', () => {
    const publicReq = {
      nextUrl: { pathname: '/login' },
      cookies: { get: () => undefined },
    } as any;

    const response = middleware(publicReq);
    expect(response.status).toBe(200);
  });

  it('TC-F0-AC05: formatApiError maps 400 validation with field-level DTO errors (F0-03)', () => {
    const err400 = formatApiError(400, {
      message: ['quantity must be a positive number', 'siteId must be a valid UUID'],
    });

    expect(err400.status).toBe(400);
    expect(err400.userMessage).toBe('Please check the highlighted fields.');
    expect(err400.fieldErrors?.quantity).toBeTruthy();
    expect(err400.fieldErrors?.siteId).toBeTruthy();
    expect(err400.canRetry).toBe(false);
  });

  it('TC-F0-AC06: formatApiError maps 401, 403, 404, 409 stale, 422, 429, and 500 (F0-03)', () => {
    const err401 = formatApiError(401);
    expect(err401.userMessage).toBe('Your session ended. Please sign in again.');

    const err403 = formatApiError(403);
    expect(err403.userMessage).toBe("You don't have permission to do this. Ask the Owner if you need access.");

    const err404 = formatApiError(404);
    expect(err404.userMessage).toBe('This record no longer exists or was moved.');

    const err409 = formatApiError(409);
    expect(err409.userMessage).toBe('Someone else updated this just now.');
    expect(err409.isStale).toBe(true);

    const err422 = formatApiError(422, { message: "Price is below today's floor" });
    expect(err422.userMessage).toBe("Price is below today's floor");

    const err429 = formatApiError(429);
    expect(err429.userMessage).toBe('Too many attempts. Please wait a minute and try again.');

    const err500 = formatApiError(500);
    expect(err500.userMessage).toBe("We couldn't reach the server. Your work is saved — try again.");
    expect(err500.canRetry).toBe(true);
  });

  it('TC-F0-AC07: generateIdempotencyKey & createMutationHeaders generate valid headers (F0-08)', () => {
    const key = generateIdempotencyKey();
    expect(key).toBeTruthy();
    expect(typeof key).toBe('string');
    expect(key.length).toBeGreaterThanOrEqual(16);

    const headers = createMutationHeaders({ 'X-Site-Id': 'site-1' }, key);
    expect(headers['Content-Type']).toBe('application/json');
    expect(headers['Idempotency-Key']).toBe(key);
    expect(headers['X-Site-Id']).toBe('site-1');
  });

  it('TC-F0-AC08: createQueryClient configures 30s background polling per OD-021 (F0-04)', () => {
    const qc = createQueryClient();
    const defaultQueryOpts = qc.getDefaultOptions().queries;

    expect(defaultQueryOpts?.staleTime).toBe(30000);
    expect(defaultQueryOpts?.refetchInterval).toBe(30000);
    expect(defaultQueryOpts?.refetchOnWindowFocus).toBe(true);
  });

  it('TC-F0-AC09: queryKeys produce structured module cache keys (F0-04)', () => {
    const orderKey = queryKeys.commercial.orders({ status: 'CONFIRMED' });
    expect(orderKey).toEqual(['m1', 'orders', { status: 'CONFIRMED' }]);

    const poKey = queryKeys.procurement.pos({ siteId: 's-1' });
    expect(poKey).toEqual(['m2', 'pos', { siteId: 's-1' }]);

    const stockKey = queryKeys.inventory.stock('s-1');
    expect(stockKey).toEqual(['m3', 'stock', 's-1']);

    const cashbookKey = queryKeys.finance.cashbook('s-1');
    expect(cashbookKey).toEqual(['m6', 'cashbook', 's-1']);
  });

  it('TC-F0-AC10: Mock mode helper returns fixtures when enabled (F0-09)', () => {
    const originalEnv = process.env.NEXT_PUBLIC_MOCKS;
    try {
      process.env.NEXT_PUBLIC_MOCKS = '1';
      expect(isMockModeEnabled()).toBe(true);

      const pulse = getMockResponse('/api/v1/dashboard/pulse');
      expect(pulse).toBeTruthy();
      expect(pulse.todaysSales).toBe('482450.00');

      const exceptions = getMockResponse('/api/v1/exceptions');
      expect(Array.isArray(exceptions)).toBe(true);
      expect(exceptions.length).toBeGreaterThan(0);
    } finally {
      process.env.NEXT_PUBLIC_MOCKS = originalEnv;
    }
  });

  it('TC-F0-AC11: Error boundaries and 404/403 pages exist (F0-10)', () => {
    const errorPage = path.resolve(__dirname, '../../app/error.tsx');
    const notFoundPage = path.resolve(__dirname, '../../app/not-found.tsx');
    const forbiddenPage = path.resolve(__dirname, '../../app/(office)/forbidden/page.tsx');

    expect(fs.existsSync(errorPage)).toBe(true);
    expect(fs.existsSync(notFoundPage)).toBe(true);
    expect(fs.existsSync(forbiddenPage)).toBe(true);

    const forbiddenContent = fs.readFileSync(forbiddenPage, 'utf-8');
    expect(forbiddenContent).toContain('Access Restricted');
    expect(forbiddenContent).toContain('Ask your Owner');
  });

  it('TC-F0-AC12: globals.css and Button.tsx enforce minimum 48px touch targets (P2, P4)', () => {
    const cssPath = path.resolve(__dirname, '../../app/globals.css');
    const buttonPath = path.resolve(__dirname, '../../src/components/ui/Button.tsx');

    const cssContent = fs.readFileSync(cssPath, 'utf-8');
    expect(cssContent).toContain('--touch-target-min: 48px');

    const buttonContent = fs.readFileSync(buttonPath, 'utf-8');
    expect(buttonContent).toContain('min-h-[48px]');
  });

  it('TC-F0-AC13: Route permissions table maps protected ERP screen paths (F0-06)', () => {
    expect(ROUTE_PERMISSIONS['/sales/orders']).toBe('order.view');
    expect(ROUTE_PERMISSIONS['/sales/prices']).toBe('price.set_daily');
    expect(ROUTE_PERMISSIONS['/procurement/purchase-orders']).toBe('po.read');
    expect(ROUTE_PERMISSIONS['/inventory/stock-counts']).toBe('inventory.read');
    expect(ROUTE_PERMISSIONS['/finance/invoices']).toBe('finance.view');
    expect(ROUTE_PERMISSIONS['/reports']).toBe('report.view');
  });

  it('TC-F0-AC14: Floor Mode (D-1) touch route group exists for PROD_MGR and STOREKEEPER', () => {
    const floorLayout = path.resolve(__dirname, '../../app/(floor)/layout.tsx');
    const floorPage = path.resolve(__dirname, '../../app/(floor)/floor/page.tsx');

    expect(fs.existsSync(floorLayout)).toBe(true);
    expect(fs.existsSync(floorPage)).toBe(true);
  });

  it('TC-F0-AC15: Dockerfile contains multi-stage standalone runner with non-root user (F0-11)', () => {
    const dockerfilePath = path.resolve(__dirname, '../../Dockerfile');
    expect(fs.existsSync(dockerfilePath)).toBe(true);

    const content = fs.readFileSync(dockerfilePath, 'utf-8');
    expect(content).toContain('FROM base AS builder');
    expect(content).toContain('COPY --from=builder --chown=neobus:neobus /app/apps/web/.next/standalone');
    expect(content).toContain('USER neobus');
  });

  it('TC-F0-AC16: BFF Auth refresh route exists and handles token rotation (F0-05)', () => {
    const refreshRoute = path.resolve(__dirname, '../../app/api/auth/refresh/route.ts');
    expect(fs.existsSync(refreshRoute)).toBe(true);

    const content = fs.readFileSync(refreshRoute, 'utf-8');
    expect(content).toContain('neobus_refresh_token');
    expect(content).toContain('/api/v1/auth/refresh');
    expect(content).toContain('neobus_access_token');
    expect(content).toContain('httpOnly: true');
  });

  it('TC-F0-AC17: BFF proxy route includes silent refresh handling on HTTP 401 (F0-05)', () => {
    const bffRoute = path.resolve(__dirname, '../../app/api/bff/[...path]/route.ts');
    const content = fs.readFileSync(bffRoute, 'utf-8');
    expect(content).toContain('upstream.status === 401');
    expect(content).toContain('/api/v1/auth/refresh');
    expect(content).toContain('neobus_refresh_token');
  });

  it('TC-F0-AC18: Telemetry module exports reportWebVitals and captureClientException without PII (F0-10)', async () => {
    const telemetry = await import('../../lib/telemetry');
    expect(typeof telemetry.reportWebVitals).toBe('function');
    expect(typeof telemetry.captureClientException).toBe('function');
  });

  it('TC-F0-AC19: Storybook configuration and component stories exist for UI design review (F0-12)', () => {
    const mainConfig = path.resolve(__dirname, '../../.storybook/main.ts');
    const previewConfig = path.resolve(__dirname, '../../.storybook/preview.ts');
    const buttonStory = path.resolve(__dirname, '../../src/components/ui/Button.stories.tsx');
    const badgeStory = path.resolve(__dirname, '../../src/components/ui/StatusBadge.stories.tsx');
    const kpiStory = path.resolve(__dirname, '../../src/components/ui/KpiCard.stories.tsx');

    expect(fs.existsSync(mainConfig)).toBe(true);
    expect(fs.existsSync(previewConfig)).toBe(true);
    expect(fs.existsSync(buttonStory)).toBe(true);
    expect(fs.existsSync(badgeStory)).toBe(true);
    expect(fs.existsSync(kpiStory)).toBe(true);
  });

  it('TC-F0-AC20: Docker compose and CI workflow cover Next.js web service and route drift check (F0-11)', () => {
    const composePath = path.resolve(__dirname, '../../../../docker-compose.prod.yml');
    const ciPath = path.resolve(__dirname, '../../../../.github/workflows/ci.yml');

    const composeContent = fs.readFileSync(composePath, 'utf-8');
    expect(composeContent).toContain('neobus_prod_web');
    expect(composeContent).toContain('apps/web/Dockerfile');

    const ciContent = fs.readFileSync(ciPath, 'utf-8');
    expect(ciContent).toContain('check:api-routes');
    expect(ciContent).toContain('test:fe');
  });
});
