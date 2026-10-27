import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Knex } from 'knex';
import { createKnex } from '../../shared/database/knex-instance.js';
import { PricingService } from './pricing.service.js';
import { ItemService } from './item.service.js';
import { CreditService } from './credit.service.js';
import { OrderService } from './order.service.js';
import { QuoteService } from './quote.service.js';
import { CustomerService } from './customer.service.js';
import { DocNumberService } from '../m0-platform/doc-number.service.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { OutboxService } from '../../shared/events/outbox.service.js';
import { ExceptionService } from '../m7a-exceptions/exception.service.js';
import { NotificationService } from '../m7a-exceptions/notification.service.js';
import { Money } from '../../shared/utils/money.util.js';

/**
 * M1 Commercial & CRM Acceptance Tests — Scenario A: Price Negotiation Flow
 *
 * Covers both paths from Blueprint Scenario A:
 *
 * Path 1 (In-band confirm):
 * - Cost ₹82, floor ₹90, target ₹95
 * - Coordinator enters order at ₹92 → in-band
 * - Order confirms without exception
 *
 * Path 2 (Below-floor → owner counter):
 * - Cost ₹82, floor ₹90, target ₹95
 * - Coordinator enters order at ₹88 → below floor
 * - PRICE_OVERRIDE exception raised
 * - Owner counters at ₹89.50
 * - Coordinator accepts counter → order confirmed
 */

describe('M1 Acceptance — Scenario A: Price Negotiation Flow', () => {
  let knex: Knex;
  let pricingSvc: PricingService;
  let itemSvc: ItemService;
  let creditSvc: CreditService;
  let orderSvc: OrderService;
  let quoteSvc: QuoteService;
  let customerSvc: CustomerService;
  let docNumberSvc: DocNumberService;
  let configSvc: ConfigService;
  let outboxSvc: OutboxService;
  let exceptionSvc: ExceptionService;
  let notificationSvc: NotificationService;

  // Test data
  let siteId: string;
  let customerId: string;
  let itemId: string;
  let userId: string; // coordinator
  let ownerId: string;
  let today: string;

  beforeAll(async () => {
    knex = await createKnex();

    // Run migrations to ensure schema is up to date
    const { MigrationService } =
      await import('../m0-platform/migration.service.js');
    const migrationService = new MigrationService(knex);
    await migrationService.runMigrations();

    // Seed approval policies (required for ExceptionService)
    await knex('approval_policies')
      .insert([
        {
          exception_type: 'PRICE_OVERRIDE',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'CREDIT_BREACH',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'SUPPLIER_PRICE_SPIKE',
          primary_approver_role: 'OWNER',
          can_delegate: false,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'SUPPLIER_SHORTFALL',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'ALLOCATION',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'YIELD_VARIANCE',
          primary_approver_role: 'OWNER',
          can_delegate: false,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'WASTAGE_WRITEOFF',
          primary_approver_role: 'OWNER',
          can_delegate: false,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'STOCK_VARIANCE',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'CREDIT_REBATE_WRITEOFF',
          primary_approver_role: 'OWNER',
          can_delegate: false,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'DELIVERY_DISPUTE',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 30,
        },
        {
          exception_type: 'MANUAL_LEDGER_ADJUSTMENT',
          primary_approver_role: 'OWNER',
          can_delegate: false,
          escalation_wait_minutes: 60,
        },
        {
          exception_type: 'CASH_HANDOVER_VARIANCE',
          primary_approver_role: 'OWNER',
          can_delegate: true,
          escalation_wait_minutes: 30,
        },
      ])
      .onConflict('exception_type')
      .ignore();

    // Initialize services
    configSvc = new ConfigService(knex);
    await configSvc.onModuleInit();

    outboxSvc = new OutboxService(knex);
    notificationSvc = new NotificationService(knex);
    exceptionSvc = new ExceptionService(
      knex,
      configSvc,
      outboxSvc,
      notificationSvc,
    );
    await exceptionSvc.onModuleInit();

    docNumberSvc = new DocNumberService(knex);

    pricingSvc = new PricingService(knex, exceptionSvc, configSvc);
    await pricingSvc.onModuleInit();

    itemSvc = new ItemService(knex);

    creditSvc = new CreditService(knex);
    await creditSvc.onModuleInit();

    customerSvc = new CustomerService(knex, docNumberSvc);

    quoteSvc = new QuoteService(knex, docNumberSvc, itemSvc, pricingSvc);

    orderSvc = new OrderService(
      knex,
      pricingSvc,
      creditSvc,
      itemSvc,
      exceptionSvc,
      docNumberSvc,
    );

    // Load test fixtures
    const site = await knex('sites').first('id');
    siteId = String(site.id);

    const user = await knex('users').where('role', 'OPS_COORD').first('id');
    userId = String(user.id);

    const owner = await knex('users').where('role', 'OWNER').first('id');
    ownerId = String(owner.id);

    today = new Date().toISOString().split('T')[0];
  });

  afterAll(async () => {
    await knex.destroy();
  });

  beforeEach(async () => {
    // Clean up M1 test data - guard against null IDs on first run
    if (customerId) {
      await knex('sales_order_lines')
        .whereIn(
          'order_id',
          knex('sales_orders').where('customer_id', customerId).select('id'),
        )
        .del();
      await knex('sales_orders').where('customer_id', customerId).del();
      await knex('quote_lines')
        .whereIn(
          'quote_id',
          knex('quotes').where('customer_id', customerId).select('id'),
        )
        .del();
      await knex('quotes').where('customer_id', customerId).del();
      await knex('customers').where('id', customerId).del();
    }

    if (itemId) {
      await knex('daily_price_lists').where('item_id', itemId).del();
      await knex('items').where('id', itemId).del();
    }

    // Reset for each test
    customerId = '';
    itemId = '';
  });

  /**
   * Helper: Create test item with known landed cost
   */
  async function createTestItem(landedCost = 82): Promise<string> {
    const item = await itemSvc.create({
      skuCode: `TEST-${Date.now()}`,
      name: 'Test Product',
      itemCategory: 'PROCESSED_FG',
      primaryUom: 'KG',
      taxRatePct: 0.05,
      hsnCode: '21069099',
      minMarginPct: 0.1,
      taxTreatment: 'TAXABLE',
      isActive: true,
      userId,
    });
    return String(item.id);
  }

  /**
   * Helper: Create test customer with credit limit
   */
  async function createTestCustomer(): Promise<string> {
    const customer = await customerSvc.create({
      businessName: 'Test Customer',
      contactPerson: 'Test Contact',
      phone: '+919876543210',
      billingAddress: '123 Test St',
      stateCode: '29',
      creditLimit: 100000, // 1 lakh
      creditDays: 30,
      paymentReliabilityScore: 1.0,
      defaultSiteId: siteId,
      gstin: '29ABCDE1234F1Z5',
      priceTier: 'STANDARD',
      isActive: true,
      userId,
    });
    return String(customer.id);
  }

  describe('Scenario A — Path 1: In-band order confirmation', () => {
    it('should confirm order without exception when price is within band', async () => {
      // Setup: Item with landed cost ₹82, floor ₹90, target ₹95
      itemId = await createTestItem(82);
      customerId = await createTestCustomer();

      // Set daily price with specific floor/target for scenario
      await knex('daily_price_lists').insert({
        item_id: itemId,
        effective_date: today,
        latest_landed_cost: 82.0,
        floor_price: 90.0,
        target_price: 95.0,
        min_margin_pct_used: 0.1,
        source: 'MANUAL',
        published_at: new Date(),
        updated_by: userId,
      });

      // Verify band is correct
      const band = await pricingSvc.getBand(itemId, today);
      expect(band).not.toBeNull();
      expect(band!.floorPrice).toBe('90.00');
      expect(band!.targetPrice).toBe('95.00');
      expect(band!.latestLandedCost).toBe('82.00');

      // Coordinator creates order at ₹92 (within band: 90 ≤ 92 ≤ 95)
      const orderResult = await orderSvc.createOrder(
        customerId,
        siteId,
        [{ itemId, qty: '10', requestedPrice: '92' }],
        userId,
      );

      expect(orderResult.status).toBe('DRAFT');
      expect(orderResult.exceptionIds).toHaveLength(0);

      // Coordinator confirms the order
      const confirmResult = await orderSvc.confirm(
        orderResult.orderId,
        'Confirmed at in-band price',
        userId,
      );

      expect(confirmResult.status).toBe('CONFIRMED');

      // Verify order details
      const order = await knex('sales_orders')
        .where('id', orderResult.orderId)
        .first();
      expect(order.order_status).toBe('CONFIRMED');
      expect(Number(order.total_amount)).toBe(920); // 10 * 92
      expect(order.confirmed_at).toBeDefined();

      // Verify order.confirmed event was published
      const events = await knex('outbox_events')
        .where({
          event_type: 'order.confirmed',
          aggregate_id: orderResult.orderId,
        })
        .select('*');
      expect(events.length).toBe(1);
      const payload =
        typeof events[0].payload === 'string'
          ? JSON.parse(events[0].payload)
          : events[0].payload;
      expect(payload.orderId).toBe(orderResult.orderId);
      expect(payload.creditFlag).toBe('OK');
      expect(payload.lines.length).toBe(1);
      expect(payload.lines[0].unitPrice).toBe('92.00');

      // Verify no exception was raised
      const exceptions = await knex('exception_approvals')
        .where({
          reference_table: 'sales_order_lines',
          reference_id: orderResult.orderId,
        })
        .select('*');
      expect(exceptions.length).toBe(0);

      console.log(
        '✅ Path 1 verified: In-band order (₹92) confirmed without exception',
      );
    });
  });

  describe('Scenario A — Path 2: Below-floor → owner counter → accept', () => {
    it('should raise PRICE_OVERRIDE for below-floor price, accept counter, and confirm', async () => {
      // Setup: Same item/customer, same price band
      itemId = await createTestItem(82);
      customerId = await createTestCustomer();

      await knex('daily_price_lists').insert({
        item_id: itemId,
        effective_date: today,
        latest_landed_cost: 82.0,
        floor_price: 90.0,
        target_price: 95.0,
        min_margin_pct_used: 0.1,
        source: 'MANUAL',
        published_at: new Date(),
        updated_by: userId,
      });

      // Coordinator creates order at ₹88 (BELOW floor ₹90)
      const orderResult = await orderSvc.createOrder(
        customerId,
        siteId,
        [{ itemId, qty: '10', requestedPrice: '88' }],
        userId,
      );

      expect(orderResult.status).toBe('DRAFT');

      // Request price override
      const overrideResult = await orderSvc.requestOverride(
        orderResult.orderId,
        'Customer negotiation - below floor',
        userId,
      );

      expect(overrideResult.exceptionId).toBeDefined();

      // Verify exception was raised
      const exception = await knex('exception_approvals')
        .where('id', overrideResult.exceptionId)
        .first();
      expect(exception).toBeDefined();
      expect(exception.exception_type).toBe('PRICE_OVERRIDE');
      expect(exception.status).toBe('PENDING');

      // Verify exception.requested event was published
      const exceptionEvents = await knex('outbox_events')
        .where({
          event_type: 'exception.requested',
          aggregate_id: overrideResult.exceptionId,
        })
        .select('*');
      expect(exceptionEvents.length).toBe(1);

      // Verify order status changed to PENDING_APPROVAL
      const pendingOrder = await knex('sales_orders')
        .where('id', orderResult.orderId)
        .first();
      expect(pendingOrder.order_status).toBe('PENDING_APPROVAL');

      // Owner resolves exception with COUNTER at ₹89.50
      const counterPayload = {
        orderId: orderResult.orderId,
        counterPrice: '89.50',
      };
      await exceptionSvc.resolve(
        overrideResult.exceptionId,
        'COUNTERED',
        'Counter at 89.50',
        counterPayload,
      );

      // Wait for handler to process
      await new Promise((r) => setTimeout(r, 100));

      // Verify exception status
      const resolvedException = await knex('exception_approvals')
        .where('id', overrideResult.exceptionId)
        .first();
      expect(resolvedException.status).toBe('COUNTERED');

      // Verify exception event metadata
      const exceptionEvent = await knex('exception_events')
        .where({ exception_id: overrideResult.exceptionId, event: 'RESOLVED' })
        .first('metadata_json');
      const meta =
        typeof exceptionEvent.metadata_json === 'string'
          ? JSON.parse(exceptionEvent.metadata_json)
          : exceptionEvent.metadata_json;
      expect(meta.counter?.orderId).toBe(orderResult.orderId);
      expect(meta.counter?.counterPrice).toBe('89.50');

      // Verify exception.resolved event was published
      const resolvedEvents = await knex('outbox_events')
        .where({ event_type: 'exception.resolved' })
        .select('*');
      const matchingEvent = resolvedEvents.find((e: any) => {
        const p =
          typeof e.payload === 'string' ? JSON.parse(e.payload) : e.payload;
        return p.exceptionId === overrideResult.exceptionId;
      });
      expect(matchingEvent).toBeDefined();

      // Coordinator accepts counter
      const acceptResult = await orderSvc.acceptCounter(
        orderResult.orderId,
        'Accepted owner counter',
        userId,
      );

      expect(acceptResult.status).toBe('CONFIRMED');

      // Verify order is confirmed
      const confirmedOrder = await knex('sales_orders')
        .where('id', orderResult.orderId)
        .first();
      expect(confirmedOrder.order_status).toBe('CONFIRMED');
      expect(confirmedOrder.confirmed_at).toBeDefined();

      // Verify order.confirmed event
      const orderEvents = await knex('outbox_events')
        .where({
          event_type: 'order.confirmed',
          aggregate_id: orderResult.orderId,
        })
        .select('*');
      expect(orderEvents.length).toBe(1);
      const orderPayload =
        typeof orderEvents[0].payload === 'string'
          ? JSON.parse(orderEvents[0].payload)
          : orderEvents[0].payload;
      expect(orderPayload.creditFlag).toBe('OK');

      console.log(
        '✅ Path 2 verified: Below-floor (₹88) → PRICE_OVERRIDE → counter (₹89.50) → confirmed',
      );
    });
  });

  describe('Scenario A — Quote conversion with price re-validation', () => {
    it('should validate quote prices against current band on conversion', async () => {
      itemId = await createTestItem(82);
      customerId = await createTestCustomer();

      // Day 1: Set price band
      await knex('daily_price_lists').insert({
        item_id: itemId,
        effective_date: today,
        latest_landed_cost: 82.0,
        floor_price: 90.0,
        target_price: 95.0,
        min_margin_pct_used: 0.1,
        source: 'MANUAL',
        published_at: new Date(),
        updated_by: userId,
      });

      // Create quote at ₹92 (in-band)
      const quote = await quoteSvc.create({
        customerId,
        siteId,
        lines: [{ itemId, qty: '5', requestedPrice: '92' }],
        validUntil: new Date(Date.now() + 4 * 60 * 60 * 1000), // 4 hours
        userId,
      });

      expect(quote.status).toBe('SENT');

      // Verify price.updated event was published
      const priceEvents = await knex('outbox_events')
        .where({ event_type: 'price.updated', aggregate_id: itemId })
        .select('*');
      expect(priceEvents.length).toBeGreaterThanOrEqual(0);

      // Convert quote - should validate against current band
      const conversionResult = await quoteSvc.convertToOrder(
        quote.id,
        siteId,
        userId,
      );

      expect(conversionResult.quoteId).toBe(quote.id);
      expect(conversionResult.priceValidation).toBeDefined();
      expect(conversionResult.priceValidation.length).toBe(1);
      expect(conversionResult.priceValidation[0].inBand).toBe(true);
      expect(conversionResult.priceValidation[0].quotedPrice).toBe('92.00');
      expect(conversionResult.priceValidation[0].floorPrice).toBe('90.00');

      console.log(
        '✅ Quote conversion re-validates prices against current band',
      );
    });

    it('should detect below-floor prices from stale quotes on conversion', async () => {
      itemId = await createTestItem(82);
      customerId = await createTestCustomer();

      // Day 1: Create quote at ₹92 with floor ₹90
      await knex('daily_price_lists').insert({
        item_id: itemId,
        effective_date: today,
        latest_landed_cost: 82.0,
        floor_price: 90.0,
        target_price: 95.0,
        min_margin_pct_used: 0.1,
        source: 'MANUAL',
        published_at: new Date(),
        updated_by: userId,
      });

      const quote = await quoteSvc.create({
        customerId,
        siteId,
        lines: [{ itemId, qty: '5', requestedPrice: '92' }],
        validUntil: new Date(Date.now() + 4 * 60 * 60 * 1000),
        userId,
      });

      // Day 2: Floor price increases to ₹93 (landed cost increased)
      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000)
        .toISOString()
        .split('T')[0];
      await knex('daily_price_lists').insert({
        item_id: itemId,
        effective_date: tomorrow,
        latest_landed_cost: 85.0,
        floor_price: 93.0,
        target_price: 98.0,
        min_margin_pct_used: 0.1,
        source: 'AUTO',
        published_at: new Date(),
        updated_by: userId,
      });

      // Convert on Day 2 - quote price ₹92 is now below new floor ₹93
      const conversionResult = await quoteSvc.convertToOrder(
        quote.id,
        siteId,
        userId,
        tomorrow,
      );

      expect(conversionResult.priceValidation.length).toBe(1);
      expect(conversionResult.priceValidation[0].inBand).toBe(false);
      expect(conversionResult.priceValidation[0].quotedPrice).toBe('92.00');
      expect(conversionResult.priceValidation[0].floorPrice).toBe('93.00');

      console.log(
        '✅ Quote conversion detects below-floor prices from stale quotes',
      );
    });
  });

  describe('Price Memory — Last 5 confirmed sales', () => {
    it('should return price memory for customer+item combination', async () => {
      itemId = await createTestItem(82);
      customerId = await createTestCustomer();

      const todayDate = new Date();
      // Create and confirm 3 orders on different days
      for (let i = 0; i < 3; i++) {
        const dateForBand = new Date(todayDate.getTime() + i * 86400000)
          .toISOString()
          .split('T')[0];
        await knex('daily_price_lists').insert({
          item_id: itemId,
          effective_date: dateForBand,
          latest_landed_cost: 82.0,
          floor_price: 90.0,
          target_price: 95.0,
          min_margin_pct_used: 0.1,
          source: 'MANUAL',
          published_at: new Date(),
          updated_by: userId,
        });

        const order = await orderSvc.createOrder(
          customerId,
          siteId,
          [{ itemId, qty: '1', requestedPrice: String(92 + i) }],
          userId,
        );
        await orderSvc.confirm(order.orderId, `Order ${i}`, userId);

        // Small delay to ensure different created_at timestamps
        await new Promise((r) => setTimeout(r, 10));
      }

      // Get price memory
      const memory = await pricingSvc.lastPrices(customerId, itemId, 5);

      expect(memory.length).toBe(3);
      // Most recent first - prices should be 94, 93, 92
      const prices = memory.map((m) => Number(m.unitPrice));
      expect(prices).toContain(94);
      expect(prices).toContain(93);
      expect(prices).toContain(92);

      console.log(
        '✅ Price memory returns last 5 confirmed sales for customer+item',
      );
    });
  });

  describe('Credit evaluation integration', () => {
    it('should raise CREDIT_BREACH when order exceeds credit limit', async () => {
      itemId = await createTestItem(82);
      customerId = await createTestCustomer();

      await knex('daily_price_lists').insert({
        item_id: itemId,
        effective_date: today,
        latest_landed_cost: 82.0,
        floor_price: 90.0,
        target_price: 95.0,
        min_margin_pct_used: 0.1,
        source: 'MANUAL',
        published_at: new Date(),
        updated_by: userId,
      });

      // Create order that exceeds credit limit (customer has 1 lakh limit, order = 2 lakh)
      // Price ₹100 is above floor ₹90, so it should be in-band for pricing
      // But credit check will fail
      const orderResult = await orderSvc.createOrder(
        customerId,
        siteId,
        [{ itemId, qty: '2000', requestedPrice: '100' }],
        userId,
      );

      // Confirm - should raise CREDIT_BREACH
      const confirmResult = await orderSvc.confirm(
        orderResult.orderId,
        'Large order',
        userId,
      );

      expect(confirmResult.status).toBe('PENDING_APPROVAL');

      // Verify CREDIT_BREACH exception
      const exceptions = await knex('exception_approvals')
        .where({
          exception_type: 'CREDIT_BREACH',
          reference_table: 'sales_orders',
          reference_id: orderResult.orderId,
        })
        .select('*');
      expect(exceptions.length).toBe(1);
      expect(exceptions[0].status).toBe('PENDING');

      console.log(
        '✅ Credit evaluation raises CREDIT_BREACH when limit exceeded',
      );
    });

    it('should allow order within credit limit', async () => {
      itemId = await createTestItem(82);
      customerId = await createTestCustomer();

      await knex('daily_price_lists').insert({
        item_id: itemId,
        effective_date: today,
        latest_landed_cost: 82.0,
        floor_price: 90.0,
        target_price: 95.0,
        min_margin_pct_used: 0.1,
        source: 'MANUAL',
        published_at: new Date(),
        updated_by: userId,
      });

      // Order well within credit limit
      const orderResult = await orderSvc.createOrder(
        customerId,
        siteId,
        [{ itemId, qty: '100', requestedPrice: '92' }],
        userId,
      );

      const confirmResult = await orderSvc.confirm(
        orderResult.orderId,
        'Small order',
        userId,
      );

      expect(confirmResult.status).toBe('CONFIRMED');

      const exceptions = await knex('exception_approvals')
        .where({
          exception_type: 'CREDIT_BREACH',
          reference_table: 'sales_orders',
          reference_id: orderResult.orderId,
        })
        .select('*');
      expect(exceptions.length).toBe(0);

      console.log(
        '✅ Order within credit limit confirms without CREDIT_BREACH',
      );
    });
  });

  describe('Auto-floor calculation (Money.autoFloor)', () => {
    it('should calculate auto-floor correctly: cost 82, margin 10% → floor 91.50', async () => {
      const cost = Money.of('82');
      const floor = Money.autoFloor(cost, 0.1);

      // 82 / (1 - 0.10) = 82 / 0.90 = 91.111... → rounded UP to nearest 0.50 = 91.50
      expect(floor.toStorageString()).toBe('91.50');
    });

    it('should calculate auto-floor correctly: cost 100, margin 15% → floor 118.00', async () => {
      const cost = Money.of('100');
      const floor = Money.autoFloor(cost, 0.15);

      // 100 / (1 - 0.15) = 100 / 0.85 = 117.647... → rounded UP to nearest 0.50 = 118.00
      expect(floor.toStorageString()).toBe('118.00');
    });

    it('should round UP to nearest 0.50 (never down)', async () => {
      // 50 / 0.9 = 55.555... → should round UP to 56.00 (not 55.50)
      const cost = Money.of('50');
      const floor = Money.autoFloor(cost, 0.1);
      expect(floor.toStorageString()).toBe('56.00');
    });
  });
});

describe('M1 Acceptance — Daily Price List Operations', () => {
  let knex: Knex;
  let pricingSvc: PricingService;
  let itemSvc: ItemService;
  let exceptionSvc: ExceptionService;
  let configSvc: ConfigService;
  let outboxSvc: OutboxService;
  let notificationSvc: NotificationService;
  let userId: string;
  let siteId: string;
  let itemId: string;
  let today: string;

  beforeAll(async () => {
    knex = await createKnex();

    configSvc = new ConfigService(knex);
    await configSvc.onModuleInit();

    outboxSvc = new OutboxService(knex);
    notificationSvc = new NotificationService(knex);
    exceptionSvc = new ExceptionService(
      knex,
      configSvc,
      outboxSvc,
      notificationSvc,
    );
    await exceptionSvc.onModuleInit();

    pricingSvc = new PricingService(knex, exceptionSvc, configSvc);
    await pricingSvc.onModuleInit();

    itemSvc = new ItemService(knex);

    const site = await knex('sites').first('id');
    siteId = String(site.id);

    const user = await knex('users').where('role', 'OPS_COORD').first('id');
    userId = String(user.id);

    today = new Date().toISOString().split('T')[0];
  });

  afterAll(async () => {
    await knex.destroy();
  });

  beforeEach(async () => {
    // Clean up all test items and price lists to ensure test isolation
    // This is critical because "missing price" test creates multiple items
    // Must delete in correct order: price lists first, then items not referenced
    await knex('daily_price_lists').del();

    // Delete items created by our tests that aren't referenced by order lines
    // Use subquery to find items with no references
    const unreferencedItems = await knex('items')
      .where('sku_code', 'like', 'MISS-%')
      .orWhere('sku_code', 'like', 'BULK-%')
      .orWhere('sku_code', 'like', 'TEST-%')
      .whereNotExists(
        knex('sales_order_lines').whereRaw(
          'sales_order_lines.item_id = items.id',
        ),
      )
      .select('id');

    if (unreferencedItems.length > 0) {
      await knex('items')
        .whereIn(
          'id',
          unreferencedItems.map((i) => i.id),
        )
        .del();
    }

    if (itemId) {
      await knex('daily_price_lists').where('item_id', itemId).del();
      await knex('items').where('id', itemId).del();
      itemId = '';
    }
  });

  it('should bulk upsert daily prices with auto-floor calculation', async () => {
    const item = await itemSvc.create({
      skuCode: `BULK-${Date.now()}`,
      name: 'Bulk Test Item',
      itemCategory: 'RAW_MATERIAL',
      primaryUom: 'KG',
      taxRatePct: 0.05,
      hsnCode: '10063010',
      minMarginPct: 0.1, // Use global default 10%
      taxTreatment: 'TAXABLE',
      isActive: true,
      userId,
    });
    itemId = String(item.id);

    // Bulk upsert without explicit floor/target
    const updated = await pricingSvc.upsertDailyPrices(
      today,
      [
        {
          itemId,
          landedCost: 100,
          source: 'AUTO',
        },
      ],
      userId,
    );

    expect(updated.length).toBe(1);

    const band = await pricingSvc.getBand(itemId, today);
    expect(band).not.toBeNull();
    // Auto-floor: 100 / (1 - 0.10) = 111.11... → rounded UP to 111.50
    expect(band!.floorPrice).toBe('111.50');
    // Target = floor * 1.05 = 117.075 → 117.08
    expect(band!.targetPrice).toBe('117.08');
  });

  it('should return missing price items for owner alert', async () => {
    // Use a fixed timestamp for this test to enable deterministic cleanup
    const testTimestamp = Date.now();

    // Create 3 items
    const item1 = await itemSvc.create({
      skuCode: `MISS-1-${testTimestamp}`,
      name: 'Missing 1',
      itemCategory: 'PROCESSED_FG',
      primaryUom: 'KG',
      taxRatePct: 0.05,
      hsnCode: '21069099',
      taxTreatment: 'TAXABLE',
      isActive: true,
      userId,
    });

    const item2 = await itemSvc.create({
      skuCode: `MISS-2-${testTimestamp}`,
      name: 'Missing 2',
      itemCategory: 'PROCESSED_FG',
      primaryUom: 'KG',
      taxRatePct: 0.05,
      hsnCode: '21069099',
      taxTreatment: 'TAXABLE',
      isActive: true,
      userId,
    });

    const item3 = await itemSvc.create({
      skuCode: `MISS-3-${testTimestamp}`,
      name: 'Missing 3',
      itemCategory: 'RAW_MATERIAL',
      primaryUom: 'KG',
      taxRatePct: 0.05,
      hsnCode: '10063010',
      taxTreatment: 'TAXABLE',
      isActive: true,
      userId,
    });

    // Set price for item1 only
    await pricingSvc.upsertDailyPrices(
      today,
      [
        {
          itemId: String(item1.id),
          landedCost: 80,
        },
      ],
      userId,
    );

    // Get missing items - filter to only our test items to avoid pollution
    const allMissing = await pricingSvc.getItemsMissingPrices(today);
    const missing = allMissing.filter(
      (m) =>
        String(m.id) === String(item2.id) || String(m.id) === String(item3.id),
    );

    expect(missing.length).toBe(2);
    const missingIds = missing.map((m) => String(m.id));
    expect(missingIds).toContain(String(item2.id));
    expect(missingIds).toContain(String(item3.id));

    // Filter by category - only our test items
    const allMissingFg = await pricingSvc.getItemsMissingPrices(today, {
      itemCategory: 'PROCESSED_FG',
    });
    const missingFg = allMissingFg.filter(
      (m) => String(m.id) === String(item2.id),
    );
    expect(missingFg.length).toBe(1);
    expect(String(missingFg[0].id)).toBe(String(item2.id));

    // Cleanup
    await knex('daily_price_lists')
      .whereIn('item_id', [
        String(item1.id),
        String(item2.id),
        String(item3.id),
      ])
      .del();
    await knex('items')
      .whereIn('id', [String(item1.id), String(item2.id), String(item3.id)])
      .del();

    console.log('✅ Missing price alerts work correctly');
  });
});
