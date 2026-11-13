import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  allocateReceiptFifo,
  evaluateEodChecklist,
  evaluateHandoverVariance,
  formatINR,
  generateTallyXmlBatch,
  processChequeTransition,
  transitionOpeningBalanceBatch,
} from '@neo/shared';
import { INITIAL_INVOICES, INITIAL_TALLY_VOUCHERS } from '../lib/finance-data';

const OFFICE_APP_DIR = path.resolve(__dirname, '../../app/(office)');

describe('Phase F9 — Finance, Collections & Accounts', () => {
  it('AC1: records payment with FIFO allocation updating oldest invoice balances first', () => {
    const sahyadriOpen = INITIAL_INVOICES.filter((i) => i.customerId === 'cust-1' && i.balanceAmount > 0);
    const res = allocateReceiptFifo(
      65000,
      sahyadriOpen.map((i) => ({
        invoiceId: i.id,
        invoiceNumber: i.invoiceNo,
        invoiceDate: i.invoiceDate,
        outstandingAmount: i.balanceAmount,
      })),
    );
    expect(res.allocations).toEqual([
      { invoiceId: 'inv-101', invoiceNumber: 'INV-2026-0101', allocatedAmount: 60000, remainingInvoiceBalance: 0 },
      { invoiceId: 'inv-102', invoiceNumber: 'INV-2026-0102', allocatedAmount: 5000, remainingInvoiceBalance: 53400 },
    ]);
    expect(res.unallocatedAdvance).toBe(0);
  });

  it('AC2: handover with non-zero variance is Disputed; zero variance verifies', () => {
    const missingCount = evaluateHandoverVariance(42500, null);
    expect(missingCount.canVerify).toBe(false);

    const disputed = evaluateHandoverVariance(42500, 37000);
    expect(disputed.canVerify).toBe(true);
    expect(disputed.cashVariance).toBe(-5500);
    expect(disputed.isDisputed).toBe(true);
    expect(disputed.escalateToOwner).toBe(true);

    const verified = evaluateHandoverVariance(42500, 42500);
    expect(verified.canVerify).toBe(true);
    expect(verified.isDisputed).toBe(false);
    expect(verified.cashVariance).toBe(0);
  });

  it('AC3: EOD sign-off blocked until all checks green; non-zero wallet links to handover desk', () => {
    const blocked = evaluateEodChecklist({
      openTripsCount: 0,
      nonZeroFieldWalletsCount: 1,
      uninvoicedDeliveriesCount: 0,
      pendingHandoversCount: 0,
      undepositedChequesCount: 0,
      depositSlipPrepared: true,
    });
    expect(blocked.canSignOff).toBe(false);
    const walletRow = blocked.rows.find((r) => r.key === 'wallets');
    expect(walletRow?.passed).toBe(false);
    expect(walletRow?.fixHref).toBe('/finance/handovers');

    const ready = evaluateEodChecklist({
      openTripsCount: 0,
      nonZeroFieldWalletsCount: 0,
      uninvoicedDeliveriesCount: 0,
      pendingHandoversCount: 0,
      undepositedChequesCount: 0,
      depositSlipPrepared: true,
    });
    expect(ready.canSignOff).toBe(true);
  });

  it('AC4: cheque bounce updates status, reverses allocation, and restores customer balance', () => {
    const deposited = processChequeTransition('RECEIVED', 'DEPOSIT', 15000);
    expect(deposited.nextStatus).toBe('DEPOSITED');

    const bounced = processChequeTransition(deposited.nextStatus, 'BOUNCE', 15000);
    expect(bounced.nextStatus).toBe('BOUNCED');
    expect(bounced.reversesAllocation).toBe(true);
    expect(bounced.raisesFollowUp).toBe(true);
    expect(bounced.customerBalanceDelta).toBe(15000);
  });

  it('AC5: Tally export batch generates valid XML for selected range and voucher types', () => {
    const batch = generateTallyXmlBatch({
      fromDate: '2026-11-11',
      toDate: '2026-11-13',
      voucherTypes: ['Sales', 'Receipt'],
      vouchers: INITIAL_TALLY_VOUCHERS,
    });
    expect(batch.includedCount).toBe(3);
    expect(batch.xml).toContain('<ENVELOPE>');
    expect(batch.xml).toContain('<VOUCHER VCHTYPE="Sales" ACTION="Create">');
    expect(batch.xml).toContain('INV-2026-0104');
    expect(batch.xml).not.toContain('CN-2026-009');
  });

  it('AC6: opening balance import follows DRAFT -> SIGNED_OFF -> IMPORTED -> REVERSED', () => {
    const s1 = transitionOpeningBalanceBatch('DRAFT', 'SIGN_OFF', '2026-11-01');
    expect(s1).toBe('SIGNED_OFF');
    const s2 = transitionOpeningBalanceBatch(s1, 'IMPORT');
    expect(s2).toBe('IMPORTED');
    const s3 = transitionOpeningBalanceBatch(s2, 'REVERSE');
    expect(s3).toBe('REVERSED');
  });

  it('AC7: formats INR amounts with Indian grouping and exact two decimals (no float artefacts)', () => {
    expect(formatINR(100000)).toBe('₹1,00,000.00');
    expect(formatINR('42500.5')).toBe('₹42,500.50');
    expect(formatINR(0.1 + 0.2)).toBe('₹0.30');
  });

  it('renders all Phase F9 pages and registers Money (Finance) + Opening Balances sidebar links', () => {
    const requiredPages = [
      'finance/page.tsx',
      'finance/invoices/page.tsx',
      'finance/receivables/page.tsx',
      'finance/collections/page.tsx',
      'finance/handovers/page.tsx',
      'finance/cheques/page.tsx',
      'finance/credit-notes/page.tsx',
      'finance/cod/page.tsx',
      'finance/ptp/page.tsx',
      'finance/eod/page.tsx',
      'finance/payables/page.tsx',
      'finance/tally/page.tsx',
      'admin/opening-balances/page.tsx',
    ];
    for (const rel of requiredPages) {
      expect(fs.existsSync(path.join(OFFICE_APP_DIR, rel))).toBe(true);
    }

    const layoutContent = fs.readFileSync(path.join(OFFICE_APP_DIR, 'layout.tsx'), 'utf8');
    expect(layoutContent).toContain('/finance');
    expect(layoutContent).toContain('/finance/invoices');
    expect(layoutContent).toContain('/finance/receivables');
    expect(layoutContent).toContain('/finance/collections');
    expect(layoutContent).toContain('/finance/handovers');
    expect(layoutContent).toContain('/finance/cheques');
    expect(layoutContent).toContain('/finance/credit-notes');
    expect(layoutContent).toContain('/finance/cod');
    expect(layoutContent).toContain('/finance/ptp');
    expect(layoutContent).toContain('/finance/payables');
    expect(layoutContent).toContain('/finance/eod');
    expect(layoutContent).toContain('/finance/tally');
    expect(layoutContent).toContain('/admin/opening-balances');
  });
});

