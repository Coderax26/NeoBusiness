import { Injectable, BadRequestException } from '@nestjs/common';
import { InjectKnex } from 'nestjs-knex';
import type { Knex } from 'knex';

export interface CreateExpenseDto {
  siteId: string;
  category: string;
  amount: string;
  refNo?: string;
  notes?: string;
  date?: string;
}

@Injectable()
export class ExpenseService {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  async createExpense(dto: CreateExpenseDto, userId: string) {
    const rawNum = Number(dto.amount);
    if (isNaN(rawNum) || rawNum <= 0) {
      throw new BadRequestException('Amount must be a positive number');
    }
    const numAmount = rawNum;

    const date = dto.date || new Date().toISOString().split('T')[0];
    const entryType = `EXPENSE_${dto.category.toUpperCase().replace(/[^A-Z0-9]/g, '_')}`;

    const [entry] = await this.knex('cashbook_entries')
      .insert({
        site_id: dto.siteId,
        entry_type: entryType.slice(0, 20),
        amount: -numAmount, // Negative for expense
        ref_no: dto.refNo || `EXP-${Date.now().toString(36).toUpperCase()}`,
        date,
      })
      .returning('*');

    return entry;
  }

  async listExpenses(filters: {
    siteId?: string;
    category?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = filters.offset ?? 0;

    let query = this.knex('cashbook_entries as c')
      .leftJoin('sites as s', 'c.site_id', 's.id')
      .where('c.entry_type', 'like', 'EXPENSE%')
      .select('c.*', 's.name as site_name')
      .limit(limit)
      .offset(offset)
      .orderBy('c.date', 'desc')
      .orderBy('c.created_at', 'desc');

    if (filters.siteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.siteId)) {
      query = query.andWhere('c.site_id', filters.siteId);
    }
    if (filters.category) {
      query = query.andWhere('c.entry_type', 'like', `%${filters.category.toUpperCase()}%`);
    }
    if (filters.dateFrom) query = query.andWhere('c.date', '>=', filters.dateFrom);
    if (filters.dateTo) query = query.andWhere('c.date', '<=', filters.dateTo);

    return query;
  }

  async getCashbook(filters: {
    siteId?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
    offset?: number;
  }) {
    const limit = Math.min(filters.limit ?? 50, 100);
    const offset = filters.offset ?? 0;

    let query = this.knex('cashbook_entries as c')
      .leftJoin('sites as s', 'c.site_id', 's.id')
      .select('c.*', 's.name as site_name')
      .limit(limit)
      .offset(offset)
      .orderBy('c.date', 'desc')
      .orderBy('c.created_at', 'desc');

    if (filters.siteId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(filters.siteId)) {
      query = query.where('c.site_id', filters.siteId);
    }
    if (filters.dateFrom) query = query.andWhere('c.date', '>=', filters.dateFrom);
    if (filters.dateTo) query = query.andWhere('c.date', '<=', filters.dateTo);

    const rows = await query;
    return rows;
  }
}
