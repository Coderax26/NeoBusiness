import {
  Injectable,
  Logger,
  Inject,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Money } from '../../shared/utils/money.util.js';
import { ConfigService } from '../m0-platform/config.service.js';
import { CREDIT_PORT } from '../../shared/ports/ports.interface.js';
import type {
  CreditPort,
  CreditEvaluation,
  CreditStatus,
} from '../../shared/ports/ports.interface.js';

/**
 * CreditPortService — Real implementation of CreditPort reading from M6 AR ledger
 *
 * Replaces CreditPortStub (which always returned OK).
 * Uses customer_ledger_entries for real AR balance and overdue analysis.
 *
 * BR-02: AR + new order ≤ credit limit, else CREDIT_BREACH exception
 * Overdue check: invoices past due_date with status != PAID
 */
@Injectable()
export class CreditPortService implements CreditPort {
  private readonly logger = new Logger(CreditPortService.name);

  constructor(
    @InjectKnex() private readonly knex: Knex,
    private readonly config: ConfigService,
  ) {}

  /**
   * Evaluate customer credit against AR balance + new order value
   */
  async evaluate(
    customerId: string,
    newOrderValue: string,
  ): Promise<CreditEvaluation> {
    // Get current AR balance from ledger
    const balanceRow = await this.knex('customer_ledger_entries')
      .where('customer_id', customerId)
      .orderBy('posted_at', 'desc')
      .first('running_balance');

    const currentArBalance = balanceRow
      ? Money.of(balanceRow.running_balance)
      : Money.zero();

    // Get customer credit limit
    const customer = await this.knex('customers')
      .where('id', customerId)
      .first('credit_limit', 'credit_days');

    const creditLimit = Money.of(customer?.credit_limit ?? '100000');
    const creditDays = customer?.credit_days ?? 30;

    // Calculate oldest overdue invoice
    const oldestOverdueDays = await this.getOldestOverdueDays(customerId);
    const maxOverdueDays = creditDays + 15; // Grace period

    // Check if adding new order would exceed credit limit
    const projectedBalance = currentArBalance.add(Money.of(newOrderValue));
    const status: CreditStatus = creditLimit.isLessThan(projectedBalance)
      ? 'HOLD'
      : 'OK';

    // Check for overdue invoices
    if (oldestOverdueDays !== null && oldestOverdueDays > maxOverdueDays) {
      return {
        status: 'COD_ONLY',
        currentArBalance: currentArBalance.toStorageString(),
        creditLimit: creditLimit.toStorageString(),
        maxOverdueDays,
        oldestOverdueDays,
        reason: `Customer has invoices overdue by ${oldestOverdueDays} days`,
      };
    }

    return {
      status,
      currentArBalance: currentArBalance.toStorageString(),
      creditLimit: creditLimit.toStorageString(),
      maxOverdueDays,
      oldestOverdueDays,
      reason: status === 'HOLD' ? 'Credit limit would be exceeded' : undefined,
    };
  }

  /**
   * Check if an order can be dispatched (used by M5 FleetService)
   * Blocks dispatch if customer has overdue invoices
   */
  async canDispatch(
    orderId: string,
  ): Promise<{ allowed: boolean; reason?: string }> {
    // Get the order and its customer
    const order = await this.knex('sales_orders')
      .where('id', orderId)
      .first('customer_id', 'order_status');

    if (!order) {
      throw new NotFoundException(`Order ${orderId} not found`);
    }

    if (order.order_status !== 'CONFIRMED') {
      return { allowed: false, reason: `Order not in CONFIRMED status` };
    }

    const customerId = order.customer_id;

    // Check for overdue invoices
    const overdueInvoice = await this.knex('invoices')
      .where('customer_id', customerId)
      .andWhere('status', '!=', 'PAID')
      .andWhere('due_date', '<', new Date())
      .orderBy('due_date', 'asc')
      .first('id', 'invoice_no', 'due_date', 'balance_due');

    if (overdueInvoice) {
      const daysOverdue = Math.floor(
        (Date.now() - new Date(overdueInvoice.due_date).getTime()) /
          (1000 * 60 * 60 * 24),
      );
      return {
        allowed: false,
        reason: `OVERDUE_INVOICES: Invoice ${overdueInvoice.invoice_no} overdue by ${daysOverdue} days (balance: ${overdueInvoice.balance_due})`,
      };
    }

    return { allowed: true };
  }

  /**
   * Get the oldest overdue days for a customer
   */
  private async getOldestOverdueDays(
    customerId: string,
  ): Promise<number | null> {
    const oldestOverdue = await this.knex('invoices')
      .where('customer_id', customerId)
      .andWhere('status', '!=', 'PAID')
      .andWhere('due_date', '<', new Date())
      .orderBy('due_date', 'asc')
      .first('due_date');

    if (!oldestOverdue) return null;

    const dueDate = new Date(oldestOverdue.due_date).getTime();
    const now = Date.now();
    const daysOverdue = Math.floor((now - dueDate) / (1000 * 60 * 60 * 24));

    return daysOverdue > 0 ? daysOverdue : null;
  }
}

// Export the provider for module wiring
export const CreditPortProvider = {
  provide: CREDIT_PORT,
  useClass: CreditPortService,
};
