import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Money } from '../../shared/utils/money.util.js';
import { CreditEvaluation } from '../../shared/ports/ports.interface.js';

/**
 * CreditService — implements BR-02 credit evaluation.
 *
 * Depends on M6's customer_ledger_entries, but currently uses a cached
 * current_ar_balance field from the customers table for the MVP.
 *
 * BR-02 rules:
 * - Block if current_ar_balance + new_order_value > credit_limit.
 * - Block if any customer_invoice is > max_overdue_days overdue (TODO: M6 integration).
 */
@Injectable()
export class CreditService implements OnModuleInit {
  private readonly logger = new Logger(CreditService.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  onModuleInit(): void {
    this.logger.log('CreditService initialized (CREDIT_PORT → real implementation)');
  }

  /**
   * Evaluate whether an order can be accepted given the customer's credit status.
   *
   * @param customerId - The customer's ID.
   * @param newOrderValue - The total value of the order in INR (as numeric string).
   * @returns CreditEvaluation result (status, current balance, limits, reasons).
   */
  async evaluate(customerId: string, newOrderValue: string): Promise<CreditEvaluation> {
    const customerRow = await this.knex('customers')
      .where('id', customerId)
      .first(
        'credit_limit',
        'current_ar_balance',
        'max_overdue_days',
        'is_active',
      );

    if (!customerRow) {
      throw new Error(`Customer ${customerId} not found`);
    }

    if (!customerRow.is_active) {
      this.logger.warn(`Customer ${customerId} is inactive`);
      return {
        status: 'HOLD',
        currentArBalance: customerRow.current_ar_balance,
        creditLimit: customerRow.credit_limit,
        maxOverdueDays: customerRow.max_overdue_days,
        oldestOverdueDays: null,
        reason: 'Customer is inactive',
      };
    }

    const currentArBalance = Money.of(customerRow.current_ar_balance);
    const creditLimit = Money.of(customerRow.credit_limit);
    const newOrderVal = Money.of(newOrderValue);
    const maxOverdueDays = customerRow.max_overdue_days;

    // BR-02.1: Check if new order exceeds credit limit
    const wouldExceedLimit = currentArBalance.add(newOrderVal).isLessThan(creditLimit) === false;

    this.logger.debug(
      `Customer credit check: ${customerId} AR ${currentArBalance.toStorageString()} + order ${newOrderVal.toStorageString()} <= limit ${creditLimit.toStorageString()}? ${!wouldExceedLimit}`,
    );

    if (wouldExceedLimit) {
      return {
        status: 'HOLD',
        currentArBalance: customerRow.current_ar_balance,
        creditLimit: customerRow.credit_limit,
        maxOverdueDays,
        oldestOverdueDays: null,
        reason: `Order value (${newOrderValue}) would exceed credit limit (current AR: ${customerRow.current_ar_balance})`,
      };
    }

    // BR-02.2: Check for overdue invoices (blocked pending M6 integration)
    // TODO: Query customer_ledger_entries for oldestOverdueDays and block if any invoice > max_overdue_days
    // For now, we only check credit limits.

    return {
      status: 'OK',
      currentArBalance: customerRow.current_ar_balance,
      creditLimit: customerRow.credit_limit,
      maxOverdueDays,
      oldestOverdueDays: null,
    };
  }

  /**
   * Check if a confirmed order can be dispatched (credit-wise).
   * This mirrors the check used by M5 when validating trip dispatches.
   *
   * @param orderId - The sales order ID.
   * @returns { allowed, reason } result.
   */
  async canDispatch(orderId: string): Promise<{ allowed: boolean; reason?: string }> {
    const orderRow = await this.knex('sales_orders')
      .where('id', orderId)
      .first('customer_id', 'order_status');

    if (!orderRow) {
      throw new Error(`Order ${orderId} not found`);
    }

    if (orderRow.order_status !== 'CONFIRMED') {
      return { allowed: false, reason: 'Order must be CONFIRMED before dispatch' };
    }

    // Compute total order value from order lines
    const lines = await this.knex('sales_order_lines')
      .where('order_id', orderId)
      .select('quoted_unit_price', 'ordered_qty');

    const totalValue = lines.reduce(
      (sum, line) => sum + parseFloat(line.quoted_unit_price) * parseFloat(line.ordered_qty),
      0,
    );
    const newOrderVal = Money.of(totalValue.toString()).toStorageString();

    const evaluation = await this.evaluate(orderRow.customer_id, newOrderVal);

    if (evaluation.status === 'OK') {
      return { allowed: true };
    } else if (evaluation.status === 'HOLD') {
      return {
        allowed: false,
        reason: evaluation.reason || 'Credit check failed',
      };
    } else {
      // COD_ONLY status would be set by M6 when AR > credit_limit + Cash deposit
      return {
        allowed: false,
        reason: 'Customer is COD-only — cannot dispatch on credit',
      };
    }
  }
}