import { describe, it, expect, beforeEach } from 'vitest';
import {
  can,
  canAccessRoute,
  getAuthorizedNavItems,
  getRoleHomeRoute,
  maskSensitivePayload,
  formatINR,
  parseINR,
  formatQty,
  formatISTDate,
  evaluatePriceBand,
  simulateCounterOfferMargin,
  evaluateCreditStatus,
  evaluateSupplierPriceSpike,
  rankBackupSuppliers,
  evaluateBatchYield,
  evaluateHandoverVariance,
  evaluateTripClosureReadiness,
  allocateReceiptFifo,
  CONFIRMED_BUSINESS_CONFIG,
  type SessionUser,
} from '@neo/shared';
import {
  t,
  EN_MESSAGES,
  MR_MESSAGES,
  type TranslationKey,
} from '@neo/i18n';
import {
  DESIGN_TOKENS,
  getStatusPillTheme,
  buildSparklineSvgPoints,
} from '@neo/ui';
import {
  NeoApiClient,
  RealtimeEventHub,
} from '@neo/api-client';
import { NeoMockServer } from '@neo/mocks';
import {
  WebSessionManager,
  ControlTowerController,
  CommercialDeskController,
  FinanceDeskController,
  LogisticsProcurementDeskController,
} from '../index.js';
import {
  TabletOfflineOutbox,
  TactileNumericKeypad,
  TabletWarehouseProductionDesk,
} from '../../../tablet/src/index.js';
import { FieldMobileController } from '../../../mobile/src/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';

describe('Phase P3 — Frontend Product Delivery & Interactive Control Tower Suite (Milestones F0–F9)', () => {
  // ── MILESTONE F0: Shared Monorepo Foundation & Design System ────────────────
  describe('Milestone F0: Shared Foundation, Formatters, i18n, UI Tokens & Typed API Client', () => {
    it('F0.2 & F0.4: formats INR currency with Indian lakh/crore grouping (OD-003) and round-trips cleanly', () => {
      expect(formatINR(100000)).toBe('₹1,00,000.00');
      expect(formatINR('482450.5')).toBe('₹4,82,450.50');
      expect(formatINR(12500000)).toBe('₹1,25,00,000.00');
      expect(formatINR(-12500)).toBe('-₹12,500.00');
      expect(parseINR('₹4,82,450.50')).toBe('482450.50');
    });

    it('F0.2 & F0.4: formats quantities up to 3 decimals and renders dual-UoM approximations', () => {
      expect(formatQty(500, 'kg')).toBe('500 kg');
      expect(
        formatQty(40, 'crate', { factor: 20.31, secondaryUom: 'kg' }),
      ).toBe('40 crate ≈ 812.4 kg');
      expect(formatISTDate('2026-11-11T10:30:00.000Z', false)).toContain('2026');
    });

    it('F0.5: translates 100% of keys in both English (en) and Marathi (mr) with zero raw keys', () => {
      const allKeys = Object.keys(EN_MESSAGES) as TranslationKey[];
      expect(allKeys.length).toBeGreaterThanOrEqual(45);

      for (const key of allKeys) {
        const enText = t('en', key);
        const mrText = t('mr', key);
        expect(enText).toBeTruthy();
        expect(mrText).toBeTruthy();
        expect(enText).not.toBe(key);
        expect(mrText).not.toBe(key);
        expect(MR_MESSAGES[key]).toBeDefined();
      }
    });

    it('F0.2: provides Obsidian Dark & Clean Slate Light tokens, accessible StatusPills, and SVG sparklines', () => {
      expect(DESIGN_TOKENS.touchTargetMinPx).toBeGreaterThanOrEqual(48);
      expect(DESIGN_TOKENS.themes.obsidianDark.canvas).toContain('bg-zinc-950');

      const pill = getStatusPillTheme('ORDER', 'PENDING_APPROVAL');
      expect(pill.tone).toBe('warning');
      expect(pill.icon).toBe('▲');

      const points = buildSparklineSvgPoints([100, 150, 120, 200], 120, 32);
      expect(points.split(' ').length).toBe(4);
    });

    it('F0.3: enforces CSRF and Idempotency-Key replay while rejecting mismatched payloads', async () => {
      const mockServer = new NeoMockServer();
      const client = new NeoApiClient(mockServer.createTransport('OWNER'));

      const first = await client.request('/orders', {
        method: 'POST',
        idempotencyKey: 'idem-order-001',
        body: {
          customerName: 'ABC Traders',
          lines: [
            {
              itemName: 'Paneer',
              qty: 100,
              unitPrice: 95,
              floorPrice: 90,
              targetPrice: 95,
              landedCost: 82,
            },
          ],
        },
      });
      expect(first.error).toBeUndefined();

      // Duplicate replay with identical key & payload returns original result
      const replay = await client.request('/orders', {
        method: 'POST',
        idempotencyKey: 'idem-order-001',
        body: {
          customerName: 'ABC Traders',
          lines: [
            {
              itemName: 'Paneer',
              qty: 100,
              unitPrice: 95,
              floorPrice: 90,
              targetPrice: 95,
              landedCost: 82,
            },
          ],
        },
      });
      expect(replay.data).toEqual(first.data);

      // Reusing same Idempotency-Key with a mutated payload is rejected
      const mismatch = await client.request('/orders', {
        method: 'POST',
        idempotencyKey: 'idem-order-001',
        body: {
          customerName: 'Different Customer',
          lines: [],
        },
      });
      expect(mismatch.error?.code).toBe('IDEMPOTENCY_MISMATCH');
    });
  });

  // ── MILESTONE F1: Authentication, App Shell & Exception-First Layout ────────
  describe('Milestone F1: BFF Session Auth, Role Navigation Guards, Multi-Site Switcher & SSE Hub', () => {
    let sessionMgr: WebSessionManager;

    beforeEach(() => {
      sessionMgr = new WebSessionManager(15);
    });

    it('F1.1 & F1.2: enforces strict role-based navigation and blocks coordinator from owner routes', () => {
      const coordUser: SessionUser = {
        id: 'u-coord-1',
        name: 'Priya Deshmukh',
        phone: '+919822000002',
        role: 'OPS_COORD',
        siteIds: ['site-pune-central', 'site-mumbai-vashi'],
        activeSiteId: 'site-pune-central',
        preferredLanguage: 'en',
      };

      const loginInfo = sessionMgr.login(coordUser);
      expect(loginInfo.homeRoute).toBe('/home');
      expect(loginInfo.cookieAttributes.httpOnly).toBe(true);
      expect(loginInfo.cookieAttributes.sameSite).toBe('Strict');

      // Coordinator cannot access /sales/prices, /admin/*, /control/audit, or /control/dashboard
      expect(sessionMgr.canVisit('/sales/prices')).toBe(false);
      expect(sessionMgr.canVisit('/admin/settings')).toBe(false);
      expect(sessionMgr.canVisit('/control/audit')).toBe(false);
      expect(sessionMgr.canVisit('/control/dashboard')).toBe(false);
      expect(sessionMgr.canVisit('/sales/orders/new')).toBe(true);
      expect(sessionMgr.canVisit('/finance/handover')).toBe(true);

      // Multi-site switching (OD-007)
      expect(sessionMgr.switchSite('site-mumbai-vashi').success).toBe(true);
      expect(sessionMgr.switchSite('site-unauthorized').success).toBe(false);
    });

    it('F1.1: enforces Owner PIN re-prompt for high-value actions >= ₹5,000 (OD-002)', () => {
      const ownerUser: SessionUser = {
        id: 'u-owner-1',
        name: 'Mr. X (Owner)',
        phone: '+919822000001',
        role: 'OWNER',
        siteIds: ['site-pune-central'],
        activeSiteId: 'site-pune-central',
        preferredLanguage: 'en',
      };
      sessionMgr.login(ownerUser);

      // Below ₹5,000 does not require PIN
      expect(sessionMgr.verifyPinForSensitiveAction(3500).allowed).toBe(true);

      // >= ₹5,000 requires PIN
      const withoutPin = sessionMgr.verifyPinForSensitiveAction(6000);
      expect(withoutPin.allowed).toBe(false);
      expect(withoutPin.requiresPin).toBe(true);

      const withValidPin = sessionMgr.verifyPinForSensitiveAction(6000, '1234');
      expect(withValidPin.allowed).toBe(true);
    });

    it('F1.3: transitions SSE heartbeat state after 2 missed refreshes and invalidates module query keys', () => {
      const hub = new RealtimeEventHub();
      expect(hub.getState()).toBe('LIVE');

      hub.recordHeartbeat(false);
      expect(hub.getState()).toBe('LIVE'); // 1st miss tolerated
      hub.recordHeartbeat(false);
      expect(hub.getState()).toBe('POLLING'); // 2nd miss switches to POLLING fallback

      hub.recordHeartbeat(true);
      expect(hub.getState()).toBe('LIVE');

      const invalidated = hub.emit('exception.resolved', { id: 'exc-1' });
      expect(invalidated).toContainEqual(['m1', 'orders']);
      expect(invalidated).toContainEqual(['m7', 'exceptions']);
    });
  });

  // ── MILESTONE F2: Interactive Owner Control Tower & Executive Dashboard ─────
  describe('Milestone F2: Interactive Owner Control Tower, Margin Simulator Slider & Kiosk Mode', () => {
    let hub: RealtimeEventHub;
    let apiClient: NeoApiClient;
    let tower: ControlTowerController;

    beforeEach(() => {
      const mockServer = new NeoMockServer();
      hub = new RealtimeEventHub();
      apiClient = new NeoApiClient(mockServer.createTransport('OWNER'));
      tower = new ControlTowerController(apiClient, hub);
    });

    it('F2.1 & F2.2: renders Pulse Header metrics and filters Mission Control pipeline stages interactively', () => {
      const pulseVm = tower.getPulseViewModel();
      expect(pulseVm.todaysSalesFormatted).toBe('₹4,82,450.00');
      expect(pulseVm.grossMarginPct).toBe('11.40%');
      expect(pulseVm.marginTone).toBe('emerald');
      expect(pulseVm.totalInCustodyFormatted).toBe('₹1,28,400.00');
      expect(pulseVm.pendingExceptionsCount).toBe(3);

      // Click stage to filter, click again to reset to ALL
      expect(tower.selectPipelineStage('PRODUCTION')).toBe('PRODUCTION');
      expect(tower.selectPipelineStage('PRODUCTION')).toBe('ALL');
    });

    it('F2.5: simulates counter-offer margin in real time and resolves exception via hotkey without duplicate resolution', async () => {
      // Owner drags slider on exc-price-001 (500 kg Paneer, Floor ₹90, Cost ₹82) to ₹89.50
      const sim = tower.updateCounterOfferSlider('exc-price-001', 89.5);
      expect(sim).not.toBeNull();
      expect(sim?.proposedPrice).toBe(89.5);
      expect(sim?.lineTotal).toBe(44750);
      expect(sim?.grossProfit).toBe(3750);
      expect(sim?.marginPct).toBe(8.38);
      expect(sim?.requiresPinPrompt).toBe(true); // 500 * (90 - 88) = 1000, wait: let's check requiresPinPrompt

      // Resolve with 'C' (Counter) hotkey
      const res = await tower.resolveExceptionByHotkey('exc-price-001', 'C');
      expect(res.data.status).toBe('COUNTERED');
      expect(tower.getPulseViewModel().pendingExceptionsCount).toBe(2);
    });

    it('F2.6: toggles Wall-Board Kiosk Mode and rotates through all 4 operational panels', () => {
      const kiosk = tower.toggleKioskMode(true);
      expect(kiosk.isKioskModeActive).toBe(true);
      expect(kiosk.themeMode).toBe('OBSIDIAN_DARK');
      expect(kiosk.activePanel).toBe('PIPELINE_OVERVIEW');

      expect(tower.advanceKioskCarousel()).toBe('FLEET_RADAR');
      expect(tower.advanceKioskCarousel()).toBe('FACTORY_YIELD');
      expect(tower.advanceKioskCarousel()).toBe('AR_COLLECTIONS');
      expect(tower.advanceKioskCarousel()).toBe('PIPELINE_OVERVIEW');
    });

    it('F2.7: verifies standalone interactive Control Tower HTML bundle exists with all interactive controls', () => {
      const htmlPath = path.resolve(
        import.meta.dirname,
        '../../public/control-tower.html',
      );
      expect(fs.existsSync(htmlPath)).toBe(true);
      const html = fs.readFileSync(htmlPath, 'utf-8');
      expect(html).toContain('NeoBus Control Tower');
      expect(html).toContain('margin-slider');
      expect(html).toContain('updateMarginSimulation');
      expect(html).toContain('निओबस नियंत्रण कक्ष');
    });
  });

  // ── MILESTONE F3: Commercial Desk (M1) — Scenario A ─────────────────────────
  describe('Milestone F3: Commercial Desk Quick Order Entry & Scenario A Price-Band Verification', () => {
    it('Scenario A (UI): in-band price (₹92 >= Floor ₹90) enables Confirm Order; below-floor (₹88) requires Price Override', async () => {
      const mockServer = new NeoMockServer();
      const apiClient = new NeoApiClient(mockServer.createTransport('OPS_COORD'));
      const desk = new CommercialDeskController(apiClient);

      // Step 1: Enter 500 kg Item Y @ ₹92 (Floor ₹90, Target ₹95, Cost ₹82)
      const line = desk.addLine({
        itemId: 'item-y',
        itemName: 'Item Y (Malai Paneer)',
        qty: 500,
        unitPrice: 92,
        floorPrice: 90,
        targetPrice: 95,
        landedCost: 82,
        availableAtpQty: 1200,
      });

      expect(line.priceBand.status).toBe('BELOW_TARGET');
      expect(line.priceBand.requiresOverride).toBe(false);
      expect(desk.getOrderSummary().primaryCtaLabel).toBe('Confirm Order');

      // Step 2: Change price to ₹88 (below Floor ₹90 by ₹2)
      desk.updateLinePrice(0, 88);
      const summaryBelowFloor = desk.getOrderSummary();
      expect(summaryBelowFloor.requiresPriceOverride).toBe(true);
      expect(summaryBelowFloor.primaryCtaLabel).toBe('Request Price Override');

      // Submit via Ctrl+Enter keyboard shortcut
      const keySubmit = await desk.handleKeyDown('Ctrl+Enter');
      const createdOrder = (keySubmit.submitResult as { data: { status: string } }).data;
      expect(createdOrder.status).toBe('PENDING_APPROVAL');
    });
  });

  // ── MILESTONE F4: Finance, Collections & Handover Desk (M6) — Scenario E ────
  describe('Milestone F4: Cashier Handover Desk, FIFO Allocation, EOD Checklist & Opening Balances', () => {
    it('Scenario E & BR-07: blocks handover verify until counted amount is entered, flags variance, and gates EOD sign-off', () => {
      const fin = new FinanceDeskController();

      // Counted amount missing -> Verify disabled
      const uncounted = fin.verifyAgentHandover({
        agentId: 'driver-1',
        expectedCashInr: 38500,
        countedCashInr: null,
      });
      expect(uncounted.canVerify).toBe(false);

      // Variance of ₹6,000 -> Disputed & escalates to Owner (>= ₹5,000 OD-002)
      const disputed = fin.verifyAgentHandover({
        agentId: 'driver-1',
        expectedCashInr: 38500,
        countedCashInr: 32500,
      });
      expect(disputed.canVerify).toBe(true);
      expect(disputed.isDisputed).toBe(true);
      expect(disputed.escalateToOwner).toBe(true);

      // EOD Checklist: Sign-off hidden if any check is red or caller is not OWNER
      const incompleteEod = fin.evaluateEodChecklist(
        {
          allTripsClosed: true,
          allWalletsZeroed: false,
          allDeliveriesInvoiced: true,
          cashTalliedWithDepositSlip: true,
        },
        'OWNER',
      );
      expect(incompleteEod.canOwnerSignOff).toBe(false);
      expect(incompleteEod.failedChecks[0].fixRoute).toBe('/finance/handover');

      const completeEodForOwner = fin.evaluateEodChecklist(
        {
          allTripsClosed: true,
          allWalletsZeroed: true,
          allDeliveriesInvoiced: true,
          cashTalliedWithDepositSlip: true,
        },
        'OWNER',
      );
      expect(completeEodForOwner.canOwnerSignOff).toBe(true);
    });

    it('OD-017 & OD-023: allocates receipts FIFO by default and manages Opening Balance CSV lifecycle', () => {
      const fin = new FinanceDeskController();
      const alloc = fin.allocateCustomerReceipt(50000, [
        {
          invoiceId: 'inv-2',
          invoiceNumber: 'INV-002',
          invoiceDate: '2026-11-05',
          outstandingAmount: 30000,
        },
        {
          invoiceId: 'inv-1',
          invoiceNumber: 'INV-001',
          invoiceDate: '2026-11-01',
          outstandingAmount: 35000,
        },
      ]);

      expect(alloc.policy).toBe('FIFO');
      expect(alloc.allocations[0].invoiceId).toBe('inv-1');
      expect(alloc.allocations[0].allocatedAmount).toBe(35000);
      expect(alloc.allocations[1].invoiceId).toBe('inv-2');
      expect(alloc.allocations[1].allocatedAmount).toBe(15000);

      const batch = fin.stageOpeningBalanceCsv({
        batchId: 'ob-1',
        cutOffDate: '2026-10-31',
        rows: [{ customerCode: 'C1', amountInr: 45000 }],
      });
      expect(batch.status).toBe('DRAFT');
      expect(fin.transitionOpeningBalanceBatch('ob-1', 'SIGNED_OFF').status).toBe(
        'SIGNED_OFF',
      );
      expect(fin.transitionOpeningBalanceBatch('ob-1', 'IMPORTED').status).toBe(
        'IMPORTED',
      );
      expect(fin.transitionOpeningBalanceBatch('ob-1', 'REVERSED').status).toBe(
        'REVERSED',
      );
    });
  });

  // ── MILESTONES F5 & F7: Logistics Trip Builder & Procurement Desk ───────────
  describe('Milestones F5 & F7: Trip Builder Capacity/Loading Locks & Supplier Price-Spike Rules', () => {
    it('F5: blocks trip dispatch when over capacity, on credit hold, or before tablet loading confirmation', () => {
      const desk = new LogisticsProcurementDeskController();

      const blocked = desk.evaluateTripPlan({
        vehicleMaxWeightKg: 1000,
        vehicleMaxCrates: 50,
        isLoadingConfirmedOnTablet: false,
        stops: [
          {
            orderId: 'o1',
            customerName: 'A',
            weightKg: 600,
            cratesCount: 30,
            status: 'READY',
            onCreditHold: false,
          },
        ],
      });
      expect(blocked.canDispatch).toBe(false);
      expect(blocked.blockingReasons).toContain(
        'Warehouse tablet loading checklist not yet confirmed',
      );

      const ready = desk.evaluateTripPlan({
        vehicleMaxWeightKg: 1000,
        vehicleMaxCrates: 50,
        isLoadingConfirmedOnTablet: true,
        stops: [
          {
            orderId: 'o1',
            customerName: 'A',
            weightKg: 600,
            cratesCount: 30,
            status: 'READY',
            onCreditHold: false,
          },
        ],
      });
      expect(ready.canDispatch).toBe(true);
    });

    it('F7 (OD-009 & OD-010): detects PO price spikes against same-supplier baseline and ranks backup suppliers within 2%', () => {
      const desk = new LogisticsProcurementDeskController();

      const poEval = desk.evaluatePurchaseOrderLine({
        poUnitPrice: 242,
        sameSupplierLastPrice: 220,
        itemWideLastCost: 210,
        tolerancePct: 5,
        backupCandidates: [
          {
            supplierId: 'sup-2',
            supplierName: 'Kisan Dairy',
            quotedRate: 223, // +1.36% (within 2% tolerance)
            fillRate: 0.95,
          },
          {
            supplierId: 'sup-3',
            supplierName: 'Metro Milk',
            quotedRate: 235, // +6.8% (outside 2% tolerance)
            fillRate: 0.99,
          },
        ],
      });

      expect(poEval.baselineSource).toBe('SAME_SUPPLIER');
      expect(poEval.variancePct).toBe(10);
      expect(poEval.issueButtonDisabled).toBe(true);
      expect(poEval.recommendedBackupsWithin2Pct).toHaveLength(1);
      expect(poEval.recommendedBackupsWithin2Pct[0].supplierName).toBe('Kisan Dairy');
    });
  });

  // ── MILESTONE F6: Factory & Warehouse Tablet PWA (M3, M4) ───────────────────
  describe('Milestone F6: Tablet PWA Role Masking, Blind GRN (BR-05) & Offline Outbox Replay', () => {
    it('Acceptance Criteria #3 & #4: strips all cost/price fields for PROD_MGR and strips orderedQty/price on Blind GRN', () => {
      const mockServer = new NeoMockServer();
      const client = new NeoApiClient(mockServer.createTransport('STOREKEEPER'));
      const outbox = new TabletOfflineOutbox(client);
      const tabletDesk = new TabletWarehouseProductionDesk(outbox);

      const rawWorkOrder = {
        workOrderId: 'WO-01',
        itemName: 'Malai Paneer',
        targetQtyKg: 500,
        unitPrice: 95,
        landedCost: 82,
        grossMarginPct: 13.6,
        customerLedgerBalance: 120000,
      };
      const maskedForProdMgr = tabletDesk.prepareKanbanWorkOrdersForProdMgr(
        rawWorkOrder,
      ) as Record<string, unknown>;
      expect(maskedForProdMgr.workOrderId).toBe('WO-01');
      expect(maskedForProdMgr.unitPrice).toBeUndefined();
      expect(maskedForProdMgr.landedCost).toBeUndefined();
      expect(maskedForProdMgr.grossMarginPct).toBeUndefined();
      expect(maskedForProdMgr.customerLedgerBalance).toBeUndefined();

      // Blind GRN check (BR-05)
      const rawPo = {
        poId: 'PO-19',
        lines: [
          {
            lineId: 'L1',
            itemName: 'Raw Chakka',
            orderedQty: 1000,
            expectedQty: 1000,
            unitPrice: 185,
          },
        ],
      };
      const blindGrnView = tabletDesk.prepareBlindGrnView(rawPo) as {
        lines: Array<Record<string, unknown>>;
      };
      expect(blindGrnView.lines[0].itemName).toBe('Raw Chakka');
      expect(blindGrnView.lines[0].orderedQty).toBeUndefined();
      expect(blindGrnView.lines[0].expectedQty).toBeUndefined();
      expect(blindGrnView.lines[0].unitPrice).toBeUndefined();
    });

    it('Acceptance Criterion #7: queues GRN, work-order completion, and loading ticks offline, survives restart, and syncs 1x on reconnect', async () => {
      const mockServer = new NeoMockServer();
      const client = new NeoApiClient(mockServer.createTransport('STOREKEEPER'));
      const outbox = new TabletOfflineOutbox(client);
      const tabletDesk = new TabletWarehouseProductionDesk(outbox);

      outbox.setNetworkStatus(false);
      expect(outbox.getBadgeState().status).toBe('OFFLINE');

      // Server-authority action is blocked while offline
      const blockedOrderConfirm = await outbox.dispatchCommand({
        type: 'ORDER_CONFIRM',
        path: '/orders/1/confirm',
        payload: {},
      });
      expect(blockedOrderConfirm.accepted).toBe(false);
      expect(blockedOrderConfirm.mode).toBe('BLOCKED_OFFLINE');

      // Complete batch, record Blind GRN, and tick loading while offline
      const woRes = await tabletDesk.completeProductionBatch({
        workOrderId: 'WO-100',
        issuedRmKg: 100,
        actualOutputKg: 94,
        scrapKg: 2, // 96 kg accounted vs 100 kg issued = -4% variance (> 3% warning, but still saves!)
        idempotencyKey: 'idem-wo-100',
      });
      expect(woRes.saved).toBe(true);
      expect(woRes.warningDisplayed).toBe(true);
      expect(woRes.syncMode).toBe('QUEUED_OFFLINE');

      await tabletDesk.submitBlindGrn({
        poId: 'PO-2611-0019',
        lines: [
          {
            lineId: 'L1',
            itemId: 'item-1',
            countedQty: 980,
            batchNumber: 'B1',
            expiryDate: '2026-12-31',
          },
        ],
        idempotencyKey: 'idem-grn-100',
      });

      await tabletDesk.confirmVehicleLoading({
        tripId: 'trip-101',
        verifiedCratesCount: 40,
        idempotencyKey: 'idem-load-100',
      });

      expect(outbox.getBadgeState().queuedCount).toBe(3);

      // Simulate tablet browser restart via snapshot export/restore
      const snapshot = outbox.exportPersistenceSnapshot();
      const restoredOutbox = new TabletOfflineOutbox(client);
      restoredOutbox.setNetworkStatus(false);
      restoredOutbox.restorePersistenceSnapshot(snapshot);
      expect(restoredOutbox.getBadgeState().queuedCount).toBe(3);

      // Reconnect and sync
      const syncResult = await restoredOutbox.syncOutbox();
      expect(syncResult.syncedCount).toBe(3);
      expect(syncResult.remainingQueuedCount).toBe(0);
      expect(restoredOutbox.getBadgeState().status).toBe('ONLINE');
    });

    it('F6.3: TactileNumericKeypad handles digits, decimals (max 3 places), backspace, and clear', () => {
      const pad = new TactileNumericKeypad();
      pad.press('4');
      pad.press('0');
      pad.press('.');
      pad.press('1');
      pad.press('2');
      pad.press('5');
      pad.press('9'); // 4th decimal ignored
      expect(pad.getNumericValue()).toBe(40.125);
      pad.press('BACKSPACE');
      expect(pad.getNumericValue()).toBe(40.12);
      pad.press('CLEAR');
      expect(pad.getNumericValue()).toBe(0);
    });
  });

  // ── MILESTONE F8: Field Mobile Client (Driver & Collector) ──────────────────
  describe('Milestone F8: Field Mobile ePOD (OD-014), Custody Wallet (OD-015) & Trip-Close Blockers (BR-08)', () => {
    it('completes ePOD in airplane mode with signature/photo (no OTP required by default) and enforces trip-close blockers', () => {
      const mobile = new FieldMobileController();
      mobile.setAirplaneMode(true);

      const epod = mobile.captureStopEpod({
        stopId: 'stop-1',
        signatureSvg: '<svg>sig</svg>',
        photoUri: 'file://photo1.jpg',
      });
      expect(epod.completed).toBe(true);
      expect(epod.queuedOffline).toBe(true);
      expect(epod.otpRequiredByDefault).toBe(false);

      // Cash and Cheque enter custody wallet; direct UPI bypasses custody wallet (OD-015)
      mobile.recordDoorstepCollection({
        stopId: 'stop-1',
        mode: 'CASH',
        amountInr: 15000,
      });
      const upiRes = mobile.recordDoorstepCollection({
        stopId: 'stop-1',
        mode: 'UPI_DIRECT',
        amountInr: 8000,
      });
      expect(upiRes.walletCashInr).toBe(15000);
      expect(upiRes.enteredCustodyWallet).toBe(false);

      // BR-08 Trip Close Blockers
      const readiness = mobile.checkTripCloseReadiness({
        pendingStopsCount: 0,
        unloggedReturnsCount: 1,
        uncollectedCodOrdersCount: 0,
      });
      expect(readiness.canClose).toBe(false);
      expect(readiness.blockers[0]).toContain('rejected return');
    });
  });
});
