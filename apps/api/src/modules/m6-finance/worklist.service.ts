import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';
import { Money } from '../../shared/utils/money.util.js';

/**
 * WorklistService — Daily collection worklist generation (08:00)
 *
 * Priority scoring: overdue_amount × days_overdue
 * Includes:
 * 1. Overdue customers (invoice due_date < today, balance > 0)
 * 2. Today's delivery-stop customers (from M5 trip stops)
 * 3. PTPs due today
 *
 * Assigned to collectors/drivers by route/area
 */
@Injectable()
export class WorklistService {
  private readonly logger = new Logger(WorklistService.name);

  constructor(@InjectKnex() private readonly knex: Knex) {}

  /**
   * Generate daily collection worklist for a site
   * Called by WorklistJob at 08:00 daily
   */
  async generateDailyWorklist(
    siteId: string,
    date?: string,
  ): Promise<{
    worklistId: string;
    date: string;
    totalCustomers: number;
    totalOverdueAmount: string;
    items: Array<{
      customerId: string;
      customerName: string;
      phone: string;
      overdueAmount: string;
      daysOverdue: number;
      priorityScore: number;
      reasons: string[];
      assignedTo?: string;
      routeOrder?: number;
    }>;
  }> {
    const targetDate = date ?? new Date().toISOString().split('T')[0];
    const today = new Date(targetDate);

    // 1. Get overdue invoices
    const overdueInvoices = await this.knex('invoices as i')
      .where('i.site_id', siteId)
      .where('i.due_date', '<', targetDate)
      .where('i.balance_due', '>', 0)
      .whereIn('i.status', ['UNPAID', 'PARTIAL', 'OVERDUE'])
      .join('customers as c', 'i.customer_id', 'c.id')
      .select(
        'i.id as invoiceId',
        'i.customer_id',
        'c.business_name as customerName',
        'c.phone',
        'i.due_date',
        'i.balance_due',
        'i.invoice_no',
      );

    // Group by customer
    const customerMap = new Map<
      string,
      {
        customerId: string;
        customerName: string;
        phone: string;
        invoices: Array<{
          invoiceId: string;
          dueDate: string;
          balance: string;
          invoiceNo: string;
        }>;
        totalOverdue: Money;
        reasons: Set<string>;
      }
    >();

    for (const inv of overdueInvoices) {
      if (!customerMap.has(inv.customer_id)) {
        customerMap.set(inv.customer_id, {
          customerId: inv.customer_id,
          customerName: inv.customerName,
          phone: inv.phone,
          invoices: [],
          totalOverdue: Money.zero(),
          reasons: new Set(['OVERDUE']),
        });
      }
      const entry = customerMap.get(inv.customer_id)!;
      entry.invoices.push({
        invoiceId: inv.invoiceId,
        dueDate: inv.due_date,
        balance: inv.balance_due,
        invoiceNo: inv.invoice_no,
      });
      entry.totalOverdue = entry.totalOverdue.add(Money.of(inv.balance_due));
    }

    // 2. Get today's delivery-stop customers (from M5 delivery_trips)
    // This would join delivery_trips → delivery_stops where trip_date = today
    // For now, we'll create a placeholder that can be populated when M5 is integrated
    const deliveryStops = await this.knex('delivery_stops as ds')
      .join('delivery_trips as dt', 'ds.trip_id', 'dt.id')
      .where('dt.site_id', siteId)
      .where('dt.trip_date', targetDate)
      .where('ds.status', 'PENDING') // or COMPLETED
      .join('customers as c', 'ds.customer_id', 'c.id')
      .select(
        'ds.customer_id',
        'c.business_name as customerName',
        'c.phone',
        'dt.id as tripId',
      );

    for (const stop of deliveryStops) {
      if (!customerMap.has(stop.customer_id)) {
        customerMap.set(stop.customer_id, {
          customerId: stop.customer_id,
          customerName: stop.customerName,
          phone: stop.phone,
          invoices: [],
          totalOverdue: Money.zero(),
          reasons: new Set(['DELIVERY_STOP']),
        });
      } else {
        customerMap.get(stop.customer_id)!.reasons.add('DELIVERY_STOP');
      }
    }

    // 3. Get PTPs due today
    const ptpsDue = await this.knex('ptp_followups')
      .where('site_id', siteId)
      .andWhere('promised_date', targetDate)
      .andWhere('status', 'OPEN')
      .join('customers', 'ptp_followups.customer_id', 'customers.id')
      .select(
        'ptp_followups.customer_id',
        'customers.business_name as customerName',
        'customers.phone',
      );

    for (const ptp of ptpsDue) {
      if (!customerMap.has(ptp.customer_id)) {
        customerMap.set(ptp.customer_id, {
          customerId: ptp.customer_id,
          customerName: ptp.customerName,
          phone: ptp.phone,
          invoices: [],
          totalOverdue: Money.zero(),
          reasons: new Set(['PTP_DUE']),
        });
      } else {
        customerMap.get(ptp.customer_id)!.reasons.add('PTP_DUE');
      }
    }

    // 4. Calculate priority scores and build worklist items
    const worklistItems = Array.from(customerMap.values()).map((c) => {
      // Calculate max days overdue from invoices
      let maxDaysOverdue = 0;
      for (const inv of c.invoices) {
        const dueDate = new Date(inv.dueDate);
        const diffDays = Math.floor(
          (today.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24),
        );
        if (diffDays > maxDaysOverdue) maxDaysOverdue = diffDays;
      }

      // Priority score = overdue_amount × days_overdue
      const priorityScore = c.totalOverdue.toNumber() * maxDaysOverdue;

      return {
        customerId: c.customerId,
        customerName: c.customerName,
        phone: c.phone,
        overdueAmount: c.totalOverdue.toStorageString(),
        daysOverdue: maxDaysOverdue,
        priorityScore,
        reasons: Array.from(c.reasons),
        assignedTo: '' as string | undefined,
        routeOrder: 0,
      };
    });

    // 5. Sort by priority score descending
    worklistItems.sort((a, b) => b.priorityScore - a.priorityScore);

    // 6. Assign to collectors by route/area
    // Simple round-robin for now; can be enhanced with route optimization
    const collectors = await this.knex('users')
      .where('assigned_site_id', siteId)
      .where('role', 'COLLECTOR')
      .select('id', 'full_name');

    if (collectors.length > 0) {
      let collectorIndex = 0;
      for (let i = 0; i < worklistItems.length; i++) {
        worklistItems[i].assignedTo = collectors[collectorIndex].id;
        worklistItems[i].routeOrder = Number(i + 1);
        collectorIndex = (collectorIndex + 1) % collectors.length;
      }
    }

    // 7. Save worklist to DB
    const [worklist] = await this.knex('worklist_worklists')
      .insert({
        site_id: siteId,
        date: targetDate,
        total_customers: worklistItems.length,
        total_overdue_amount: worklistItems
          .reduce((sum, w) => sum.add(Money.of(w.overdueAmount)), Money.zero())
          .toStorageString(),
        status: 'GENERATED',
      })
      .returning('*');

    // 8. Insert individual worklist items
    for (const item of worklistItems) {
      await this.knex('worklist_items').insert({
        worklist_id: worklist.id,
        customer_id: item.customerId,
        priority_score: item.priorityScore,
        overdue_amount: item.overdueAmount,
        days_overdue: item.daysOverdue,
        reasons: item.reasons,
        assigned_to: item.assignedTo,
        route_order: item.routeOrder,
        status: 'PENDING',
      });
    }

    this.logger.log(
      `Worklist generated for ${targetDate}, site ${siteId}: ${worklistItems.length} customers`,
    );

    return {
      worklistId: String(worklist.id),
      date: targetDate,
      totalCustomers: worklistItems.length,
      totalOverdueAmount: worklistItems
        .reduce((sum, w) => sum.add(Money.of(w.overdueAmount)), Money.zero())
        .toStorageString(),
      items: worklistItems,
    };
  }

  /**
   * Get worklist for a collector (mobile screen)
   */
  async getMyWorklist(collectorId: string, siteId: string, date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];

    const items = await this.knex('worklist_items as cwi')
      .join('worklist_worklists as cw', 'cwi.worklist_id', 'cw.id')
      .join('customers as c', 'cwi.customer_id', 'c.id')
      .where('cw.site_id', siteId)
      .where('cw.date', targetDate)
      .where('cwi.assigned_to', collectorId)
      .where('cwi.status', 'PENDING')
      .orderBy('cwi.route_order', 'asc')
      .select(
        'cwi.*',
        'c.business_name as customerName',
        'c.phone',
        'c.address',
      );

    // Add overdue invoices for each customer
    const customerIds = items.map((i) => i.customer_id);
    const overdueInvoices = await this.knex('invoices')
      .whereIn('customer_id', customerIds)
      .where('due_date', '<', targetDate)
      .where('balance_due', '>', 0)
      .whereIn('status', ['UNPAID', 'PARTIAL', 'OVERDUE'])
      .select(
        'customer_id',
        'id as invoiceId',
        'invoice_no',
        'due_date',
        'balance_due',
        'total_amount',
      );

    const invoiceMap = new Map<string, any[]>();
    for (const inv of overdueInvoices) {
      if (!invoiceMap.has(inv.customer_id)) invoiceMap.set(inv.customer_id, []);
      invoiceMap.get(inv.customer_id)!.push(inv);
    }

    return items.map((item) => ({
      ...item,
      overdueInvoices: invoiceMap.get(item.customer_id) || [],
    }));
  }

  /**
   * Update worklist item outcome (collector taps outcome on mobile)
   */
  async updateOutcome(
    worklistItemId: string,
    outcome: 'PAID' | 'PTP' | 'DECLINED' | 'NOT_AT_HOME' | 'DISPUTED',
    userId: string,
    notes?: string,
  ) {
    const [item] = await this.knex('worklist_items')
      .where('id', worklistItemId)
      .update({
        outcome,
        completed_at: new Date(),
        completed_by: userId,
        notes,
        status: 'COMPLETED',
      })
      .returning('*');

    if (!item)
      throw new NotFoundException(`Worklist item ${worklistItemId} not found`);

    return item;
  }

  /**
   * Get worklist summary for Coordinator/Owner dashboard
   */
  async getWorklistSummary(siteId: string, date?: string) {
    const targetDate = date ?? new Date().toISOString().split('T')[0];

    const worklist = await this.knex('worklist_worklists')
      .where('site_id', siteId)
      .andWhere('date', targetDate)
      .first('*');

    if (!worklist) return null;

    const items = await this.knex('worklist_items')
      .where('worklist_id', worklist.id)
      .select('outcome', 'status');

    const summary = {
      total: items.length,
      pending: items.filter((i) => i.status === 'PENDING').length,
      completed: items.filter((i) => i.status === 'COMPLETED').length,
      paid: items.filter((i) => i.outcome === 'PAID').length,
      ptp: items.filter((i) => i.outcome === 'PTP').length,
      declined: items.filter((i) => i.outcome === 'DECLINED').length,
      notAtHome: items.filter((i) => i.outcome === 'NOT_AT_HOME').length,
      disputed: items.filter((i) => i.outcome === 'DISPUTED').length,
    };

    return { ...worklist, summary };
  }
}
