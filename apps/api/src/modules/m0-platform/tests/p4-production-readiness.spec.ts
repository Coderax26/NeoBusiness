import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { UnauthorizedException, BadRequestException } from '@nestjs/common';
import type { Knex } from 'knex';
import { v4 as uuidv4 } from 'uuid';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { setupTestDB } from '../../m3-inventory/tests/test-setup.js';
import { AuthController } from '../auth.controller.js';
import { RlsContextMiddleware } from '../../../shared/middleware/rls-context.middleware.js';
import {
  sanitizeFileName,
  validateUploadContent,
} from '../../../shared/security/upload-security.util.js';
import { validateEnvironmentConfig } from '../../../shared/config/env-validator.js';
import { ObservabilityService } from '../../../shared/observability/observability.service.js';
import { CorrelationMiddleware } from '../../../shared/observability/correlation.middleware.js';
import { PilotReconciliationService } from '../../../shared/observability/pilot-reconciliation.service.js';
import { HealthController } from '../../../health.controller.js';
import { PriceMasker } from '../../../shared/utils/price-masker.util.js';
import { verifyBackupReadinessLocal } from '../../../../../../scripts/backup-and-verify.mjs';

describe('Phase P4 — Production Readiness Verification Suite (P4.1 – P4.6)', () => {
  let context: Awaited<ReturnType<typeof setupTestDB>>;
  let knex: Knex;

  beforeAll(async () => {
    context = await setupTestDB();
    knex = context.knex;
  });

  afterAll(async () => {
    await knex.destroy();
  });

  // ── P4.1: Security Review & Remediations ───────────────────────────────────
  describe('P4.1 — Security Review, Auth Hardening, RLS, Upload Traversal & Masking', () => {
    it('SEC-01: AuthController strips password_hash/pin_hash on login and throws HTTP 401 UnauthorizedException on bad credentials/refresh', async () => {
      const mockAuthService = {
        validateUser: async (phone: string, cred: string) => {
          if (phone === '+919876543210' && cred === '1234') {
            return {
              user: {
                id: 'u-1',
                phone,
                role: 'OWNER',
                password_hash: '$2b$10$secretHashShouldBeStripped',
                pin_hash: '$2b$10$secretPinHash',
              },
              accessToken: 'jwt-access',
              refreshToken: 'jwt-refresh',
            };
          }
          return null;
        },
        refreshAccessToken: async () => null,
      } as any;

      const ctrl = new AuthController(mockAuthService);

      const ok = await ctrl.login({ phone: '+919876543210', pin: '1234' });
      expect(ok.user.password_hash).toBeUndefined();
      expect(ok.user.pin_hash).toBeUndefined();
      expect(ok.user.role).toBe('OWNER');

      await expect(
        ctrl.login({ phone: '+919876543210', password: 'wrong' }),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        ctrl.refresh({ refreshToken: 'expired-or-revoked' }),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('SEC-02: RlsContextMiddleware sets PostgreSQL session context via parameterized set_config without SQL syntax error', async () => {
      const mw = new RlsContextMiddleware(knex);
      const fakeReq: any = {
        user: {
          sub: uuidv4(),
          role: 'OPS_COORD',
        },
      };
      let nextCalled = false;

      await knex.transaction(async (trx) => {
        const trxMw = new RlsContextMiddleware(trx);
        await trxMw.use(fakeReq, {} as any, () => {
          nextCalled = true;
        });

        const cfg = await trx.raw(
          `SELECT current_setting('app.role', true) as role, current_setting('app.user_id', true) as uid`,
        );
        expect(cfg.rows[0].role).toBe('OPS_COORD');
        expect(cfg.rows[0].uid).toBe(fakeReq.user.sub);
      });

      expect(nextCalled).toBe(true);
      expect(mw).toBeDefined();
    });

    it('SEC-03: rejects path traversal, null bytes, unsupported extensions, and spoofed PDF/PNG magic bytes', () => {
      expect(() => sanitizeFileName('../../etc/passwd')).toThrow(BadRequestException);
      expect(() => sanitizeFileName('receipt.pdf\0.exe')).toThrow(BadRequestException);
      expect(() => sanitizeFileName('malware.sh')).toThrow(BadRequestException);
      expect(sanitizeFileName('epod_stop 12.jpg')).toBe('epod_stop_12.jpg');

      // Spoofed PDF containing HTML/JS script instead of %PDF- magic header
      expect(() =>
        validateUploadContent({
          fileName: 'invoice.pdf',
          mimeType: 'application/pdf',
          buffer: Buffer.from('<script>alert(1)</script>'),
        }),
      ).toThrow(BadRequestException);

      const validPdf = validateUploadContent({
        fileName: 'challan-101.pdf',
        mimeType: 'application/pdf',
        buffer: Buffer.from('%PDF-1.4 valid content'),
      });
      expect(validPdf.safeFileName).toBe('challan-101.pdf');
    });

    it('SEC-04: verifies sensitive field masking removes cost, price, and margin from PROD_MGR and STOREKEEPER', () => {
      const payload = {
        id: 'wo-1',
        itemName: 'Paneer',
        unit_price: '95.00',
        landed_cost: '82.00',
        margin_pct: '13.68',
        po_unit_price: '185.00',
      };

      const maskedProd = PriceMasker.apply('PROD_MGR', payload);
      expect(maskedProd.itemName).toBe('Paneer');
      expect(maskedProd.unit_price).toBeUndefined();
      expect(maskedProd.landed_cost).toBeUndefined();
      expect(maskedProd.margin_pct).toBeUndefined();

      const ownerView = PriceMasker.apply('OWNER', payload);
      expect(ownerView.unit_price).toBe('95.00');
      expect(ownerView.margin_pct).toBe('13.68');
    });
  });

  // ── P4.2: Concurrency & Load Verification ──────────────────────────────────
  describe('P4.2 — Concurrency & Latency Targets (p95 <= 300ms)', () => {
    it('measures p95 database query latency <= 300ms across 30 operational queries and zero blocking lock waits', async () => {
      const durationsMs: number[] = [];

      // Warm up pool connections before measuring steady-state query latency
      await Promise.all([
        knex.raw('SELECT 1'),
        knex.raw('SELECT 1'),
        knex.raw('SELECT 1'),
      ]);

      for (let i = 0; i < 30; i++) {
        const start = performance.now();
        await knex('sites').select('id', 'name').limit(10);
        durationsMs.push(performance.now() - start);
      }

      const sorted = [...durationsMs].sort((a, b) => a - b);
      const p95 = sorted[Math.min(sorted.length - 1, Math.ceil(0.95 * sorted.length) - 1)];
      expect(p95).toBeLessThan(300);

      // Verify zero blocking lock waits in PostgreSQL
      const lockCheck = await knex.raw(
        `SELECT COUNT(*)::int as waiting FROM pg_stat_activity WHERE wait_event_type = 'Lock' AND datname = current_database()`,
      );
      expect(Number(lockCheck.rows[0].waiting)).toBe(0);
    });

    it('prevents last-stock oversell under concurrent transactional FOR UPDATE reservations', async () => {
      const siteId = context.siteId;
      const itemId = context.itemRiceId;
      const batchId = uuidv4();

      // Insert isolated batch with exactly 10 kg available
      await knex('inventory_batches').insert({
        id: batchId,
        site_id: siteId,
        item_id: itemId,
        batch_number: `B-P4-${batchId.slice(0, 8)}`,
        status: 'AVAILABLE',
        qty_on_hand: '10.000',
        qty_committed: '0.000',
        received_date: context.today,
        landed_cost_per_unit: '65.00',
        created_at: new Date(),
        updated_at: new Date(),
      });

      // Attempt 3 concurrent reservations of 8 kg each (only 1 can succeed with 10 kg on hand!)
      const attemptReserve = async () => {
        return knex.transaction(async (trx) => {
          const row = await trx('inventory_batches')
            .where({ id: batchId })
            .forUpdate()
            .first();
          const available = Number(row.qty_on_hand) - Number(row.qty_committed);
          if (available < 8) {
            return false;
          }
          await trx('inventory_batches')
            .where({ id: batchId })
            .update({ qty_committed: (Number(row.qty_committed) + 8).toFixed(3) });
          return true;
        });
      };

      const results = await Promise.all([
        attemptReserve(),
        attemptReserve(),
        attemptReserve(),
      ]);

      const succeeded = results.filter(Boolean).length;
      expect(succeeded).toBe(1);

      const finalBatch = await knex('inventory_batches').where({ id: batchId }).first();
      expect(Number(finalBatch.qty_committed)).toBe(8);
    });
  });

  // ── P4.3: Backup & Restore Readiness ───────────────────────────────────────
  describe('P4.3 — Backup Schedule, Migration Continuity & Append-Only Ledger Integrity', () => {
    it('verifies all canonical SQL migrations are tracked and append-only ledger tables exist', async () => {
      const readiness = verifyBackupReadinessLocal();
      expect(readiness.migrationFilesCount).toBeGreaterThanOrEqual(29);

      const appliedRows = await knex('knex_migrations').select('name');
      expect(appliedRows.length).toBeGreaterThan(0);

      for (const tbl of readiness.appendOnlyTablesChecked) {
        const exists = await knex.schema.hasTable(tbl);
        expect(exists).toBe(true);
      }
    });
  });

  // ── P4.4: Observability, Correlation IDs & Metrics ─────────────────────────
  describe('P4.4 — Observability, Structured JSON Logs, Correlation IDs & /metrics', () => {
    it('propagates Correlation IDs, emits structured JSON logs, calculates latency p95, and serves /health + /metrics', async () => {
      const obs = new ObservabilityService();
      const mw = new CorrelationMiddleware(obs);

      const headersSent: Record<string, string> = {};
      const listeners: Record<string, () => void> = {};

      const mockReq: any = {
        method: 'GET',
        originalUrl: '/api/v1/dashboard/pulse',
        headers: { 'x-correlation-id': 'corr-p4-test-1234' },
        user: { sub: 'u-owner', role: 'OWNER' },
      };
      const mockRes: any = {
        statusCode: 200,
        setHeader: (k: string, v: string) => {
          headersSent[k] = v;
        },
        on: (ev: string, fn: () => void) => {
          listeners[ev] = fn;
        },
      };

      mw.use(mockReq, mockRes, () => {});
      expect(headersSent['X-Correlation-Id']).toBe('corr-p4-test-1234');
      expect(headersSent['X-Request-Id']).toBe('corr-p4-test-1234');

      // Trigger finish event
      listeners['finish']();

      const snap = obs.getSnapshot();
      expect(snap.requestsTotal).toBe(1);
      expect(snap.errorsTotal).toBe(0);
      expect(obs.toPrometheusText()).toContain('neobus_http_requests_total 1');

      const healthCtrl = new HealthController(knex, obs);
      const health = await healthCtrl.check();
      expect(health.status).toBe('ok');
      expect(health.database).toBe('connected');
      expect(healthCtrl.prometheusMetrics()).toContain('neobus_http_request_duration_ms_p95');
    });
  });

  // ── P4.5: Deployment Hardening & Environment Config Validation ─────────────
  describe('P4.5 — Deployment Hardening, Non-Root Dockerfiles & Env Validation', () => {
    it('rejects weak/default JWT secrets and wildcard CORS in production mode while accepting strong config', () => {
      const badProd = validateEnvironmentConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://app:pass@db:5432/prod',
        REDIS_URL: 'redis://redis:6379',
        JWT_SECRET: 'default',
        JWT_REFRESH_SECRET: 'short',
        ALLOWED_ORIGINS: '*',
      });
      expect(badProd.valid).toBe(false);
      expect(badProd.errors.length).toBeGreaterThanOrEqual(4);

      const goodProd = validateEnvironmentConfig({
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://neobus_app:strongPass!99@postgres:5432/neobus_prod',
        REDIS_URL: 'redis://redis:6379',
        JWT_SECRET: 'a9f8d7c6b5e4f3a291827364556677889900aabbccddeeff1122334455667788',
        JWT_REFRESH_SECRET: 'ffeeddccbbaa0099887766554433221199887766554433221100ffeeddccbbaa',
        ALLOWED_ORIGINS: 'https://ops.neobus.in',
      });
      expect(goodProd.valid).toBe(true);
      expect(goodProd.errors).toHaveLength(0);
    });

    it('verifies non-root Dockerfiles and hardened production docker-compose exist', () => {
      const repoRoot = path.resolve(import.meta.dirname, '../../../../../../');
      const apiDockerfile = fs.readFileSync(path.join(repoRoot, 'apps/api/Dockerfile'), 'utf-8');
      const webDockerfile = fs.readFileSync(path.join(repoRoot, 'apps/web/Dockerfile'), 'utf-8');
      const prodCompose = fs.readFileSync(path.join(repoRoot, 'docker-compose.prod.yml'), 'utf-8');

      expect(apiDockerfile).toContain('USER neobus');
      expect(apiDockerfile).toContain('HEALTHCHECK');
      expect(webDockerfile).toContain('USER neobus');
      expect(prodCompose).toContain('archive_mode=on');
      expect(prodCompose).toContain('no-new-privileges:true');
    });
  });

  // ── P4.6: Operational Pilot Daily Reconciliation ───────────────────────────
  describe('P4.6 — 7-Day Parallel Operational Pilot Daily Reconciliation', () => {
    it('executes daily reconciliation check across invoices, collections, exceptions, and open trips', async () => {
      const recon = new PilotReconciliationService(knex);
      const today = new Date().toISOString().slice(0, 10);
      const report = await recon.generateDailyReport(context.siteId, today);

      expect(report.siteId).toBe(context.siteId);
      expect(report.date).toBe(today);
      expect(report.reconciledClean).toBe(true);
      expect(report.discrepancies).toHaveLength(0);
    });
  });
});
