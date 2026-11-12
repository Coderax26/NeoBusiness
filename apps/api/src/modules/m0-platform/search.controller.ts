import {
  Controller,
  Get,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
} from '@nestjs/swagger';
import type { Knex } from 'knex';
import { InjectKnex } from 'nestjs-knex';
import { JwtAuthGuard } from './jwt-auth.guard.js';

@ApiTags('search')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('search')
export class SearchController {
  constructor(@InjectKnex() private readonly knex: Knex) {}

  @Get()
  @ApiOperation({ summary: 'Federated global search for Command Palette (Ctrl+K)' })
  async search(@Query('q') q = '', @Query('siteId') siteId?: string) {
    const term = q.trim();
    if (!term || term.length < 2) {
      return {
        customers: [],
        orders: [],
        items: [],
        suppliers: [],
        trips: [],
      };
    }

    const likeTerm = `%${term}%`;

    // 1. Customers
    const customers = await this.knex('customers')
      .where('is_active', true)
      .andWhere((b) => {
        b.whereILike('business_name', likeTerm)
          .orWhereILike('phone', likeTerm)
          .orWhereILike('customer_code', likeTerm);
      })
      .select('id', 'business_name', 'customer_code', 'phone')
      .limit(5);

    // 2. Sales Orders
    let ordersQuery = this.knex('sales_orders as so')
      .leftJoin('customers as c', 'so.customer_id', 'c.id')
      .whereILike('so.order_number', likeTerm);

    if (siteId) {
      ordersQuery = ordersQuery.where('so.site_id', siteId);
    }
    const orders = await ordersQuery
      .select('so.id', 'so.order_number', 'so.status', 'so.total_amount', 'c.business_name as customer_name')
      .limit(5);

    // 3. Items
    const items = await this.knex('items')
      .where('is_active', true)
      .andWhere((b) => {
        b.whereILike('name', likeTerm).orWhereILike('sku_code', likeTerm);
      })
      .select('id', 'name', 'sku_code', 'category', 'base_uom')
      .limit(5);

    // 4. Suppliers
    const suppliers = await this.knex('suppliers')
      .where('is_active', true)
      .andWhere((b) => {
        b.whereILike('name', likeTerm)
          .orWhereILike('supplier_code', likeTerm)
          .orWhereILike('phone', likeTerm);
      })
      .select('id', 'name', 'supplier_code', 'phone')
      .limit(5);

    // 5. Trips
    let tripsQuery = this.knex('delivery_trips as dt')
      .whereILike('dt.trip_no', likeTerm);

    if (siteId) {
      tripsQuery = tripsQuery.where('dt.site_id', siteId);
    }
    const trips = await tripsQuery
      .select('dt.id', 'dt.trip_no', 'dt.status', 'dt.trip_date')
      .limit(5);

    return {
      customers,
      orders,
      items,
      suppliers,
      trips,
    };
  }
}

