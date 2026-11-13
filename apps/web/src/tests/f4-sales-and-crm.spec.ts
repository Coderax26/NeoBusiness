import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  calculateAutoFloorPrice,
  evaluatePriceBand,
  evaluateCreditExposure,
  evaluateStockAvailability,
  evaluateOrderApprovalNeed,
  computeRunningLedgerBalance,
  canViewMarginAndCost,
  ORDER_LIFECYCLE_STEPS,
  CANCEL_REASONS,
} from '@neo/shared';

describe('Phase F4 — Sales & CRM Specification', () => {
  // 1. TC-F4-AC01: Price Band (BR-01) & Scenario A
  describe('TC-F4-AC01: Price Band Evaluation (BR-01) & Dynamic Approval Button', () => {
    it('Scenario A: Floor ₹90 — price ₹92 shows In band and Confirm works', () => {
      const band = evaluatePriceBand(92, 90, 95, 75);
      expect(band.requiresOverride).toBe(false);
      expect(band.chipLabel).toContain('In band');

      const credit = evaluateCreditExposure(100000, 50000, 10000, false);
      const approval = evaluateOrderApprovalNeed(
        [{ itemName: 'Fresh Malai Paneer 200g', unitPrice: 92, floorPrice: 90, targetPrice: 95 }],
        credit,
      );

      expect(approval.primaryAction).toBe('CONFIRM');
      expect(approval.buttonLabel).toBe('Confirm order');
      expect(approval.reasons).toHaveLength(0);
    });

    it('Scenario A: Floor ₹90 — price ₹88 shows Below floor by ₹2 and routes to Owner approval', () => {
      const band = evaluatePriceBand(88, 90, 95, 75);
      expect(band.status).toBe('BELOW_FLOOR');
      expect(Math.abs(band.deltaFromFloor)).toBe(2);
      expect(band.requiresOverride).toBe(true);
      expect(band.chipLabel).toContain('Below floor by ₹2');

      const credit = evaluateCreditExposure(100000, 50000, 10000, false);
      const approval = evaluateOrderApprovalNeed(
        [{ itemName: 'Fresh Malai Paneer 200g', unitPrice: 88, floorPrice: 90, targetPrice: 95 }],
        credit,
      );

      expect(approval.primaryAction).toBe('SEND_FOR_APPROVAL');
      expect(approval.buttonLabel).toBe('Send for Owner approval');
      expect(approval.reasons[0]).toContain("₹2 below today's floor");
    });
  });

  // 2. TC-F4-AC02: Credit Exposure (BR-02) & ATP Stock (BR-04)
  describe('TC-F4-AC02: Credit Breach (BR-02) & ATP Stock Guidance (BR-04)', () => {
    it('flags credit breach when projected outstanding exceeds credit limit', () => {
      const credit = evaluateCreditExposure(100000, 80000, 25000, false);
      expect(credit.status).toBe('BREACH');
      expect(credit.projectedOutstanding).toBe(105000);
      expect(credit.breachAmount).toBe(5000);
      expect(credit.requiresApproval).toBe(true);
      expect(credit.reason).toContain('Over credit limit');

      const approval = evaluateOrderApprovalNeed(
        [{ itemName: 'Paneer', unitPrice: 95, floorPrice: 90, targetPrice: 95 }],
        credit,
      );
      expect(approval.primaryAction).toBe('SEND_FOR_APPROVAL');
    });

    it('flags manual credit hold even if within numeric limit', () => {
      const credit = evaluateCreditExposure(100000, 10000, 5000, true);
      expect(credit.status).toBe('HOLD');
      expect(credit.requiresApproval).toBe(true);
    });

    it('provides non-technical stock shortfall guidance by item category (BR-04)', () => {
      const fgShort = evaluateStockAvailability(100, 150, 'PROCESSED_FG');
      expect(fgShort.status).toBe('SHORT');
      expect(fgShort.shortQty).toBe(50);
      expect(fgShort.suggestion).toContain('Will be produced');

      const tradedShort = evaluateStockAvailability(20, 50, 'TRADED_GOOD');
      expect(tradedShort.status).toBe('SHORT');
      expect(tradedShort.shortQty).toBe(30);
      expect(tradedShort.suggestion).toContain('Back-to-back purchase suggested');

      const okStock = evaluateStockAvailability(1200, 500, 'PROCESSED_FG');
      expect(okStock.status).toBe('AVAILABLE');
    });
  });

  // 3. TC-F4-AC03: Counter Offer & Live 30s Polling on Order Detail
  describe('TC-F4-AC03: Order Detail Lifecycle, Counter Offer & 30s Polling', () => {
    it('defines 9-step order lifecycle and cancel reason choices', () => {
      expect(ORDER_LIFECYCLE_STEPS).toHaveLength(9);
      expect(ORDER_LIFECYCLE_STEPS[0]).toBe('Draft');
      expect(ORDER_LIFECYCLE_STEPS[8]).toBe('Paid');
      expect(CANCEL_REASONS).toContain('Customer cancelled');
      expect(CANCEL_REASONS).toContain('Out of stock');
    });

    it('verifies Order Detail page implements 30s polling and Accept counter workflow', () => {
      const file = path.resolve(__dirname, '../../app/(office)/sales/orders/[id]/page.tsx');
      expect(fs.existsSync(file)).toBe(true);
      const content = fs.readFileSync(file, 'utf8');

      expect(content).toContain('30000');
      expect(content).toContain('Waiting for Owner Approval');
      expect(content).toContain('Owner suggests ₹');
      expect(content).toContain('Accept counter');
      expect(content).toContain('accept-counter');
    });
  });

  // 4. TC-F4-AC04: Quick Order Guided + Express Modes & Keyboard Shortcuts
  describe('TC-F4-AC04: Quick Order Entry Modes, Keyboard Shortcuts & Price Memory', () => {
    it('verifies Quick Order screen implements Guided/Express modes, keyboard shortcuts, and price memory', () => {
      const file = path.resolve(__dirname, '../../app/(office)/sales/orders/new/page.tsx');
      expect(fs.existsSync(file)).toBe(true);
      const content = fs.readFileSync(file, 'utf8');

      expect(content).toContain('Guided (3-step)');
      expect(content).toContain('Express (Keyboard)');
      expect(content).toContain('Ctrl+Enter');
      expect(content).toContain('Ctrl+S');
      expect(content).toContain('Last Prices');
      expect(content).toContain('Draft saved');
      expect(content).toContain('Duplicate');
    });
  });

  // 5. TC-F4-AC05: Today's Prices Sheet & Auto-Floor Formula
  describe("TC-F4-AC05: Today's Prices Auto-Floor, Bulk Tools & Publish", () => {
    it('calculates auto-floor price rounded up to nearest ₹0.50', () => {
      // 75 / (1 - 0.16) = 75 / 0.84 = 89.2857 -> rounds up to 89.50
      expect(calculateAutoFloorPrice(75, 16)).toBe(89.5);
      // 112 / (1 - 0.15) = 112 / 0.85 = 131.76 -> rounds up to 132.00
      expect(calculateAutoFloorPrice(112, 15)).toBe(132);
    });

    it("verifies Today's Prices screen includes bulk tools, missing alert, and PUT /prices/:date", () => {
      const file = path.resolve(__dirname, '../../app/(office)/sales/prices/page.tsx');
      expect(fs.existsSync(file)).toBe(true);
      const content = fs.readFileSync(file, 'utf8');

      expect(content).toContain("Copy yesterday's prices");
      expect(content).toContain('Apply +2% to selected');
      expect(content).toContain('Use suggested floors');
      expect(content).toContain('Publish prices');
      expect(content).toContain('/api/proxy/prices/');
      expect(content).toContain('Target Rates Only');
    });
  });

  // 6. TC-F4-AC06: Masked Roles Visibility
  describe('TC-F4-AC06: Role-Based Margin & Cost Masking', () => {
    it('allows margin/cost visibility only for OWNER', () => {
      expect(canViewMarginAndCost('OWNER')).toBe(true);
      expect(canViewMarginAndCost('OPS_COORD')).toBe(false);
      expect(canViewMarginAndCost('PROD_MGR')).toBe(false);
      expect(canViewMarginAndCost('DRIVER')).toBe(false);
      expect(canViewMarginAndCost('STOREKEEPER')).toBe(false);
      expect(canViewMarginAndCost('COLLECTOR')).toBe(false);
      expect(canViewMarginAndCost(null)).toBe(false);
    });

    it('verifies margin fields are guarded by isOwner checks in UI pages', () => {
      const orderNew = fs.readFileSync(
        path.resolve(__dirname, '../../app/(office)/sales/orders/new/page.tsx'),
        'utf8',
      );
      expect(orderNew).toContain('{isOwner && (');
      expect(orderNew).toContain('Margin (Owner Only)');

      const cust360 = fs.readFileSync(
        path.resolve(__dirname, '../../app/(office)/sales/customers/[id]/page.tsx'),
        'utf8',
      );
      expect(cust360).toContain('{isOwner && (');
      expect(cust360).toContain('Avg Margin (Owner)');
    });
  });

  // 7. TC-F4-AC07: Customer 360 Statement Running Balance & 10 Tabs
  describe('TC-F4-AC07: Customer 360 Running Ledger Balance & CRM Tabs', () => {
    it('computes running ledger balance accurately across invoices and payments', () => {
      const entries = [
        { id: '1', date: '2026-11-01', type: 'OPENING' as const, reference: 'OB', description: 'Opening', debit: 50000, credit: 0 },
        { id: '2', date: '2026-11-05', type: 'INVOICE' as const, reference: 'INV-1', description: 'Sale', debit: 42000, credit: 0 },
        { id: '3', date: '2026-11-08', type: 'PAYMENT' as const, reference: 'PMT-1', description: 'NEFT', debit: 0, credit: 32000 },
        { id: '4', date: '2026-11-12', type: 'INVOICE' as const, reference: 'INV-2', description: 'Sale', debit: 20000, credit: 0 },
      ];

      const result = computeRunningLedgerBalance(entries);
      expect(result.map((r) => r.runningBalance)).toEqual([50000, 92000, 60000, 80000]);
    });

    it('verifies Customer 360 includes all 10 tabs and activity logging', () => {
      const file = path.resolve(__dirname, '../../app/(office)/sales/customers/[id]/page.tsx');
      expect(fs.existsSync(file)).toBe(true);
      const content = fs.readFileSync(file, 'utf8');

      for (const tab of ['Overview', 'Orders', 'Invoices', 'Statement', 'Payments', 'Promises', 'Price History', 'Contacts', 'Activity', 'Documents']) {
        expect(content).toContain(tab);
      }
      expect(content).toContain('Log Customer Activity');
    });
  });

  // 8. TC-F4-AC08: Orders Tracker, Sales Board, Quotes & Sales Returns Screens
  describe('TC-F4-AC08: Orders Tracker, Sales Board, Quotes & Sales Returns Coverage', () => {
    it('verifies Orders Tracker supports Table, Kanban, Calendar and Saved Views', () => {
      const file = path.resolve(__dirname, '../../app/(office)/sales/orders/page.tsx');
      expect(fs.existsSync(file)).toBe(true);
      const content = fs.readFileSync(file, 'utf8');

      expect(content).toContain('Orders Tracker');
      expect(content).toContain('Saved Views');
      expect(content).toContain('My orders today');
      expect(content).toContain('Ready for Pune route');
    });

    it('verifies Sales Board Kanban screen exists', () => {
      const file = path.resolve(__dirname, '../../app/(office)/sales/board/page.tsx');
      expect(fs.existsSync(file)).toBe(true);
      const content = fs.readFileSync(file, 'utf8');
      expect(content).toContain('Sales Board (Kanban)');
    });

    it('verifies Quotes list, create, and 1-click convert pages exist', () => {
      expect(fs.existsSync(path.resolve(__dirname, '../../app/(office)/sales/quotes/page.tsx'))).toBe(true);
      expect(fs.existsSync(path.resolve(__dirname, '../../app/(office)/sales/quotes/new/page.tsx'))).toBe(true);
      const detail = fs.readFileSync(
        path.resolve(__dirname, '../../app/(office)/sales/quotes/[id]/page.tsx'),
        'utf8',
      );
      expect(detail).toContain('Convert to Order');
      expect(detail).toContain('/convert');
    });

    it('verifies Sales Returns page exists with Resaleable/Damaged condition and credit note request', () => {
      const file = path.resolve(__dirname, '../../app/(office)/sales/returns/page.tsx');
      expect(fs.existsSync(file)).toBe(true);
      const content = fs.readFileSync(file, 'utf8');

      expect(content).toContain('Sales Returns');
      expect(content).toContain('Resaleable');
      expect(content).toContain('Damaged');
      expect(content).toContain('/api/proxy/credit-notes');
    });
  });
});
